/** Client helpers: upload images & files to a task for embedding in the editor. */

import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
} from "@/lib/upload-limits";

export type UploadedFile = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "bin";
}

/** Normalize clipboard/screenshot File with a usable name. */
export function normalizeImageFile(file: File): File {
  if (file.name && file.name !== "image.png" && file.name !== "blob") return file;
  const ext = extensionForMime(file.type || "image/png");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new File([file], `screenshot-${stamp}.${ext}`, {
    type: file.type || "image/png",
    lastModified: file.lastModified,
  });
}

function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}:${f.type}`;
}

/** Collect every file from a paste/drop DataTransfer. */
export function collectFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();

  if (data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (!f) continue;
      const key = fileKey(f);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f.type.startsWith("image/") ? normalizeImageFile(f) : f);
    }
  }

  if (data.files?.length) {
    for (const f of Array.from(data.files)) {
      const key = fileKey(f);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f.type.startsWith("image/") ? normalizeImageFile(f) : f);
    }
  }

  return out;
}

export function collectImageFiles(
  data: DataTransfer | null | undefined,
): File[] {
  return collectFiles(data).filter((f) => f.type.startsWith("image/"));
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadTaskFile(
  taskId: string,
  file: File,
): Promise<UploadedFile> {
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large (max ${MAX_ATTACHMENT_LABEL})`);
  }

  const payload = file.type.startsWith("image/")
    ? normalizeImageFile(file)
    : file;

  const formData = new FormData();
  formData.set("file", payload);

  const res = await fetch(`/api/tasks/${taskId}/attachments`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }

  const data = (await res.json()) as {
    id?: string;
    url?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  };

  if (!data.id || !data.url) {
    throw new Error("Upload succeeded but no file URL was returned");
  }

  return {
    id: data.id,
    url: data.url,
    fileName: data.fileName ?? file.name,
    mimeType: data.mimeType ?? (file.type || "application/octet-stream"),
    sizeBytes: data.sizeBytes ?? file.size,
  };
}

/** @deprecated use uploadTaskFile */
export async function uploadTaskImage(
  taskId: string,
  file: File,
): Promise<UploadedFile> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only images can be pasted here");
  }
  return uploadTaskFile(taskId, file);
}
