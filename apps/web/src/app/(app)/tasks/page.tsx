import { db, spaces } from "@aitim/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSpaceRole, requireUser } from "@/lib/rbac";

export default async function TasksHomePage() {
  const user = await requireUser();
  const candidates = await db.select().from(spaces).where(eq(spaces.isArchived, false));
  const roles = await Promise.all(
    candidates.map((s) => getSpaceRole(user.id, s.id, user.platformRole)),
  );
  const allSpaces = candidates.filter((_, i) => roles[i] !== null);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-semibold">Tasks</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {allSpaces.map((s) => (
          <Link key={s.id} href={`/tasks/${s.slug}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle style={s.color ? { color: s.color } : undefined}>{s.name}</CardTitle>
                <CardDescription>Space · {s.taskPrefix}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        {allSpaces.length === 0 && <p className="text-muted-foreground">No spaces yet.</p>}
      </div>
    </div>
  );
}
