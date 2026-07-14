import Link from "next/link";
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
  label: string;
  type: string;
  options: unknown;
}

function renderFieldValue(def: FieldDefLike, value: unknown, userNames: Map<string, string>) {
  if (value === null || value === undefined || value === "") return "—";
  const options = (def.options ?? []) as { id: string; label: string }[];
  switch (def.type) {
    case "checkbox":
      return value ? "✓" : "—";
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

export function TaskTable({
  items,
  statuses,
  fieldDefs,
  userNames,
}: {
  items: TaskWithMeta[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  userNames: Map<string, string>;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">#</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Assignees</TableHead>
          {fieldDefs.map((d) => (
            <TableHead key={d.id}>{d.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(({ task, assignees }) => {
          const status = statusById.get(task.statusId);
          const cf = (task.customFields ?? {}) as Record<string, unknown>;
          return (
            <TableRow key={task.id}>
              <TableCell className="text-xs text-muted-foreground">{task.number}</TableCell>
              <TableCell>
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
                  <Badge variant="secondary" className={cn("text-xs", PRIORITY_STYLES[task.priority])}>
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
              {fieldDefs.map((d) => (
                <TableCell key={d.id} className="text-sm">
                  {renderFieldValue(d, cf[d.id], userNames)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={6 + fieldDefs.length} className="text-muted-foreground">
              No tasks match.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
