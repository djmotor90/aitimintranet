"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Columns, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveTaskLayout } from "../actions";
import { CORE_FIELDS, type LayoutGroup, type TaskLayout } from "../layout-types";

// ─── field meta ───────────────────────────────────────────────────────────────

interface FieldMeta {
  id: string;
  label: string;
  isCustom: boolean;
  fieldType?: string;
}

// ─── field chip (used in groups and unassigned pool) ──────────────────────────

function FieldChip({
  field,
  groupId,
  onRemove,
}: {
  field: FieldMeta;
  groupId: string;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${groupId}::${field.id}`,
    data: { fieldId: field.id, groupId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-sm select-none",
        isDragging && "opacity-40",
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </span>
      <span className="flex-1 truncate">{field.label}</span>
      {field.isCustom && (
        <Badge variant="outline" className="h-4 px-1 text-[10px]">
          {field.fieldType}
        </Badge>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-muted-foreground hover:text-foreground"
          title="Move to unassigned"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// Overlay chip (shown under cursor while dragging, not sortable)
function FieldChipOverlay({ field }: { field: FieldMeta }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-sm shadow-lg">
      <GripVertical className="size-3.5 text-muted-foreground" />
      <span>{field.label}</span>
    </div>
  );
}

// ─── unassigned pool ──────────────────────────────────────────────────────────

function UnassignedPool({
  fieldIds,
  allFields,
}: {
  fieldIds: string[];
  allFields: FieldMeta[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned" });

  const sortableIds = fieldIds.map((id) => `unassigned::${id}`);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border-2 border-dashed p-3 transition-colors",
        isOver ? "border-primary/50 bg-primary/5" : "border-muted",
        fieldIds.length === 0 && "py-5",
      )}
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Unassigned — drag into a group to show in task view
      </p>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-wrap gap-1.5">
          {fieldIds.map((id) => {
            const meta = allFields.find((f) => f.id === id);
            if (!meta) return null;
            return (
              <FieldChip key={id} field={meta} groupId="unassigned" />
            );
          })}
          {fieldIds.length === 0 && (
            <p className="text-xs text-muted-foreground">All fields are assigned to a group.</p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  allFields,
  onLabelChange,
  onColumnsChange,
  onRemoveField,
  onDelete,
  isDraggingGroup,
}: {
  group: LayoutGroup;
  allFields: FieldMeta[];
  onLabelChange: (id: string, label: string) => void;
  onColumnsChange: (id: string, columns: 1 | 2 | 3) => void;
  onRemoveField: (groupId: string, fieldId: string) => void;
  onDelete: (id: string) => void;
  isDraggingGroup: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id, data: { type: "group" } });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: group.id });

  const sortableIds = group.fields.map((f) => `${group.id}::${f.id}`);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border-2 bg-card", isDragging && "opacity-40")}
    >
      {/* group header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>

        <Input
          value={group.label}
          onChange={(e) => onLabelChange(group.id, e.target.value)}
          className="h-7 flex-1 border-none bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0"
          placeholder="Group name…"
        />

        {/* column count toggle */}
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onColumnsChange(group.id, n)}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors",
                group.columns === n
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={`${n} column${n > 1 ? "s" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onDelete(group.id)}
          className="text-muted-foreground hover:text-destructive"
          title="Delete group (fields move to unassigned)"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* drop zone + fields */}
      <div
        ref={setDropRef}
        className={cn(
          "min-h-16 p-3 transition-colors",
          isOver && !isDraggingGroup && "bg-primary/5",
        )}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div
            className={cn(
              "grid gap-1.5",
              group.columns === 1 && "grid-cols-1",
              group.columns === 2 && "grid-cols-2",
              group.columns === 3 && "grid-cols-3",
            )}
          >
            {group.fields.map(({ id: fieldId }) => {
              const meta = allFields.find((f) => f.id === fieldId);
              if (!meta) return null;
              return (
                <FieldChip
                  key={fieldId}
                  field={meta}
                  groupId={group.id}
                  onRemove={() => onRemoveField(group.id, fieldId)}
                />
              );
            })}
            {group.fields.length === 0 && (
              <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                Drop fields here
              </p>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// ─── main builder ─────────────────────────────────────────────────────────────

interface BuilderState {
  groups: LayoutGroup[];
  unassigned: string[]; // field IDs not in any group
}

export function LayoutBuilder({
  listId,
  initialLayout,
  fieldDefs,
}: {
  listId: string;
  initialLayout: TaskLayout;
  fieldDefs: { id: string; label: string; type: string }[];
}) {
  const allFields: FieldMeta[] = [
    ...CORE_FIELDS.map((f) => ({ ...f, isCustom: false })),
    ...fieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      label: d.label,
      isCustom: true,
      fieldType: d.type,
    })),
  ];

  const allFieldIds = new Set(allFields.map((f) => f.id));

  function buildInitialState(): BuilderState {
    const assignedIds = new Set(
      initialLayout.groups.flatMap((g) => g.fields.map((f) => f.id)),
    );
    const unassigned = [...allFieldIds].filter((id) => !assignedIds.has(id));
    // Keep only field IDs that still exist (field defs might have been archived)
    const groups = initialLayout.groups.map((g) => ({
      ...g,
      fields: g.fields.filter((f) => allFieldIds.has(f.id)),
    }));
    return { groups, unassigned };
  }

  const [state, setState] = useState<BuilderState>(buildInitialState);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDraggingGroup, setIsDraggingGroup] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Parse composite sortable IDs: `${groupId}::${fieldId}`
  function parseId(id: string): { groupId: string; fieldId: string } | null {
    const idx = id.indexOf("::");
    if (idx === -1) return null;
    return { groupId: id.slice(0, idx), fieldId: id.slice(idx + 2) };
  }

  function findFieldContainer(fieldId: string): string {
    for (const g of state.groups) {
      if (g.fields.some((f) => f.id === fieldId)) return g.id;
    }
    return "unassigned";
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    // If it's a bare group UUID (not composite), it's a group drag
    if (state.groups.some((g) => g.id === id)) {
      setIsDraggingGroup(true);
    } else {
      setIsDraggingGroup(false);
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || isDraggingGroup) return;

    const activeParsed = parseId(String(active.id));
    if (!activeParsed) return;
    const { fieldId } = activeParsed;

    const overStr = String(over.id);
    const overParsed = parseId(overStr);

    // Destination: either a group container or a field inside a group
    const destGroupId = overParsed
      ? overParsed.groupId
      : state.groups.some((g) => g.id === overStr)
        ? overStr
        : overStr === "unassigned"
          ? "unassigned"
          : null;

    if (!destGroupId) return;

    const srcGroupId = findFieldContainer(fieldId);
    if (srcGroupId === destGroupId) return;

    // Move field from src to dest
    setState((prev) => {
      const next = structuredClone(prev);

      // Remove from source
      if (srcGroupId === "unassigned") {
        next.unassigned = next.unassigned.filter((id) => id !== fieldId);
      } else {
        const srcGroup = next.groups.find((g) => g.id === srcGroupId);
        if (srcGroup) srcGroup.fields = srcGroup.fields.filter((f) => f.id !== fieldId);
      }

      // Add to destination at the end (or before the over-field if inside same container)
      if (destGroupId === "unassigned") {
        next.unassigned.push(fieldId);
      } else {
        const destGroup = next.groups.find((g) => g.id === destGroupId);
        if (destGroup) {
          if (overParsed && overParsed.groupId === destGroupId) {
            const overIdx = destGroup.fields.findIndex((f) => f.id === overParsed.fieldId);
            destGroup.fields.splice(overIdx >= 0 ? overIdx : destGroup.fields.length, 0, { id: fieldId });
          } else {
            destGroup.fields.push({ id: fieldId });
          }
        }
      }
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setIsDraggingGroup(false);
    if (!over) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);

    // Sorting groups
    if (state.groups.some((g) => g.id === activeStr)) {
      const oldIdx = state.groups.findIndex((g) => g.id === activeStr);
      const newIdx = state.groups.findIndex((g) => g.id === overStr);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        setState((prev) => ({ ...prev, groups: arrayMove(prev.groups, oldIdx, newIdx) }));
      }
      return;
    }

    // Sorting fields within the same group
    const activeParsed = parseId(activeStr);
    const overParsed = parseId(overStr);
    if (!activeParsed || !overParsed) return;
    if (activeParsed.groupId !== overParsed.groupId) return; // cross-group already handled in onDragOver

    const { groupId, fieldId: activeFieldId } = activeParsed;
    const { fieldId: overFieldId } = overParsed;

    if (groupId === "unassigned") {
      setState((prev) => {
        const oldIdx = prev.unassigned.indexOf(activeFieldId);
        const newIdx = prev.unassigned.indexOf(overFieldId);
        if (oldIdx === -1 || newIdx === -1) return prev;
        return { ...prev, unassigned: arrayMove(prev.unassigned, oldIdx, newIdx) };
      });
    } else {
      setState((prev) => {
        const next = structuredClone(prev);
        const group = next.groups.find((g) => g.id === groupId);
        if (!group) return prev;
        const oldIdx = group.fields.findIndex((f) => f.id === activeFieldId);
        const newIdx = group.fields.findIndex((f) => f.id === overFieldId);
        if (oldIdx === -1 || newIdx === -1) return prev;
        group.fields = arrayMove(group.fields, oldIdx, newIdx);
        return next;
      });
    }
  }

  function addGroup() {
    const id = `grp-${Math.random().toString(36).slice(2, 10)}`;
    setState((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        { id, label: "New group", columns: 2, fields: [] },
      ],
    }));
  }

  function deleteGroup(groupId: string) {
    setState((prev) => {
      const group = prev.groups.find((g) => g.id === groupId);
      const releasedFieldIds = group?.fields.map((f) => f.id) ?? [];
      return {
        groups: prev.groups.filter((g) => g.id !== groupId),
        unassigned: [...prev.unassigned, ...releasedFieldIds],
      };
    });
  }

  function updateLabel(groupId: string, label: string) {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, label } : g)),
    }));
  }

  function updateColumns(groupId: string, columns: 1 | 2 | 3) {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, columns } : g)),
    }));
  }

  function removeFieldFromGroup(groupId: string, fieldId: string) {
    setState((prev) => {
      const next = structuredClone(prev);
      const group = next.groups.find((g) => g.id === groupId);
      if (!group) return prev;
      group.fields = group.fields.filter((f) => f.id !== fieldId);
      next.unassigned.push(fieldId);
      return next;
    });
  }

  function save() {
    const layout: TaskLayout = { groups: state.groups };
    startTransition(async () => {
      await saveTaskLayout(listId, layout);
      toast.success("Layout saved");
    });
  }

  const groupIds = state.groups.map((g) => g.id);

  const activeParsed = activeId ? parseId(activeId) : null;
  const activeFieldMeta = activeParsed
    ? allFields.find((f) => f.id === activeParsed.fieldId)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {/* groups */}
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {state.groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                allFields={allFields}
                onLabelChange={updateLabel}
                onColumnsChange={updateColumns}
                onRemoveField={removeFieldFromGroup}
                onDelete={deleteGroup}
                isDraggingGroup={isDraggingGroup}
              />
            ))}
          </div>
        </SortableContext>

        {/* unassigned pool */}
        <UnassignedPool fieldIds={state.unassigned} allFields={allFields} />

        <DragOverlay>
          {activeFieldMeta ? <FieldChipOverlay field={activeFieldMeta} /> : null}
        </DragOverlay>
      </DndContext>

      {/* footer */}
      <div className="flex items-center gap-3 border-t pt-4">
        <Button type="button" variant="outline" size="sm" onClick={addGroup} className="gap-1.5">
          <Plus className="size-4" />
          Add group
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={isPending} className="ml-auto">
          {isPending ? "Saving…" : "Save layout"}
        </Button>
      </div>
    </div>
  );
}
