import { db, lists, spaces, users } from "@aitim/db";
import { eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { initials, UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getListRole, requireUser } from "@/lib/rbac";
import { archiveTask, updateTaskCore } from "@/modules/tasks/actions";
import { AttachmentUpload } from "@/modules/tasks/components/attachment-upload";
import { AssigneeSelect } from "@/modules/tasks/components/assignee-select";
import { CommentBox } from "@/modules/tasks/components/comment-box";
import { CustomFieldInput } from "@/modules/tasks/components/custom-field-input";
import { TagPicker } from "@/modules/tasks/components/tag-picker";
import { TaskDetailShell } from "@/modules/tasks/components/task-detail-shell";
import { defaultLayout, type TaskLayout } from "@/modules/tasks/layout-types";
import {
  getActiveUsers,
  getFieldDefinitions,
  getStatusesForList,
  getTagsForSpace,
  getTagsForTask,
  getTaskActivity,
  getTaskAttachments,
  getTaskByNumber,
  getTaskComments,
  getUsersWithListAccess,
} from "@/modules/tasks/queries";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatActivityTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", " at");
}

function describeActivity(a: {
  verb: string;
  payload: unknown;
  actorId: string | null;
  actorName: string | null;
  actorLabel: string | null;
  actorPhotoKey: string | null;
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
    case "task.tag_added":
      return `${who} added tag ${p.name ?? "?"}`;
    case "task.tag_removed":
      return `${who} removed tag ${p.name ?? "?"}`;
    case "task.field_changed":
      return `${who} changed ${p.field}: ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}`;
    case "attachment.added":
      return `${who} added attachment`;
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

  const role = await getListRole(user.id, list.id, user.platformRole);
  if (!role) notFound();
  const canEdit = role === "owner" || role === "member";

  const [
    listStatuses,
    fieldDefs,
    activity,
    activeUsers,
    mentionableUsers,
    taskComments,
    taskAttachments,
    spaceTags,
    taskTags,
  ] = await Promise.all([
    getStatusesForList(task.listId),
    getFieldDefinitions(task.listId),
    getTaskActivity(task.id),
    getActiveUsers(),
    // @-mentions only list people who can access this task (list RBAC).
    getUsersWithListAccess(task.listId),
    getTaskComments(task.id),
    getTaskAttachments(task.id),
    getTagsForSpace(space.id),
    getTagsForTask(task.id),
  ]);
  const { taskAssignees: ta } = await import("@aitim/db");
  const assigneeRows = await db
    .select({ id: users.id, displayName: users.displayName, photoKey: users.photoKey })
    .from(ta)
    .innerJoin(users, eq(ta.userId, users.id))
    .where(eq(ta.taskId, task.id));
  const cf = (task.customFields ?? {}) as Record<string, unknown>;
  const description = (task.description as { text?: string } | null)?.text ?? "";
  const savedLayout = list.taskLayout as TaskLayout | null;
  const layout = savedLayout ?? defaultLayout(fieldDefs);
  const timelineItems = [
    ...activity
      .filter((a) => a.verb !== "comment.created")
      .map((a) => ({ id: `activity-${a.id}`, type: "activity" as const, createdAt: a.createdAt, activity: a })),
    ...taskComments.map((c) => ({
      id: `comment-${c.id}`,
      type: "comment" as const,
      createdAt: c.createdAt,
      comment: c,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <TaskDetailShell
      activity={
        <>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {timelineItems.map((item) => (
              <li key={item.id} className="border-b py-4 first:pt-0 last:border-b-0">
                {item.type === "comment" ? (
                  <div className="flex gap-3">
                    <UserAvatar
                      userId={item.comment.authorId}
                      name={item.comment.authorName}
                      hasPhoto={!!item.comment.authorPhotoKey}
                      className="size-7"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {item.comment.authorName}{" "}
                        <span className="font-normal text-muted-foreground">commented</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {(item.comment.body as { text?: string })?.text ?? ""}
                      </p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatActivityTime(item.comment.createdAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    {item.activity.actorId ? (
                      <UserAvatar
                        userId={item.activity.actorId}
                        name={item.activity.actorName ?? item.activity.actorLabel ?? "System"}
                        hasPhoto={!!item.activity.actorPhotoKey}
                        className="size-7"
                      />
                    ) : (
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                        {initials(item.activity.actorName ?? item.activity.actorLabel ?? "System")}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-muted-foreground">
                        {describeActivity(item.activity)}
                      </div>
                      {item.activity.verb === "attachment.added" && (
                        <div className="mt-3 flex items-center gap-3 rounded-lg border p-3">
                          <FileText className="size-5 shrink-0 text-destructive" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {String(
                                ((item.activity.payload ?? {}) as Record<string, unknown>).fileName ??
                                  "Attachment",
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatActivityTime(item.activity.createdAt)}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
            {timelineItems.length === 0 && (
              <li className="text-sm text-muted-foreground">No activity yet.</li>
            )}
          </ul>
          <div className="rounded-xl border bg-card p-3">
            <CommentBox taskId={task.id} users={mentionableUsers} />
          </div>
        </>
      }
    >
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

        <form action={updateTaskCore} className="flex flex-col gap-5">
          <input type="hidden" name="taskId" value={task.id} />

          {/* title — always fixed at the top */}
          <Input
            name="title"
            defaultValue={task.title}
            required
            disabled={!canEdit}
            className="text-lg font-semibold"
          />

          {/* Tags sit under the title like ClickUp (also available as a layout field). */}
          <div className="flex flex-col gap-1.5">
            <Label>Tags</Label>
            <TagPicker
              taskId={task.id}
              spaceTags={spaceTags}
              selectedTags={taskTags}
              disabled={!canEdit}
            />
          </div>

          {/* layout-driven field groups */}
          {layout.groups.map((group) => {
            const showBorder = (group as { showBorder?: boolean }).showBorder ?? true;
            const colClassMap: Record<number, string> = {
              1: "flex flex-col gap-3",
              2: "grid gap-3 sm:grid-cols-2",
              3: "grid gap-3 sm:grid-cols-3",
              4: "grid gap-3 sm:grid-cols-4",
              5: "grid gap-3 sm:grid-cols-5",
            };
            const cols = group.columns ?? 2;
            const colClass = colClassMap[cols] ?? colClassMap[2];
            return (
            <div
              key={group.id}
              className={cn(
                "flex flex-col gap-3 p-4",
                showBorder && "rounded-lg border",
              )}
            >
              {group.label && (
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <div className={colClass}>
                {group.fields.map(({ id: fieldId }) => {
                  if (fieldId === "status") return (
                    <div key="status" className="flex flex-col gap-1.5">
                      <Label htmlFor="statusId">Status</Label>
                      <select
                        id="statusId"
                        name="statusId"
                        defaultValue={task.statusId}
                        disabled={!canEdit}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                      >
                        {listStatuses.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                  if (fieldId === "priority") return (
                    <div key="priority" className="flex flex-col gap-1.5">
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
                  );
                  if (fieldId === "due_date") return (
                    <div key="due_date" className="flex flex-col gap-1.5">
                      <Label htmlFor="dueDate">Due date</Label>
                      <Input
                        id="dueDate"
                        name="dueDate"
                        type="date"
                        defaultValue={task.dueDate ?? ""}
                        disabled={!canEdit}
                      />
                    </div>
                  );
                  if (fieldId === "start_date") return (
                    <div key="start_date" className="flex flex-col gap-1.5">
                      <Label htmlFor="startDate">Start date</Label>
                      <Input
                        id="startDate"
                        name="startDate"
                        type="date"
                        defaultValue={task.startDate ?? ""}
                        disabled={!canEdit}
                      />
                    </div>
                  );
                  if (fieldId === "created_at") return (
                    <div key="created_at" className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground">Created date</Label>
                      <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(task.createdAt)}
                      </div>
                    </div>
                  );
                  if (fieldId === "closed_at") return (
                    <div key="closed_at" className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground">Closed date</Label>
                      <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                        {task.completedAt
                          ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(task.completedAt)
                          : "—"}
                      </div>
                    </div>
                  );
                  if (fieldId === "assignees") return (
                    <div key="assignees" className="flex flex-col gap-1.5">
                      <Label>Assignees</Label>
                      <AssigneeSelect
                        taskId={task.id}
                        users={activeUsers}
                        selectedUsers={assigneeRows}
                        disabled={!canEdit}
                      />
                    </div>
                  );
                  if (fieldId === "tags") return (
                    <div key="tags" className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label>Tags</Label>
                      <TagPicker
                        taskId={task.id}
                        spaceTags={spaceTags}
                        selectedTags={taskTags}
                        disabled={!canEdit}
                      />
                    </div>
                  );
                  if (fieldId === "description") return (
                    <div key="description" className="flex flex-col gap-1.5">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        rows={4}
                        defaultValue={description}
                        disabled={!canEdit}
                      />
                    </div>
                  );
                  if (fieldId.startsWith("cf_")) {
                    const defId = fieldId.slice(3);
                    const def = fieldDefs.find((d) => d.id === defId);
                    if (!def) return null;
                    return (
                      <CustomFieldInput
                        key={fieldId}
                        def={def}
                        users={activeUsers}
                        defaultValue={cf[defId]}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
            );
          })}

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

        {canEdit && !task.isArchived && (
          <form action={archiveTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <Button variant="ghost" size="sm" type="submit" className="text-destructive">
              Archive task
            </Button>
          </form>
        )}
      </div>
    </TaskDetailShell>
  );
}
