"use server";

import { db, entraGroups, groupRoleMappings, users } from "@aitim/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueue, JOBS } from "@/lib/queue";
import { requireAdmin } from "@/lib/rbac";

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
