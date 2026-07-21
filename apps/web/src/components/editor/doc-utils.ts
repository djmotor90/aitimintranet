import type { JSONContent } from "@tiptap/react";

/** Legacy comment/description shape: `{ text: string }` or TipTap `{ type:'doc', ... }` or hybrid. */
export type StoredRichDoc = {
  text?: string;
  doc?: JSONContent;
  type?: string;
  content?: JSONContent[];
} | null;

export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Build a minimal TipTap doc from plain text (legacy data). */
export function plainTextToDoc(text: string): JSONContent {
  const trimmed = text.trim();
  if (!trimmed) return emptyDoc();
  const paragraphs = trimmed.split(/\n+/).map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : undefined,
  }));
  return { type: "doc", content: paragraphs };
}

/** Extract plain text from a TipTap JSON doc (for previews / notifications). */
export function docToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  const parts: string[] = [];
  function walk(node: JSONContent) {
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === "hardBreak") parts.push("\n");
    if (node.type === "image") {
      const alt = (node.attrs?.alt as string | undefined)?.trim();
      parts.push(alt ? `[Image: ${alt}]` : "[Image]");
    }
    if (node.type === "fileAttachment") {
      const name = (node.attrs?.fileName as string | undefined)?.trim();
      parts.push(name ? `[File: ${name}]` : "[File]");
    }
    if (node.content) {
      for (const child of node.content) walk(child);
      if (node.type === "tableCell" || node.type === "tableHeader") {
        parts.push("\t");
      }
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "bulletList" ||
        node.type === "orderedList" ||
        node.type === "taskList" ||
        node.type === "blockquote" ||
        node.type === "codeBlock" ||
        node.type === "tableRow" ||
        node.type === "table" ||
        node.type === "image" ||
        node.type === "fileAttachment"
      ) {
        parts.push("\n");
      }
    }
  }
  walk(doc);
  return parts.join("").replace(/\n+$/, "").trim();
}

/** True when the doc has no text and no media (images / file chips). */
export function docHasContent(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false;
  if (docToPlainText(doc).trim()) return true;
  let hasMedia = false;
  function walk(node: JSONContent) {
    if (node.type === "image" && node.attrs?.src) hasMedia = true;
    if (node.type === "fileAttachment" && (node.attrs?.href || node.attrs?.id)) {
      hasMedia = true;
    }
    if (node.content) for (const child of node.content) walk(child);
  }
  walk(doc);
  return hasMedia;
}

/** Normalize anything we might have stored into a TipTap doc. */
export function storedToDoc(stored: StoredRichDoc | string | null | undefined): JSONContent {
  if (!stored) return emptyDoc();
  if (typeof stored === "string") return plainTextToDoc(stored);
  // Full TipTap doc stored at top level
  if (stored.type === "doc") return stored as JSONContent;
  // Hybrid: { text, doc }
  if (stored.doc && stored.doc.type === "doc") return stored.doc;
  // Legacy: { text: "..." }
  if (typeof stored.text === "string") return plainTextToDoc(stored.text);
  return emptyDoc();
}

/** Persist TipTap doc + plain text for backwards-compatible previews. */
export function docToStored(doc: JSONContent): { text: string; doc: JSONContent } {
  return { text: docToPlainText(doc), doc };
}

export function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  return !docHasContent(doc);
}
