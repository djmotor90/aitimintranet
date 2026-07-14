import {
  db,
  notificationPreferences,
  notifications,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { sendMail } from "@/lib/mailer";
import { notifyUsers } from "@/lib/notify";

const TYPE_LABELS: Record<string, string> = {
  assigned: "You were assigned to a task",
  mentioned: "You were mentioned",
  comment: "New comment",
  status_changed: "Status changed",
  due_soon: "Task due soon",
  form_submission: "New customer request",
};

export async function sendNotificationEmail(notificationId: string): Promise<string> {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, notificationId));
  if (!n) return "notification gone";
  if (n.emailedAt) return "already emailed";

  const [recipient] = await db.select().from(users).where(eq(users.id, n.recipientId));
  if (!recipient?.isActive) return "recipient inactive";

  // Preferences: default = instant email for everything
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, n.recipientId));
  if (prefs?.emailDigest === "off") return "email disabled by preference";
  const typePrefs = (prefs?.preferences ?? {}) as Record<string, { email?: boolean }>;
  if (typePrefs[n.type]?.email === false) return "type email disabled";

  const task = n.taskId
    ? (await db.select().from(tasks).where(eq(tasks.id, n.taskId)))[0]
    : undefined;
  const actor = n.actorId
    ? (await db.select().from(users).where(eq(users.id, n.actorId)))[0]
    : undefined;

  const p = (n.payload ?? {}) as Record<string, unknown>;
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const taskLink = task ? `${base}/tasks/task/${encodeURIComponent(task.number)}` : base;
  const title = TYPE_LABELS[n.type] ?? "Notification";
  const detail =
    n.type === "status_changed"
      ? `Status: ${p.from ?? "?"} → ${p.to ?? "?"}`
      : n.type === "comment" || n.type === "mentioned"
        ? String(p.preview ?? "")
        : "";

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="margin:0 0 8px">${title}</h2>
      ${actor ? `<p style="margin:0 0 4px;color:#555">by ${actor.displayName}</p>` : ""}
      ${task ? `<p style="margin:0 0 4px"><strong>${task.number}</strong> — ${task.title}</p>` : ""}
      ${detail ? `<p style="margin:0 0 12px;color:#333">${detail}</p>` : ""}
      <p><a href="${taskLink}" style="color:#2563eb">Open in AITIM Intranet</a></p>
    </div>`;

  await sendMail({ to: recipient.email, subject: `[AITIM] ${title}${task ? ` · ${task.number}` : ""}`, html });
  await db
    .update(notifications)
    .set({ emailedAt: new Date() })
    .where(eq(notifications.id, notificationId));
  return `emailed ${recipient.email}`;
}

/** Daily: notify assignees of open tasks due today or tomorrow. */
export async function runDueSoonScanner(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const dueTasks = await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, dueDate: tasks.dueDate })
    .from(tasks)
    .where(
      and(
        gte(tasks.dueDate, today),
        lte(tasks.dueDate, tomorrow),
        isNull(tasks.completedAt),
        eq(tasks.isArchived, false),
      ),
    );

  let notified = 0;
  for (const task of dueTasks) {
    const assignees = await db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, task.id));
    if (assignees.length === 0) continue;
    await notifyUsers({
      recipientIds: assignees.map((a) => a.userId),
      type: "due_soon",
      taskId: task.id,
      payload: { number: task.number, title: task.title, dueDate: task.dueDate },
    });
    notified += assignees.length;
  }
  return `notified ${notified} assignees across ${dueTasks.length} due tasks`;
}
