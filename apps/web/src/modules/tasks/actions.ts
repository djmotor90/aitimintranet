"use server";

import {
  customFieldDefinitions,
  db,
  folderMembers,
  folders,
  listMembers,
  lists,
  modules,
  spaceMembers,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { valueSchemaFor, type CustomFieldDefinitionLike, type CustomFieldType } from "@aitim/shared";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { notifyUsers, pingListUpdate } from "@/lib/notify";
import { assertListRole, assertSpaceRole, getListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "./lib/activity";
import { getActiveUsers, getFolderMembers, getSpaceMembers } from "./queries";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

async function requireList(listId: string) {
  const [row] = await db
    .select({ list: lists, space: spaces })
    .from(lists)
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(lists.id, listId));
  if (!row) throw new Error("List not found");
  return row;
}

async function requireFolder(folderId: string) {
  const [row] = await db
    .select({ folder: folders, space: spaces })
    .from(folders)
    .innerJoin(spaces, eq(folders.spaceId, spaces.id))
    .where(eq(folders.id, folderId));
  if (!row) throw new Error("Folder not found");
  return row;
}

async function uniqueFolderSlug(spaceId: string, base: string, excludeFolderId?: string) {
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (
    (
      await db
        .select({ id: folders.id })
        .from(folders)
        .where(
          and(
            eq(folders.spaceId, spaceId),
            eq(folders.slug, candidate),
            excludeFolderId ? ne(folders.id, excludeFolderId) : undefined,
          ),
        )
    ).length > 0
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

async function uniqueListSlug(spaceId: string, base: string, excludeListId?: string) {
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (
    (
      await db
        .select({ id: lists.id })
        .from(lists)
        .where(
          and(
            eq(lists.spaceId, spaceId),
            eq(lists.slug, candidate),
            excludeListId ? ne(lists.id, excludeListId) : undefined,
          ),
        )
    ).length > 0
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

async function requireTask(taskId: string) {
  const [row] = await db
    .select({ task: tasks, list: lists, space: spaces })
    .from(tasks)
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(tasks.id, taskId));
  if (!row) throw new Error("Task not found");
  return row;
}

function listPath(spaceSlug: string, listSlug: string) {
  return `/tasks/${spaceSlug}/${listSlug}`;
}

// ---------------------------------------------------------------- lists

const DEFAULT_STATUSES = [
  { name: "New", color: "#64748b", category: "open", position: "a0" },
  { name: "In Progress", color: "#3b82f6", category: "active", position: "a1" },
  { name: "Done", color: "#22c55e", category: "done", position: "a2" },
] as const;

export async function createList(formData: FormData) {
  const spaceId = z.string().uuid().parse(formData.get("spaceId"));
  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const folderId = z.string().uuid().optional().parse(formData.get("folderId")?.toString() || undefined);
  const user = await requireUser();
  await assertSpaceRole(spaceId, "owner");

  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (folderId) {
    const { folder } = await requireFolder(folderId);
    if (folder.spaceId !== spaceId) throw new Error("Folder does not belong to this space");
  }

  const slug = await uniqueListSlug(spaceId, slugify(name));

  await db.transaction(async (tx) => {
    const [list] = await tx
      .insert(lists)
      .values({ spaceId, folderId, name, slug })
      .returning();
    const statusRows = await tx
      .insert(statuses)
      .values(DEFAULT_STATUSES.map((s) => ({ ...s, listId: list.id })))
      .returning();
    await tx.update(lists).set({ defaultStatusId: statusRows[0].id }).where(eq(lists.id, list.id));
    await logActivity(tx, {
      spaceId,
      actorId: user.id,
      verb: "list.created",
      payload: { name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

// ---------------------------------------------------------------- folders

const folderRoleSchema = z.enum(["owner", "member", "guest"]);

export async function createFolder(formData: FormData) {
  const spaceId = z.string().uuid().parse(formData.get("spaceId"));
  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const parentFolderId = z
    .string()
    .uuid()
    .optional()
    .parse(formData.get("parentFolderId")?.toString() || undefined);
  const user = await requireUser();
  await assertSpaceRole(spaceId, "owner");

  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (parentFolderId) {
    const { folder: parentFolder } = await requireFolder(parentFolderId);
    if (parentFolder.spaceId !== spaceId) throw new Error("Parent folder does not belong to this space");
  }

  const slug = await uniqueFolderSlug(spaceId, slugify(name));
  const siblingCount = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.spaceId, spaceId),
        parentFolderId ? eq(folders.parentFolderId, parentFolderId) : isNull(folders.parentFolderId),
      ),
    );

  await db.transaction(async (tx) => {
    await tx.insert(folders).values({
      spaceId,
      parentFolderId,
      name,
      slug,
      position: `a${siblingCount.length}`,
      createdBy: user.id,
    });
    await logActivity(tx, {
      spaceId,
      actorId: user.id,
      verb: "folder.created",
      payload: { name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function setFolderPrivacy(formData: FormData) {
  const folderId = z.string().uuid().parse(formData.get("folderId"));
  const isPrivate = formData.get("isPrivate") === "true";
  const { folder, space } = await requireFolder(folderId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(folders).set({ isPrivate }).where(eq(folders.id, folderId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "folder.privacy_changed",
      payload: { folderName: folder.name, isPrivate },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function addFolderMember(formData: FormData) {
  const folderId = z.string().uuid().parse(formData.get("folderId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const role = folderRoleSchema.parse(formData.get("role"));
  const { folder, space } = await requireFolder(folderId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(folderMembers)
    .where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(folderMembers).set({ role }).where(eq(folderMembers.id, existing.id));
    } else {
      await tx.insert(folderMembers).values({ folderId, principalType: "user", userId, role });
    }
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "folder.member_added",
      payload: { userId, displayName: targetUser.displayName, role, folderName: folder.name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function removeFolderMember(formData: FormData) {
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const [member] = await db.select().from(folderMembers).where(eq(folderMembers.id, memberId));
  if (!member) return;
  const { folder, space } = await requireFolder(member.folderId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.delete(folderMembers).where(eq(folderMembers.id, memberId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "folder.member_removed",
      payload: { userId: member.userId, folderName: folder.name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/** Lazily fetched by client components (e.g. the sidebar's right-click menu). */
export async function getFolderSharingData(folderId: string) {
  const { space } = await requireFolder(folderId);
  await assertSpaceRole(space.id, "owner");
  const [members, activeUsers] = await Promise.all([getFolderMembers(folderId), getActiveUsers()]);
  const memberUserIds = new Set(members.map((m) => m.userId));
  return { members, addableUsers: activeUsers.filter((u) => !memberUserIds.has(u.id)) };
}

/** Move a list into another folder (or to a space's top level) and/or another space entirely. */
export async function moveList(listId: string, targetSpaceId: string, targetFolderId: string | null) {
  "use server";
  const { list, space: sourceSpace } = await requireList(listId);
  await assertSpaceRole(sourceSpace.id, "owner");
  const [targetSpace] = await db.select().from(spaces).where(eq(spaces.id, targetSpaceId));
  if (!targetSpace) throw new Error("Target space not found");
  await assertSpaceRole(targetSpaceId, "owner");

  if (targetFolderId) {
    const { folder: targetFolder } = await requireFolder(targetFolderId);
    if (targetFolder.spaceId !== targetSpaceId) throw new Error("Folder does not belong to target space");
  }

  const crossSpace = targetSpaceId !== sourceSpace.id;
  const slug = crossSpace ? await uniqueListSlug(targetSpaceId, list.slug, listId) : list.slug;
  const siblingCount = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.spaceId, targetSpaceId),
        targetFolderId ? eq(lists.folderId, targetFolderId) : isNull(lists.folderId),
      ),
    );
  const actor = await requireUser();

  await db.transaction(async (tx) => {
    await tx
      .update(lists)
      .set({
        spaceId: targetSpaceId,
        folderId: targetFolderId,
        slug,
        position: `a${siblingCount.length}`,
      })
      .where(eq(lists.id, listId));
    await logActivity(tx, {
      spaceId: targetSpaceId,
      actorId: actor.id,
      verb: "list.moved",
      payload: { listName: list.name, fromSpace: sourceSpace.name, toSpace: targetSpace.name },
    });
  });
  revalidatePath(`/tasks/${sourceSpace.slug}`);
  revalidatePath(`/tasks/${targetSpace.slug}`);
}

/** Move a folder (and its whole subtree of subfolders/lists) into another folder, space root, or space. */
export async function moveFolder(
  folderId: string,
  targetSpaceId: string,
  targetParentFolderId: string | null,
) {
  "use server";
  const { folder, space: sourceSpace } = await requireFolder(folderId);
  await assertSpaceRole(sourceSpace.id, "owner");
  const [targetSpace] = await db.select().from(spaces).where(eq(spaces.id, targetSpaceId));
  if (!targetSpace) throw new Error("Target space not found");
  await assertSpaceRole(targetSpaceId, "owner");

  if (targetParentFolderId === folderId) throw new Error("Cannot move a folder into itself");

  const allSourceFolders = await db.select().from(folders).where(eq(folders.spaceId, sourceSpace.id));
  const subtreeIds = new Set<string>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of allSourceFolders) {
      if (f.parentFolderId && subtreeIds.has(f.parentFolderId) && !subtreeIds.has(f.id)) {
        subtreeIds.add(f.id);
        grew = true;
      }
    }
  }
  if (targetParentFolderId && subtreeIds.has(targetParentFolderId)) {
    throw new Error("Cannot move a folder into one of its own subfolders");
  }
  if (targetParentFolderId) {
    const { folder: targetFolder } = await requireFolder(targetParentFolderId);
    if (targetFolder.spaceId !== targetSpaceId) throw new Error("Target folder does not belong to target space");
  }

  const crossSpace = targetSpaceId !== sourceSpace.id;
  const actor = await requireUser();

  // Pre-compute slug renames (if crossing spaces) before opening the transaction.
  const folderSlugUpdates = new Map<string, string>();
  const listSlugUpdates = new Map<string, string>();
  if (crossSpace) {
    for (const id of subtreeIds) {
      const f = allSourceFolders.find((row) => row.id === id)!;
      const newSlug = await uniqueFolderSlug(targetSpaceId, f.slug, id);
      if (newSlug !== f.slug) folderSlugUpdates.set(id, newSlug);
    }
    const subtreeLists = await db
      .select()
      .from(lists)
      .where(inArray(lists.folderId, [...subtreeIds]));
    for (const l of subtreeLists) {
      const newSlug = await uniqueListSlug(targetSpaceId, l.slug, l.id);
      if (newSlug !== l.slug) listSlugUpdates.set(l.id, newSlug);
    }
  }

  const siblingCount = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.spaceId, targetSpaceId),
        targetParentFolderId
          ? eq(folders.parentFolderId, targetParentFolderId)
          : isNull(folders.parentFolderId),
      ),
    );

  await db.transaction(async (tx) => {
    if (crossSpace) {
      await tx
        .update(folders)
        .set({ spaceId: targetSpaceId })
        .where(inArray(folders.id, [...subtreeIds]));
      await tx.update(lists).set({ spaceId: targetSpaceId }).where(inArray(lists.folderId, [...subtreeIds]));
      for (const [id, newSlug] of folderSlugUpdates) {
        await tx.update(folders).set({ slug: newSlug }).where(eq(folders.id, id));
      }
      for (const [id, newSlug] of listSlugUpdates) {
        await tx.update(lists).set({ slug: newSlug }).where(eq(lists.id, id));
      }
    }
    await tx
      .update(folders)
      .set({ parentFolderId: targetParentFolderId, position: `a${siblingCount.length}` })
      .where(eq(folders.id, folderId));
    await logActivity(tx, {
      spaceId: targetSpaceId,
      actorId: actor.id,
      verb: "folder.moved",
      payload: { folderName: folder.name, fromSpace: sourceSpace.name, toSpace: targetSpace.name },
    });
  });
  revalidatePath(`/tasks/${sourceSpace.slug}`);
  revalidatePath(`/tasks/${targetSpace.slug}`);
}

// ---------------------------------------------------------------- spaces

async function uniqueValue(column: typeof spaces.slug | typeof spaces.taskPrefix, base: string) {
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while ((await db.select({ id: spaces.id }).from(spaces).where(eq(column, candidate))).length > 0) {
    candidate = `${base}${column === spaces.slug ? "-" : ""}${n++}`;
  }
  return candidate;
}

export async function createSpace(formData: FormData) {
  const user = await requireUser();
  if (user.platformRole !== "admin") throw new Error("Only admins can create spaces");

  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const rawPrefix = formData.get("taskPrefix");
  const color = z.string().max(20).optional().parse(formData.get("color")?.toString() || undefined);

  const [tasksModule] = await db.select().from(modules).where(eq(modules.slug, "tasks"));
  if (!tasksModule) throw new Error("Tasks module not found");

  const slug = await uniqueValue(spaces.slug, slugify(name));
  const prefixBase =
    (rawPrefix ? String(rawPrefix) : name).replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "SPC";
  const taskPrefix = await uniqueValue(spaces.taskPrefix, prefixBase);

  let newSlug = "";
  await db.transaction(async (tx) => {
    const [space] = await tx
      .insert(spaces)
      .values({ moduleId: tasksModule.id, name, slug, taskPrefix, color: color || null, createdBy: user.id })
      .returning();
    newSlug = space.slug;
    await tx.insert(spaceTaskCounters).values({ spaceId: space.id, nextNumber: 1 });
    await tx.insert(spaceMembers).values({
      spaceId: space.id,
      principalType: "user",
      userId: user.id,
      role: "owner",
    });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "space.created",
      payload: { name },
    });
  });
  revalidatePath("/tasks");
  redirect(`/tasks/${newSlug}`);
}

/** Lazily fetched by client components (e.g. the sidebar's right-click menu) that need
 * sharing data for a space without the nav tree query eagerly loading it for every space. */
export async function getSpaceSharingData(spaceId: string) {
  await assertSpaceRole(spaceId, "owner");
  const [members, activeUsers] = await Promise.all([getSpaceMembers(spaceId), getActiveUsers()]);
  const memberUserIds = new Set(members.map((m) => m.userId));
  return { members, addableUsers: activeUsers.filter((u) => !memberUserIds.has(u.id)) };
}

// ---------------------------------------------------------------- space members

const spaceRoleSchema = z.enum(["owner", "member", "guest"]);

async function requireSpace(spaceId: string) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (!space) throw new Error("Space not found");
  return space;
}

export async function addSpaceMember(formData: FormData) {
  const spaceId = z.string().uuid().parse(formData.get("spaceId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const role = spaceRoleSchema.parse(formData.get("role"));
  const space = await requireSpace(spaceId);
  const actor = await requireUser();
  await assertSpaceRole(spaceId, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(spaceMembers).set({ role }).where(eq(spaceMembers.id, existing.id));
    } else {
      await tx.insert(spaceMembers).values({ spaceId, principalType: "user", userId, role });
    }
    await logActivity(tx, {
      spaceId,
      actorId: actor.id,
      verb: "space.member_added",
      payload: { userId, displayName: targetUser.displayName, role },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function removeSpaceMember(formData: FormData) {
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const [member] = await db.select().from(spaceMembers).where(eq(spaceMembers.id, memberId));
  if (!member) return;
  const space = await requireSpace(member.spaceId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  if (member.role === "owner") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.role, "owner")));
    if (count <= 1) throw new Error("Cannot remove the last owner of a space");
  }

  await db.transaction(async (tx) => {
    await tx.delete(spaceMembers).where(eq(spaceMembers.id, memberId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "space.member_removed",
      payload: { userId: member.userId },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

// ---------------------------------------------------------------- list members

export async function addListMember(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const role = spaceRoleSchema.parse(formData.get("role"));
  const { list, space } = await requireList(listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(listMembers).set({ role }).where(eq(listMembers.id, existing.id));
    } else {
      await tx.insert(listMembers).values({ listId, principalType: "user", userId, role });
    }
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.member_added",
      payload: { userId, displayName: targetUser.displayName, role, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function removeListMember(formData: FormData) {
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const [member] = await db.select().from(listMembers).where(eq(listMembers.id, memberId));
  if (!member) return;
  const { list, space } = await requireList(member.listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.delete(listMembers).where(eq(listMembers.id, memberId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.member_removed",
      payload: { userId: member.userId, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

/**
 * Toggle whether a list inherits access from its space. When restricted,
 * only direct listMembers rows grant access — space owners still bypass
 * this (see getListRole), so the acting owner can never lock themselves out.
 */
export async function setListPrivacy(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const isPrivate = formData.get("isPrivate") === "true";
  const { list, space } = await requireList(listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(lists).set({ isPrivate }).where(eq(lists.id, listId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.privacy_changed",
      payload: { listName: list.name, isPrivate },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(`/tasks/${space.slug}`);
}

// ---------------------------------------------------------------- statuses

export async function createStatus(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const name = z.string().min(1).max(50).parse(formData.get("name"));
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get("color") ?? "#94a3b8");
  const category = z.enum(["open", "active", "done", "cancelled"]).parse(formData.get("category"));
  const { list, space } = await requireList(listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    const existing = await tx.select().from(statuses).where(eq(statuses.listId, listId));
    await tx.insert(statuses).values({
      listId,
      name,
      color,
      category,
      position: `a${existing.length}`,
    });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "status.created",
      payload: { name, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function deleteStatus(formData: FormData) {
  const statusId = z.string().uuid().parse(formData.get("statusId"));
  const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
  if (!status) return;
  const { list, space } = await requireList(status.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.statusId, statusId));
  if (count > 0) throw new Error("Cannot delete a status that has tasks");
  if (list.defaultStatusId === statusId) throw new Error("Cannot delete the default status");

  await db.transaction(async (tx) => {
    await tx.delete(statuses).where(eq(statuses.id, statusId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "status.deleted",
      payload: { name: status.name, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function updateStatus(formData: FormData) {
  const statusId = z.string().uuid().parse(formData.get("statusId"));
  const name = z.string().min(1).max(50).parse(formData.get("name"));
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get("color"));
  const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
  if (!status) return;
  const { list, space } = await requireList(status.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(statuses).set({ name, color }).where(eq(statuses.id, statusId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "status.updated",
      payload: { from: status.name, to: name, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

const reorderStatusSchema = z.array(
  z.object({
    id: z.string().uuid(),
    category: z.enum(["open", "active", "done", "cancelled"]),
    position: z.string().max(20),
  }),
);

/** Bulk reorder/recategorize after a drag-and-drop reorder in the Statuses tab. */
export async function reorderStatuses(
  listId: string,
  updates: { id: string; category: "open" | "active" | "done" | "cancelled"; position: string }[],
) {
  "use server";
  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");
  const parsed = reorderStatusSchema.parse(updates);

  await db.transaction(async (tx) => {
    for (const u of parsed) {
      await tx
        .update(statuses)
        .set({ category: u.category, position: u.position })
        .where(and(eq(statuses.id, u.id), eq(statuses.listId, listId)));
    }
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

// ---------------------------------------------------------------- custom fields

const fieldTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "multi_select",
  "user",
  "checkbox",
  "url",
  "email",
  "phone",
]);

export async function createFieldDefinition(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const label = z.string().min(1).max(100).parse(formData.get("label"));
  const type = fieldTypeSchema.parse(formData.get("type"));
  const isRequired = formData.get("isRequired") === "on";
  const optionsRaw = String(formData.get("options") ?? "").trim();

  const { list, space } = await requireList(listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  let options: { id: string; label: string }[] | null = null;
  if (type === "dropdown" || type === "multi_select") {
    const labels = optionsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length === 0) throw new Error("Dropdown fields need at least one option");
    options = labels.map((l) => ({ id: slugify(l), label: l }));
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.listId, listId));
    await tx.insert(customFieldDefinitions).values({
      listId,
      key: slugify(label),
      label,
      type,
      options,
      isRequired,
      position: `a${existing.length}`,
    });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.created",
      payload: { label, type, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function archiveFieldDefinition(formData: FormData) {
  const fieldId = z.string().uuid().parse(formData.get("fieldId"));
  const [field] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, fieldId));
  if (!field) return;
  const { list, space } = await requireList(field.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefinitions)
      .set({ isArchived: true })
      .where(eq(customFieldDefinitions.id, fieldId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.archived",
      payload: { label: field.label, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

// ---------------------------------------------------------------- custom field parsing

function parseCustomFieldsFromForm(
  formData: FormData,
  defs: (typeof customFieldDefinitions.$inferSelect)[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = formData.getAll(`cf_${def.id}`);
    const first = raw[0];
    let value: unknown;
    switch (def.type as CustomFieldType) {
      case "checkbox":
        value = first === "on" || first === "true";
        break;
      case "number":
        value = first === undefined || first === "" ? undefined : Number(first);
        break;
      case "multi_select":
        value = raw.length > 0 ? raw.map(String) : undefined;
        break;
      default:
        value = first === undefined || first === "" ? undefined : String(first);
    }
    if (value === undefined) {
      if (def.isRequired) throw new Error(`Field "${def.label}" is required`);
      continue;
    }
    const schema = valueSchemaFor(def as unknown as CustomFieldDefinitionLike);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`Invalid value for "${def.label}": ${parsed.error.issues[0]?.message}`);
    }
    values[def.id] = parsed.data;
  }
  return values;
}

// ---------------------------------------------------------------- tasks

export async function createTask(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const title = z.string().min(1).max(300).parse(formData.get("title"));
  const priorityRaw = String(formData.get("priority") ?? "");
  const priority = priorityRaw
    ? z.enum(["urgent", "high", "normal", "low"]).parse(priorityRaw)
    : null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const dueDate = dueDateRaw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dueDateRaw) : null;
  const assigneeIds = formData.getAll("assignees").map((v) => z.string().uuid().parse(v));

  const { list, space } = await requireList(listId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const defs = (
    await db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.listId, listId))
  ).filter((d) => !d.isArchived);
  const customFields = parseCustomFieldsFromForm(formData, defs);

  if (!list.defaultStatusId) throw new Error("List has no default status");

  let createdTaskId: string | undefined;
  let createdTaskNumber: string | undefined;
  await db.transaction(async (tx) => {
    const [counter] = await tx
      .update(spaceTaskCounters)
      .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
      .where(eq(spaceTaskCounters.spaceId, space.id))
      .returning({ next: spaceTaskCounters.nextNumber });
    // counter.next is the value AFTER increment; the allocated number is next - 1
    const number = `${space.taskPrefix}-${counter.next - 1}`;

    const [task] = await tx
      .insert(tasks)
      .values({
        listId,
        number,
        title,
        statusId: list.defaultStatusId!,
        priority,
        dueDate,
        customFields,
        createdBy: user.id,
        source: "manual",
      })
      .returning();

    if (assigneeIds.length > 0) {
      await tx.insert(taskAssignees).values(
        assigneeIds.map((userId) => ({ taskId: task.id, userId, assignedBy: user.id })),
      );
    }
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "task.created",
      payload: { title, number },
    });
    createdTaskId = task.id;
    createdTaskNumber = number;
  });

  if (assigneeIds.length > 0 && createdTaskId) {
    await notifyUsers({
      recipientIds: assigneeIds,
      type: "assigned",
      taskId: createdTaskId,
      actorId: user.id,
      payload: { number: createdTaskNumber, title },
    });
  }
  await pingListUpdate(listId);
  revalidatePath(listPath(space.slug, list.slug));
}

export async function updateTaskStatus(taskId: string, statusId: string) {
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");
  if (task.statusId === statusId) return;

  const [fromStatus] = await db.select().from(statuses).where(eq(statuses.id, task.statusId));
  const [toStatus] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.listId, task.listId)));
  if (!toStatus) throw new Error("Invalid status");

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        statusId,
        completedAt: (toStatus.category === "done" || toStatus.category === "cancelled")
          ? new Date()
          : null,
      })
      .where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.status_changed",
      payload: { from: fromStatus?.name, to: toStatus.name },
    });
  });

  const assignees = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  await notifyUsers({
    recipientIds: assignees.map((a) => a.userId),
    type: "status_changed",
    taskId,
    actorId: user.id,
    payload: { from: fromStatus?.name, to: toStatus.name, number: task.number },
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline priority cell. */
export async function updateTaskPriority(
  taskId: string,
  priority: "urgent" | "high" | "normal" | "low" | null,
) {
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");
  if (task.priority === priority) return;

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ priority }).where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.priority_changed",
      payload: { from: task.priority, to: priority },
    });
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline due/start date cells. */
export async function updateTaskDate(
  taskId: string,
  field: "dueDate" | "startDate",
  value: string | null,
) {
  const parsed = value ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(value) : null;
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");
  if (task[field] === parsed) return;

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ [field]: parsed }).where(eq(tasks.id, taskId));
    if (field === "dueDate") {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.due_date_changed",
        payload: { from: task.dueDate, to: parsed },
      });
    }
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline custom-field cells. */
export async function updateTaskCustomField(taskId: string, defId: string, value: unknown) {
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const [def] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, defId));
  if (!def || def.listId !== task.listId) throw new Error("Field not found");

  const schema = valueSchemaFor(def as unknown as CustomFieldDefinitionLike);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid value: ${parsed.error.issues[0]?.message}`);

  const before = (task.customFields ?? {}) as Record<string, unknown>;
  const after = { ...before, [defId]: parsed.data };
  if (parsed.data === undefined) delete after[defId];

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ customFields: after }).where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.field_changed",
      payload: { field: def.label, from: before[defId] ?? null, to: parsed.data ?? null },
    });
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function updateTaskCore(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const title = z.string().min(1).max(300).parse(formData.get("title"));
  const description = String(formData.get("description") ?? "");
  const priorityRaw = String(formData.get("priority") ?? "");
  const priority = priorityRaw
    ? z.enum(["urgent", "high", "normal", "low"]).parse(priorityRaw)
    : null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const dueDate = dueDateRaw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dueDateRaw) : null;
  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(startDateRaw) : null;
  const statusId = z.string().uuid().parse(formData.get("statusId"));

  const defs = (
    await db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.listId, task.listId))
  ).filter((d) => !d.isArchived);
  const customFields = parseCustomFieldsFromForm(formData, defs);

  const [toStatus] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.listId, task.listId)));
  if (!toStatus) throw new Error("Invalid status");

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        title,
        description: description ? { text: description } : null,
        priority,
        dueDate,
        startDate,
        statusId,
        customFields,
        completedAt: (toStatus.category === "done" || toStatus.category === "cancelled")
          ? (task.completedAt ?? new Date())
          : null,
      })
      .where(eq(tasks.id, taskId));

    if (title !== task.title) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.title_changed",
        payload: { from: task.title, to: title },
      });
    }
    if (statusId !== task.statusId) {
      const [fromStatus] = await tx.select().from(statuses).where(eq(statuses.id, task.statusId));
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.status_changed",
        payload: { from: fromStatus?.name, to: toStatus.name },
      });
    }
    if (priority !== task.priority) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.priority_changed",
        payload: { from: task.priority, to: priority },
      });
    }
    if (dueDate !== task.dueDate) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.due_date_changed",
        payload: { from: task.dueDate, to: dueDate },
      });
    }
    const oldCf = (task.customFields ?? {}) as Record<string, unknown>;
    for (const def of defs) {
      const before = JSON.stringify(oldCf[def.id] ?? null);
      const after = JSON.stringify(customFields[def.id] ?? null);
      if (before !== after) {
        await logActivity(tx, {
          spaceId: space.id,
          taskId,
          actorId: user.id,
          verb: "task.field_changed",
          payload: { field: def.label, from: oldCf[def.id] ?? null, to: customFields[def.id] ?? null },
        });
      }
    }
  });

  if (statusId !== task.statusId) {
    const assignees = await db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId));
    await notifyUsers({
      recipientIds: assignees.map((a) => a.userId),
      type: "status_changed",
      taskId,
      actorId: user.id,
      payload: { to: toStatus.name, number: task.number },
    });
  }
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function toggleAssignee(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const existing = await db
    .select()
    .from(taskAssignees)
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      await tx
        .delete(taskAssignees)
        .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.assignee_removed",
        payload: { userId },
      });
    } else {
      await tx.insert(taskAssignees).values({ taskId, userId, assignedBy: user.id });
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.assignee_added",
        payload: { userId },
      });
    }
  });
  if (existing.length === 0) {
    await notifyUsers({
      recipientIds: [userId],
      type: "assigned",
      taskId,
      actorId: user.id,
      payload: { number: task.number, title: task.title },
    });
  }
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function archiveTask(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ isArchived: true }).where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.archived",
      payload: { number: task.number },
    });
  });
  revalidatePath(listPath(space.slug, list.slug));
}

// ---------------------------------------------------------------- comments

export async function addComment(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const body = z.string().min(1).max(10_000).parse(formData.get("body"));
  const mentionIds = formData.getAll("mentions").map((v) => z.string().uuid().parse(v));

  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "guest"); // guests may comment

  const { comments, commentMentions } = await import("@aitim/db");

  await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(comments)
      .values({ taskId, authorId: user.id, body: { text: body } })
      .returning();
    if (mentionIds.length > 0) {
      await tx
        .insert(commentMentions)
        .values(mentionIds.map((userId) => ({ commentId: comment.id, userId })))
        .onConflictDoNothing();
    }
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "comment.created",
      payload: { preview: body.slice(0, 140) },
    });
  });

  // Fan-out after commit: assignees + creator get "comment", mentions get "mentioned"
  const assignees = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  const mentionSet = new Set(mentionIds);
  const commentRecipients = [
    ...assignees.map((a) => a.userId),
    ...(task.createdBy ? [task.createdBy] : []),
  ].filter((id) => !mentionSet.has(id));

  const { notifyUsers } = await import("@/lib/notify");
  const preview = body.slice(0, 140);
  await notifyUsers({
    recipientIds: commentRecipients,
    type: "comment",
    taskId,
    actorId: user.id,
    payload: { preview, number: task.number },
  });
  await notifyUsers({
    recipientIds: mentionIds,
    type: "mentioned",
    taskId,
    actorId: user.id,
    payload: { preview, number: task.number },
  });

  revalidatePath(`/tasks/task/${task.number}`);
}

const filterConditionSchema = z.array(
  z.object({
    field: z.string().max(60),
    op: z.string().max(20),
    value: z.string().max(500),
    conjunction: z.enum(["and", "or"]).optional(),
  }),
).max(20);

/** Follow-up page fetch for the infinite-scrolling task table. */
export async function fetchTasksPage(params: {
  listId: string;
  conditions?: unknown;
  groupBy?: string;
  sort?: { fieldId: string; dir: "asc" | "desc" } | null;
  offset: number;
  limit?: number;
}) {
  "use server";
  const listId = z.string().uuid().parse(params.listId);
  await assertListRole(listId, "guest");
  const conditions = filterConditionSchema.parse(params.conditions ?? []);
  const limit = Math.min(Math.max(z.number().int().optional().parse(params.limit) ?? 200, 1), 500);
  const offset = z.number().int().min(0).max(1_000_000).parse(params.offset);
  const sort = params.sort
    ? { fieldId: z.string().uuid().parse(params.sort.fieldId), dir: z.enum(["asc", "desc"]).parse(params.sort.dir) }
    : null;
  const groupBy = params.groupBy ? z.string().max(60).parse(params.groupBy) : undefined;

  const { getTasksPage } = await import("./queries");
  return getTasksPage({ listId, conditions, groupBy, sort, limit, offset, countsAlreadyKnown: true });
}

export async function saveTableColumnOrder(listId: string, order: string[]) {
  "use server";
  await requireUser();
  const { list } = await requireList(listId);
  // Any list member (direct or inherited from the space) can save their own column layout
  const user = await (await import("@/lib/auth")).auth();
  if (!user?.user?.id) return;
  const role = await getListRole(user.user.id, list.id, (user.user as { platformRole?: string }).platformRole ?? "member");
  if (!role) return;

  await db.update(lists).set({ tableColumnOrder: order }).where(eq(lists.id, list.id));
  // No revalidatePath needed — client reads this on next load via prop
}

/** Persist the active view (table|board) and/or groupBy for a list. Any list member can call this. */
export async function saveListViewPrefs(
  listId: string,
  prefs: { view?: string; groupBy?: string },
) {
  "use server";
  const { list } = await requireList(listId);
  const session = await (await import("@/lib/auth")).auth();
  if (!session?.user?.id) return;
  const role = await getListRole(
    session.user.id,
    list.id,
    (session.user as { platformRole?: string }).platformRole ?? "member",
  );
  if (!role) return;

  const updates: Record<string, string | null> = {};
  if ("view" in prefs) updates.defaultView = prefs.view ?? null;
  if ("groupBy" in prefs) updates.defaultGroupBy = prefs.groupBy || null;
  if (Object.keys(updates).length === 0) return;

  await db.update(lists).set(updates).where(eq(lists.id, list.id));
}

export async function saveTaskLayout(
  listId: string,
  layout: import("./layout-types").TaskLayout,
) {
  "use server";
  await requireUser();
  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");

  await db.update(lists).set({ taskLayout: layout }).where(eq(lists.id, list.id));

  revalidatePath(`/tasks/${space.slug}/${list.slug}`);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}
