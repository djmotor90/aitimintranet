"use client";

import {
  ChevronDown,
  ChevronRight,
  FileText,
  ListFilter,
  MessageSquare,
  Reply,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { initials, UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskComment } from "../queries";
import { CommentBox } from "./comment-box";

export type ActivityEvent = {
  id: number;
  verb: string;
  payload: unknown;
  actorId: string | null;
  actorName: string | null;
  actorLabel: string | null;
  actorPhotoKey: string | null;
  createdAt: Date;
};

type TimelineItem =
  | { id: string; type: "activity"; createdAt: Date; activity: ActivityEvent }
  | { id: string; type: "comment"; createdAt: Date; comment: TaskComment };

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

function describeActivity(a: ActivityEvent): string {
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
    case "comment.replied":
      return `${who} replied in a thread`;
    default:
      return `${who} · ${a.verb}`;
  }
}

function commentText(c: TaskComment): string {
  return (c.body as { text?: string } | null)?.text ?? "";
}

function CommentBody({
  comment,
  footer,
}: {
  comment: TaskComment;
  footer?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <UserAvatar
        userId={comment.authorId}
        name={comment.authorName}
        hasPhoto={!!comment.authorPhotoKey}
        className="size-7"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {comment.authorName}{" "}
          <span className="font-normal text-muted-foreground">
            {comment.parentCommentId ? "replied" : "commented"}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{commentText(comment)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatActivityTime(comment.createdAt)}</span>
          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * Activity feed + Slack-style comment threads.
 * Main view: activity + root comments (with collapsible reply previews).
 * Thread view: full conversation with back navigation on the same panel.
 */
export function ActivityPanel({
  taskId,
  mentionableUsers,
  activity,
  comments,
}: {
  taskId: string;
  mentionableUsers: { id: string; displayName: string; photoKey: string | null }[];
  activity: ActivityEvent[];
  comments: TaskComment[];
}) {
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  /** Roots whose inline reply tree is expanded on the main feed. */
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(() => new Set());

  const { roots, repliesByRoot } = useMemo(() => {
    const rootsList = comments.filter((c) => !c.parentCommentId);
    const map = new Map<string, TaskComment[]>();
    for (const c of comments) {
      if (!c.parentCommentId) continue;
      const list = map.get(c.parentCommentId) ?? [];
      list.push(c);
      map.set(c.parentCommentId, list);
    }
    return { roots: rootsList, repliesByRoot: map };
  }, [comments]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [
      ...activity
        .filter((a) => a.verb !== "comment.created" && a.verb !== "comment.replied")
        .map((a) => ({
          id: `activity-${a.id}`,
          type: "activity" as const,
          createdAt: a.createdAt,
          activity: a,
        })),
      ...roots.map((c) => ({
        id: `comment-${c.id}`,
        type: "comment" as const,
        createdAt: c.createdAt,
        comment: c,
      })),
    ];
    return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [activity, roots]);

  const threadRoot = threadRootId
    ? comments.find((c) => c.id === threadRootId) ?? null
    : null;
  const threadReplies = threadRootId ? (repliesByRoot.get(threadRootId) ?? []) : [];

  function toggleExpanded(rootId: string) {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function openThread(rootId: string) {
    setThreadRootId(rootId);
    setExpandedRoots((prev) => new Set(prev).add(rootId));
  }

  // ── Thread detail view ────────────────────────────────────────────────────
  if (threadRoot) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0 border-b border-border">
          <div className="flex min-w-0 flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 w-fit gap-1.5 px-2 text-muted-foreground"
              onClick={() => setThreadRootId(null)}
            >
              <ChevronRight className="size-3.5 rotate-180" />
              Back to activity
            </Button>
            <CardTitle className="text-base">Thread</CardTitle>
            <p className="text-xs text-muted-foreground">
              {threadReplies.length} {threadReplies.length === 1 ? "reply" : "replies"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-(--card-spacing)">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-0.5">
            <div className="box-border rounded-lg border border-border bg-card p-3 shadow-sm ring-1 ring-primary/10">
              <CommentBody comment={threadRoot} />
            </div>
            {threadReplies.length > 0 && (
              <div className="ml-3 flex flex-col gap-2 border-l-2 border-border pl-3">
                {threadReplies.map((r) => (
                  <div
                    key={r.id}
                    className="box-border rounded-lg border border-border bg-card p-3 shadow-sm"
                  >
                    <CommentBody comment={r} />
                  </div>
                ))}
              </div>
            )}
            {threadReplies.length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet — start the conversation.</p>
            )}
          </div>
          <div className="box-border shrink-0 rounded-xl border border-border bg-card p-3 shadow-sm">
            <CommentBox
              taskId={taskId}
              users={mentionableUsers}
              parentCommentId={threadRoot.id}
              placeholder="Reply in thread… Use @ to mention"
              autoFocus
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Main activity feed ────────────────────────────────────────────────────
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="shrink-0 border-b border-border">
        <CardTitle className="text-base">Activity</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ListFilter className="size-4" />
            Filter
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pt-(--card-spacing)">
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-0.5">
          {timelineItems.map((item) => {
            if (item.type === "activity") {
              return (
                <li
                  key={item.id}
                  className="box-border rounded-lg border border-border bg-card p-3 shadow-sm"
                >
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
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                          <FileText className="size-5 shrink-0 text-destructive" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {String(
                                ((item.activity.payload ?? {}) as Record<string, unknown>)
                                  .fileName ?? "Attachment",
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
                </li>
              );
            }

            const root = item.comment;
            const replies = repliesByRoot.get(root.id) ?? [];
            const expanded = expandedRoots.has(root.id);
            const preview = replies.slice(-2);

            return (
              <li
                key={item.id}
                className="box-border rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                <CommentBody
                  comment={root}
                  footer={
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        onClick={() => openThread(root.id)}
                      >
                        <Reply className="size-3" />
                        Reply
                      </button>
                      {replies.length > 0 && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => toggleExpanded(root.id)}
                        >
                          {expanded ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                          {replies.length} {replies.length === 1 ? "reply" : "replies"}
                        </button>
                      )}
                    </>
                  }
                />

                {/* Collapsible thread preview on the main feed */}
                {replies.length > 0 && expanded && (
                  <div className="mt-3 ml-2 flex flex-col gap-2 border-l-2 border-border pl-3">
                    {preview.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-border/80 bg-muted/20 p-2.5"
                      >
                        <CommentBody comment={r} />
                      </div>
                    ))}
                    {replies.length > preview.length && (
                      <p className="text-xs text-muted-foreground">
                        +{replies.length - preview.length} earlier{" "}
                        {replies.length - preview.length === 1 ? "reply" : "replies"}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-fit gap-1.5"
                      onClick={() => openThread(root.id)}
                    >
                      <MessageSquare className="size-3.5" />
                      Open thread
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {timelineItems.length === 0 && (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          )}
        </ul>
        <div className="box-border shrink-0 rounded-xl border border-border bg-card p-3 shadow-sm">
          <CommentBox taskId={taskId} users={mentionableUsers} />
        </div>
      </CardContent>
    </Card>
  );
}
