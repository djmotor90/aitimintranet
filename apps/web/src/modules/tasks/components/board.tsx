"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { updateTaskStatus } from "../actions";
import { TaskCardContent, type TaskCardData } from "./task-card";

export interface BoardStatus {
  id: string;
  name: string;
  color: string;
  category: string;
}

export interface BoardTask extends TaskCardData {
  statusId: string;
}

function DraggableCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <TaskCardContent task={task} />
    </div>
  );
}

function Column({
  status,
  tasks,
  canEdit,
}: {
  status: BoardStatus;
  tasks: BoardTask[];
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2 transition-colors",
        canEdit && isOver && "bg-muted ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex min-h-16 flex-col gap-2">
        {tasks.map((t) =>
          canEdit ? (
            <DraggableCard key={t.id} task={t} />
          ) : (
            <div key={t.id}>
              <TaskCardContent task={t} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function Board({
  statuses,
  tasks,
  canEdit = true,
}: {
  statuses: BoardStatus[];
  tasks: BoardTask[];
  /** When false, cards are read-only (no drag-and-drop status changes). */
  canEdit?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [optimisticTasks, moveTask] = useOptimistic(
    tasks,
    (state, move: { taskId: string; statusId: string }) =>
      state.map((t) => (t.id === move.taskId ? { ...t, statusId: move.statusId } : t)),
  );
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(event: DragStartEvent) {
    if (!canEdit) return;
    setActiveTask(optimisticTasks.find((t) => t.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    if (!canEdit) return;
    const taskId = String(event.active.id);
    const statusId = event.over ? String(event.over.id) : null;
    if (!statusId) return;
    const task = optimisticTasks.find((t) => t.id === taskId);
    if (!task || task.statusId === statusId) return;
    startTransition(async () => {
      moveTask({ taskId, statusId });
      await updateTaskStatus(taskId, statusId);
    });
  }

  const columns = (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {statuses.map((status) => (
        <Column
          key={status.id}
          status={status}
          tasks={optimisticTasks.filter((t) => t.statusId === status.id)}
          canEdit={canEdit}
        />
      ))}
    </div>
  );

  if (!canEdit) return columns;

  return (
    <DndContext id="task-board-dnd" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {columns}
      <DragOverlay>{activeTask ? <TaskCardContent task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
