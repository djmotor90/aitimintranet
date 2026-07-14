import { db, notifications, tasks, users } from "@aitim/db";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/rbac";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/shell/actions/notifications";

const TYPE_LABELS: Record<string, string> = {
  assigned: "Assigned to you",
  mentioned: "Mentioned you",
  comment: "Commented",
  status_changed: "Status changed",
  due_soon: "Due soon",
  form_submission: "New customer request",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: users.displayName,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .where(eq(notifications.recipientId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Notifications {unread > 0 && <Badge className="ml-1 align-middle">{unread} new</Badge>}
        </h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <Button variant="outline" size="sm" type="submit">
              Mark all read
            </Button>
          </form>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((n) => {
          const p = (n.payload ?? {}) as Record<string, unknown>;
          return (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-md border p-3 ${n.readAt ? "opacity-70" : "bg-muted/40"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {n.actorName && <span className="font-medium">{n.actorName} · </span>}
                  <span>{TYPE_LABELS[n.type] ?? n.type}</span>
                </div>
                {n.taskNumber && (
                  <Link
                    href={`/tasks/task/${n.taskNumber}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {n.taskNumber} — {n.taskTitle}
                  </Link>
                )}
                {typeof p.preview === "string" && p.preview && (
                  <p className="truncate text-sm text-muted-foreground">“{p.preview}”</p>
                )}
                {n.type === "status_changed" && (
                  <p className="text-sm text-muted-foreground">
                    {String(p.from ?? "")} → {String(p.to ?? "")}
                  </p>
                )}
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </div>
              </div>
              {!n.readAt && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <Button variant="ghost" size="sm" type="submit">
                    Mark read
                  </Button>
                </form>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-muted-foreground">No notifications yet.</li>}
      </ul>
    </div>
  );
}
