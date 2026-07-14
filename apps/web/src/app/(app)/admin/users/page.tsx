import { db, users } from "@aitim/db";
import { asc } from "drizzle-orm";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/rbac";
import { toggleUserActive, triggerEntraSync } from "@/modules/shell/actions/admin";

export default async function AdminUsersPage() {
  await requireAdmin();
  const allUsers = await db.select().from(users).orderBy(asc(users.displayName));
  const graphConfigured = !!process.env.DAEMON_CLIENT_ID;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <form action={triggerEntraSync}>
          <Button type="submit" disabled={!graphConfigured}>
            Sync from Entra ID
          </Button>
        </form>
      </div>
      {!graphConfigured && (
        <p className="mb-4 text-sm text-amber-600">
          Daemon credentials not configured — see docs/entra-setup.md to enable directory sync.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last synced</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allUsers.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} />
                  <div>
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{u.department ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={u.platformRole === "admin" ? "default" : "secondary"}>
                  {u.platformRole}
                  {u.isProtectedAdmin ? " ★" : ""}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={u.isActive ? "outline" : "destructive"}>
                  {u.isActive ? "active" : "inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {u.lastSyncedAt ? u.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}
              </TableCell>
              <TableCell>
                {!u.isProtectedAdmin && (
                  <form action={toggleUserActive}>
                    <input type="hidden" name="id" value={u.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
