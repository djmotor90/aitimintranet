"use client";

import type { JSONContent } from "@tiptap/react";
import { AtSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { extractMentionIds } from "@/components/editor/mention-extension";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { isDocEmpty } from "@/components/editor/doc-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addComment } from "../actions";

interface UserOption {
  id: string;
  displayName: string;
  photoKey?: string | null;
}

/**
 * Comment composer with TipTap: `/` slash commands + `@` mentions
 * (only users who have access to this task's list).
 */
export function CommentBox({
  taskId,
  users,
  parentCommentId,
  placeholder,
  autoFocus,
}: {
  taskId: string;
  /** Mentionable users — people with list access only. */
  users: UserOption[];
  parentCommentId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [empty, setEmpty] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const [payload, setPayload] = useState<{
    text: string;
    doc: JSONContent;
  } | null>(null);
  // After mount we allow the real empty/pending logic. SSR + first client paint
  // stay identical so TipTap-related state never flips attributes during hydrate.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const mentionedUsers = useMemo(() => {
    if (!payload?.doc) return [];
    return extractMentionIds(payload.doc)
      .map((id) => userById.get(id))
      .filter((u): u is UserOption => Boolean(u));
  }, [payload, userById]);

  const submitLabel = parentCommentId ? "Reply" : "Comment";
  const canSubmit =
    ready && !pending && !empty && Boolean(payload && !isDocEmpty(payload.doc));

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!canSubmit || !payload || isDocEmpty(payload.doc)) {
        if (ready) setError("Write something first");
        return;
      }
      const formData = new FormData();
      formData.set("taskId", taskId);
      if (parentCommentId) formData.set("parentCommentId", parentCommentId);
      formData.set("body", JSON.stringify(payload));
      for (const id of extractMentionIds(payload.doc)) {
        formData.append("mentions", id);
      }
      startTransition(async () => {
        try {
          await addComment(formData);
          setPayload(null);
          setEmpty(true);
          setEditorKey((k) => k + 1);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to comment");
        }
      });
    },
    [canSubmit, payload, ready, taskId, parentCommentId],
  );

  return (
    <form className="flex flex-col gap-2" onSubmit={onSubmit}>
      <RichTextEditor
        key={editorKey}
        variant="compact"
        autoFocus={autoFocus}
        taskId={taskId}
        mentionUsers={users}
        onFilesUploaded={() => router.refresh()}
        placeholder={
          placeholder ??
          "Write a comment… attach files, paste screenshots, @ mention, / blocks"
        }
        onChange={({ text, doc, empty: isEmpty }) => {
          setEmpty(isEmpty);
          setPayload({ text, doc });
        }}
      />

      {mentionedUsers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <AtSign className="size-3.5 text-muted-foreground" />
          {mentionedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {u.displayName}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {/*
          Do not use the HTML `disabled` attribute here. React 19 SSR often
          emits disabled={null} while the client expects disabled={true}, which
          causes a hydration mismatch on this button. Guard submit in onSubmit
          and mirror the disabled look with aria-disabled + CSS.
        */}
        <Button
          type="submit"
          size="sm"
          aria-disabled={!canSubmit}
          className={cn(!canSubmit && "pointer-events-none opacity-50")}
          tabIndex={canSubmit ? 0 : -1}
        >
          {pending ? "Posting…" : submitLabel}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
