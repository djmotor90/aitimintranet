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
import { ListViewTabs } from "@/modules/tasks/components/list-view-tabs";
import { NewTaskDialog } from "@/modules/tasks/components/new-task-dialog";
import { ShowClosedToggle } from "@/modules/tasks/components/show-closed-toggle";
import { TaskTable } from "@/modules/tasks/components/task-table";
import {
  ensureListViews,
  getActiveUsers,
  getFieldDefinitions,
  getListBySlug,
  getSpaceBySlug,
  getStatusesForList,
  getTagsForSpace,
  getTasksPage,
  type ListViewRow,
} from "@/modules/tasks/queries";

const TABLE_PAGE_SIZE = 200;
/** Board renders every card at once, so it gets a hard cap. */
const BOARD_LIMIT = 1000;

function parseFilters(raw: string | undefined, fallback: unknown): FilterCondition[] {
  try {
    if (raw) return JSON.parse(raw) as FilterCondition[];
  } catch {
    // malformed URL JSON
  }
  if (Array.isArray(fallback)) return fallback as FilterCondition[];
  return [];
}

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
  const canEdit = role === "owner" || role === "member";
  const isSpaceOwner = (await getSpaceRole(user.id, space.id, user.platformRole)) === "owner";

  // Named views (ClickUp-style). Seed List + Board if the list has none yet.
  const views = await ensureListViews(list.id);
  if (views.length === 0) notFound();

  let activeView: ListViewRow =
    (sp.v ? views.find((v) => v.id === sp.v) : undefined) ?? views[0];

  // URL overrides for the active view's stored settings (so live filters work
  // without waiting for a save). When no override is present, use the view.
  const view: "table" | "board" =
    sp.view === "board" || sp.view === "table"
      ? sp.view
      : activeView.type;

  const conditions = parseFilters(
    sp.filters,
    // Only use stored filters when the URL didn't supply an explicit filters param.
    sp.filters === undefined ? activeView.filters : undefined,
  );

  const groupBy =
    sp.groupBy !== undefined
      ? sp.groupBy
      : (activeView.groupBy ?? list.defaultGroupBy ?? "");

  const showClosed =
    sp.closed !== undefined
      ? sp.closed === "1" || sp.closed === "true"
      : activeView.showClosed;

  const columnOrder =
    (activeView.tableColumnOrder as string[] | null) ??
    (list.tableColumnOrder as string[] | null) ??
    undefined;

  const [listStatuses, fieldDefs, activeUsers, page, spaceTags] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id),
    getActiveUsers(),
    getTasksPage({
      listId: list.id,
      conditions,
      groupBy: view === "table" ? groupBy || undefined : undefined,
      limit: view === "board" ? BOARD_LIMIT : TABLE_PAGE_SIZE,
      offset: 0,
      showClosed,
    }),
    getTagsForSpace(space.id),
  ]);
  const userNames = new Map(activeUsers.map((u) => [u.id, u.displayName]));

  const boardStatuses = showClosed
    ? listStatuses
    : listStatuses.filter((s) => s.category !== "done" && s.category !== "cancelled");

  const boardTasks = page.items.map(({ task, assignees, tags: taskTags }) => ({
    id: task.id,
    number: task.number,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    statusId: task.statusId,
    assignees,
    tags: taskTags,
  }));

  return (
    <div className="flex h-full flex-col">
      <ListLiveRefresh listId={list.id} />

      {/* ── header: title + actions, then view tabs under the list name ── */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted-foreground">
              <Link href={`/tasks/${space.slug}`} className="hover:underline">
                {space.name}
              </Link>
            </div>
            <h1 className="text-xl font-semibold leading-tight">{list.name}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5">
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

        {/* View tabs sit under the list name (ClickUp-style) */}
        <Suspense>
          <ListViewTabs
            listId={list.id}
            views={views}
            activeViewId={activeView.id}
            canManage={canEdit}
          />
        </Suspense>
      </div>

      {/* ── sub-bar: count + filter + group by + show closed ── */}
      <div className="mb-4 flex items-center gap-2">
        <Badge variant="secondary">{page.total} tasks</Badge>
        <Suspense>
          <FilterBar
            listId={list.id}
            statuses={listStatuses}
            fieldDefs={fieldDefs}
            activeUsers={activeUsers}
            view={view}
            spaceTags={spaceTags}
            viewId={activeView.id}
          />
        </Suspense>
        <Suspense>
          <ShowClosedToggle
            showClosed={showClosed}
            listId={list.id}
            viewId={activeView.id}
          />
        </Suspense>
        {view === "board" && page.total > BOARD_LIMIT && (
          <span className="text-xs text-muted-foreground">
            Board shows the first {BOARD_LIMIT} tasks — use filters or the table view for the rest.
          </span>
        )}
      </div>

      {view === "board" ? (
        <Board statuses={boardStatuses} tasks={boardTasks} canEdit={canEdit} />
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
          initialColumnOrder={columnOrder}
          canEdit={canEdit}
          showClosed={showClosed}
          spaceTags={spaceTags}
          viewId={activeView.id}
        />
      )}
    </div>
  );
}
