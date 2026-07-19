"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteStatus, reorderStatuses, updateStatus } from "../actions";

type StatusCategory = "open" | "active" | "done" | "cancelled";

interface StatusItem {
  id: string;
  name: string;
  color: string;
  category: StatusCategory;
}

const CATEGORY_META: { category: StatusCategory; label: string; color: string }[] = [
  { category: "open", label: "Not Started", color: "text-slate-500" },
  { category: "active", label: "Active", color: "text-blue-500" },
  { category: "done", label: "Done", color: "text-green-500" },
  { category: "cancelled", label: "Closed", color: "text-rose-500" },
];

function StatusRow({
  status,
  isDefault,
  onDelete,
  onSaved,
}: {
  status: StatusItem;
  isDefault: boolean;
  onDelete: () => void;
  onSaved: (patch: { name: string; color: string }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status.id,
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(status.name);
  const [color, setColor] = useState(status.color);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("statusId", status.id);
      formData.set("name", name);
      formData.set("color", color);
      await updateStatus(formData);
      onSaved({ name, color });
      setEditing(false);
      toast.success("Status updated");
    });
  }

  function cancel() {
    setName(status.name);
    setColor(status.color);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5",
        isDragging && "opacity-40",
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>

      {editing ? (
        <>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-9 shrink-0 rounded border p-0.5"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 flex-1"
            autoFocus
          />
          <Button variant="ghost" size="icon-sm" onClick={save} disabled={isPending} title="Save">
            <Check className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={cancel} title="Cancel">
            <X className="size-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
          <span className="flex-1 truncate font-medium">{status.name}</span>
          {isDefault && <Badge variant="secondary">default</Badge>}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground"
            title="Rename"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function CategoryColumn({
  category,
  label,
  color,
  statuses,
  defaultStatusId,
  onDeleteStatus,
  onSaveStatus,
}: {
  category: StatusCategory;
  label: string;
  color: string;
  statuses: StatusItem[];
  defaultStatusId: string | null;
  onDeleteStatus: (id: string) => void;
  onSaveStatus: (id: string, patch: { name: string; color: string }) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: category });
  const sortableIds = statuses.map((s) => s.id);

  return (
    <div>
      <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wider", color)}>{label}</p>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-12 flex-col gap-2 rounded-lg p-1 transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {statuses.map((s) => (
            <StatusRow
              key={s.id}
              status={s}
              isDefault={s.id === defaultStatusId}
              onDelete={() => onDeleteStatus(s.id)}
              onSaved={(patch) => onSaveStatus(s.id, patch)}
            />
          ))}
        </SortableContext>
        {statuses.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">Drop a status here</p>
        )}
      </div>
    </div>
  );
}

export function StatusManager({
  listId,
  initialStatuses,
  defaultStatusId,
}: {
  listId: string;
  initialStatuses: StatusItem[];
  defaultStatusId: string | null;
}) {
  const [items, setItems] = useState<StatusItem[]>(initialStatuses);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function categoryOf(id: string): StatusCategory | null {
    const s = items.find((x) => x.id === id);
    if (s) return s.category;
    return CATEGORY_META.some((c) => c.category === id) ? (id as StatusCategory) : null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const srcCat = categoryOf(activeId);
    const destCat = categoryOf(overId);
    if (!srcCat || !destCat || srcCat === destCat) return;

    setItems((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, category: destCat } : s)),
    );
  }

  function persist(list: StatusItem[]) {
    startTransition(async () => {
      await reorderStatuses(
        listId,
        list.map((s, i) => ({ id: s.id, category: s.category, position: `a${i}` })),
      );
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeIdx = items.findIndex((s) => s.id === activeId);
    if (activeIdx === -1) return;
    const overIdx = items.findIndex((s) => s.id === overId);
    const next = overIdx === -1 ? items : arrayMove(items, activeIdx, overIdx);
    setItems(next);
    persist(next);
  }

  function handleSaveStatus(statusId: string, patch: { name: string; color: string }) {
    setItems((prev) => prev.map((s) => (s.id === statusId ? { ...s, ...patch } : s)));
  }

  async function handleDelete(statusId: string) {
    const formData = new FormData();
    formData.set("statusId", statusId);
    try {
      await deleteStatus(formData);
      setItems((prev) => prev.filter((s) => s.id !== statusId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete status");
    }
  }

  const activeStatus = activeId ? items.find((s) => s.id === activeId) : null;

  return (
    <DndContext
      id="status-manager-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col gap-6">
        {CATEGORY_META.map(({ category, label, color }) => (
          <CategoryColumn
            key={category}
            category={category}
            label={label}
            color={color}
            statuses={items.filter((s) => s.category === category)}
            defaultStatusId={defaultStatusId}
            onDeleteStatus={handleDelete}
            onSaveStatus={handleSaveStatus}
          />
        ))}
      </div>
      <DragOverlay>
        {activeStatus && (
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 shadow-lg">
            <GripVertical className="size-4 text-muted-foreground" />
            <span className="size-3 rounded-full" style={{ backgroundColor: activeStatus.color }} />
            <span className="text-sm">{activeStatus.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
