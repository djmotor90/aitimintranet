"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Columns3 } from "lucide-react";
import {
  Fragment,
  type DragEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shell/user-avatar";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TaskWithMeta } from "../queries";
import { saveTableColumnOrder } from "../actions";
import { PRIORITY_STYLES } from "./task-card";

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
  { id: "number",    label: "#",         width: 90,  minWidth: 72  },
  { id: "title",     label: "Title",     width: 360, minWidth: 220 },
  { id: "status",    label: "Status",    width: 150, minWidth: 120 },
  { id: "priority",  label: "Priority",  width: 130, minWidth: 110 },
  { id: "due",       label: "Due",       width: 140, minWidth: 120 },
  { id: "assignees", label: "Assignees", width: 150, minWidth: 120 },
];
const BASE_COL_MAP = new Map(BASE_COLUMNS.map((c) => [c.id, c]));

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

// ─── main component ───────────────────────────────────────────────────────────

export function TaskTable({
  items,
  statuses,
  fieldDefs,
  userNames,
  groupBy,
  listId,
  initialColumnOrder,
}: {
  items: TaskWithMeta[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  userNames: Map<string, string>;
  groupBy?: string;
  listId: string;
  initialColumnOrder?: string[];
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ── column order ──────────────────────────────────────────────────────────
  const defaultOrder = useMemo(
    () => [...BASE_COLUMNS.map((c) => c.id), ...fieldDefs.map((d) => `field-${d.id}`)],
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
    startTransition(() => { saveTableColumnOrder(listId, columnOrder); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder]);

  // ── column visibility ─────────────────────────────────────────────────────
  const hiddenStorageKey = useMemo(
    () => `aitim:task-table-hidden-fields:${fieldDefs.map((d) => d.id).join(":")}`,
    [fieldDefs],
  );
  const [hiddenFieldIds, setHiddenFieldIds] = useState<string[]>([]);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(hiddenStorageKey);
    try {
      const saved = raw ? (JSON.parse(raw) as string[]) : [];
      const fieldIds = new Set(fieldDefs.map((d) => d.id));
      const timeout = window.setTimeout(() => {
        setHiddenFieldIds(saved.filter((id) => fieldIds.has(id)));
        setVisibilityLoaded(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      window.localStorage.removeItem(hiddenStorageKey);
      const timeout = window.setTimeout(() => setVisibilityLoaded(true), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [fieldDefs, hiddenStorageKey]);

  useEffect(() => {
    if (!visibilityLoaded) return;
    window.localStorage.setItem(hiddenStorageKey, JSON.stringify(hiddenFieldIds));
  }, [hiddenFieldIds, hiddenStorageKey, visibilityLoaded]);

  function toggleField(fieldId: string) {
    setHiddenFieldIds((cur) =>
      cur.includes(fieldId) ? cur.filter((id) => id !== fieldId) : [...cur, fieldId],
    );
  }

  // ── sort ──────────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ fieldId: string; dir: "asc" | "desc" } | null>(null);

  const sortedItems = useMemo(() => {
    if (!sort) return items;
    const def = fieldDefs.find((d) => d.id === sort.fieldId);
    if (!def) return items;
    return [...items].sort((a, b) => {
      const cfa = (a.task.customFields ?? {}) as Record<string, unknown>;
      const cfb = (b.task.customFields ?? {}) as Record<string, unknown>;
      const va = cfa[sort.fieldId];
      const vb = cfb[sort.fieldId];
      if (def.type === "number") {
        const na = Number(va ?? 0), nb = Number(vb ?? 0);
        return sort.dir === "asc" ? na - nb : nb - na;
      }
      if (def.type === "date") {
        const da = va ? new Date(String(va)).getTime() : 0;
        const db = vb ? new Date(String(vb)).getTime() : 0;
        return sort.dir === "asc" ? da - db : db - da;
      }
      const sa = String(va ?? ""), sb = String(vb ?? "");
      return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [items, sort, fieldDefs]);

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
    const result: ColumnDef[] = [];
    for (const id of columnOrder) {
      if (BASE_COL_MAP.has(id)) {
        const base = BASE_COL_MAP.get(id)!;
        result.push({ ...base, width: widths[id] ?? base.width });
      } else if (id.startsWith("field-")) {
        const defId = id.slice(6);
        if (hiddenFieldIds.includes(defId)) continue;
        const def = fieldDefs.find((d) => d.id === defId);
        if (!def) continue;
        result.push({ id, label: def.label, width: widths[id] ?? 180, minWidth: 120 });
      }
    }
    return result;
  }, [columnOrder, fieldDefs, hiddenFieldIds, widths]);

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
    const params = new URLSearchParams(window.location.search);
    params.set("groupBy", `cf_${ctxMenu!.fieldId}`);
    router.push(`${window.location.pathname}?${params.toString()}`);
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
    toggleField(ctxMenu!.fieldId);
    setCtxMenu(null);
  }

  // ── cell renderer ─────────────────────────────────────────────────────────
  function renderCell(colId: string, task: TaskWithMeta["task"], assignees: TaskWithMeta["assignees"]) {
    const status = statusById.get(task.statusId);
    const cf = (task.customFields ?? {}) as Record<string, unknown>;
    switch (colId) {
      case "number":
        return <TableCell key={colId} className="text-xs text-muted-foreground">{task.number}</TableCell>;
      case "title":
        return (
          <TableCell key={colId} className="truncate">
            <Link href={`/tasks/task/${task.number}`} className="font-medium hover:underline">{task.title}</Link>
          </TableCell>
        );
      case "status":
        return (
          <TableCell key={colId}>
            {status && <Badge variant="outline" style={{ borderColor: status.color, color: status.color }}>{status.name}</Badge>}
          </TableCell>
        );
      case "priority":
        return (
          <TableCell key={colId}>
            {task.priority && <Badge variant="secondary" className={cn("text-xs", PRIORITY_STYLES[task.priority])}>{task.priority}</Badge>}
          </TableCell>
        );
      case "due": return <TableCell key={colId} className="text-sm">{task.dueDate ?? "—"}</TableCell>;
      case "assignees":
        return (
          <TableCell key={colId}>
            <span className="flex -space-x-1.5">
              {assignees.map((a) => (
                <UserAvatar key={a.id} userId={a.id} name={a.displayName} hasPhoto={!!a.photoKey} className="size-6 ring-2 ring-background" />
              ))}
            </span>
          </TableCell>
        );
      default:
        if (colId.startsWith("field-")) {
          const defId = colId.slice(6);
          const def = fieldDefs.find((d) => d.id === defId);
          if (!def) return null;
          return <TableCell key={colId} className="truncate text-sm">{renderFieldValue(def, cf[defId], userNames)}</TableCell>;
        }
        return null;
    }
  }

  function renderTaskRow(task: TaskWithMeta["task"], assignees: TaskWithMeta["assignees"]) {
    return (
      <TableRow key={task.id}>
        {orderedColumns.map((col) => renderCell(col.id, task, assignees))}
      </TableRow>
    );
  }

  // ── grouping ──────────────────────────────────────────────────────────────
  const effectiveGroupBy = groupBy;

  const groups = useMemo<Group[] | null>(() => {
    if (!effectiveGroupBy) return null;
    function getGroupKey(item: TaskWithMeta): string {
      if (effectiveGroupBy === "status") return item.task.statusId ?? "__none__";
      if (effectiveGroupBy === "priority") return item.task.priority ?? "__none__";
      if (effectiveGroupBy!.startsWith("cf_")) {
        const defId = effectiveGroupBy!.slice(3);
        const cf = (item.task.customFields ?? {}) as Record<string, unknown>;
        const val = cf[defId];
        if (val === null || val === undefined || val === "") return "__none__";
        return String(val);
      }
      return "__none__";
    }
    function getGroupMeta(key: string): { label: string; color?: string } {
      if (key === "__none__") return { label: "No value" };
      if (effectiveGroupBy === "status") { const s = statusById.get(key); return { label: s?.name ?? key, color: s?.color }; }
      if (effectiveGroupBy === "priority") {
        return { label: { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" }[key] ?? key };
      }
      if (effectiveGroupBy!.startsWith("cf_")) {
        const def = fieldDefs.find((d) => d.id === effectiveGroupBy!.slice(3));
        if (!def) return { label: key };
        if (def.type === "checkbox") return { label: key === "true" ? "Yes" : "No" };
        return { label: renderFieldValue(def, key, userNames) };
      }
      return { label: key };
    }
    const groupMap = new Map<string, TaskWithMeta[]>();
    for (const item of sortedItems) {
      const key = getGroupKey(item);
      const arr = groupMap.get(key) ?? [];
      arr.push(item);
      groupMap.set(key, arr);
    }
    const entries = [...groupMap.entries()];
    const noValueIdx = entries.findIndex(([k]) => k === "__none__");
    if (noValueIdx > -1) { const [nv] = entries.splice(noValueIdx, 1); entries.push(nv); }
    return entries.map(([key, groupItems]) => ({ key, ...getGroupMeta(key), items: groupItems }));
  }, [effectiveGroupBy, sortedItems, statusById, fieldDefs, userNames]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  const totalWidth = orderedColumns.reduce((sum, col) => sum + columnWidth(col), 0);
  const colSpan = orderedColumns.length;
  const visibleCustomFieldCount = fieldDefs.filter((d) => !hiddenFieldIds.includes(d.id)).length;
  const showCalcFooter = calcFieldIds.size > 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      {fieldDefs.length > 0 && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <Columns3 className="size-4" />
                Custom fields
                <span className="text-muted-foreground">{visibleCustomFieldCount}/{fieldDefs.length}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72">
              {fieldDefs.map((field) => (
                <DropdownMenuCheckboxItem
                  key={field.id}
                  checked={!hiddenFieldIds.includes(field.id)}
                  onCheckedChange={() => toggleField(field.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {field.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Table className="table-fixed" style={{ width: totalWidth }}>
        <colgroup>
          {orderedColumns.map((col) => <col key={col.id} style={{ width: columnWidth(col) }} />)}
        </colgroup>
        <TableHeader>
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
          {groups ? (
            groups.length === 0 ? (
              <TableRow><TableCell colSpan={colSpan} className="text-muted-foreground">No tasks match.</TableCell></TableRow>
            ) : (
              groups.map((group) => {
                const collapsed = collapsedGroups.has(group.key);
                return (
                  <Fragment key={group.key}>
                    <TableRow className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleGroup(group.key)}>
                      <TableCell colSpan={colSpan} className="py-2">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", !collapsed && "rotate-90")} />
                          {group.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />}
                          <span className="text-sm font-semibold">{group.label}</span>
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">{group.items.length}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {!collapsed && group.items.map(({ task, assignees }) => renderTaskRow(task, assignees))}
                    {/* per-group calc footer */}
                    {!collapsed && showCalcFooter && (
                      <TableRow className="bg-muted/20 text-xs text-muted-foreground">
                        {orderedColumns.map((col) => {
                          if (!col.id.startsWith("field-")) return <TableCell key={col.id} />;
                          const defId = col.id.slice(6);
                          if (!calcFieldIds.has(defId)) return <TableCell key={col.id} />;
                          return <TableCell key={col.id} className="font-medium">{calcValue(defId, group.items)}</TableCell>;
                        })}
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )
          ) : (
            <>
              {sortedItems.map(({ task, assignees }) => renderTaskRow(task, assignees))}
              {sortedItems.length === 0 && (
                <TableRow><TableCell colSpan={colSpan} className="text-muted-foreground">No tasks match.</TableCell></TableRow>
              )}
            </>
          )}
        </TableBody>
        {/* global calc footer (flat view) */}
        {!groups && showCalcFooter && (
          <TableFooter>
            <TableRow className="bg-muted/20 text-xs text-muted-foreground">
              {orderedColumns.map((col) => {
                if (!col.id.startsWith("field-")) return <TableCell key={col.id} />;
                const defId = col.id.slice(6);
                if (!calcFieldIds.has(defId)) return <TableCell key={col.id} />;
                return <TableCell key={col.id} className="font-medium">{calcValue(defId, sortedItems)}</TableCell>;
              })}
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {/* context menu */}
      {ctxMenu && ctxDef && (
        <FieldContextMenu
          menu={ctxMenu}
          def={ctxDef}
          isSorted={sort?.fieldId === ctxMenu.fieldId}
          sortDir={sort?.dir ?? "asc"}
          hasCalc={calcFieldIds.has(ctxMenu.fieldId)}
          isHidden={hiddenFieldIds.includes(ctxMenu.fieldId)}
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
