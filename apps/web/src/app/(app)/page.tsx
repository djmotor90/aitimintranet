import { db, users } from "@aitim/db";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/rbac";

export default async function HomePage() {
  const user = await requireUser();
  const [{ value: userCount }] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.isActive, true));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Welcome, {user.name?.split(" ")[0]}</h1>
      <p className="mb-6 text-muted-foreground">AITIM Group Intranet</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/tasks">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>Safety department customer requests</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/directory">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Directory</CardTitle>
              <CardDescription>{userCount} active colleagues</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
