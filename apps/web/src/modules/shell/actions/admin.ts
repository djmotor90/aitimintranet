"use server";

import { db, entraGroups, groupRoleMappings, users } from "@aitim/db";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueue, JOBS } from "@/lib/queue";
import { requireAdmin } from "@/lib/rbac";

export type AdminUserRow = {
  id: string;
  displayName: string;
  email: string;
  department: string | null;
  platformRole: "admin" | "member";
  isProtectedAdmin: boolean;
  isActive: boolean;
  photoKey: string | null;
  lastSyncedAt: string | null;
};

export type AdminGroupRow = { id: string; displayName: string };

export type AdminMappingRow = {
  id: string;
  role: string;
  targetType: string;
  groupName: string;
};

export async function getAdminUsersData(): Promise<{
  users: AdminUserRow[];
  graphConfigured: boolean;
}> {
  await requireAdmin();
  const rows = await db.select().from(users).orderBy(asc(users.displayName));
  return {
    graphConfigured: !!process.env.DAEMON_CLIENT_ID,
    users: rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      department: u.department,
      platformRole: u.platformRole,
      isProtectedAdmin: u.isProtectedAdmin,
      isActive: u.isActive,
      photoKey: u.photoKey,
      lastSyncedAt: u.lastSyncedAt
        ? u.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
        : null,
    })),
  };
}

export async function getAdminGroupsData(): Promise<{
  groups: AdminGroupRow[];
  mappings: AdminMappingRow[];
}> {
  await requireAdmin();
  const groups = await db
    .select({ id: entraGroups.id, displayName: entraGroups.displayName })
    .from(entraGroups)
    .orderBy(asc(entraGroups.displayName));
  const mappings = await db
    .select({
      id: groupRoleMappings.id,
      role: groupRoleMappings.role,
      targetType: groupRoleMappings.targetType,
      groupName: entraGroups.displayName,
    })
    .from(groupRoleMappings)
    .innerJoin(entraGroups, eq(groupRoleMappings.groupId, entraGroups.id));
  return { groups, mappings };
}

export async function triggerEntraSync() {
  await requireAdmin();
  await enqueue(JOBS.syncEntra);
  await enqueue("sync-group-catalog");
  await enqueue(JOBS.syncPhotos);
  revalidatePath("/admin/users");
}

const mappingSchema = z.object({
  groupId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

export async function createPlatformRoleMapping(formData: FormData) {
  await requireAdmin();
  const parsed = mappingSchema.parse({
    groupId: formData.get("groupId"),
    role: formData.get("role"),
  });
  await db.insert(groupRoleMappings).values({
    groupId: parsed.groupId,
    targetType: "platform_role",
    role: parsed.role,
  });
  revalidatePath("/admin/groups");
}

export async function deleteRoleMapping(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await db.delete(groupRoleMappings).where(eq(groupRoleMappings.id, id));
  revalidatePath("/admin/groups");
}

export async function toggleUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  if (id === admin.id) return; // don't deactivate yourself
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user || user.isProtectedAdmin) return;
  await db
    .update(users)
    .set({
      isActive: !user.isActive,
      deactivatedAt: user.isActive ? new Date() : null,
    })
    .where(eq(users.id, id));
  revalidatePath("/admin/users");
}
