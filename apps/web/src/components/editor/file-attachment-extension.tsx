"use client";

import { mergeAttributes, Node } from "@tiptap/core";

export type FileAttachmentAttrs = {
  id: string | null;
  href: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFileAttachment: (attrs: FileAttachmentAttrs) => ReturnType;
    };
  }
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ClickUp-style file chip: paperclip + name + size, links to download URL.
 */
export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      href: { default: null },
      fileName: { default: null },
      mimeType: { default: null },
      sizeBytes: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-size");
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) =>
          attrs.sizeBytes != null ? { "data-size": String(attrs.sizeBytes) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file-attachment"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const name = String(node.attrs.fileName ?? "Attachment");
    const href = String(node.attrs.href ?? "#");
    const size = formatSize(node.attrs.sizeBytes as number | null);
    const mime = String(node.attrs.mimeType ?? "");

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "file-attachment",
        "data-id": node.attrs.id ?? "",
        "data-href": href,
        "data-filename": name,
        "data-mime": mime,
        class: "aitim-file-attachment",
        contenteditable: "false",
      }),
      [
        "a",
        {
          href,
          class: "aitim-file-attachment__link",
          download: name,
          target: "_blank",
          rel: "noopener noreferrer",
          title: name,
        },
        ["span", { class: "aitim-file-attachment__icon", "aria-hidden": "true" }, "📎"],
        ["span", { class: "aitim-file-attachment__name" }, name],
        size
          ? ["span", { class: "aitim-file-attachment__size" }, size]
          : ["span", { class: "aitim-file-attachment__size" }, ""],
      ],
    ];
  },

  addCommands() {
    return {
      setFileAttachment:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },

  renderText({ node }) {
    return `[File: ${node.attrs.fileName ?? "attachment"}]`;
  },
});
