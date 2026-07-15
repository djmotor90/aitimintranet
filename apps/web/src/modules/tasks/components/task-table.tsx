"use client";

import Link from "next/link";
import { ChevronRight, Columns3 } from "lucide-react";
import { Fragment, type PointerEvent, useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
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
import { PRIORITY_STYLES } from "./task-card";

interface StatusLike {
  id: string;
  name: string;
  color: string;
}

interface FieldDefLike {
  id: string;
  key: string;
  label: string;
  type: string;
  options: unknown;
}

function renderFieldValue(def: FieldDefLike, value: unknown, userNames: Map<string, string>) {
  if (value === null || value === undefined || value === "") return "—";
  const options = (def.options ?? []) as { id: string; label: string }[];
  switch (def.type) {
    case "checkbox":
      return value ? "Yes" : "No";
    case "dropdown":
      return options.find((o) => o.id === value)?.label ?? String(value);
    case "multi_select":
      return (value as string[])
        .map((v) => options.find((o) => o.id === v)?.label ?? v)
        .join(", ");
    case "user":
      return userNames.get(String(value)) ?? "Unknown";
    default:
      return String(value);
  }
}

const BASE_COLUMNS = [
  { id: "number", label: "#", width: 90, minWidth: 72 },
  { id: "title", label: "Title", width: 360, minWidth: 220 },
  { id: "status", label: "Status", width: 150, minWidth: 120 },
  { id: "priority", label: "Priority", width: 130, minWidth: 110 },
  { id: "due", label: "Due", width: 140, minWidth: 120 },
  { id: "assignees", label: "Assignees", width: 150, minWidth: 120 },
];

interface ColumnDef {
  id: string;
  label: string;
  width: number;
  minWidth: number;
}

interface Group {
  key: string;
  label: string;
  color?: string;
  items: TaskWithMeta[];
}

export function TaskTable({
  items,
  statuses,
  fieldDefs,
  userNames,
  groupBy,
}: {
  items: TaskWithMeta[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  userNames: Map<string, string>;
  groupBy?: string;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  // --- column visibility ---
  const hiddenStorageKey = useMemo(
    () => `aitim:task-table-hidden-fields:${fieldDefs.map((d) => d.id).join(":")}`,
    [fieldDefs],
  );
  const [hiddenFieldIds, setHiddenFieldIds] = useState<string[]>([]);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);
  const visibleFieldDefs = useMemo(
    () => fieldDefs.filter((d) => !hiddenFieldIds.includes(d.id)),
    [fieldDefs, hiddenFieldIds],
  );

  // --- column widths ---
  const storageKey = useMemo(
    () => `aitim:task-table-widths:${fieldDefs.map((d) => d.id).join(":")}`,
    [fieldDefs],
  );
  const [widths, setWidths] = useState<Record<string, number>>({});

  const columns = useMemo<ColumnDef[]>(
    () => [
      ...BASE_COLUMNS,
      ...visibleFieldDefs.map((d) => ({
        id: `field-${d.id}`,
        label: d.label,
        width: 180,
        minWidth: 120,
      })),
    ],
    [visibleFieldDefs],
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(hiddenStorageKey);
    try {
      const saved = raw ? (JSON.parse(raw) as string[]) : [];
      const fieldIds = new Set(fieldDefs.map((d) => d.id));
      const nextHiddenIds = saved.filter((id) => fieldIds.has(id));
      const timeout = window.setTimeout(() => {
        setHiddenFieldIds(nextHiddenIds);
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

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, number>;
      const timeout = window.setTimeout(() => setWidths(saved), 0);
      return () => window.clearTimeout(timeout);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (Object.keys(widths).length === 0) return;
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  function columnWidth(column: ColumnDef) {
    return widths[column.id] ?? column.width;
  }

  function resizeColumn(column: ColumnDef, event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidth(column);

    function onPointerMove(moveEvent: globalThis.PointerEvent) {
      const nextWidth = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
      setWidths((current) => ({ ...current, [column.id]: nextWidth }));
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  const totalWidth = columns.reduce((sum, column) => sum + columnWidth(column), 0);
  const visibleCustomFieldCount = visibleFieldDefs.length;

  function toggleField(fieldId: string) {
    setHiddenFieldIds((current) =>
      current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId],
    );
  }

  // --- grouping ---
  const groups = useMemo<Group[] | null>(() => {
    if (!groupBy) return null;

    function getGroupKey(item: TaskWithMeta): string {
      if (groupBy === "status") return item.task.statusId ?? "__none__";
      if (groupBy === "priority") return item.task.priority ?? "__none__";
      if (groupBy!.startsWith("cf_")) {
        const defId = groupBy!.slice(3);
        const cf = (item.task.customFields ?? {}) as Record<string, unknown>;
        const val = cf[defId];
        if (val === null || val === undefined || val === "") return "__none__";
        return String(val);
      }
      return "__none__";
    }

    function getGroupMeta(key: string): { label: string; color?: string } {
      if (key === "__none__") return { label: "No value" };
      if (groupBy === "status") {
        const s = statusById.get(key);
        return { label: s?.name ?? key, color: s?.color };
      }
      if (groupBy === "priority") {
        const labels: Record<string, string> = {
          urgent: "Urgent",
          high: "High",
          normal: "Normal",
          low: "Low",
        };
        return { label: labels[key] ?? key };
      }
      if (groupBy!.startsWith("cf_")) {
        const defId = groupBy!.slice(3);
        const def = fieldDefs.find((d) => d.id === defId);
        if (!def) return { label: key };
        if (def.type === "checkbox") return { label: key === "true" ? "Yes" : "No" };
        return { label: renderFieldValue(def, key, userNames) };
      }
      return { label: key };
    }

    const groupMap = new Map<string, TaskWithMeta[]>();
    for (const item of items) {
      const key = getGroupKey(item);
      const arr = groupMap.get(key) ?? [];
      arr.push(item);
      groupMap.set(key, arr);
    }

    // Sort groups: "No value" always last
    const entries = [...groupMap.entries()];
    const noValueIdx = entries.findIndex(([k]) => k === "__none__");
    if (noValueIdx > -1) {
      const [nv] = entries.splice(noValueIdx, 1);
      entries.push(nv);
    }

    return entries.map(([key, groupItems]) => ({
      key,
      ...getGroupMeta(key),
      items: groupItems,
    }));
  }, [groupBy, items, statusById, fieldDefs, userNames]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const colSpan = 6 + visibleFieldDefs.length;

  function renderTaskRow(task: TaskWithMeta["task"], assignees: TaskWithMeta["assignees"]) {
    const status = statusById.get(task.statusId);
    const cf = (task.customFields ?? {}) as Record<string, unknown>;
    return (
      <TableRow key={task.id}>
        <TableCell className="text-xs text-muted-foreground">{task.number}</TableCell>
        <TableCell className="truncate">
          <Link href={`/tasks/task/${task.number}`} className="font-medium hover:underline">
            {task.title}
          </Link>
        </TableCell>
        <TableCell>
          {status && (
            <Badge
              variant="outline"
              style={{ borderColor: status.color, color: status.color }}
            >
              {status.name}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {task.priority && (
            <Badge
              variant="secondary"
              className={cn("text-xs", PRIORITY_STYLES[task.priority])}
            >
              {task.priority}
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-sm">{task.dueDate ?? "—"}</TableCell>
        <TableCell>
          <span className="flex -space-x-1.5">
            {assignees.map((a) => (
              <UserAvatar
                key={a.id}
                userId={a.id}
                name={a.displayName}
                hasPhoto={!!a.photoKey}
                className="size-6 ring-2 ring-background"
              />
            ))}
          </span>
        </TableCell>
        {visibleFieldDefs.map((d) => (
          <TableCell key={d.id} className="truncate text-sm">
            {renderFieldValue(d, cf[d.id], userNames)}
          </TableCell>
        ))}
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {fieldDefs.length > 0 && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <Columns3 className="size-4" />
                Custom fields
                <span className="text-muted-foreground">
                  {visibleCustomFieldCount}/{fieldDefs.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72">
              {fieldDefs.map((field) => (
                <DropdownMenuCheckboxItem
                  key={field.id}
                  checked={!hiddenFieldIds.includes(field.id)}
                  onCheckedChange={() => toggleField(field.id)}
                  onSelect={(event) => event.preventDefault()}
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
          {columns.map((column) => (
            <col key={column.id} style={{ width: columnWidth(column) }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id} className="relative select-none pr-4">
                <span className="block truncate">{column.label}</span>
                <div
                  role="separator"
                  aria-label={`Resize ${column.label} column`}
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none after:absolute after:top-2 after:right-1 after:h-[calc(100%-1rem)] after:w-px after:bg-transparent hover:after:bg-border"
                  onPointerDown={(event) => resizeColumn(column, event)}
                  onDoubleClick={() =>
                    setWidths((current) => {
                      const next = { ...current };
                      delete next[column.id];
                      return next;
                    })
                  }
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups ? (
            // --- grouped view ---
            groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-muted-foreground">
                  No tasks match.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => {
                const collapsed = collapsedGroups.has(group.key);
                return (
                  <Fragment key={group.key}>
                    {/* group header row */}
                    <TableRow
                      className="cursor-pointer bg-muted/40 hover:bg-muted/60"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <TableCell colSpan={colSpan} className="py-2">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                              !collapsed && "rotate-90",
                            )}
                          />
                          {group.color && (
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                          )}
                          <span className="text-sm font-semibold">{group.label}</span>
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {group.items.length}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* group tasks */}
                    {!collapsed &&
                      group.items.map(({ task, assignees }) =>
                        renderTaskRow(task, assignees),
                      )}
                  </Fragment>
                );
              })
            )
          ) : (
            // --- flat view ---
            <>
              {items.map(({ task, assignees }) => renderTaskRow(task, assignees))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-muted-foreground">
                    No tasks match.
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
