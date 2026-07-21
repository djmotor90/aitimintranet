import Link from "next/link";
import { TrashPanel } from "@/modules/tasks/components/trash-panel";
import { getTrashItemsForUser } from "@/modules/tasks/queries";
import { requireUser } from "@/lib/rbac";

export default async function TasksTrashPage() {
  const user = await requireUser();
  const items = await getTrashItemsForUser(user);
  // Serialize dates for the client component boundary.
  const serialized = items.map((i) => ({
    ...i,
    deletedAt: i.deletedAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleted spaces, folders, and lists stay here until you restore them or delete them
            forever.
          </p>
        </div>
        <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Tasks
        </Link>
      </div>
      <TrashPanel items={serialized} />
    </div>
  );
}
