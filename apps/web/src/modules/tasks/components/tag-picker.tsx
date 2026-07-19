"use client";

import { Check, Plus, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createAndAddTag, toggleTaskTag } from "../actions";

/** Client-side palette for the create-tag color picker (must not live in "use server" actions). */
export const TAG_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

function TagChip({
  tag,
  onRemove,
  size = "md",
}: {
  tag: TagOption;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium text-white",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
      )}
      style={{ backgroundColor: tag.color }}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 rounded-full opacity-80 hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className={size === "sm" ? "size-2.5" : "size-3"} />
        </button>
      )}
    </span>
  );
}

/**
 * ClickUp-style multi-tag picker: chips on the task, popover to toggle existing
 * space tags, and "Create …" when the search text does not match any tag.
 *
 * `iconOnly` renders a small tag-icon toggle (for the table title cell) that
 * opens the same picker without taking a full column of space.
 */
export function TagPicker({
  taskId,
  spaceTags,
  selectedTags,
  disabled,
  compact,
  iconOnly,
}: {
  taskId: string;
  /** All tags available in the space. */
  spaceTags: TagOption[];
  selectedTags: TagOption[];
  disabled?: boolean;
  /** Smaller chips for table cells. */
  compact?: boolean;
  /** Compact icon button next to the task title (table view). */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createColor, setCreateColor] = useState<string>(TAG_COLOR_PALETTE[5]);
  const [pending, startTransition] = useTransition();
  const [localSelected, setLocalSelected] = useState(selectedTags);
  const [localSpaceTags, setLocalSpaceTags] = useState(spaceTags);

  useEffect(() => {
    setLocalSelected(selectedTags);
    setLocalSpaceTags(spaceTags);
  }, [selectedTags, spaceTags]);

  const selectedIds = new Set(localSelected.map((t) => t.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localSpaceTags;
    return localSpaceTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [localSpaceTags, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return localSpaceTags.find((t) => t.name.toLowerCase() === q) ?? null;
  }, [localSpaceTags, query]);

  const canCreate = query.trim().length > 0 && !exactMatch;

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update tags");
      }
    });
  }

  function toggle(tag: TagOption) {
    if (disabled) return;
    const wasSelected = selectedIds.has(tag.id);
    setLocalSelected((prev) =>
      wasSelected ? prev.filter((t) => t.id !== tag.id) : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)),
    );
    run(() => toggleTaskTag(taskId, tag.id));
  }

  function create() {
    if (disabled || !canCreate) return;
    const name = query.trim();
    const color = createColor;
    run(async () => {
      const tag = await createAndAddTag(taskId, name, color);
      setLocalSpaceTags((prev) =>
        prev.some((t) => t.id === tag.id)
          ? prev
          : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setLocalSelected((prev) =>
        prev.some((t) => t.id === tag.id)
          ? prev
          : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setQuery("");
    });
  }

  const popover = (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        {iconOnly ? (
          <button
            type="button"
            disabled={disabled || pending}
            title={
              localSelected.length > 0
                ? `Tags: ${localSelected.map((t) => t.name).join(", ")}`
                : "Add tags"
            }
            aria-label={
              localSelected.length > 0
                ? `Edit tags (${localSelected.length})`
                : "Add tags"
            }
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "group/tag-btn relative flex size-6 shrink-0 items-center justify-center rounded-md",
              "text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100",
              (open || localSelected.length > 0) && "opacity-100",
              localSelected.length > 0 && "text-foreground",
              disabled && "pointer-events-none opacity-0",
            )}
          >
            <Tag className="size-3.5" />
            {localSelected.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex -space-x-0.5">
                {localSelected.slice(0, 3).map((t) => (
                  <span
                    key={t.id}
                    className="size-1.5 rounded-full ring-1 ring-background"
                    style={{ backgroundColor: t.color }}
                  />
                ))}
              </span>
            )}
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            className={cn(
              "h-7 gap-1 border-dashed text-muted-foreground",
              compact && "h-6 px-1.5 text-[10px]",
            )}
          >
            <Tag className={compact ? "size-3" : "size-3.5"} />
            {localSelected.length === 0 ? "Add tag" : ""}
            {localSelected.length > 0 && <Plus className="size-3" />}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          placeholder="Search or create…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) {
              e.preventDefault();
              create();
            }
          }}
          className="mb-2 h-8"
        />
        <div className="max-h-52 overflow-y-auto">
          {filtered.length === 0 && !canCreate && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No tags yet — type a name to create one.
            </p>
          )}
          {filtered.map((tag) => {
            const on = selectedIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  on && "bg-muted/60",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                {on && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
        {canCreate && (
          <div className="mt-2 border-t pt-2">
            <div className="mb-2 flex flex-wrap gap-1 px-1">
              {TAG_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setCreateColor(c)}
                  className={cn(
                    "size-4 rounded-full ring-offset-background transition-shadow",
                    createColor === c && "ring-2 ring-ring ring-offset-1",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={create}
              disabled={pending}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">
                Create{" "}
                <span
                  className="rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: createColor }}
                >
                  {query.trim()}
                </span>
              </span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  if (iconOnly) {
    if (disabled && localSelected.length === 0) return null;
    return popover;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", compact ? "min-h-0" : "min-h-7")}>
      {localSelected.map((t) => (
        <TagChip
          key={t.id}
          tag={t}
          size={compact ? "sm" : "md"}
          onRemove={
            disabled
              ? undefined
              : () => {
                  setLocalSelected((prev) => prev.filter((x) => x.id !== t.id));
                  run(() => toggleTaskTag(taskId, t.id));
                }
          }
        />
      ))}
      {!disabled && popover}
      {disabled && localSelected.length === 0 && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

/** Read-only chip row for board cards / non-interactive surfaces. */
export function TagChips({ tags, size = "sm" }: { tags: TagOption[]; size?: "sm" | "md" }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} size={size} />
      ))}
    </div>
  );
}
