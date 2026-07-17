import { Suspense } from "react";
import { Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSpaceRole, requireUser } from "@/lib/rbac";
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
  getTasksForList,
} from "@/modules/tasks/queries";

export default async function ListPage(props: {
  params: Promise<{ spaceSlug: string; listSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { spaceSlug, listSlug } = await props.params;
  const sp = await props.searchParams;

  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const role = await getSpaceRole(user.id, space.id, user.platformRole);
  if (!role) notFound();
  const list = await getListBySlug(space.id, listSlug);
  if (!list) notFound();

  // URL param wins; fall back to list's persisted default; then "table".
  const view: "table" | "board" =
    sp.view === "board" ? "board"
    : sp.view === "table" ? "table"
    : (list.defaultView === "board" ? "board" : "table");

  const [listStatuses, fieldDefs, items, activeUsers] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id),
    getTasksForList(list.id),
    getActiveUsers(),
  ]);
  const userNames = new Map(activeUsers.map((u) => [u.id, u.displayName]));

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

  // ─── apply filters (server-side) ───────────────────────────────────────────

  /** Returns true if a single condition matches the task. */
  function evalCondition(
    { field, op, value }: FilterCondition,
    task: (typeof items)[number]["task"],
    assignees: (typeof items)[number]["assignees"],
  ): boolean {
    // skip conditions with no value (unless op doesn't need one)
    if (!value && op !== "is_empty" && op !== "is_not_empty") return true;

    const cf = (task.customFields ?? {}) as Record<string, unknown>;

    if (field === "status") {
      const m = task.statusId === value;
      return op === "is" ? m : !m;
    }
    if (field === "priority") {
      const m = task.priority === value;
      return op === "is" ? m : !m;
    }
    if (field === "assignee") {
      const m = assignees.some((a) => a.id === value);
      return op === "is" ? m : !m;
    }
    if (field.startsWith("cf_")) {
      const defId = field.slice(3);
      const def = fieldDefs.find((d) => d.id === defId);
      if (!def) return true;
      const cfVal = cf[defId];

      switch (def.type) {
        case "dropdown":
        case "user": {
          const m = cfVal === value;
          return op === "is" ? m : !m;
        }
        case "multi_select": {
          const arr = Array.isArray(cfVal) ? (cfVal as string[]) : [];
          const m = arr.includes(value);
          return op === "includes" ? m : !m;
        }
        case "checkbox": {
          return !!cfVal === (value === "true");
        }
        case "text":
        case "textarea":
        case "url":
        case "email":
        case "phone": {
          const str = String(cfVal ?? "").toLowerCase();
          const val = value.toLowerCase();
          if (op === "contains") return str.includes(val);
          if (op === "not_contains") return !str.includes(val);
          if (op === "is") return str === val;
          if (op === "is_not") return str !== val;
          return true;
        }
        case "number": {
          const num = cfVal != null ? Number(cfVal) : null;
          const target = Number(value);
          if (num === null) return false;
          if (op === "eq") return num === target;
          if (op === "neq") return num !== target;
          if (op === "gt") return num > target;
          if (op === "lt") return num < target;
          if (op === "gte") return num >= target;
          if (op === "lte") return num <= target;
          return true;
        }
        case "date": {
          const dateStr = cfVal ? String(cfVal).slice(0, 10) : null;
          if (!dateStr) return false;
          if (op === "is") return dateStr === value;
          if (op === "before") return dateStr < value;
          if (op === "after") return dateStr > value;
          return true;
        }
      }
    }
    return true;
  }

  const filtered = items.filter(({ task, assignees }) => {
    if (conditions.length === 0) return true;

    // Evaluate left-to-right respecting AND / OR conjunctions.
    // First condition has no conjunction (treated as the base).
    let result = evalCondition(conditions[0], task, assignees);

    for (let i = 1; i < conditions.length; i++) {
      const cond = conditions[i];
      const match = evalCondition(cond, task, assignees);
      if (cond.conjunction === "or") {
        result = result || match;
      } else {
        // "and" is the default
        result = result && match;
      }
    }

    return result;
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

      {/* ── sub-bar: count + filter + group by ── */}
      <div className="mb-4 flex items-center gap-2">
        <Badge variant="secondary">{filtered.length} tasks</Badge>
        <Suspense>
          <FilterBar
            listId={list.id}
            statuses={listStatuses}
            fieldDefs={fieldDefs}
            activeUsers={activeUsers}
            view={view}
          />
        </Suspense>
      </div>

      {view === "board" ? (
        <Board statuses={listStatuses} tasks={boardTasks} />
      ) : (
        <TaskTable
          items={filtered}
          statuses={listStatuses}
          fieldDefs={fieldDefs}
          userNames={userNames}
          groupBy={groupBy || undefined}
          listId={list.id}
          initialColumnOrder={(list.tableColumnOrder as string[] | null) ?? undefined}
        />
      )}
    </div>
  );
}
