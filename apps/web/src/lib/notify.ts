import { db, notifications } from "@aitim/db";
import { sql } from "drizzle-orm";
import { enqueue } from "./queue";

export type NotificationType =
  | "assigned"
  | "mentioned"
  | "comment"
  | "status_changed"
  | "due_soon"
  | "form_submission";

export interface NotifyInput {
  recipientIds: string[];
  type: NotificationType;
  taskId?: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Fan out a notification: insert rows, ping SSE listeners via pg_notify,
 * and enqueue email delivery. Call after the triggering transaction commits.
 * The actor is never notified about their own action.
 */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return;

  const rows = await db
    .insert(notifications)
    .values(
      recipients.map((recipientId) => ({
        recipientId,
        type: input.type,
        taskId: input.taskId,
        actorId: input.actorId ?? null,
        payload: input.payload,
      })),
    )
    .returning({ id: notifications.id, recipientId: notifications.recipientId });

  for (const row of rows) {
    await db.execute(
      sql`select pg_notify('app_events', ${JSON.stringify({
        kind: "notification",
        recipientId: row.recipientId,
      })})`,
    );
    await enqueue("send-notification-email", { notificationId: row.id });
  }
}

/** Ping list watchers so open boards refresh. */
export async function pingListUpdate(listId: string): Promise<void> {
  await db.execute(
    sql`select pg_notify('app_events', ${JSON.stringify({ kind: "list", listId })})`,
  );
}
