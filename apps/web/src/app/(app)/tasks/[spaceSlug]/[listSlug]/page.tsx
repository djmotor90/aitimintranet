import { Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSpaceRole, requireUser } from "@/lib/rbac";
import { Board } from "@/modules/tasks/components/board";
import { ListLiveRefresh } from "@/modules/tasks/components/list-live-refresh";
import { NewTaskDialog } from "@/modules/tasks/components/new-task-dialog";
import { TaskTable } from "@/modules/tasks/components/task-table";
import {
  getActiveUsers,
  getFieldDefinitions,
  getListBySlug,
  getSpaceBySlug,
  getStatusesForList,
  getTasksForList,
} from "@/modules/tasks/queries";

export default async function ListPage(props: {
  params: Promise<{ spaceSlug: string; listSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { spaceSlug, listSlug } = await props.params;
  const sp = await props.searchParams;
  const view = sp.view === "board" ? "board" : "table";

  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const role = await getSpaceRole(user.id, space.id, user.platformRole);
  if (!role) notFound();
  const list = await getListBySlug(space.id, listSlug);
  if (!list) notFound();

  const [listStatuses, fieldDefs, items, activeUsers] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id),
    getTasksForList(list.id),
    getActiveUsers(),
  ]);
  const userNames = new Map(activeUsers.map((u) => [u.id, u.displayName]));

  // --- filters (server-side) ---
  const filterStatus = sp.status;
  const filterPriority = sp.priority;
  const filterAssignee = sp.assignee;
  const dropdownDefs = fieldDefs.filter((d) => d.type === "dropdown");
  const filtered = items.filter(({ task, assignees }) => {
    if (filterStatus && task.statusId !== filterStatus) return false;
    if (filterPriority && task.priority !== filterPriority) return false;
    if (filterAssignee && !assignees.some((a) => a.id === filterAssignee)) return false;
    for (const def of dropdownDefs) {
      const want = sp[`cf_${def.key}`];
      if (want && (task.customFields as Record<string, unknown>)[def.id] !== want) return false;
    }
    return true;
  });

  const boardTasks = filtered.map(({ task, assignees }) => ({
    id: task.id,
    number: task.number,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    statusId: task.statusId,
    assignees,
  }));

  const baseParams = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => v && k !== "view") as [string, string][],
  );

  return (
    <div className="flex h-full flex-col">
      <ListLiveRefresh listId={list.id} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href={`/tasks/${space.slug}`} className="hover:underline">
              {space.name}
            </Link>
          </div>
          <h1 className="text-xl font-semibold">{list.name}</h1>
        </div>
        <Badge variant="secondary">{filtered.length} tasks</Badge>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            <Link
              href={`?${new URLSearchParams({ ...Object.fromEntries(baseParams), view: "board" }).toString()}`}
            >
              <Button variant={view === "board" ? "secondary" : "ghost"} size="sm">
                Board
              </Button>
            </Link>
            <Link href={`?${new URLSearchParams({ ...Object.fromEntries(baseParams) }).toString()}`}>
              <Button variant={view === "table" ? "secondary" : "ghost"} size="sm">
                Table
              </Button>
            </Link>
          </div>
          {role === "owner" && (
            <Link href={`/tasks/${space.slug}/${list.slug}/settings`}>
              <Button variant="outline" size="sm">
                <Settings className="size-4" />
              </Button>
            </Link>
          )}
          <NewTaskDialog listId={list.id} fieldDefs={fieldDefs} users={activeUsers} />
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="GET">
        {view === "board" && <input type="hidden" name="view" value="board" />}
        <select
          name="status"
          defaultValue={filterStatus ?? ""}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">All statuses</option>
          {listStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={filterPriority ?? ""}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select
          name="assignee"
          defaultValue={filterAssignee ?? ""}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">All assignees</option>
          {activeUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        {dropdownDefs.map((def) => (
          <select
            key={def.id}
            name={`cf_${def.key}`}
            defaultValue={sp[`cf_${def.key}`] ?? ""}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All {def.label.toLowerCase()}</option>
            {((def.options ?? []) as { id: string; label: string }[]).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {view === "board" ? (
        <Board statuses={listStatuses} tasks={boardTasks} />
      ) : (
        <TaskTable
          items={filtered}
          statuses={listStatuses}
          fieldDefs={fieldDefs}
          userNames={userNames}
        />
      )}
    </div>
  );
}
