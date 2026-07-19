import { Suspense } from "react";
import { Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getListRole, getSpaceRole, requireUser } from "@/lib/rbac";
import { Board } from "@/modules/tasks/components/board";
import { FilterBar, type FilterCondition } from "@/modules/tasks/components/filter-bar";
import { ListLiveRefresh } from "@/modules/tasks/components/list-live-refresh";
import { NewTaskDialog } from "@/modules/tasks/components/new-task-dialog";
import { TaskTable } from "@/modules/tasks/components/task-table";
import { ViewToggle } from "@/modules/tasks/components/view-toggle";
import {
  getActiveUsers,
  getFieldDefinitions,
  getListBySlug,
  getSpaceBySlug,
  getStatusesForList,
  getTasksPage,
} from "@/modules/tasks/queries";

const TABLE_PAGE_SIZE = 200;
/** Board renders every card at once, so it gets a hard cap. */
const BOARD_LIMIT = 1000;

export default async function ListPage(props: {
  params: Promise<{ spaceSlug: string; listSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { spaceSlug, listSlug } = await props.params;
  const sp = await props.searchParams;

  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const list = await getListBySlug(space.id, listSlug);
  if (!list) notFound();
  const role = await getListRole(user.id, list.id, user.platformRole);
  if (!role) notFound();
  // Guests can view; members and owners can create/edit tasks.
  const canEdit = role === "owner" || role === "member";
  // Settings (statuses/fields/layout) stays gated on space ownership specifically —
  // a list-direct grant gives content access, not structural control.
  const isSpaceOwner = (await getSpaceRole(user.id, space.id, user.platformRole)) === "owner";

  // URL param wins; fall back to list's persisted default; then "table".
  const view: "table" | "board" =
    sp.view === "board" ? "board"
    : sp.view === "table" ? "table"
    : (list.defaultView === "board" ? "board" : "table");

  // ─── parse filter conditions from URL ───────────────────────────────────────
  let conditions: FilterCondition[] = [];
  try {
    const raw = sp.filters;
    if (raw) conditions = JSON.parse(raw) as FilterCondition[];
  } catch {
    // malformed JSON — ignore
  }

  // URL param wins; fall back to list's persisted default.
  const groupBy = sp.groupBy ?? list.defaultGroupBy ?? "";

  const [listStatuses, fieldDefs, activeUsers, page] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id),
    getActiveUsers(),
    getTasksPage({
      listId: list.id,
      conditions,
      groupBy: view === "table" ? groupBy || undefined : undefined,
      limit: view === "board" ? BOARD_LIMIT : TABLE_PAGE_SIZE,
      offset: 0,
    }),
  ]);
  const userNames = new Map(activeUsers.map((u) => [u.id, u.displayName]));

  const boardTasks = page.items.map(({ task, assignees }) => ({
    id: task.id,
    number: task.number,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    statusId: task.statusId,
    assignees,
  }));

  return (
    <div className="flex h-full flex-col">
      <ListLiveRefresh listId={list.id} />

      {/* ── top bar: title + actions ── */}
      <div className="mb-2 flex items-center gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href={`/tasks/${space.slug}`} className="hover:underline">
              {space.name}
            </Link>
          </div>
          <h1 className="text-xl font-semibold">{list.name}</h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* view toggle */}
          <Suspense>
            <ViewToggle listId={list.id} view={view} />
          </Suspense>

          {isSpaceOwner && (
            <Link href={`/tasks/${space.slug}/${list.slug}/settings`}>
              <Button variant="outline" size="sm">
                <Settings className="size-4" />
              </Button>
            </Link>
          )}

          {canEdit && (
            <NewTaskDialog listId={list.id} fieldDefs={fieldDefs} users={activeUsers} />
          )}
        </div>
      </div>

      {/* ── sub-bar: count + filter + group by ── */}
      <div className="mb-4 flex items-center gap-2">
        <Badge variant="secondary">{page.total} tasks</Badge>
        <Suspense>
          <FilterBar
            listId={list.id}
            statuses={listStatuses}
            fieldDefs={fieldDefs}
            activeUsers={activeUsers}
            view={view}
          />
        </Suspense>
        {view === "board" && page.total > BOARD_LIMIT && (
          <span className="text-xs text-muted-foreground">
            Board shows the first {BOARD_LIMIT} tasks — use filters or the table view for the rest.
          </span>
        )}
      </div>

      {view === "board" ? (
        <Board statuses={listStatuses} tasks={boardTasks} canEdit={canEdit} />
      ) : (
        <TaskTable
          items={page.items}
          totalCount={page.total}
          groupCounts={page.groupCounts}
          conditions={conditions}
          statuses={listStatuses}
          fieldDefs={fieldDefs}
          userNames={userNames}
          activeUsers={activeUsers}
          groupBy={groupBy || undefined}
          listId={list.id}
          initialColumnOrder={(list.tableColumnOrder as string[] | null) ?? undefined}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
