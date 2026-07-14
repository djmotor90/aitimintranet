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

function Column({ status, tasks }: { status: BoardStatus; tasks: BoardTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2 transition-colors",
        isOver && "bg-muted ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex min-h-16 flex-col gap-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}

export function Board({ statuses, tasks }: { statuses: BoardStatus[]; tasks: BoardTask[] }) {
  const [, startTransition] = useTransition();
  const [optimisticTasks, moveTask] = useOptimistic(
    tasks,
    (state, move: { taskId: string; statusId: string }) =>
      state.map((t) => (t.id === move.taskId ? { ...t, statusId: move.statusId } : t)),
  );
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(event: DragStartEvent) {
    setActiveTask(optimisticTasks.find((t) => t.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTask(null);
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

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((status) => (
          <Column
            key={status.id}
            status={status}
            tasks={optimisticTasks.filter((t) => t.statusId === status.id)}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCardContent task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
