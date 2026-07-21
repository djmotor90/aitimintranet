"use client";

import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import type { StoredRichDoc } from "@/components/editor/doc-utils";

/** Description field with full-screen mode + paste/attach files. */
export function TaskDescriptionEditor({
  taskId,
  initialContent,
}: {
  taskId: string;
  initialContent: StoredRichDoc;
}) {
  const router = useRouter();

  return (
    <RichTextEditor
      name="description"
      variant="minimal"
      expandable
      expandTitle="Description"
      taskId={taskId}
      initialContent={initialContent}
      onFilesUploaded={() => router.refresh()}
      placeholder="Add a description… attach files, paste screenshots, / for blocks"
    />
  );
}
