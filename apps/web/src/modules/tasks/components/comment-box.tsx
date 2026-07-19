"use client";

import { AtSign, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addComment } from "../actions";

interface UserOption {
  id: string;
  displayName: string;
  photoKey?: string | null;
}

/** Find an active @query just before the cursor (e.g. "@sa" or "@"). */
function getAtQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  // Match last @ that is start-of-string or preceded by whitespace, then non-space chars.
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = before.length - query.length - 1; // index of @
  return { start, query };
}

/**
 * Activity comment box with @-mentions. Only users with permission on the task
 * (list access) are offered — never the full directory.
 */
export function CommentBox({
  taskId,
  users,
}: {
  taskId: string;
  /** Mentionable users — must already be filtered to those with list access. */
  users: UserOption[];
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [caret, setCaret] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const atQuery = useMemo(() => getAtQuery(body, caret), [body, caret]);

  const filtered = useMemo(() => {
    if (!atQuery) return [];
    const q = atQuery.query.toLowerCase();
    return users
      .filter((u) => !mentions.some((m) => m.id === u.id))
      .filter((u) => !q || u.displayName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [atQuery, users, mentions]);

  useEffect(() => {
    if (atQuery && filtered.length > 0) {
      setMentionOpen(true);
      setHighlight(0);
    } else {
      setMentionOpen(false);
    }
  }, [atQuery, filtered.length]);

  const available = users.filter((u) => !mentions.some((m) => m.id === u.id));

  function syncCaret(el: HTMLTextAreaElement) {
    setCaret(el.selectionStart ?? el.value.length);
  }

  function insertMention(user: UserOption) {
    const el = textareaRef.current;
    const currentCaret = el?.selectionStart ?? caret;
    const found = getAtQuery(body, currentCaret);
    const insertText = `@${user.displayName} `;

    let nextBody: string;
    let nextCaret: number;
    if (found) {
      nextBody = body.slice(0, found.start) + insertText + body.slice(currentCaret);
      nextCaret = found.start + insertText.length;
    } else {
      // Triggered from the Mention button — append.
      const needsSpace = body.length > 0 && !/\s$/.test(body);
      nextBody = body + (needsSpace ? " " : "") + insertText;
      nextCaret = nextBody.length;
    }

    setBody(nextBody);
    setMentions((prev) => (prev.some((m) => m.id === user.id) ? prev : [...prev, user]));
    setMentionOpen(false);
    setCaret(nextCaret);

    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[highlight] ?? filtered[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionOpen(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await addComment(formData);
            setBody("");
            setMentions([]);
            setMentionOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to comment");
          }
        });
      }}
    >
      <input type="hidden" name="taskId" value={taskId} />
      {mentions.map((m) => (
        <input key={m.id} type="hidden" name="mentions" value={m.id} />
      ))}

      <div className="relative">
        <Textarea
          ref={textareaRef}
          name="body"
          rows={3}
          placeholder="Write a comment… Use @ to mention someone"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            syncCaret(e.target);
          }}
          onClick={(e) => syncCaret(e.currentTarget)}
          onKeyUp={(e) => syncCaret(e.currentTarget)}
          onSelect={(e) => syncCaret(e.currentTarget)}
          onKeyDown={onKeyDown}
          required
        />

        {mentionOpen && filtered.length > 0 && (
          <div
            ref={listRef}
            role="listbox"
            className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-full max-w-sm overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          >
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              People with access
            </p>
            {filtered.map((u, i) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  // prevent textarea blur before click
                  e.preventDefault();
                  insertMention(u);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <AtSign className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{u.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <AtSign className="size-4" /> Mention
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-64 overflow-y-auto">
            {available.map((u) => (
              <DropdownMenuItem key={u.id} onSelect={() => insertMention(u)}>
                {u.displayName}
              </DropdownMenuItem>
            ))}
            {available.length === 0 && (
              <DropdownMenuItem disabled>
                {users.length === 0 ? "No one else has access" : "Everyone mentioned"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {mentions.map((m) => (
          <Badge key={m.id} variant="secondary" className="gap-1">
            @{m.displayName}
            <button
              type="button"
              onClick={() => setMentions((prev) => prev.filter((x) => x.id !== m.id))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Button type="submit" size="sm" className="ml-auto" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
