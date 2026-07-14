import { db, spaceMembers, userGroupMemberships } from "@aitim/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type SpaceRole = "owner" | "member" | "guest";
const ROLE_RANK: Record<SpaceRole, number> = { owner: 3, member: 2, guest: 1 };

/** Session user or redirect to login. */
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
});

export const requireAdmin = cache(async () => {
  const user = await requireUser();
  if (user.platformRole !== "admin") redirect("/");
  return user;
});

/**
 * Effective role in a space: direct membership OR membership via a mapped
 * Entra group; highest role wins. Platform admins are implicit owners.
 */
export const getSpaceRole = cache(
  async (userId: string, spaceId: string, platformRole?: string): Promise<SpaceRole | null> => {
    if (platformRole === "admin") return "owner";

    const groupRows = await db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, userId));
    const groupIds = groupRows.map((r) => r.groupId);

    const memberships = await db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, spaceId),
          or(
            eq(spaceMembers.userId, userId),
            groupIds.length > 0 ? inArray(spaceMembers.groupId, groupIds) : undefined,
          ),
        ),
      );

    if (memberships.length === 0) return null;
    return memberships.reduce<SpaceRole>(
      (best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best),
      "guest",
    );
  },
);

export async function assertSpaceRole(spaceId: string, minimum: SpaceRole): Promise<SpaceRole> {
  const user = await requireUser();
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimum]) redirect("/");
  return role;
}
