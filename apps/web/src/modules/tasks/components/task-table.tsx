"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Columns3, Pencil } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type DragEvent,
  memo,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TaskFilterCondition, TaskWithMeta } from "../queries";
import { fetchTasksPage, saveListViewPrefs, saveTableColumnOrder } from "../actions";
import { AssigneeSelect } from "./assignee-select";
import {
  CustomFieldEditCell,
  PrioritySelectCell,
  StatusSelectCell,
  TaskDateCell,
  TitleEditCell,
} from "./editable-cells";
import { PRIORITY_STYLES } from "./task-card";
import { TagChips, TagPicker, type TagOption } from "./tag-picker";

interface StatusLike { id: string; name: string; color: string }
interface FieldDefLike { id: string; key: string; label: string; type: string; options: unknown }

const CALCULABLE_TYPES = new Set(["number", "date"]);

function renderFieldValue(def: FieldDefLike, value: unknown, userNames: Map<string, string>) {
  if (value === null || value === undefined || value === "") return "—";
  const options = (def.options ?? []) as { id: string; label: string }[];
  switch (def.type) {
    case "checkbox": return value ? "Yes" : "No";
    case "dropdown": return options.find((o) => o.id === value)?.label ?? String(value);
    case "multi_select":
      return (value as string[]).map((v) => options.find((o) => o.id === v)?.label ?? v).join(", ");
    case "user": return userNames.get(String(value)) ?? "Unknown";
    default: return String(value);
  }
}

const BASE_COLUMNS = [
  { id: "number",     label: "#",            width: 90,  minWidth: 72  },
  { id: "title",      label: "Title",        width: 360, minWidth: 220 },
  { id: "status",     label: "Status",       width: 150, minWidth: 120 },
  { id: "priority",   label: "Priority",     width: 130, minWidth: 110 },
  { id: "tags",       label: "Tags",         width: 180, minWidth: 140 },
  { id: "due",        label: "Due date",     width: 140, minWidth: 120 },
  { id: "start_date", label: "Start date",   width: 140, minWidth: 120 },
  { id: "assignees",  label: "Assignees",    width: 150, minWidth: 120 },
  { id: "created_at", label: "Created date", width: 160, minWidth: 120 },
  { id: "closed_at",  label: "Closed date",  width: 160, minWidth: 120 },
];
const BASE_COL_MAP = new Map(BASE_COLUMNS.map((c) => [c.id, c]));

/** These base columns cannot be hidden — they are always shown. */
const ALWAYS_VISIBLE = new Set(["number", "title"]);
/** Base columns shown in the field selector (hideable). */
const HIDEABLE_BASE_COLS = BASE_COLUMNS.filter((c) => !ALWAYS_VISIBLE.has(c.id));
/** Base columns hidden by default (auto-managed). */
const DEFAULT_HIDDEN_COLS = ["created_at", "closed_at"];

interface ColumnDef { id: string; label: string; width: number; minWidth: number }
interface Group { key: string; label: string; color?: string; items: TaskWithMeta[] }

// ─── column context menu ──────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; fieldId: string }

function FieldContextMenu({
  menu,
  def,
  isSorted,
  sortDir,
  hasCalc,
  isHidden,
  onSort,
  onGroup,
  onEditOptions,
  onMoveStart,
  onMoveEnd,
  onToggleCalc,
  onHide,
  onClose,
}: {
  menu: CtxMenu;
  def: FieldDefLike;
  isSorted: boolean;
  sortDir: "asc" | "desc";
  hasCalc: boolean;
  isHidden: boolean;
  onSort: (dir: "asc" | "desc") => void;
  onGroup: () => void;
  onEditOptions: () => void;
  onMoveStart: () => void;
  onMoveEnd: () => void;
  onToggleCalc: () => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    // small delay so the right-click that opened it doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  // Adjust position to stay within viewport
  const [pos, setPos] = useState({ top: menu.y, left: menu.x });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: Math.min(menu.y, window.innerHeight - rect.height - 8),
      left: Math.min(menu.x, window.innerWidth - rect.width - 8),
    });
  }, [menu.x, menu.y]);

  const isCalculable = CALCULABLE_TYPES.has(def.type);
  const hasOptions = def.type === "dropdown" || def.type === "multi_select";

  function item(label: string, onClick: () => void, active = false) {
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
          active && "font-medium text-primary",
        )}
      >
        {label}
      </button>
    );
  }

  function separator() {
    return <div className="my-1 border-t" />;
  }

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="min-w-[200px] rounded-lg border bg-popover py-1 shadow-lg"
    >
      {item(`Sort A → Z`, () => { onSort("asc"); onClose(); }, isSorted && sortDir === "asc")}
      {item(`Sort Z → A`, () => { onSort("desc"); onClose(); }, isSorted && sortDir === "desc")}
      {separator()}
      {item("Group by this field", onGroup)}
      {separator()}
      {hasOptions && item("Edit options", onEditOptions)}
      {separator()}
      {item("Move to start", onMoveStart)}
      {item("Move to end", onMoveEnd)}
      {separator()}
      {isCalculable && item(hasCalc ? "Hide calculation" : "Calculate", onToggleCalc)}
      {separator()}
      {item(isHidden ? "Show column" : "Hide column", onHide)}
    </div>
  );
}

// ─── virtualized row (memoized, display-first) ────────────────────────────────
// Airtable / native-list model:
//  • Rows always paint cheap, stable display cells (same look while scrolling).
//  • Interactive editors (Radix menus, pickers) mount ONLY for the one cell the
//    user clicks — never for every visible row on every fling.
//  • No scroll-mode swap → no blink, no mass remount freeze on settle.
// React.memo skips re-renders when props are stable (pure scroll of already-
// mounted rows).

const CELL_BTN =
  "block h-7 w-full truncate rounded-md px-1.5 text-left text-sm hover:bg-muted";

function fmtShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

interface TaskRowProps {
  vIndex: number;
  item: TaskWithMeta;
  orderedColumns: ColumnDef[];
  canEdit: boolean;
  statuses: StatusLike[];
  statusById: Map<string, StatusLike>;
  fieldDefs: FieldDefLike[];
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: TagOption[];
  onPatchTask: (taskId: string, patch: Partial<TaskWithMeta["task"]>) => void;
  onPatchCustomField: (taskId: string, defId: string, value: unknown) => void;
}

const TaskRow = memo(function TaskRow({
  vIndex,
  item,
  orderedColumns,
  canEdit,
  statuses,
  statusById,
  fieldDefs,
  userNames,
  activeUsers,
  spaceTags,
  onPatchTask,
  onPatchCustomField,
}: TaskRowProps) {
  const task = item.task;
  const assignees = item.assignees;
  const taskTags = item.tags ?? [];
  const cf = (task.customFields ?? {}) as Record<string, unknown>;
  // Only one interactive editor per row at a time — keeps scroll paint cheap.
  const [editingCol, setEditingCol] = useState<string | null>(null);

  function openEdit(colId: string) {
    if (!canEdit) return;
    setEditingCol(colId);
  }

  function closeEdit() {
    setEditingCol(null);
  }

  function renderCell(colId: string) {
    const editing = canEdit && editingCol === colId;

    switch (colId) {
      case "number":
        return (
          <TableCell key={colId} className="text-xs text-muted-foreground">
            {task.number}
          </TableCell>
        );

      case "title":
        // Title stays a real link; pencil mounts the light editor only when asked.
        // Tag chips are display-only here — full tag edit lives in the Tags column.
        return (
          <TableCell key={colId} className="min-w-0">
            {editing ? (
              <TitleEditCell
                taskId={task.id}
                number={task.number}
                title={task.title}
                canEdit
                startEditing
                onSaved={(next) => {
                  onPatchTask(task.id, { title: next });
                  closeEdit();
                }}
              />
            ) : (
              <div className="group/title flex min-w-0 items-center gap-0.5">
                <Link
                  href={`/tasks/task/${task.number}`}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {task.title}
                </Link>
                {taskTags.length > 0 && (
                  <span className="ml-1 hidden min-w-0 sm:inline">
                    <TagChips tags={taskTags.slice(0, 2)} />
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    title="Edit title"
                    aria-label="Edit title"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openEdit("title");
                    }}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      "text-muted-foreground opacity-0 transition-opacity",
                      "hover:bg-muted hover:text-foreground",
                      "group-hover/title:opacity-100 focus-visible:opacity-100",
                    )}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </TableCell>
        );

      case "status": {
        const st = statusById.get(task.statusId);
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5">
              <StatusSelectCell
                taskId={task.id}
                statusId={task.statusId}
                statuses={statuses}
                defaultOpen
                onOpenChange={(open) => {
                  if (!open) closeEdit();
                }}
                onSaved={(next) => {
                  onPatchTask(task.id, { statusId: next });
                  closeEdit();
                }}
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button
                type="button"
                onClick={() => openEdit("status")}
                style={st ? { color: st.color } : undefined}
                className={CELL_BTN}
              >
                {st?.name ?? "—"}
              </button>
            ) : (
              <span className="block h-7 truncate px-1.5 text-sm" style={st ? { color: st.color } : undefined}>
                {st?.name ?? "—"}
              </span>
            )}
          </TableCell>
        );
      }

      case "priority": {
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5">
              <PrioritySelectCell
                taskId={task.id}
                priority={task.priority}
                defaultOpen
                onOpenChange={(open) => {
                  if (!open) closeEdit();
                }}
                onSaved={(next) => {
                  onPatchTask(task.id, { priority: next });
                  closeEdit();
                }}
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button
                type="button"
                onClick={() => openEdit("priority")}
                className={cn(CELL_BTN, "capitalize", task.priority && PRIORITY_STYLES[task.priority])}
              >
                {task.priority ?? <span className="text-muted-foreground">—</span>}
              </button>
            ) : (
              <span className={cn("block h-7 truncate px-1.5 text-sm capitalize", task.priority && PRIORITY_STYLES[task.priority])}>
                {task.priority ?? "—"}
              </span>
            )}
          </TableCell>
        );
      }

      case "due":
      case "start_date": {
        const field = colId === "due" ? "dueDate" : "startDate";
        const value = colId === "due" ? task.dueDate : task.startDate;
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5">
              <TaskDateCell
                taskId={task.id}
                field={field}
                value={value}
                startEditing
                onCancel={closeEdit}
                onSaved={(next) => {
                  onPatchTask(task.id, { [field]: next });
                  closeEdit();
                }}
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button type="button" onClick={() => openEdit(colId)} className={CELL_BTN}>
                {fmtShortDate(value)}
              </button>
            ) : (
              <span className="block h-7 truncate px-1.5 text-sm">{fmtShortDate(value)}</span>
            )}
          </TableCell>
        );
      }

      case "created_at":
        return (
          <TableCell key={colId} className="text-sm">
            {fmtShortDate(task.createdAt)}
          </TableCell>
        );

      case "closed_at":
        return (
          <TableCell key={colId} className="text-sm">
            {fmtShortDate(task.completedAt)}
          </TableCell>
        );

      case "tags":
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5" onClick={(e) => e.stopPropagation()}>
              <TagPicker
                taskId={task.id}
                spaceTags={spaceTags}
                selectedTags={taskTags}
                compact
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button
                type="button"
                onClick={() => openEdit("tags")}
                className={cn(CELL_BTN, "flex items-center gap-1")}
              >
                {taskTags.length > 0 ? <TagChips tags={taskTags} /> : (
                  <span className="text-muted-foreground">—</span>
                )}
              </button>
            ) : (
              <div className="flex h-7 items-center px-1.5">
                {taskTags.length > 0 ? <TagChips tags={taskTags} /> : "—"}
              </div>
            )}
          </TableCell>
        );

      case "assignees":
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5" onClick={(e) => e.stopPropagation()}>
              <AssigneeSelect
                taskId={task.id}
                users={activeUsers}
                selectedUsers={assignees}
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button type="button" onClick={() => openEdit("assignees")} className={CELL_BTN}>
                {assignees.map((a) => a.displayName).join(", ") || (
                  <span className="text-muted-foreground">—</span>
                )}
              </button>
            ) : (
              <span className="block h-7 truncate px-1.5 text-sm">
                {assignees.map((a) => a.displayName).join(", ") || "—"}
              </span>
            )}
          </TableCell>
        );

      default:
        if (colId.startsWith("field-")) {
          const defId = colId.slice(6);
          const def = fieldDefs.find((d) => d.id === defId);
          if (!def) return null;
          if (editing) {
            return (
              <TableCell key={colId} className="p-0.5">
                <CustomFieldEditCell
                  taskId={task.id}
                  def={def}
                  value={cf[defId]}
                  users={activeUsers}
                  onSaved={(next) => {
                    onPatchCustomField(task.id, defId, next);
                    // Keep open for multi-step fields; click outside handled by row reuse.
                  }}
                />
              </TableCell>
            );
          }
          return (
            <TableCell key={colId} className="p-0.5">
              {canEdit ? (
                <button type="button" onClick={() => openEdit(colId)} className={CELL_BTN}>
                  {renderFieldValue(def, cf[defId], userNames)}
                </button>
              ) : (
                <span className="block h-7 truncate px-1.5 text-sm">
                  {renderFieldValue(def, cf[defId], userNames)}
                </span>
              )}
            </TableCell>
          );
        }
        return null;
    }
  }

  return (
    <TableRow data-index={vIndex} className="h-[37px]">
      {orderedColumns.map((col) => renderCell(col.id))}
    </TableRow>
  );
});

// ─── main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 200;

export function TaskTable({
  items,
  totalCount,
  groupCounts,
  conditions,
  statuses,
  fieldDefs,
  userNames,
  activeUsers,
  groupBy,
  listId,
  initialColumnOrder,
  canEdit = true,
  showClosed = false,
  spaceTags = [],
  viewId,
}: {
  /** First page of tasks (server-filtered and ordered). */
  items: TaskWithMeta[];
  /** Total matching rows across all pages. */
  totalCount: number;
  /** Per-group totals when groupBy is active (keys match server group keys). */
  groupCounts?: { key: string; count: number }[] | null;
  /** Active filter conditions — passed through to follow-up page fetches. */
  conditions?: TaskFilterCondition[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  groupBy?: string;
  listId: string;
  initialColumnOrder?: string[];
  /** When false, cells are read-only (guests / view-only grants). */
  canEdit?: boolean;
  /** Include done/cancelled tasks on follow-up page fetches (matches server page). */
  showClosed?: boolean;
  /** All tags defined in the parent space (for the tags column picker). */
  spaceTags?: TagOption[];
  /** Active named list view id — column order / groupBy persist onto it. */
  viewId?: string;
}) {
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ── sparse row cache keyed by absolute offset (ClickUp/Airtable model) ─────
  // The scrollbar reserves height for ALL rows up front; unloaded offsets render
  // as skeletons and fill in as pages arrive. Fetched rows stay cached, so
  // scrolling back up never refetches and the layout never shifts.
  const [rowsByOffset, setRowsByOffset] = useState<Map<number, TaskWithMeta>>(
    () => new Map(items.map((it, i) => [i, it])),
  );
  const requestedPages = useRef<Set<number>>(new Set([0]));
  useEffect(() => {
    setRowsByOffset(new Map(items.map((it, i) => [i, it])));
    requestedPages.current = new Set([0]);
  }, [items]);

  const patchRows = useCallback((fn: (it: TaskWithMeta) => TaskWithMeta) => {
    setRowsByOffset((prev) => {
      const next = new Map<number, TaskWithMeta>();
      for (const [offset, it] of prev) next.set(offset, fn(it));
      return next;
    });
  }, []);
  const patchTask = useCallback(
    (taskId: string, patch: Partial<TaskWithMeta["task"]>) => {
      patchRows((it) => (it.task.id === taskId ? { ...it, task: { ...it.task, ...patch } } : it));
    },
    [patchRows],
  );
  const patchCustomField = useCallback(
    (taskId: string, defId: string, value: unknown) => {
      patchRows((it) => {
        if (it.task.id !== taskId) return it;
        const cf = { ...(it.task.customFields as Record<string, unknown> | null ?? {}) };
        if (value === undefined) delete cf[defId];
        else cf[defId] = value;
        return { ...it, task: { ...it.task, customFields: cf } };
      });
    },
    [patchRows],
  );

  // ── column order ──────────────────────────────────────────────────────────
  const defaultOrder = useMemo(
    () => [...BASE_COLUMNS.map((c) => c.id), ...fieldDefs.map((d) => `field-${d.id}`)],
    // fieldDefs is the only runtime dependency; BASE_COLUMNS is module-level constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldDefs],
  );

  function mergeOrder(saved: string[], known: string[]): string[] {
    const knownSet = new Set(known);
    const filtered = saved.filter((id) => knownSet.has(id));
    const existing = new Set(filtered);
    return [...filtered, ...known.filter((id) => !existing.has(id))];
  }

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    initialColumnOrder ? mergeOrder(initialColumnOrder, defaultOrder) : defaultOrder,
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    startTransition(() => { saveTableColumnOrder(listId, columnOrder, viewId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder]);

  // ── column visibility ─────────────────────────────────────────────────────
  // Stores column IDs of hidden cols: base col IDs (e.g. "status") or "field-{defId}" for custom.
  const hiddenStorageKey = `aitim:task-table-hidden:${listId}`;
  const [hiddenColIds, setHiddenColIds] = useState<string[]>([]);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(hiddenStorageKey);
    try {
      const saved = raw ? (JSON.parse(raw) as string[]) : DEFAULT_HIDDEN_COLS;
      const timeout = window.setTimeout(() => {
        setHiddenColIds(saved);
        setVisibilityLoaded(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      window.localStorage.removeItem(hiddenStorageKey);
      const timeout = window.setTimeout(() => {
        setHiddenColIds(DEFAULT_HIDDEN_COLS);
        setVisibilityLoaded(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visibilityLoaded) return;
    window.localStorage.setItem(hiddenStorageKey, JSON.stringify(hiddenColIds));
  }, [hiddenColIds, hiddenStorageKey, visibilityLoaded]);

  function toggleCol(colId: string) {
    setHiddenColIds((cur) =>
      cur.includes(colId) ? cur.filter((id) => id !== colId) : [...cur, colId],
    );
  }

  // ── sort (server-driven: changing it clears the cache and refetches) ───────
  const [sort, setSort] = useState<{ fieldId: string; dir: "asc" | "desc" } | null>(null);

  const fetchPage = useCallback(
    async (pageIdx: number) => {
      if (requestedPages.current.has(pageIdx)) return;
      requestedPages.current.add(pageIdx);
      try {
        const page = await fetchTasksPage({
          listId,
          conditions,
          groupBy,
          sort,
          offset: pageIdx * PAGE_SIZE,
          limit: PAGE_SIZE,
          showClosed,
        });
        setRowsByOffset((prev) => {
          const next = new Map(prev);
          page.items.forEach((it, j) => next.set(pageIdx * PAGE_SIZE + j, it));
          return next;
        });
      } catch {
        requestedPages.current.delete(pageIdx); // retry on next scroll
        toast.error("Failed to load tasks");
      }
    },
    [listId, conditions, groupBy, sort, showClosed],
  );

  // Sort changes invalidate every cached offset.
  const isFirstSortRender = useRef(true);
  useEffect(() => {
    if (isFirstSortRender.current) { isFirstSortRender.current = false; return; }
    setRowsByOffset(new Map());
    requestedPages.current = new Set();
    void fetchPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  /** Everything currently loaded, in offset order (used by calc footers). */
  const loadedItems = useMemo(
    () => [...rowsByOffset.entries()].sort((a, b) => a[0] - b[0]).map(([, it]) => it),
    [rowsByOffset],
  );

  // ── calculate ─────────────────────────────────────────────────────────────
  const [calcFieldIds, setCalcFieldIds] = useState<Set<string>>(new Set());

  function calcValue(fieldId: string, taskList: TaskWithMeta[]): string {
    const def = fieldDefs.find((d) => d.id === fieldId);
    if (!def) return "—";
    const vals = taskList.map(({ task }) => {
      const cf = (task.customFields ?? {}) as Record<string, unknown>;
      return cf[fieldId];
    });
    const nonEmpty = vals.filter((v) => v !== null && v !== undefined && v !== "");
    if (def.type === "number") {
      const nums = nonEmpty.map(Number).filter((n) => !isNaN(n));
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = nums.length ? (sum / nums.length).toFixed(1) : "—";
      return `Σ ${sum} · avg ${avg}`;
    }
    if (def.type === "date") {
      const dates = nonEmpty.map((v) => new Date(String(v))).filter((d) => !isNaN(d.getTime()));
      if (!dates.length) return "—";
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      const fmt = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
      return dates.length === 1 ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
    }
    return "—";
  }

  // ── column widths ─────────────────────────────────────────────────────────
  const widthStorageKey = useMemo(
    () => `aitim:task-table-widths:${fieldDefs.map((d) => d.id).join(":")}`,
    [fieldDefs],
  );
  const [widths, setWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const raw = window.localStorage.getItem(widthStorageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, number>;
      const timeout = window.setTimeout(() => setWidths(saved), 0);
      return () => window.clearTimeout(timeout);
    } catch { window.localStorage.removeItem(widthStorageKey); }
  }, [widthStorageKey]);

  useEffect(() => {
    if (Object.keys(widths).length === 0) return;
    window.localStorage.setItem(widthStorageKey, JSON.stringify(widths));
  }, [widthStorageKey, widths]);

  // ── ordered visible columns ───────────────────────────────────────────────
  const orderedColumns = useMemo<ColumnDef[]>(() => {
    const hiddenSet = new Set(hiddenColIds);
    const result: ColumnDef[] = [];
    for (const id of columnOrder) {
      if (BASE_COL_MAP.has(id)) {
        if (!ALWAYS_VISIBLE.has(id) && hiddenSet.has(id)) continue;
        const base = BASE_COL_MAP.get(id)!;
        result.push({ ...base, width: widths[id] ?? base.width });
      } else if (id.startsWith("field-")) {
        if (hiddenSet.has(id)) continue;
        const def = fieldDefs.find((d) => d.id === id.slice(6));
        if (!def) continue;
        result.push({ id, label: def.label, width: widths[id] ?? 180, minWidth: 120 });
      }
    }
    return result;
  }, [columnOrder, fieldDefs, hiddenColIds, widths]);

  function columnWidth(col: ColumnDef) { return widths[col.id] ?? col.width; }

  function resizeColumn(col: ColumnDef, event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX, startWidth = columnWidth(col);
    function onMove(e: globalThis.PointerEvent) {
      setWidths((cur) => ({ ...cur, [col.id]: Math.max(col.minWidth, startWidth + e.clientX - startX) }));
    }
    function onUp() { window.removeEventListener("pointermove", onMove); }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  // ── column drag-to-reorder ────────────────────────────────────────────────
  const dragColId = useRef<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  function onColDragStart(e: DragEvent<HTMLTableCellElement>, colId: string) {
    dragColId.current = colId;
    e.dataTransfer.effectAllowed = "move";
  }
  function onColDragOver(e: DragEvent<HTMLTableCellElement>, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (colId !== dragColId.current) setDragOverColId(colId);
  }
  function onColDrop(e: DragEvent<HTMLTableCellElement>, targetId: string) {
    e.preventDefault();
    const srcId = dragColId.current;
    dragColId.current = null;
    setDragOverColId(null);
    if (!srcId || srcId === targetId) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(srcId);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, srcId);
      return next;
    });
  }
  function onColDragEnd() { dragColId.current = null; setDragOverColId(null); }

  // ── context menu ──────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  function openCtxMenu(e: React.MouseEvent, fieldId: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, fieldId });
  }

  const ctxDef = ctxMenu ? fieldDefs.find((d) => d.id === ctxMenu.fieldId) : null;

  function ctxSort(dir: "asc" | "desc") {
    const active = sort?.fieldId === ctxMenu!.fieldId && sort.dir === dir;
    setSort(active ? null : { fieldId: ctxMenu!.fieldId, dir });
  }
  function ctxGroup() {
    const value = `cf_${ctxMenu!.fieldId}`;
    const params = new URLSearchParams(window.location.search);
    params.set("groupBy", value);
    router.push(`${window.location.pathname}?${params.toString()}`);
    startTransition(() => { saveListViewPrefs(listId, { groupBy: value, viewId }); });
    setCtxMenu(null);
  }
  function ctxEditOptions() {
    router.push(`${window.location.pathname}/settings?tab=fields`);
    setCtxMenu(null);
  }
  function ctxMoveStart() {
    const colId = `field-${ctxMenu!.fieldId}`;
    setColumnOrder((prev) => [colId, ...prev.filter((id) => id !== colId)]);
    setCtxMenu(null);
  }
  function ctxMoveEnd() {
    const colId = `field-${ctxMenu!.fieldId}`;
    setColumnOrder((prev) => [...prev.filter((id) => id !== colId), colId]);
    setCtxMenu(null);
  }
  function ctxToggleCalc() {
    setCalcFieldIds((prev) => {
      const next = new Set(prev);
      next.has(ctxMenu!.fieldId) ? next.delete(ctxMenu!.fieldId) : next.add(ctxMenu!.fieldId);
      return next;
    });
    setCtxMenu(null);
  }
  function ctxHide() {
    toggleCol(`field-${ctxMenu!.fieldId}`);
    setCtxMenu(null);
  }

  function renderTaskRow(vIndex: number, item: TaskWithMeta) {
    return (
      <TaskRow
        key={item.task.id}
        vIndex={vIndex}
        item={item}
        orderedColumns={orderedColumns}
        canEdit={canEdit}
        statuses={statuses}
        statusById={statusById}
        fieldDefs={fieldDefs}
        userNames={userNames}
        activeUsers={activeUsers}
        spaceTags={spaceTags}
        onPatchTask={patchTask}
        onPatchCustomField={patchCustomField}
      />
    );
  }

  // ── grouping: fixed-position segments computed from server group counts ────
  // Group sizes are known up front (groupCounts is server-ordered to match the
  // row ordering), so every group header's absolute position — and every task
  // row's absolute offset — is known before any rows load.
  const effectiveGroupBy = groupBy;

  const getGroupMeta = useCallback(
    (key: string): { label: string; color?: string } => {
      if (key === "__none__") return { label: "No value" };
      if (effectiveGroupBy === "status") {
        const s = statuses.find((x) => x.id === key);
        return { label: s?.name ?? key, color: s?.color };
      }
      if (effectiveGroupBy === "priority") {
        return { label: { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" }[key] ?? key };
      }
      if (effectiveGroupBy?.startsWith("cf_")) {
        const def = fieldDefs.find((d) => d.id === effectiveGroupBy.slice(3));
        if (!def) return { label: key };
        if (def.type === "checkbox") return { label: key === "true" ? "Yes" : "No" };
        return { label: renderFieldValue(def, key, userNames) };
      }
      return { label: key };
    },
    [effectiveGroupBy, statuses, fieldDefs, userNames],
  );

  interface GroupSegment { key: string; label: string; color?: string; count: number; startOffset: number }
  const groupSegments = useMemo<GroupSegment[] | null>(() => {
    if (!effectiveGroupBy || !groupCounts) return null;
    let offset = 0;
    return groupCounts.map((g) => {
      const seg = { key: g.key, ...getGroupMeta(g.key), count: g.count, startOffset: offset };
      offset += g.count;
      return seg;
    });
  }, [effectiveGroupBy, groupCounts, getGroupMeta]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  // ── virtual row model over the FULL dataset (loaded or not) ────────────────
  type RowEntry =
    | { kind: "header"; seg: GroupSegment }
    | { kind: "task"; offset: number }
    | { kind: "calc"; seg: GroupSegment };

  const showCalcFooterRows = calcFieldIds.size > 0;

  // Per-segment entry index ranges (grouped mode only).
  const segmentRanges = useMemo(() => {
    if (!groupSegments) return null;
    let cursor = 0;
    const ranges = groupSegments.map((seg) => {
      const collapsed = collapsedGroups.has(seg.key);
      const bodyRows = collapsed ? 0 : seg.count + (showCalcFooterRows ? 1 : 0);
      const r = { seg, headerIndex: cursor, bodyRows, collapsed };
      cursor += 1 + bodyRows;
      return r;
    });
    return { ranges, totalEntries: cursor };
  }, [groupSegments, collapsedGroups, showCalcFooterRows]);

  const virtualCount = segmentRanges ? segmentRanges.totalEntries : totalCount;

  const resolveEntry = useCallback(
    (index: number): RowEntry => {
      if (!segmentRanges) return { kind: "task", offset: index };
      // Binary search the segment whose entry range contains this index.
      const { ranges } = segmentRanges;
      let lo = 0;
      let hi = ranges.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ranges[mid].headerIndex <= index) lo = mid;
        else hi = mid - 1;
      }
      const r = ranges[lo];
      if (index === r.headerIndex) return { kind: "header", seg: r.seg };
      const within = index - r.headerIndex - 1;
      if (showCalcFooterRows && within === r.seg.count) return { kind: "calc", seg: r.seg };
      return { kind: "task", offset: r.seg.startOffset + within };
    },
    [segmentRanges, showCalcFooterRows],
  );

  // State (not a ref) so the virtualizer re-initializes its scroll listener
  // once the element exists — a ref stays null through the first render and
  // the subscription would never attach.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => (resolveEntry(i).kind === "header" ? 42 : 37),
    // Fixed row heights — no ResizeObserver thrash. Overscan keeps a buffer of
    // cheap display-only rows ready so trackpad flings stay within pre-rendered
    // content. Editors are not mounted per-row, so overscan is nearly free.
    overscan: 12,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  // Fetch every page touching the visible window, plus one page ahead and one
  // behind (prefetch), so skeletons are rarely seen at normal scroll speeds.
  const firstVirtualIndex = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const lastVirtualIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : 0;
  useEffect(() => {
    if (totalCount === 0) return;
    let minOffset = Number.POSITIVE_INFINITY;
    let maxOffset = -1;
    for (const v of virtualRows) {
      const e = resolveEntry(v.index);
      if (e.kind !== "task") continue;
      if (e.offset < minOffset) minOffset = e.offset;
      if (e.offset > maxOffset) maxOffset = e.offset;
    }
    if (maxOffset < 0) return;
    const from = Math.max(0, minOffset - PAGE_SIZE);
    const to = Math.min(totalCount - 1, maxOffset + PAGE_SIZE);
    const lastPage = Math.floor(to / PAGE_SIZE);
    for (let p = Math.floor(from / PAGE_SIZE); p <= lastPage; p++) {
      if (!requestedPages.current.has(p)) void fetchPage(p);
    }
  // resolveEntry/virtualRows identities churn every render; the index bounds are the real inputs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstVirtualIndex, lastVirtualIndex, totalCount, fetchPage, rowsByOffset.size]);

  const totalWidth = orderedColumns.reduce((sum, col) => sum + columnWidth(col), 0);
  const colSpan = orderedColumns.length;
  const totalHideable = HIDEABLE_BASE_COLS.length + fieldDefs.length;
  const visibleCount = totalHideable - hiddenColIds.filter((id) =>
    HIDEABLE_BASE_COLS.some((c) => c.id === id) || id.startsWith("field-"),
  ).length;
  const showCalcFooter = calcFieldIds.size > 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* toolbar */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Columns3 className="size-4" />
              Fields
              <span className="text-muted-foreground">{visibleCount}/{totalHideable}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Standard fields</DropdownMenuLabel>
            {HIDEABLE_BASE_COLS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={!hiddenColIds.includes(col.id)}
                onCheckedChange={() => toggleCol(col.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
            {fieldDefs.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Custom fields</DropdownMenuLabel>
                {fieldDefs.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.id}
                    checked={!hiddenColIds.includes(`field-${field.id}`)}
                    onCheckedChange={() => toggleCol(`field-${field.id}`)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={setScrollEl}
        className="min-h-0 flex-1 overflow-auto overscroll-contain [contain:strict] [scrollbar-gutter:stable]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
      <Table className="table-fixed" style={{ width: totalWidth }}>
        <colgroup>
          {orderedColumns.map((col) => <col key={col.id} style={{ width: columnWidth(col) }} />)}
        </colgroup>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {orderedColumns.map((col) => {
              const isCustom = col.id.startsWith("field-");
              const defId = isCustom ? col.id.slice(6) : null;
              const isSorted = !!defId && sort?.fieldId === defId;
              return (
                <TableHead
                  key={col.id}
                  draggable
                  onDragStart={(e) => onColDragStart(e, col.id)}
                  onDragOver={(e) => onColDragOver(e, col.id)}
                  onDrop={(e) => onColDrop(e, col.id)}
                  onDragEnd={onColDragEnd}
                  onContextMenu={isCustom && defId ? (e) => openCtxMenu(e, defId) : undefined}
                  className={cn(
                    "relative select-none pr-4 cursor-grab active:cursor-grabbing",
                    dragOverColId === col.id && "bg-muted/60 border-l-2 border-l-primary",
                    isSorted && "bg-muted/30",
                  )}
                >
                  <span className="block truncate">
                    {col.label}
                    {isSorted && <span className="ml-1 text-xs text-muted-foreground">{sort!.dir === "asc" ? "↑" : "↓"}</span>}
                  </span>
                  <div
                    role="separator"
                    aria-label={`Resize ${col.label}`}
                    aria-orientation="vertical"
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none after:absolute after:top-2 after:right-1 after:h-[calc(100%-1rem)] after:w-px after:bg-transparent hover:after:bg-border"
                    onPointerDown={(e) => { e.stopPropagation(); resizeColumn(col, e); }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setWidths((cur) => { const next = { ...cur }; delete next[col.id]; return next; });
                    }}
                  />
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {virtualCount === 0 && (
            <TableRow><TableCell colSpan={colSpan} className="text-muted-foreground">No tasks match.</TableCell></TableRow>
          )}
          {paddingTop > 0 && (
            <tr aria-hidden style={{ height: paddingTop }}><td colSpan={colSpan} className="p-0" /></tr>
          )}
          {virtualRows.map((vRow) => {
            const entry = resolveEntry(vRow.index);
            if (entry.kind === "header") {
              const seg = entry.seg;
              const collapsed = collapsedGroups.has(seg.key);
              return (
                <TableRow
                  key={`h-${seg.key}`}
                  data-index={vRow.index}
                  className="cursor-pointer bg-muted/40 hover:bg-muted/60"
                  onClick={() => toggleGroup(seg.key)}
                >
                  <TableCell colSpan={colSpan} className="py-2">
                    <div className="flex items-center gap-2">
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", !collapsed && "rotate-90")} />
                      {seg.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />}
                      <span className="text-sm font-semibold">{seg.label}</span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">{seg.count}</Badge>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
            if (entry.kind === "calc") {
              const seg = entry.seg;
              const segItems: TaskWithMeta[] = [];
              for (let o = seg.startOffset; o < seg.startOffset + seg.count; o++) {
                const it = rowsByOffset.get(o);
                if (it) segItems.push(it);
              }
              return (
                <TableRow
                  key={`c-${seg.key}`}
                  data-index={vRow.index}
                  className="bg-muted/20 text-xs text-muted-foreground"
                >
                  {orderedColumns.map((col) => {
                    if (!col.id.startsWith("field-")) return <TableCell key={col.id} />;
                    const defId = col.id.slice(6);
                    if (!calcFieldIds.has(defId)) return <TableCell key={col.id} />;
                    return <TableCell key={col.id} className="font-medium">{calcValue(defId, segItems)}</TableCell>;
                  })}
                </TableRow>
              );
            }
            const item = rowsByOffset.get(entry.offset);
            if (!item) {
              // Skeleton placeholder — same height as a data row, filled in when its page lands.
              return (
                <TableRow
                  key={`skeleton-${entry.offset}`}
                  data-index={vRow.index}
                  className="animate-pulse"
                >
                  {orderedColumns.map((col, i) => (
                    <TableCell key={col.id} className="py-2.5">
                      <div className="h-3 rounded bg-muted" style={{ width: i === 1 ? "80%" : "55%" }} />
                    </TableCell>
                  ))}
                </TableRow>
              );
            }
            return renderTaskRow(vRow.index, item);
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden style={{ height: paddingBottom }}><td colSpan={colSpan} className="p-0" /></tr>
          )}
        </TableBody>
        {/* global calc footer (flat view) — computed over loaded rows */}
        {!groupSegments && showCalcFooter && (
          <TableFooter>
            <TableRow className="bg-muted/20 text-xs text-muted-foreground">
              {orderedColumns.map((col) => {
                if (!col.id.startsWith("field-")) return <TableCell key={col.id} />;
                const defId = col.id.slice(6);
                if (!calcFieldIds.has(defId)) return <TableCell key={col.id} />;
                return <TableCell key={col.id} className="font-medium">{calcValue(defId, loadedItems)}</TableCell>;
              })}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      </div>

      {/* context menu */}
      {ctxMenu && ctxDef && (
        <FieldContextMenu
          menu={ctxMenu}
          def={ctxDef}
          isSorted={sort?.fieldId === ctxMenu.fieldId}
          sortDir={sort?.dir ?? "asc"}
          hasCalc={calcFieldIds.has(ctxMenu.fieldId)}
          isHidden={hiddenColIds.includes(`field-${ctxMenu.fieldId}`)}
          onSort={ctxSort}
          onGroup={ctxGroup}
          onEditOptions={ctxEditOptions}
          onMoveStart={ctxMoveStart}
          onMoveEnd={ctxMoveEnd}
          onToggleCalc={ctxToggleCalc}
          onHide={ctxHide}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
