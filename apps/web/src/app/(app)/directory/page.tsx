import { db, users } from "@aitim/db";
import { asc, eq } from "drizzle-orm";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/rbac";

export default async function DirectoryPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await props.searchParams;
  const query = q?.toLowerCase().trim() ?? "";

  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.displayName));

  const filtered = query
    ? allUsers.filter(
        (u) =>
          u.displayName.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.department?.toLowerCase().includes(query) ||
          u.jobTitle?.toLowerCase().includes(query),
      )
    : allUsers;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-semibold">Directory</h1>
      <form className="mb-6">
        <Input
          name="q"
          placeholder="Search by name, email, department…"
          defaultValue={q ?? ""}
          className="max-w-sm"
        />
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} className="size-10" />
              <div className="min-w-0">
                <div className="truncate font-medium">{u.displayName}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {[u.jobTitle, u.department].filter(Boolean).join(" · ") || u.email}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-muted-foreground">No people found.</p>
        )}
      </div>
    </div>
  );
}
