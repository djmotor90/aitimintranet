"use server";

import {
  customFieldDefinitions,
  db,
  lists,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
} from "@aitim/db";
import { valueSchemaFor, type CustomFieldDefinitionLike, type CustomFieldType } from "@aitim/shared";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyUsers, pingListUpdate } from "@/lib/notify";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "./lib/activity";

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
  const user = await requireUser();
  await assertSpaceRole(spaceId, "owner");

  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));

  await db.transaction(async (tx) => {
    const [list] = await tx
      .insert(lists)
      .values({ spaceId, name, slug: slugify(name) })
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
  await assertSpaceRole(space.id, "member");

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
  await assertSpaceRole(space.id, "member");
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

export async function updateTaskCore(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "member");

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
  await assertSpaceRole(space.id, "member");

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
  await assertSpaceRole(space.id, "member");

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
  await assertSpaceRole(space.id, "guest"); // guests may comment

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

export async function saveTableColumnOrder(listId: string, order: string[]) {
  "use server";
  await requireUser();
  const { list, space } = await requireList(listId);
  // Any space member can save their own column layout — we only need role existence
  const { getSpaceRole } = await import("@/lib/rbac");
  const user = await (await import("@/lib/auth")).auth();
  if (!user?.user?.id) return;
  const role = await getSpaceRole(user.user.id, space.id, (user.user as { platformRole?: string }).platformRole ?? "member");
  if (!role) return;

  await db.update(lists).set({ tableColumnOrder: order }).where(eq(lists.id, list.id));
  // No revalidatePath needed — client reads this on next load via prop
}

/** Persist the active view (table|board) and/or groupBy for a list. Any space member can call this. */
export async function saveListViewPrefs(
  listId: string,
  prefs: { view?: string; groupBy?: string },
) {
  "use server";
  const { list, space } = await requireList(listId);
  const { getSpaceRole } = await import("@/lib/rbac");
  const session = await (await import("@/lib/auth")).auth();
  if (!session?.user?.id) return;
  const role = await getSpaceRole(
    session.user.id,
    space.id,
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
