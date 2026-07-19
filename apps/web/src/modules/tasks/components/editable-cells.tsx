"use client";

import { Check, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  updateTaskCustomField,
  updateTaskDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
} from "../actions";
import { PRIORITY_STYLES } from "./task-card";

const PRIORITY_OPTIONS = ["urgent", "high", "normal", "low"] as const;

async function runSave(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to save");
  }
}

// ─── lazy picker (display button; menu content mounts only when opened) ────────
// Rendering thousands of rows means cells must stay cheap: a single button in
// display mode, with the option list mounted only for the open picker.

function LazyPicker({
  display,
  displayClassName,
  displayStyle,
  options,
  selectedId,
  onSelect,
  clearable,
  defaultOpen = false,
  onOpenChange,
}: {
  display: React.ReactNode;
  displayClassName?: string;
  displayStyle?: React.CSSProperties;
  options: { id: string; label: string; color?: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  clearable?: boolean;
  /** Open immediately when mounted (click-to-edit cells). */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          style={displayStyle}
          className={cn(
            "block h-7 w-full truncate rounded-md px-1.5 text-left text-sm hover:bg-muted",
            displayClassName,
          )}
        >
          {display}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72">
        {clearable && (
          <DropdownMenuCheckboxItem
            checked={selectedId === null}
            onCheckedChange={() => onSelect(null)}
            className="text-muted-foreground"
          >
            —
          </DropdownMenuCheckboxItem>
        )}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.id}
            checked={o.id === selectedId}
            onCheckedChange={() => onSelect(o.id)}
          >
            {o.color && <span className="mr-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StatusSelectCell({
  taskId,
  statusId,
  statuses,
  onSaved,
  defaultOpen,
  onOpenChange,
}: {
  taskId: string;
  statusId: string;
  statuses: { id: string; name: string; color: string }[];
  onSaved: (statusId: string) => void;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [, startTransition] = useTransition();
  const current = statuses.find((s) => s.id === statusId);

  return (
    <LazyPicker
      display={current?.name ?? "—"}
      displayStyle={current ? { color: current.color } : undefined}
      options={statuses.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
      selectedId={statusId}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      onSelect={(next) => {
        if (!next || next === statusId) return;
        onSaved(next);
        startTransition(() => runSave(() => updateTaskStatus(taskId, next)));
      }}
    />
  );
}

export function PrioritySelectCell({
  taskId,
  priority,
  onSaved,
  defaultOpen,
  onOpenChange,
}: {
  taskId: string;
  priority: "urgent" | "high" | "normal" | "low" | null;
  onSaved: (priority: "urgent" | "high" | "normal" | "low" | null) => void;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [, startTransition] = useTransition();

  return (
    <LazyPicker
      display={priority ?? <span className="text-muted-foreground">—</span>}
      displayClassName={priority ? PRIORITY_STYLES[priority] : undefined}
      options={PRIORITY_OPTIONS.map((p) => ({ id: p, label: p }))}
      selectedId={priority}
      clearable
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      onSelect={(nextId) => {
        const next = (nextId ?? null) as typeof priority;
        if (next === priority) return;
        onSaved(next);
        startTransition(() => runSave(() => updateTaskPriority(taskId, next)));
      }}
    />
  );
}

// ─── date input (due/start date, and date-type custom fields) ─────────────────

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function DateEditCell({
  value,
  onCommit,
  startEditing = false,
  onCancel,
}: {
  value: string | null;
  onCommit: (value: string | null) => void;
  /** Open in edit mode immediately (table click-to-edit). */
  startEditing?: boolean;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="block h-7 w-full truncate rounded-md px-1.5 text-left text-sm hover:bg-muted"
      >
        {formatDate(value) ?? <span className="text-muted-foreground">—</span>}
      </button>
    );
  }
  return (
    <input
      type="date"
      autoFocus
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const next = e.target.value || null;
        setEditing(false);
        if (next === value) {
          onCancel?.();
          return;
        }
        startTransition(() => runSave(async () => onCommit(next)));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
          onCancel?.();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-7 w-full rounded-md border bg-background px-1.5 text-sm ring-1 ring-ring"
    />
  );
}

export function TaskDateCell({
  taskId,
  field,
  value,
  onSaved,
  startEditing,
  onCancel,
}: {
  taskId: string;
  field: "dueDate" | "startDate";
  value: string | null;
  onSaved: (value: string | null) => void;
  startEditing?: boolean;
  onCancel?: () => void;
}) {
  return (
    <DateEditCell
      value={value}
      startEditing={startEditing}
      onCancel={onCancel}
      onCommit={async (next) => {
        onSaved(next);
        await updateTaskDate(taskId, field, next);
      }}
    />
  );
}

// ─── inline title edit (table view: pen next to the task name link) ───────────

/**
 * Renders the task title as a link, with a small pencil that switches to an
 * inline input so the name can be renamed without opening the task page.
 *
 * Pass `trailing` (e.g. the tag toggle) to place content between the title and
 * the pencil: Title · trailing · ✏️
 */
export function TitleEditCell({
  taskId,
  number,
  title,
  canEdit,
  onSaved,
  trailing,
  startEditing = false,
}: {
  taskId: string;
  number: string;
  title: string;
  canEdit: boolean;
  onSaved: (title: string) => void;
  /** Rendered after the title link and before the edit pencil (e.g. tag toggle). */
  trailing?: ReactNode;
  /** Open the input immediately (table click-to-edit). */
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(title);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  function commit() {
    const next = draft.trim();
    if (!next) {
      toast.error("Title cannot be empty");
      setDraft(title);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (next === title) return;
    onSaved(next);
    startTransition(() =>
      runSave(async () => {
        try {
          await updateTaskTitle(taskId, next);
        } catch (err) {
          onSaved(title); // roll back optimistic patch
          throw err;
        }
      }),
    );
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-1.5 text-sm font-medium ring-1 ring-ring"
        />
      </div>
    );
  }

  return (
    <div className="group/title flex min-w-0 items-center gap-0.5">
      <Link
        href={`/tasks/task/${number}`}
        className="min-w-0 truncate font-medium hover:underline"
      >
        {title}
      </Link>
      {trailing}
      {canEdit && (
        <button
          type="button"
          title="Edit title"
          aria-label="Edit title"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDraft(title);
            setEditing(true);
          }}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── click-to-edit text (text/textarea/number/url/email/phone) ────────────────

export function TextEditCell({
  value,
  type,
  onCommit,
}: {
  value: string;
  type: "text" | "number" | "url" | "email" | "phone" | "textarea";
  onCommit: (value: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    setEditing(false);
    if (draft === value) return;
    startTransition(() => runSave(async () => onCommit(draft)));
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        className="block w-full truncate rounded px-1.5 py-1 text-left text-sm hover:bg-muted"
      >
        {value || <span className="text-muted-foreground">—</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      type={type === "textarea" ? "text" : type === "phone" ? "tel" : type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-7 w-full rounded-md border bg-background px-1.5 text-sm ring-1 ring-ring"
    />
  );
}

// ─── checkbox ───────────────────────────────────────────────────────────────────

export function CheckboxEditCell({
  checked,
  onCommit,
}: {
  checked: boolean;
  onCommit: (checked: boolean) => Promise<void> | void;
}) {
  const [, startTransition] = useTransition();
  return (
    <div className="flex items-center px-1.5" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => startTransition(() => runSave(async () => onCommit(next === true)))}
      />
    </div>
  );
}

// ─── single-select (dropdown / user) ───────────────────────────────────────────

export function SelectEditCell({
  value,
  options,
  onCommit,
}: {
  value: string;
  options: { id: string; label: string }[];
  onCommit: (value: string) => Promise<void> | void;
}) {
  const [, startTransition] = useTransition();
  const current = options.find((o) => o.id === value);
  return (
    <LazyPicker
      display={current?.label ?? <span className="text-muted-foreground">—</span>}
      options={options}
      selectedId={value || null}
      clearable
      onSelect={(next) => {
        const v = next ?? "";
        if (v === value) return;
        startTransition(() => runSave(async () => onCommit(v)));
      }}
    />
  );
}

// ─── multi-select popover ───────────────────────────────────────────────────────

export function MultiSelectEditCell({
  values,
  options,
  onCommit,
}: {
  values: string[];
  options: { id: string; label: string; color?: string }[];
  onCommit: (values: string[]) => Promise<void> | void;
}) {
  const [, startTransition] = useTransition();
  const selectedOptions = values
    .map((v) => options.find((o) => o.id === v))
    .filter((o): o is (typeof options)[number] => !!o);

  function toggle(id: string) {
    const next = values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
    startTransition(() => runSave(async () => onCommit(next)));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded px-1.5 py-1 text-left text-sm hover:bg-muted"
        >
          {selectedOptions.length > 0 ? (
            selectedOptions.map((o) => (
              <span
                key={o.id}
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={
                  o.color ? { backgroundColor: `${o.color}26`, color: o.color } : { backgroundColor: "var(--muted)" }
                }
              >
                {o.label}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.id}
            checked={values.includes(o.id)}
            onCheckedChange={() => toggle(o.id)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.color && (
              <span className="mr-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
            )}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── generic custom-field cell (dispatches by def.type) ────────────────────────

export interface FieldDefLike {
  id: string;
  key: string;
  label: string;
  type: string;
  options: unknown;
}

export function CustomFieldEditCell({
  taskId,
  def,
  value,
  users,
  onSaved,
}: {
  taskId: string;
  def: FieldDefLike;
  value: unknown;
  users: { id: string; displayName: string }[];
  onSaved: (value: unknown) => void;
}) {
  const options = (def.options ?? []) as { id: string; label: string }[];

  async function commit(next: unknown) {
    onSaved(next);
    await updateTaskCustomField(taskId, def.id, next);
  }

  switch (def.type) {
    case "checkbox":
      return <CheckboxEditCell checked={value === true} onCommit={commit} />;
    case "dropdown":
      return <SelectEditCell value={(value as string) ?? ""} options={options} onCommit={commit} />;
    case "user":
      return (
        <SelectEditCell
          value={(value as string) ?? ""}
          options={users.map((u) => ({ id: u.id, label: u.displayName }))}
          onCommit={commit}
        />
      );
    case "multi_select":
      return (
        <MultiSelectEditCell
          values={Array.isArray(value) ? (value as string[]) : []}
          options={options}
          onCommit={commit}
        />
      );
    case "date":
      return <DateEditCell value={(value as string) ?? null} onCommit={commit} />;
    case "number":
      return (
        <TextEditCell
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onCommit={(v) => commit(v === "" ? undefined : Number(v))}
        />
      );
    case "text":
    case "textarea":
    case "url":
    case "email":
    case "phone":
      return (
        <TextEditCell
          type={def.type as "text" | "textarea" | "url" | "email" | "phone"}
          value={(value as string) ?? ""}
          onCommit={(v) => commit(v === "" ? undefined : v)}
        />
      );
    default:
      return null;
  }
}
