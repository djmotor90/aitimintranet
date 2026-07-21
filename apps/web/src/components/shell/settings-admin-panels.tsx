"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
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
import {
  createPlatformRoleMapping,
  deleteRoleMapping,
  getAdminGroupsData,
  getAdminUsersData,
  toggleUserActive,
  triggerEntraSync,
  type AdminGroupRow,
  type AdminMappingRow,
  type AdminUserRow,
} from "@/modules/shell/actions/admin";

export function SettingsAdminUsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [graphConfigured, setGraphConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getAdminUsersData();
      setUsers(data.users);
      setGraphConfigured(data.graphConfigured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading users…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">Directory accounts and platform roles.</p>
        </div>
        <Button
          type="button"
          disabled={!graphConfigured || pending}
          onClick={() => {
            startTransition(async () => {
              await triggerEntraSync();
              await load();
            });
          }}
        >
          Sync from Entra ID
        </Button>
      </div>
      {!graphConfigured && (
        <p className="text-sm text-amber-600">
          Daemon credentials not configured — see docs/entra-setup.md to enable directory sync.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
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
            {users.map((u) => (
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
                  {u.lastSyncedAt ?? "—"}
                </TableCell>
                <TableCell>
                  {!u.isProtectedAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const fd = new FormData();
                          fd.set("id", u.id);
                          await toggleUserActive(fd);
                          await load();
                        });
                      }}
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function SettingsAdminGroupsPanel() {
  const [groups, setGroups] = useState<AdminGroupRow[]>([]);
  const [mappings, setMappings] = useState<AdminMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getAdminGroupsData();
      setGroups(data.groups);
      setMappings(data.mappings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading groups…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Groups &amp; Roles</h2>
        <p className="text-sm text-muted-foreground">
          Map Entra groups to platform roles for automatic access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Role mappings</CardTitle>
          <CardDescription>
            Members of a mapped Entra group automatically receive the mapped role on next sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border">
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
                      <Badge>
                        {m.targetType === "platform_role" ? `platform: ${m.role}` : m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const fd = new FormData();
                            fd.set("id", m.id);
                            await deleteRoleMapping(fd);
                            await load();
                          });
                        }}
                      >
                        Remove
                      </Button>
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
          </div>

          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              startTransition(async () => {
                await createPlatformRoleMapping(fd);
                form.reset();
                await load();
              });
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="settings-groupId" className="text-sm font-medium">
                Group
              </label>
              <select
                id="settings-groupId"
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
              <label htmlFor="settings-role" className="text-sm font-medium">
                Platform role
              </label>
              <select
                id="settings-role"
                name="role"
                required
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
            </div>
            <Button type="submit" disabled={groups.length === 0 || pending}>
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
