"use client";

/**
 * Extra TipTap nodes/marks for ClickUp-like slash commands:
 * banners, badges, toggles, columns, buttons, pull quotes, TOC helper.
 */

import { mergeAttributes, Node, Mark } from "@tiptap/core";

// ── Color palette (shared by text / highlight / badge) ───────────────────────

export const TEXT_COLORS = {
  default: null,
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#f5d90a",
  blue: "#3e63dd",
  purple: "#8e4ec6",
  pink: "#d6409f",
  green: "#30a46c",
  grey: "#8b8d98",
} as const;

export type ColorName = keyof typeof TEXT_COLORS;

export const HIGHLIGHT_COLORS: Record<Exclude<ColorName, "default"> | "default", string | null> = {
  default: null,
  red: "#ffc9c9",
  orange: "#ffd8a8",
  yellow: "#fff3bf",
  blue: "#d0ebff",
  purple: "#e5dbff",
  pink: "#ffdeeb",
  green: "#d3f9d8",
  grey: "#e9ecef",
};

// ── Badge mark ───────────────────────────────────────────────────────────────

export type BadgeVariant =
  | "red"
  | "orange"
  | "yellow"
  | "blue"
  | "purple"
  | "pink"
  | "green"
  | "grey"
  | "strong-red"
  | "strong-orange"
  | "strong-yellow"
  | "strong-blue"
  | "strong-purple"
  | "strong-pink"
  | "strong-green"
  | "strong-grey";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    badge: {
      setBadge: (variant: BadgeVariant) => ReturnType;
      unsetBadge: () => ReturnType;
    };
    banner: {
      setBanner: (variant?: string) => ReturnType;
    };
    pullQuote: {
      setPullQuote: () => ReturnType;
    };
    toggleBlock: {
      setToggleBlock: () => ReturnType;
    };
    columns: {
      setColumns: (count?: number) => ReturnType;
    };
    actionButton: {
      setActionButton: (attrs?: { label?: string; href?: string }) => ReturnType;
    };
  }
}

export const Badge = Mark.create({
  name: "badge",
  excludes: "badge highlight",
  inclusive: false,
  parseHTML() {
    return [
      {
        tag: "span[data-badge]",
        getAttrs: (el) => ({
          variant: (el as HTMLElement).getAttribute("data-badge") || "grey",
        }),
      },
    ];
  },
  addAttributes() {
    return {
      variant: {
        default: "grey",
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-badge") || "grey",
        renderHTML: (attrs) => ({
          "data-badge": attrs.variant || "grey",
        }),
      },
    };
  },
  renderHTML({ mark, HTMLAttributes }) {
    const variant = String(mark.attrs.variant || "grey");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-badge": variant,
        // Keep class on the DOM so CSS always matches (not only data-attr)
        class: `aitim-badge aitim-badge--${variant}`,
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setBadge:
        (variant) =>
        ({ commands, state }) => {
          // Require a non-empty selection so users see an immediate effect
          const { empty } = state.selection;
          if (empty) return false;
          return commands.setMark(this.name, { variant });
        },
      unsetBadge:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

// ── Banner (callout) ─────────────────────────────────────────────────────────

export const Banner = Node.create({
  name: "banner",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-variant") || "info",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="banner"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "banner",
        class: `aitim-banner aitim-banner--${node.attrs.variant ?? "info"}`,
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setBanner:
        (variant = "info") =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { variant },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Banner text…" }],
                },
              ],
            })
            .run(),
    };
  },
});

// ── Pull quote ───────────────────────────────────────────────────────────────

export const PullQuote = Node.create({
  name: "pullQuote",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: 'blockquote[data-type="pull-quote"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "blockquote",
      mergeAttributes(HTMLAttributes, {
        "data-type": "pull-quote",
        class: "aitim-pull-quote",
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setPullQuote:
        () =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Pull quote…" }],
                },
              ],
            })
            .run(),
    };
  },
});

// ── Toggle block (details/summary style) ─────────────────────────────────────

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("open") !== null,
        renderHTML: (attrs) => (attrs.open ? { open: "" } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'details[data-type="toggle"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, {
        "data-type": "toggle",
        class: "aitim-toggle",
      }),
      ["summary", { class: "aitim-toggle__summary" }, "Toggle title"],
      ["div", { class: "aitim-toggle__body" }, 0],
    ];
  },
  addCommands() {
    return {
      setToggleBlock:
        () =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { open: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Hidden content…" }],
                },
              ],
            })
            .run(),
    };
  },
});

// ── Columns ──────────────────────────────────────────────────────────────────

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "column",
        class: "aitim-column",
      }),
      0,
    ];
  },
});

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "columns",
        class: "aitim-columns",
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setColumns:
        (count = 2) =>
        ({ chain }) => {
          const cols = Math.min(3, Math.max(2, count));
          const column = {
            type: "column",
            content: [{ type: "paragraph" }],
          };
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              content: Array.from({ length: cols }, () => column),
            })
            .run();
        },
    };
  },
});

// ── Action button ────────────────────────────────────────────────────────────

export const ActionButton = Node.create({
  name: "actionButton",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      label: {
        default: "Button",
        parseHTML: (el) => el.textContent || "Button",
      },
      href: {
        default: "https://",
        parseHTML: (el) => el.getAttribute("href") || "https://",
      },
    };
  },
  parseHTML() {
    return [{ tag: 'a[data-type="action-button"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-type": "action-button",
        class: "aitim-action-button",
        href: node.attrs.href,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
      node.attrs.label || "Button",
    ];
  },
  addCommands() {
    return {
      setActionButton:
        (attrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                label: attrs?.label ?? "Button",
                href: attrs?.href ?? "https://",
              },
            })
            .run(),
    };
  },
});

/** Build a simple TOC bullet list from current heading nodes in the doc. */
export function insertTableOfContents(editor: {
  state: { doc: { descendants: (fn: (node: { type: { name: string }; attrs: { level?: number }; textContent: string }) => void) => void } };
  chain: () => {
    focus: () => {
      deleteRange: (r: { from: number; to: number }) => {
        insertContent: (c: unknown) => { run: () => boolean };
      };
    };
  };
}, range: { from: number; to: number }) {
  const headings: { level: number; text: string }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      const text = node.textContent.trim();
      if (text) headings.push({ level: node.attrs.level ?? 1, text });
    }
  });

  const content =
    headings.length === 0
      ? [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Table of contents (add headings to populate)",
                marks: [{ type: "italic" }],
              },
            ],
          },
        ]
      : [
          {
            type: "bulletList",
            content: headings.map((h) => ({
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: `${"  ".repeat(Math.max(0, h.level - 1))}${h.text}`,
                    },
                  ],
                },
              ],
            })),
          },
        ];

  return editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(content)
    .run();
}
