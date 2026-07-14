import { db, lists, spaces } from "@aitim/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSpaceRole, requireUser } from "@/lib/rbac";
import { archiveTask, toggleAssignee, updateTaskCore } from "@/modules/tasks/actions";
import { AttachmentUpload } from "@/modules/tasks/components/attachment-upload";
import { CommentBox } from "@/modules/tasks/components/comment-box";
import { CustomFieldInput } from "@/modules/tasks/components/custom-field-input";
import {
  getActiveUsers,
  getFieldDefinitions,
  getStatusesForList,
  getTaskActivity,
  getTaskAttachments,
  getTaskByNumber,
  getTaskComments,
} from "@/modules/tasks/queries";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function describeActivity(a: {
  verb: string;
  payload: unknown;
  actorName: string | null;
  actorLabel: string | null;
}): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const who = a.actorName ?? a.actorLabel ?? "System";
  switch (a.verb) {
    case "task.created":
      return `${who} created the task`;
    case "task.status_changed":
      return `${who} changed status: ${p.from ?? "?"} → ${p.to ?? "?"}`;
    case "task.title_changed":
      return `${who} renamed the task`;
    case "task.priority_changed":
      return `${who} set priority to ${p.to ?? "none"}`;
    case "task.due_date_changed":
      return `${who} set due date to ${p.to ?? "none"}`;
    case "task.assignee_added":
      return `${who} added an assignee`;
    case "task.assignee_removed":
      return `${who} removed an assignee`;
    case "task.field_changed":
      return `${who} changed ${p.field}: ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}`;
    case "task.archived":
      return `${who} archived the task`;
    default:
      return `${who} · ${a.verb}`;
  }
}

export default async function TaskDetailPage(props: { params: Promise<{ number: string }> }) {
  const { number } = await props.params;
  const user = await requireUser();
  const task = await getTaskByNumber(decodeURIComponent(number));
  if (!task) notFound();

  const [row] = await db
    .select({ list: lists, space: spaces })
    .from(lists)
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(lists.id, task.listId));
  if (!row) notFound();
  const { list, space } = row;

  const role = await getSpaceRole(user.id, space.id, user.platformRole);
  if (!role) notFound();
  const canEdit = role === "owner" || role === "member";

  const [listStatuses, fieldDefs, activity, activeUsers, taskComments, taskAttachments] =
    await Promise.all([
      getStatusesForList(task.listId),
      getFieldDefinitions(task.listId),
      getTaskActivity(task.id),
      getActiveUsers(),
      getTaskComments(task.id),
      getTaskAttachments(task.id),
    ]);
  const { taskAssignees: ta } = await import("@aitim/db");
  const assigneeRows = await db.select().from(ta).where(eq(ta.taskId, task.id));
  const assigneeIds = new Set(assigneeRows.map((r) => r.userId));
  const cf = (task.customFields ?? {}) as Record<string, unknown>;
  const description = (task.description as { text?: string } | null)?.text ?? "";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted-foreground">
          <Link href={`/tasks/${space.slug}/${list.slug}`} className="hover:underline">
            {space.name} / {list.name}
          </Link>
          <span className="mx-2">·</span>
          {task.number}
          {task.isArchived && (
            <Badge variant="destructive" className="ml-2">
              archived
            </Badge>
          )}
        </div>

        <form action={updateTaskCore} className="flex flex-col gap-4">
          <input type="hidden" name="taskId" value={task.id} />
          <Input
            name="title"
            defaultValue={task.title}
            required
            disabled={!canEdit}
            className="text-lg font-semibold"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="statusId">Status</Label>
              <select
                id="statusId"
                name="statusId"
                defaultValue={task.statusId}
                disabled={!canEdit}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                {listStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                defaultValue={task.priority ?? ""}
                disabled={!canEdit}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">—</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={task.dueDate ?? ""}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={description}
              disabled={!canEdit}
            />
          </div>
          {fieldDefs.map((def) => (
            <CustomFieldInput key={def.id} def={def} users={activeUsers} defaultValue={cf[def.id]} />
          ))}
          {canEdit && (
            <div className="flex gap-2">
              <Button type="submit">Save changes</Button>
            </div>
          )}
        </form>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Attachments ({taskAttachments.length})</CardTitle>
            {canEdit && <AttachmentUpload taskId={task.id} />}
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {taskAttachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <a href={`/api/attachments/${a.id}`} className="font-medium text-primary hover:underline">
                    {a.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(a.sizeBytes)} · {a.uploaderName ?? "—"}
                  </span>
                </li>
              ))}
              {taskAttachments.length === 0 && (
                <li className="text-sm text-muted-foreground">No attachments.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comments ({taskComments.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-4">
              {taskComments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <UserAvatar
                    userId={c.authorId}
                    name={c.authorName}
                    hasPhoto={!!c.authorPhotoKey}
                    className="size-7"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{c.authorName}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {c.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">
                      {(c.body as { text?: string })?.text ?? ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <CommentBox taskId={task.id} users={activeUsers} />
          </CardContent>
        </Card>

        {canEdit && !task.isArchived && (
          <form action={archiveTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <Button variant="ghost" size="sm" type="submit" className="text-destructive">
              Archive task
            </Button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignees</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {activeUsers.map((u) => (
              <form key={u.id} action={toggleAssignee}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="userId" value={u.id} />
                <button
                  type="submit"
                  disabled={!canEdit}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                    assigneeIds.has(u.id) ? "bg-muted font-medium" : "text-muted-foreground"
                  }`}
                >
                  <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} className="size-6" />
                  <span className="truncate">{u.displayName}</span>
                  {assigneeIds.has(u.id) && <span className="ml-auto">✓</span>}
                </button>
              </form>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <div>{describeActivity(a)}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                </li>
              ))}
              {activity.length === 0 && (
                <li className="text-sm text-muted-foreground">No activity yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
