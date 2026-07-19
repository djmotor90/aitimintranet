"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Columns3,
  MoreHorizontal,
  Pencil,
  Plus,
  SquareKanban,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  createListView,
  deleteListView,
  renameListView,
  reorderListViews,
} from "../actions";
import type { ListViewRow } from "../queries";

function viewQueryParams(view: ListViewRow): URLSearchParams {
  const params = new URLSearchParams();
  params.set("v", view.id);
  if (view.type === "board") params.set("view", "board");
  if (view.groupBy) params.set("groupBy", view.groupBy);
  if (view.showClosed) params.set("closed", "1");
  const filters = view.filters;
  if (Array.isArray(filters) && filters.length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
  return params;
}

function ViewTabContent({
  view,
  active,
  renaming,
  draft,
  inputRef,
  canManage,
  onSelect,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onRemove,
  canDelete,
  dragHandleProps,
  setNodeRef,
  style,
  isDragging,
}: {
  view: ListViewRow;
  active: boolean;
  renaming: boolean;
  draft: string;
  inputRef: RefObject<HTMLInputElement | null>;
  canManage: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRemove: () => void;
  canDelete: boolean;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
}) {
  const Icon = view.type === "board" ? SquareKanban : Columns3;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/tab relative flex shrink-0 items-center",
        "border-b-2 -mb-px",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
        isDragging && "z-20 opacity-40",
      )}
    >
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={60}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="mb-0.5 h-7 w-28 rounded-sm bg-background px-2 text-sm font-medium ring-1 ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onStartRename}
          {...(canManage ? dragHandleProps : {})}
          className={cn(
            "flex h-8 items-center gap-1.5 px-2.5 text-sm transition-colors",
            active ? "font-medium" : "hover:bg-muted/60",
            canManage && "cursor-grab active:cursor-grabbing",
          )}
        >
          <Icon className="size-3.5 shrink-0 opacity-70" />
          <span className="max-w-[10rem] truncate">{view.name}</span>
        </button>
      )}

      {canManage && !renaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${view.name} options`}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                "mr-1 flex size-5 items-center justify-center rounded opacity-0 transition-opacity",
                "hover:bg-muted group-hover/tab:opacity-100 focus-visible:opacity-100",
                active && "opacity-60",
              )}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={onStartRename}>
              <Pencil className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function SortableViewTab({
  view,
  active,
  renaming,
  draft,
  inputRef,
  canManage,
  canDelete,
  onSelect,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onRemove,
}: {
  view: ListViewRow;
  active: boolean;
  renaming: boolean;
  draft: string;
  inputRef: RefObject<HTMLInputElement | null>;
  canManage: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.id,
    disabled: !canManage || renaming,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ViewTabContent
      view={view}
      active={active}
      renaming={renaming}
      draft={draft}
      inputRef={inputRef}
      canManage={canManage}
      canDelete={canDelete}
      onSelect={onSelect}
      onStartRename={onStartRename}
      onDraftChange={onDraftChange}
      onCommitRename={onCommitRename}
      onCancelRename={onCancelRename}
      onRemove={onRemove}
      setNodeRef={setNodeRef}
      style={style}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

/**
 * ClickUp-style named view tabs: switch, create, rename, delete, and drag to reorder.
 */
export function ListViewTabs({
  listId,
  views: initialViews,
  activeViewId,
  canManage,
}: {
  listId: string;
  views: ListViewRow[];
  activeViewId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [views, setViews] = useState(initialViews);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setViews(initialViews);
  }, [initialViews]);

  useEffect(() => {
    if (renamingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renamingId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a short drag so clicks still select the tab.
      activationConstraint: { distance: 6 },
    }),
  );

  function selectView(view: ListViewRow) {
    if (view.id === activeViewId && renamingId !== view.id) return;
    router.push(`?${viewQueryParams(view).toString()}`);
  }

  function startRename(view: ListViewRow) {
    if (!canManage) return;
    setRenamingId(view.id);
    setDraft(view.name);
  }

  function commitRename(view: ListViewRow) {
    const name = draft.trim();
    setRenamingId(null);
    if (!name || name === view.name) return;
    setViews((prev) => prev.map((v) => (v.id === view.id ? { ...v, name } : v)));
    startTransition(async () => {
      try {
        await renameListView(view.id, name);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename view");
        setViews(initialViews);
      }
    });
  }

  function create(type: "table" | "board") {
    startTransition(async () => {
      try {
        const { id } = await createListView({
          listId,
          type,
          copyFromViewId: activeViewId,
        });
        const params = new URLSearchParams(searchParams.toString());
        params.set("v", id);
        if (type === "board") params.set("view", "board");
        else params.delete("view");
        router.push(`?${params.toString()}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create view");
      }
    });
  }

  function remove(view: ListViewRow) {
    if (views.length <= 1) {
      toast.error("Cannot delete the last view");
      return;
    }
    startTransition(async () => {
      try {
        await deleteListView(view.id);
        if (view.id === activeViewId) {
          const next = views.find((v) => v.id !== view.id);
          if (next) router.push(`?${viewQueryParams(next).toString()}`);
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete view");
      }
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = views.findIndex((v) => v.id === active.id);
    const newIndex = views.findIndex((v) => v.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(views, oldIndex, newIndex);
    setViews(next);
    startTransition(async () => {
      try {
        await reorderListViews(
          listId,
          next.map((v) => v.id),
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reorder views");
        setViews(initialViews);
      }
    });
  }

  const activeDragView = activeDragId ? views.find((v) => v.id === activeDragId) : null;

  const tabs = (
    <div className="-mx-1 flex min-w-0 items-end gap-0.5 overflow-x-auto border-b border-border">
      <SortableContext items={views.map((v) => v.id)} strategy={horizontalListSortingStrategy}>
        {views.map((view) => (
          <SortableViewTab
            key={view.id}
            view={view}
            active={view.id === activeViewId}
            renaming={renamingId === view.id}
            draft={draft}
            inputRef={inputRef}
            canManage={canManage}
            canDelete={views.length > 1}
            onSelect={() => selectView(view)}
            onStartRename={() => startRename(view)}
            onDraftChange={setDraft}
            onCommitRename={() => commitRename(view)}
            onCancelRename={() => setRenamingId(null)}
            onRemove={() => remove(view)}
          />
        ))}
      </SortableContext>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5 h-8 shrink-0 gap-1 px-2 text-muted-foreground"
              title="Add view"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">View</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => create("table")}>
              <Columns3 className="size-3.5" />
              List view
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => create("board")}>
              <SquareKanban className="size-3.5" />
              Board view
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  if (!canManage) return tabs;

  return (
    <DndContext
      id="list-view-tabs-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {tabs}
      <DragOverlay dropAnimation={null}>
        {activeDragView ? (
          <div className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm font-medium shadow-md">
            {activeDragView.type === "board" ? (
              <SquareKanban className="size-3.5 opacity-70" />
            ) : (
              <Columns3 className="size-3.5 opacity-70" />
            )}
            <span className="max-w-[10rem] truncate">{activeDragView.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
