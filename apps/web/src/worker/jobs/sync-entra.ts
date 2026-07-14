import {
  db,
  entraGroups,
  groupRoleMappings,
  spaceMembers,
  syncState,
  userGroupMemberships,
  users,
} from "@aitim/db";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { collectPaged, type GraphUser } from "@/lib/graph/app-client";

async function getDeltaLink(): Promise<string | null> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, "users_delta_link"));
  return (row?.value as { url?: string })?.url ?? null;
}

async function saveDeltaLink(url: string) {
  await db
    .insert(syncState)
    .values({ key: "users_delta_link", value: { url } })
    .onConflictDoUpdate({ target: syncState.key, set: { value: { url } } });
}

async function syncUsers() {
  const startUrl =
    (await getDeltaLink()) ??
    "/users/delta?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled";
  const { values, deltaLink } = await collectPaged<GraphUser>(startUrl);

  for (const gu of values) {
    if (gu["@removed"]) {
      await db
        .update(users)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(eq(users.entraObjectId, gu.id));
      continue;
    }
    const email = gu.mail ?? gu.userPrincipalName;
    if (!email) continue;
    const values_ = {
      email,
      displayName: gu.displayName ?? email,
      jobTitle: gu.jobTitle ?? null,
      department: gu.department ?? null,
      isActive: gu.accountEnabled ?? true,
      lastSyncedAt: new Date(),
    };
    await db
      .insert(users)
      .values({ entraObjectId: gu.id, ...values_ })
      .onConflictDoUpdate({ target: users.entraObjectId, set: values_ });
  }
  if (deltaLink) await saveDeltaLink(deltaLink);
  return values.length;
}

async function syncGroupMemberships() {
  // Groups referenced by role mappings or space membership are the ones we track.
  const mapped = await db
    .select({ groupId: groupRoleMappings.groupId })
    .from(groupRoleMappings);
  const spaceGroups = await db
    .select({ groupId: spaceMembers.groupId })
    .from(spaceMembers)
    .where(isNotNull(spaceMembers.groupId));
  const groupIds = [
    ...new Set([...mapped.map((r) => r.groupId), ...spaceGroups.map((r) => r.groupId!)]),
  ];
  if (groupIds.length === 0) return 0;

  const groups = await db.select().from(entraGroups).where(inArray(entraGroups.id, groupIds));

  for (const group of groups) {
    const { values } = await collectPaged<GraphUser>(
      `/groups/${group.entraGroupId}/transitiveMembers/microsoft.graph.user?$select=id&$count=true`,
    );
    const memberOids = values.map((m) => m.id);
    const memberRows =
      memberOids.length > 0
        ? await db
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.entraObjectId, memberOids))
        : [];

    await db.transaction(async (tx) => {
      await tx.delete(userGroupMemberships).where(eq(userGroupMemberships.groupId, group.id));
      if (memberRows.length > 0) {
        await tx
          .insert(userGroupMemberships)
          .values(memberRows.map((u) => ({ userId: u.id, groupId: group.id })))
          .onConflictDoNothing();
      }
      await tx
        .update(entraGroups)
        .set({ lastSyncedAt: new Date() })
        .where(eq(entraGroups.id, group.id));
    });
  }
  return groups.length;
}

async function recomputePlatformRoles() {
  // Users in a group mapped to platform_role=admin become admins; everyone
  // else falls back to member — except protected (break-glass) admins.
  await db.execute(sql`
    update users u set platform_role = coalesce(sub.role, 'member')::platform_role
    from (
      select u2.id, max(m.role) as role
      from users u2
      left join user_group_memberships ugm on ugm.user_id = u2.id
      left join group_role_mappings m
        on m.group_id = ugm.group_id and m.target_type = 'platform_role'
      group by u2.id
    ) sub
    where sub.id = u.id
      and u.is_protected_admin = false
      and u.platform_role is distinct from coalesce(sub.role, 'member')::platform_role
  `);
}

export async function runSyncEntra(): Promise<string> {
  const userCount = await syncUsers();
  const groupCount = await syncGroupMemberships();
  await recomputePlatformRoles();
  return `synced ${userCount} user changes, ${groupCount} groups`;
}

/** Import all tenant groups (id + name) so admins can pick them in mappings. */
export async function runSyncGroupCatalog(): Promise<number> {
  const { values } = await collectPaged<{ id: string; displayName: string }>(
    "/groups?$select=id,displayName&$filter=securityEnabled eq true",
  );
  for (const g of values) {
    await db
      .insert(entraGroups)
      .values({ entraGroupId: g.id, displayName: g.displayName })
      .onConflictDoUpdate({
        target: entraGroups.entraGroupId,
        set: { displayName: g.displayName },
      });
  }
  return values.length;
}
