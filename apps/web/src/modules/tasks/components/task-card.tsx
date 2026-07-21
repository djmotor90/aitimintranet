import { Paperclip } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TagChips } from "./tag-picker";

export const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
};

export interface TaskCardData {
  id: string;
  number: string;
  title: string;
  priority: string | null;
  dueDate: string | null;
  assignees: { id: string; displayName: string; photoKey: string | null }[];
  tags?: { id: string; name: string; color: string }[];
  hasAttachments?: boolean;
}

export function TaskCardContent({ task }: { task: TaskCardData }) {
  const overdue = task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <div className="box-border flex flex-col gap-2 rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/tasks/task/${task.number}`}
          className="min-w-0 text-sm font-medium leading-snug hover:underline"
        >
          {task.title}
        </Link>
        {task.hasAttachments && (
          <span title="Has attachments" aria-label="Has attachments" className="shrink-0 text-muted-foreground">
            <Paperclip className="size-3.5" />
          </span>
        )}
      </div>
      {task.tags && task.tags.length > 0 && <TagChips tags={task.tags} />}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{task.number}</span>
        {task.priority && (
          <Badge variant="secondary" className={cn("text-[10px]", PRIORITY_STYLES[task.priority])}>
            {task.priority}
          </Badge>
        )}
        {task.dueDate && (
          <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
            {task.dueDate}
          </span>
        )}
        <span className="ml-auto flex -space-x-1.5">
          {task.assignees.slice(0, 3).map((a) => (
            <UserAvatar
              key={a.id}
              userId={a.id}
              name={a.displayName}
              hasPhoto={!!a.photoKey}
              className="size-5 ring-2 ring-card"
            />
          ))}
        </span>
      </div>
    </div>
  );
}
