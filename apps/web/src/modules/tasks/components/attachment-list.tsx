"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteAttachment } from "../actions";

export type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string | null;
  uploaderName: string | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({
  attachments,
  currentUserId,
  canEdit,
  isPlatformAdmin,
}: {
  attachments: AttachmentRow[];
  currentUserId: string;
  /** List owner/member — can delete any attachment on this task. */
  canEdit: boolean;
  /** Platform admin — can delete any attachment. */
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function canDelete(a: AttachmentRow) {
    return isPlatformAdmin || canEdit || a.uploaderId === currentUserId;
  }

  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {canEdit
          ? "No attachments yet — use Attach files, or drop / paperclip in the description or a comment."
          : "No attachments."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {attachments.map((a) => (
        <li
          key={a.id}
          className="box-border flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
        >
          <a
            href={`/api/attachments/${a.id}`}
            className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
          >
            {a.fileName}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatBytes(a.sizeBytes)} · {a.uploaderName ?? "—"}
          </span>
          {canDelete(a) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pendingId === a.id}
              title="Delete attachment"
              aria-label={`Delete ${a.fileName}`}
              onClick={() => {
                if (!window.confirm(`Delete “${a.fileName}”?`)) return;
                setPendingId(a.id);
                const fd = new FormData();
                fd.set("attachmentId", a.id);
                void deleteAttachment(fd)
                  .then(() => router.refresh())
                  .finally(() => setPendingId(null));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
