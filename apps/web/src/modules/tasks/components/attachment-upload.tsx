"use client";

import { Paperclip, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
} from "@/lib/upload-limits";
import { cn } from "@/lib/utils";

export function AttachmentUpload({
  taskId,
  compact,
}: {
  taskId: string;
  /** Icon-only button for tight toolbars. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setUploading(true);
      try {
        for (const file of files) {
          if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
            throw new Error(
              `${file.name}: too large (max ${MAX_ATTACHMENT_LABEL})`,
            );
          }
          const formData = new FormData();
          formData.set("file", file);
          const res = await fetch(`/api/tasks/${taskId}/attachments`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(data.error ?? `Upload failed (${res.status})`);
          }
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [taskId, router],
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg transition-colors",
          dragOver && "ring-2 ring-primary/40 bg-primary/5",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []));
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Upload className="size-4 animate-pulse" /> Uploading…
            </>
          ) : (
            <>
              <Paperclip className="size-4" />
              {compact ? "Attach" : "Attach files"}
            </>
          )}
        </Button>
      </div>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
