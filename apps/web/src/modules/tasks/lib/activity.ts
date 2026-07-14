import { activityLog } from "@aitim/db";

/** Transaction-scoped DB handle (works with both db and tx). */
export type DbLike = {
  insert: typeof import("@aitim/db").db.insert;
};

export interface ActivityEntry {
  spaceId: string;
  taskId?: string;
  actorId?: string | null;
  actorLabel?: string;
  verb:
    | "task.created"
    | "task.title_changed"
    | "task.description_changed"
    | "task.status_changed"
    | "task.priority_changed"
    | "task.due_date_changed"
    | "task.assignee_added"
    | "task.assignee_removed"
    | "task.field_changed"
    | "task.archived"
    | "comment.created"
    | "attachment.added"
    | "list.created"
    | "status.created"
    | "status.updated"
    | "status.deleted"
    | "field.created"
    | "field.archived";
  payload?: Record<string, unknown>;
}

/** Call inside the same transaction as the mutation it describes. */
export async function logActivity(tx: DbLike, entry: ActivityEntry) {
  await tx.insert(activityLog).values({
    spaceId: entry.spaceId,
    taskId: entry.taskId,
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel,
    verb: entry.verb,
    payload: entry.payload,
  });
}
