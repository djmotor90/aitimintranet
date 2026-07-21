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
    | "task.tag_added"
    | "task.tag_removed"
    | "task.field_changed"
    | "task.archived"
    | "comment.created"
    | "comment.replied"
    | "attachment.added"
    | "space.created"
    | "list.created"
    | "status.created"
    | "status.updated"
    | "status.deleted"
    | "field.created"
    | "field.archived"
    | "space.member_added"
    | "space.member_removed"
    | "list.member_added"
    | "list.member_removed"
    | "list.privacy_changed"
    | "list.moved"
    | "folder.created"
    | "folder.privacy_changed"
    | "folder.member_added"
    | "folder.member_removed"
    | "folder.moved";
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
