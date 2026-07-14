"use client";

import { AtSign, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "../actions";

interface UserOption {
  id: string;
  displayName: string;
}

export function CommentBox({ taskId, users }: { taskId: string; users: UserOption[] }) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const available = users.filter((u) => !mentions.some((m) => m.id === u.id));

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
      <Textarea
        name="body"
        rows={3}
        placeholder="Write a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <AtSign className="size-4" /> Mention
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {available.map((u) => (
              <DropdownMenuItem
                key={u.id}
                onSelect={() => {
                  setMentions((prev) => [...prev, u]);
                  setBody((prev) => (prev ? `${prev} @${u.displayName}` : `@${u.displayName}`));
                }}
              >
                {u.displayName}
              </DropdownMenuItem>
            ))}
            {available.length === 0 && (
              <DropdownMenuItem disabled>Everyone mentioned</DropdownMenuItem>
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
