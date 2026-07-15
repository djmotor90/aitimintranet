"use client";

import { Check, Plus, Rows3, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

export interface FilterCondition {
  field: string; // "status" | "priority" | "assignee" | `cf_${defId}`
  op: string;
  value: string;
  /** How this condition joins the previous one. Undefined on the first condition. */
  conjunction?: "and" | "or";
}

type FieldType =
  | "status"
  | "priority"
  | "assignee"
  | "dropdown"
  | "multi_select"
  | "checkbox"
  | "user"
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "phone"
  | "number"
  | "date";

interface FilterField {
  id: string;
  label: string;
  type: FieldType;
  options?: { id: string; label: string }[];
}

// ─── constants ────────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "normal", label: "Normal" },
  { id: "low", label: "Low" },
];

const CHECKBOX_OPTIONS = [
  { id: "true", label: "Yes" },
  { id: "false", label: "No" },
];

const OPERATORS: Record<FieldType, { value: string; label: string }[]> = {
  status: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  priority: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  assignee: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  dropdown: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  multi_select: [
    { value: "includes", label: "includes" },
    { value: "not_includes", label: "doesn't include" },
  ],
  checkbox: [{ value: "is", label: "is" }],
  user: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is", label: "is exactly" },
    { value: "is_not", label: "is not" },
  ],
  textarea: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
  ],
  url: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is", label: "is exactly" },
  ],
  email: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is", label: "is exactly" },
  ],
  phone: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
  ],
  date: [
    { value: "is", label: "is" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
  ],
};

const DEFAULT_OP: Record<FieldType, string> = {
  status: "is",
  priority: "is",
  assignee: "is",
  dropdown: "is",
  multi_select: "includes",
  checkbox: "is",
  user: "is",
  text: "contains",
  textarea: "contains",
  url: "contains",
  email: "contains",
  phone: "contains",
  number: "eq",
  date: "is",
};

const SELECT_TYPES = new Set<FieldType>([
  "status",
  "priority",
  "assignee",
  "dropdown",
  "multi_select",
  "user",
  "checkbox",
]);

function defaultValue(field: FilterField): string {
  return field.options?.[0]?.id ?? "";
}

// ─── condition row ─────────────────────────────────────────────────────────────

function ConditionRow({
  index,
  condition,
  fields,
  onChange,
  onRemove,
}: {
  index: number;
  condition: FilterCondition & { _id: string };
  fields: FilterField[];
  onChange: (id: string, updates: Partial<FilterCondition>) => void;
  onRemove: (id: string) => void;
}) {
  const field = fields.find((f) => f.id === condition.field);
  const fieldType = (field?.type ?? "text") as FieldType;
  const operators = OPERATORS[fieldType] ?? OPERATORS.text;

  return (
    <div className="flex items-center gap-1.5">
      {/* where / and / or toggle */}
      {index === 0 ? (
        <span className="w-10 shrink-0 text-right text-[11px] font-medium text-muted-foreground">
          Where
        </span>
      ) : (
        <button
          type="button"
          title="Click to toggle AND / OR"
          onClick={() =>
            onChange(condition._id, {
              conjunction: condition.conjunction === "or" ? "and" : "or",
            })
          }
          className={cn(
            "w-10 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold uppercase tracking-wider transition-colors",
            condition.conjunction === "or"
              ? "bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-400"
              : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {condition.conjunction === "or" ? "OR" : "AND"}
        </button>
      )}

      {/* field */}
      <Select
        value={condition.field}
        onValueChange={(value) => {
          const newField = fields.find((f) => f.id === value);
          if (newField) {
            onChange(condition._id, {
              field: value,
              op: DEFAULT_OP[newField.type] ?? "is",
              value: defaultValue(newField),
            });
          }
        }}
      >
        <SelectTrigger size="sm" className="w-[130px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* operator */}
      <Select
        value={condition.op}
        onValueChange={(op) => onChange(condition._id, { op })}
      >
        <SelectTrigger size="sm" className="w-[130px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* value */}
      <div className="min-w-0 flex-1">
        {SELECT_TYPES.has(fieldType) ? (
          <Select
            value={condition.value}
            onValueChange={(value) => onChange(condition._id, { value })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {(field?.options ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : fieldType === "number" ? (
          <Input
            type="number"
            value={condition.value}
            onChange={(e) => onChange(condition._id, { value: e.target.value })}
            className="h-7 w-full text-sm"
          />
        ) : fieldType === "date" ? (
          <Input
            type="date"
            value={condition.value}
            onChange={(e) => onChange(condition._id, { value: e.target.value })}
            className="h-7 w-full text-sm"
          />
        ) : (
          <Input
            type="text"
            value={condition.value}
            onChange={(e) => onChange(condition._id, { value: e.target.value })}
            placeholder="Value…"
            className="h-7 w-full text-sm"
          />
        )}
      </div>

      {/* remove */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => onRemove(condition._id)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

// ─── filter popover ────────────────────────────────────────────────────────────

function FilterPopover({ fields }: { fields: FilterField[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // draft: working copy inside the popover (not yet committed to URL)
  type DraftCondition = FilterCondition & { _id: string };
  const [draft, setDraft] = useState<DraftCondition[]>([]);

  function parseFromUrl(): DraftCondition[] {
    try {
      const raw = searchParams.get("filters");
      const parsed: FilterCondition[] = raw ? JSON.parse(raw) : [];
      return parsed.map((c) => ({ ...c, _id: Math.random().toString(36).slice(2) }));
    } catch {
      return [];
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) setDraft(parseFromUrl());
    setOpen(isOpen);
  }

  function addCondition() {
    const firstField = fields[0];
    if (!firstField) return;
    setDraft((prev) => [
      ...prev,
      {
        _id: Math.random().toString(36).slice(2),
        field: firstField.id,
        op: DEFAULT_OP[firstField.type] ?? "is",
        value: defaultValue(firstField),
        conjunction: prev.length > 0 ? ("and" as const) : undefined,
      },
    ]);
  }

  function updateCondition(id: string, updates: Partial<FilterCondition>) {
    setDraft((prev) =>
      prev.map((c) => (c._id === id ? { ...c, ...updates } : c)),
    );
  }

  function removeCondition(id: string) {
    setDraft((prev) => prev.filter((c) => c._id !== id));
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    // strip conditions with empty value (except ops that don't need one)
    const valid = draft.filter((c) => c.value !== "" || c.op === "is_empty" || c.op === "is_not_empty");
    if (valid.length > 0) {
      params.set(
        "filters",
        JSON.stringify(valid.map(({ _id: _ignored, ...rest }) => rest)),
      );
    } else {
      params.delete("filters");
    }
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  function clearAll() {
    setDraft([]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("filters");
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  // active count from URL (not draft)
  const activeCount = (() => {
    try {
      const raw = searchParams.get("filters");
      return raw ? (JSON.parse(raw) as FilterCondition[]).length : 0;
    } catch {
      return 0;
    }
  })();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[520px] p-0"
        onInteractOutside={(e) => {
          // prevent closing when interacting with nested selects/popovers
          e.preventDefault();
          setOpen(false);
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-sm font-semibold">Filters</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>

        <Separator />

        {/* conditions */}
        <div className="flex flex-col gap-2 px-3 py-3">
          {draft.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              No filters applied
            </p>
          ) : (
            draft.map((cond, i) => (
              <ConditionRow
                key={cond._id}
                index={i}
                condition={cond}
                fields={fields}
                onChange={updateCondition}
                onRemove={removeCondition}
              />
            ))
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-fit gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={addCondition}
          >
            <Plus className="size-3.5" />
            Add filter
          </Button>
        </div>

        <Separator />

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={apply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── group by popover ──────────────────────────────────────────────────────────

interface GroupByOption {
  value: string;
  label: string;
}

function GroupByPopover({ options }: { options: GroupByOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const current = searchParams.get("groupBy") ?? "";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("groupBy", value);
    } else {
      params.delete("groupBy");
    }
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  const currentLabel = options.find((o) => o.value === current)?.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={current ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
        >
          <Rows3 className="size-3.5" />
          {current ? (
            <>
              <span className="text-muted-foreground">Group:</span> {currentLabel}
            </>
          ) : (
            "Group by"
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-52 p-1.5">
        <p className="px-2 pb-1.5 pt-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Group by
        </p>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => select(opt.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              current === opt.value && "bg-accent text-accent-foreground",
            )}
          >
            <Check
              className={cn(
                "size-3.5 shrink-0",
                current === opt.value ? "opacity-100" : "opacity-0",
              )}
            />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── public FilterBar ──────────────────────────────────────────────────────────

export function FilterBar({
  statuses,
  fieldDefs,
  activeUsers,
  view,
}: {
  statuses: { id: string; name: string; color: string }[];
  fieldDefs: { id: string; key: string; label: string; type: string; options: unknown }[];
  activeUsers: { id: string; displayName: string }[];
  view: "board" | "table";
}) {
  // Build unified field list with all options resolved
  const userOptions = activeUsers.map((u) => ({ id: u.id, label: u.displayName }));

  const fields: FilterField[] = [
    {
      id: "status",
      label: "Status",
      type: "status",
      options: statuses.map((s) => ({ id: s.id, label: s.name })),
    },
    {
      id: "priority",
      label: "Priority",
      type: "priority",
      options: PRIORITY_OPTIONS,
    },
    {
      id: "assignee",
      label: "Assignee",
      type: "assignee",
      options: userOptions,
    },
    ...fieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      label: d.label,
      type: d.type as FieldType,
      options:
        d.type === "user" || d.type === "assignee"
          ? userOptions
          : d.type === "checkbox"
            ? CHECKBOX_OPTIONS
            : ((d.options as { id: string; label: string }[] | null) ?? undefined),
    })),
  ];

  // group by options (only discrete-value fields make sense)
  const groupByOptions: GroupByOption[] = [
    { value: "", label: "None" },
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    ...fieldDefs
      .filter((d) => ["dropdown", "checkbox", "user"].includes(d.type))
      .map((d) => ({ value: `cf_${d.id}`, label: d.label })),
  ];

  return (
    <div className="flex items-center gap-2">
      <FilterPopover fields={fields} />
      {view !== "board" && <GroupByPopover options={groupByOptions} />}
    </div>
  );
}
