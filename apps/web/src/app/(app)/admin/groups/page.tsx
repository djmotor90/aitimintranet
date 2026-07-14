import { db, entraGroups, groupRoleMappings } from "@aitim/db";
import { asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/rbac";
import { createPlatformRoleMapping, deleteRoleMapping } from "@/modules/shell/actions/admin";

export default async function AdminGroupsPage() {
  await requireAdmin();
  const groups = await db.select().from(entraGroups).orderBy(asc(entraGroups.displayName));
  const mappings = await db
    .select({
      id: groupRoleMappings.id,
      role: groupRoleMappings.role,
      targetType: groupRoleMappings.targetType,
      groupName: entraGroups.displayName,
    })
    .from(groupRoleMappings)
    .innerJoin(entraGroups, eq(groupRoleMappings.groupId, entraGroups.id));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Groups &amp; Roles</h1>

      <Card>
        <CardHeader>
          <CardTitle>Role mappings</CardTitle>
          <CardDescription>
            Members of a mapped Entra group automatically receive the mapped role on next sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entra group</TableHead>
                <TableHead>Grants</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.groupName}</TableCell>
                  <TableCell>
                    <Badge>{m.targetType === "platform_role" ? `platform: ${m.role}` : m.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={deleteRoleMapping}>
                      <input type="hidden" name="id" value={m.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        Remove
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {mappings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No mappings yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <form action={createPlatformRoleMapping} className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="groupId" className="text-sm font-medium">
                Group
              </label>
              <select
                id="groupId"
                name="groupId"
                required
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-sm font-medium">
                Platform role
              </label>
              <select
                id="role"
                name="role"
                required
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
            </div>
            <Button type="submit" disabled={groups.length === 0}>
              Add mapping
            </Button>
          </form>
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No Entra groups imported yet — run “Sync from Entra ID” on the Users page first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
