import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSpaceRole, requireUser } from "@/lib/rbac";
import { createList } from "@/modules/tasks/actions";
import { getListsForSpace, getSpaceBySlug } from "@/modules/tasks/queries";

export default async function SpacePage(props: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await props.params;
  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const role = await getSpaceRole(user.id, space.id, user.platformRole);
  if (!role) notFound();

  const spaceLists = await getListsForSpace(space.id);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold" style={space.color ? { color: space.color } : undefined}>
        {space.name}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Space · prefix {space.taskPrefix} · your role: {role}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {spaceLists.map((list) => (
          <Link key={list.id} href={`/tasks/${space.slug}/${list.slug}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{list.name}</CardTitle>
                {list.description && <CardDescription>{list.description}</CardDescription>}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {role === "owner" && (
        <form action={createList} className="mt-8 flex max-w-sm items-end gap-2">
          <input type="hidden" name="spaceId" value={space.id} />
          <div className="flex-1">
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              New list
            </label>
            <Input id="name" name="name" placeholder="e.g. Inspections" required />
          </div>
          <Button type="submit">Create</Button>
        </form>
      )}
    </div>
  );
}
