"use client";

import {
  ChevronDown,
  ChevronRight,
  FileText,
  ListFilter,
  MessageSquare,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { initials, UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RichTextViewer } from "@/components/editor/rich-text-editor";
import { docToPlainText, storedToDoc, type StoredRichDoc } from "@/components/editor/doc-utils";
import { cn } from "@/lib/utils";
import { deleteComment } from "../actions";
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

/** High-level kinds of system activity (not comments). */
type ActivityKind =
  | "status"
  | "assignees"
  | "fields"
  | "attachments"
  | "tags"
  | "task"
  | "other";

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

type ActivityFilters = {
  /** Show comments in the feed. */
  showComments: boolean;
  /** Show system/activity events (status, assignees, etc.). */
  showActivity: boolean;
  /** Empty = all people. */
  personIds: string[];
  datePreset: DatePreset;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  /** Empty = all kinds (when showActivity). */
  activityKinds: ActivityKind[];
};

const DEFAULT_FILTERS: ActivityFilters = {
  showComments: true,
  showActivity: true,
  personIds: [],
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  activityKinds: [],
};

const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  status: "Status changes",
  assignees: "Assignees",
  fields: "Field updates",
  attachments: "Attachments",
  tags: "Tags",
  task: "Task (create / rename / archive)",
  other: "Other",
};

function activityKind(verb: string): ActivityKind {
  if (verb.includes("status")) return "status";
  if (verb.includes("assignee")) return "assignees";
  if (verb.includes("field") || verb.includes("priority") || verb.includes("due_date"))
    return "fields";
  if (verb.includes("attachment")) return "attachments";
  if (verb.includes("tag")) return "tags";
  if (
    verb === "task.created" ||
    verb === "task.archived" ||
    verb === "task.title_changed" ||
    verb === "task.description_changed"
  )
    return "task";
  return "other";
}

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateInput(value: string, endOfDay: boolean): Date | null {
  if (!value) return null;
  const d = new Date(value + (endOfDay ? "T23:59:59.999" : "T00:00:00"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateRangeFor(filters: ActivityFilters): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (filters.datePreset) {
    case "today":
      return { from: startOfLocalDay(now), to: endOfLocalDay(now) };
    case "7d": {
      const from = startOfLocalDay(now);
      from.setDate(from.getDate() - 6);
      return { from, to: endOfLocalDay(now) };
    }
    case "30d": {
      const from = startOfLocalDay(now);
      from.setDate(from.getDate() - 29);
      return { from, to: endOfLocalDay(now) };
    }
    case "custom":
      return {
        from: parseDateInput(filters.dateFrom, false),
        to: parseDateInput(filters.dateTo, true),
      };
    default:
      return { from: null, to: null };
  }
}

function inDateRange(date: Date, from: Date | null, to: Date | null): boolean {
  const t = date.getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

function countActiveFilters(f: ActivityFilters): number {
  let n = 0;
  if (!f.showComments || !f.showActivity) n += 1;
  if (f.personIds.length > 0) n += 1;
  if (f.datePreset !== "all") n += 1;
  if (f.activityKinds.length > 0) n += 1;
  return n;
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
    case "attachment.removed":
      return `${who} removed attachment${p.fileName ? ` ${p.fileName}` : ""}`;
    case "task.archived":
      return `${who} archived the task`;
    case "comment.replied":
      return `${who} replied in a thread`;
    default:
      return `${who} · ${a.verb}`;
  }
}

function DeleteCommentButton({
  commentId,
  canDelete,
}: {
  commentId: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!canDelete) return null;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium text-destructive hover:underline disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this comment?")) return;
        startTransition(async () => {
          const fd = new FormData();
          fd.set("commentId", commentId);
          await deleteComment(fd);
          router.refresh();
        });
      }}
    >
      <Trash2 className="size-3" />
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

function CommentBody({
  comment,
  footer,
}: {
  comment: TaskComment;
  footer?: ReactNode;
}) {
  const body = comment.body as StoredRichDoc;
  const hasRich = Boolean(body && (body.doc || body.type === "doc"));
  const plain = hasRich
    ? docToPlainText(storedToDoc(body))
    : String(body?.text ?? "");

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
        <div className="mt-2 text-sm leading-6">
          {hasRich ? (
            <RichTextViewer content={body} className="text-sm" />
          ) : (
            <p className="whitespace-pre-wrap">{plain}</p>
          )}
        </div>
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
  currentUserId,
  canModerateComments = false,
}: {
  taskId: string;
  mentionableUsers: { id: string; displayName: string; photoKey: string | null }[];
  activity: ActivityEvent[];
  comments: TaskComment[];
  /** Session user id — for “delete own comment”. */
  currentUserId: string;
  /**
   * Platform admin (and protected/super admin) may delete any comment.
   * Regular users may only delete their own.
   */
  canModerateComments?: boolean;
}) {
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  function canDeleteComment(authorId: string) {
    return canModerateComments || authorId === currentUserId;
  }
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

  /** People who appear in the feed (for person filter). */
  const peopleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of activity) {
      if (a.actorId) {
        map.set(a.actorId, a.actorName ?? a.actorLabel ?? "Someone");
      }
    }
    for (const c of comments) {
      map.set(c.authorId, c.authorName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activity, comments]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    const { from, to } = dateRangeFor(filters);
    const personSet = new Set(filters.personIds);
    const kindSet = new Set(filters.activityKinds);

    const items: TimelineItem[] = [];

    if (filters.showActivity) {
      for (const a of activity) {
        if (a.verb === "comment.created" || a.verb === "comment.replied") continue;
        if (!inDateRange(new Date(a.createdAt), from, to)) continue;
        if (personSet.size > 0) {
          if (!a.actorId || !personSet.has(a.actorId)) continue;
        }
        if (kindSet.size > 0 && !kindSet.has(activityKind(a.verb))) continue;
        items.push({
          id: `activity-${a.id}`,
          type: "activity",
          createdAt: new Date(a.createdAt),
          activity: a,
        });
      }
    }

    if (filters.showComments) {
      for (const c of roots) {
        if (!inDateRange(new Date(c.createdAt), from, to)) continue;
        if (personSet.size > 0 && !personSet.has(c.authorId)) continue;
        // activityKinds only applies to system events
        items.push({
          id: `comment-${c.id}`,
          type: "comment",
          createdAt: new Date(c.createdAt),
          comment: c,
        });
      }
    }

    return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [activity, roots, filters]);

  const activeFilterCount = countActiveFilters(filters);

  function togglePerson(id: string) {
    setFilters((f) => {
      const has = f.personIds.includes(id);
      return {
        ...f,
        personIds: has
          ? f.personIds.filter((x) => x !== id)
          : [...f.personIds, id],
      };
    });
  }

  function toggleKind(kind: ActivityKind) {
    setFilters((f) => {
      const has = f.activityKinds.includes(kind);
      return {
        ...f,
        activityKinds: has
          ? f.activityKinds.filter((x) => x !== kind)
          : [...f.activityKinds, kind],
      };
    });
  }

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
              <CommentBody
                comment={threadRoot}
                footer={
                  <DeleteCommentButton
                    commentId={threadRoot.id}
                    canDelete={canDeleteComment(threadRoot.authorId)}
                  />
                }
              />
            </div>
            {threadReplies.length > 0 && (
              <div className="ml-3 flex flex-col gap-2 border-l-2 border-border pl-3">
                {threadReplies.map((r) => (
                  <div
                    key={r.id}
                    className="box-border rounded-lg border border-border bg-card p-3 shadow-sm"
                  >
                    <CommentBody
                      comment={r}
                      footer={
                        <DeleteCommentButton
                          commentId={r.id}
                          canDelete={canDeleteComment(r.authorId)}
                        />
                      }
                    />
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
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-2 text-muted-foreground",
                  activeFilterCount > 0 && "text-primary",
                )}
              >
                <ListFilter className="size-4" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Filter activity</p>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                  >
                    Reset all
                  </button>
                )}
              </div>

              {/* Type */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={filters.showComments}
                    onCheckedChange={(v) =>
                      setFilters((f) => ({ ...f, showComments: v === true }))
                    }
                  />
                  Comments
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={filters.showActivity}
                    onCheckedChange={(v) =>
                      setFilters((f) => ({ ...f, showActivity: v === true }))
                    }
                  />
                  System activity
                </label>
              </div>

              {/* Date */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["all", "Any time"],
                      ["today", "Today"],
                      ["7d", "7 days"],
                      ["30d", "30 days"],
                      ["custom", "Custom"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setFilters((f) => ({ ...f, datePreset: key }))
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        filters.datePreset === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {filters.datePreset === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">From</Label>
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">To</Label>
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, dateTo: e.target.value }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Person */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
                  Person {filters.personIds.length > 0 && `(${filters.personIds.length})`}
                </Label>
                <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                  {peopleOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No people in feed</p>
                  )}
                  {peopleOptions.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={filters.personIds.includes(p.id)}
                        onCheckedChange={() => togglePerson(p.id)}
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Activity kinds */}
              {filters.showActivity && (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Activity kind
                    {filters.activityKinds.length === 0
                      ? " (all)"
                      : ` (${filters.activityKinds.length})`}
                  </Label>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                    {(Object.keys(ACTIVITY_KIND_LABELS) as ActivityKind[]).map(
                      (kind) => (
                        <label
                          key={kind}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={filters.activityKinds.includes(kind)}
                            onCheckedChange={() => toggleKind(kind)}
                          />
                          {ACTIVITY_KIND_LABELS[kind]}
                        </label>
                      ),
                    )}
                  </div>
                </div>
              )}

              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={() => setFilterOpen(false)}
              >
                Done
              </Button>
            </PopoverContent>
          </Popover>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pt-(--card-spacing)">
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Active:</span>
            {!filters.showComments && (
              <FilterChip
                label="No comments"
                onClear={() => setFilters((f) => ({ ...f, showComments: true }))}
              />
            )}
            {!filters.showActivity && (
              <FilterChip
                label="No system activity"
                onClear={() => setFilters((f) => ({ ...f, showActivity: true }))}
              />
            )}
            {filters.datePreset !== "all" && (
              <FilterChip
                label={
                  filters.datePreset === "custom"
                    ? `Date ${filters.dateFrom || "…"}–${filters.dateTo || "…"}`
                    : filters.datePreset === "today"
                      ? "Today"
                      : filters.datePreset === "7d"
                        ? "Last 7 days"
                        : "Last 30 days"
                }
                onClear={() =>
                  setFilters((f) => ({
                    ...f,
                    datePreset: "all",
                    dateFrom: "",
                    dateTo: "",
                  }))
                }
              />
            )}
            {filters.personIds.map((id) => {
              const name = peopleOptions.find((p) => p.id === id)?.name ?? "Person";
              return (
                <FilterChip
                  key={id}
                  label={name}
                  onClear={() => togglePerson(id)}
                />
              );
            })}
            {filters.activityKinds.map((kind) => (
              <FilterChip
                key={kind}
                label={ACTIVITY_KIND_LABELS[kind]}
                onClear={() => toggleKind(kind)}
              />
            ))}
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear all
            </button>
          </div>
        )}
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
                      <DeleteCommentButton
                        commentId={root.id}
                        canDelete={canDeleteComment(root.authorId)}
                      />
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
                        <CommentBody
                          comment={r}
                          footer={
                            <DeleteCommentButton
                              commentId={r.id}
                              canDelete={canDeleteComment(r.authorId)}
                            />
                          }
                        />
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
            <li className="text-sm text-muted-foreground">
              {activeFilterCount > 0
                ? "No items match these filters."
                : "No activity yet."}
            </li>
          )}
        </ul>
        <div className="box-border shrink-0 rounded-xl border border-border bg-card p-3 shadow-sm">
          <CommentBox taskId={taskId} users={mentionableUsers} />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
