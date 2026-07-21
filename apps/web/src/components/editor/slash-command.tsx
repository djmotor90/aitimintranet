"use client";

import { Extension, type Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import {
  AlignLeft,
  Bold,
  CheckSquare,
  ChevronsUpDown,
  Code2,
  Columns2,
  Eraser,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Minus,
  MousePointerClick,
  Paperclip,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Tag,
  TextCursorInput,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  type BadgeVariant,
  type ColorName,
  insertTableOfContents,
} from "./editor-extras";

export const slashPluginKey = new PluginKey("slashCommand");

export type SlashItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  searchTerms: string[];
  /** Optional color swatch for color/highlight/badge items */
  swatch?: string | null;
  command: (props: {
    editor: Editor;
    range: { from: number; to: number };
  }) => void;
};

export type SlashSection = {
  id: string;
  label: string;
  items: SlashItem[];
};

export type SlashCommandOptions = {
  onInsertImage?: () => void;
  onAttachFile?: () => void;
};

function del(
  editor: Editor,
  range: { from: number; to: number },
) {
  return editor.chain().focus().deleteRange(range);
}

function colorItem(
  name: ColorName,
  label: string,
): SlashItem {
  const value = TEXT_COLORS[name];
  return {
    title: label,
    description: name === "default" ? "Reset text color" : `${label} text`,
    icon: Type,
    swatch: value,
    searchTerms: ["color", "text", name, label.toLowerCase()],
    command: ({ editor, range }) => {
      const chain = del(editor, range);
      if (!value) chain.unsetColor().run();
      else chain.setColor(value).run();
    },
  };
}

function highlightItem(
  name: ColorName,
  label: string,
): SlashItem {
  const value = HIGHLIGHT_COLORS[name];
  return {
    title: label,
    description: name === "default" ? "Clear highlight" : label,
    icon: Highlighter,
    swatch: value ?? "transparent",
    searchTerms: ["highlight", "mark", "bg", name, label.toLowerCase()],
    command: ({ editor, range }) => {
      const chain = del(editor, range);
      if (!value) chain.unsetHighlight().run();
      else chain.setHighlight({ color: value }).run();
    },
  };
}

function badgeItem(variant: BadgeVariant | "remove", label: string): SlashItem {
  const isStrong = variant.startsWith("strong-");
  const base = variant === "remove" ? "grey" : variant.replace("strong-", "");
  const swatch =
    variant === "remove"
      ? null
      : isStrong
        ? TEXT_COLORS[base as ColorName]
        : HIGHLIGHT_COLORS[base as ColorName];
  return {
    title: label,
    description: variant === "remove" ? "Clear badge" : label,
    icon: Tag,
    swatch,
    searchTerms: ["badge", "label", "tag", variant, label.toLowerCase()],
    command: ({ editor, range }) => {
      const chain = del(editor, range);
      if (variant === "remove") chain.unsetBadge().run();
      else chain.setBadge(variant).run();
    },
  };
}

export function buildSlashSections(
  options: SlashCommandOptions = {},
): SlashSection[] {
  const sections: SlashSection[] = [
    {
      id: "text",
      label: "Text",
      items: [
        {
          title: "Normal text",
          description: "Plain paragraph",
          icon: TextCursorInput,
          searchTerms: ["p", "paragraph", "text", "normal"],
          command: ({ editor, range }) => {
            del(editor, range).setParagraph().run();
          },
        },
        {
          title: "Heading 1",
          description: "Large title",
          icon: Heading1,
          searchTerms: ["h1", "heading", "title"],
          command: ({ editor, range }) => {
            del(editor, range).setHeading({ level: 1 }).run();
          },
        },
        {
          title: "Heading 2",
          description: "Section title",
          icon: Heading2,
          searchTerms: ["h2", "heading", "subtitle"],
          command: ({ editor, range }) => {
            del(editor, range).setHeading({ level: 2 }).run();
          },
        },
        {
          title: "Heading 3",
          description: "Subsection",
          icon: Heading3,
          searchTerms: ["h3", "heading"],
          command: ({ editor, range }) => {
            del(editor, range).setHeading({ level: 3 }).run();
          },
        },
        {
          title: "Heading 4",
          description: "Small heading",
          icon: Heading4,
          searchTerms: ["h4", "heading"],
          command: ({ editor, range }) => {
            del(editor, range).setHeading({ level: 4 }).run();
          },
        },
        {
          title: "Checklist",
          description: "To-do checkboxes",
          icon: CheckSquare,
          searchTerms: ["todo", "task", "checkbox", "checklist"],
          command: ({ editor, range }) => {
            del(editor, range).toggleTaskList().run();
          },
        },
        {
          title: "Bulleted list",
          description: "Unordered list",
          icon: List,
          searchTerms: ["ul", "bullet", "unordered", "list"],
          command: ({ editor, range }) => {
            del(editor, range).toggleBulletList().run();
          },
        },
        {
          title: "Numbered list",
          description: "Ordered list",
          icon: ListOrdered,
          searchTerms: ["ol", "number", "ordered", "list"],
          command: ({ editor, range }) => {
            del(editor, range).toggleOrderedList().run();
          },
        },
        {
          title: "Toggle list",
          description: "Collapsible block",
          icon: ChevronsUpDown,
          searchTerms: ["toggle", "collapse", "details", "accordion"],
          command: ({ editor, range }) => {
            del(editor, range).setToggleBlock().run();
          },
        },
        {
          title: "Banner",
          description: "Callout box",
          icon: AlignLeft,
          searchTerms: ["banner", "callout", "alert", "info"],
          command: ({ editor, range }) => {
            del(editor, range).setBanner("info").run();
          },
        },
        {
          title: "Code block",
          description: "Code snippet",
          icon: Code2,
          searchTerms: ["code", "snippet", "pre"],
          command: ({ editor, range }) => {
            del(editor, range).toggleCodeBlock().run();
          },
        },
        {
          title: "Block quote",
          description: "Quotation",
          icon: Quote,
          searchTerms: ["quote", "blockquote", "citation"],
          command: ({ editor, range }) => {
            del(editor, range).toggleBlockquote().run();
          },
        },
        {
          title: "Pull quote",
          description: "Emphasized quote",
          icon: Quote,
          searchTerms: ["pull", "quote", "emphasis"],
          command: ({ editor, range }) => {
            del(editor, range).setPullQuote().run();
          },
        },
      ],
    },
    {
      id: "formatting",
      label: "Formatting",
      items: [
        {
          title: "Clear format",
          description: "Remove marks",
          icon: RemoveFormatting,
          searchTerms: ["clear", "format", "reset", "plain"],
          command: ({ editor, range }) => {
            del(editor, range).unsetAllMarks().clearNodes().run();
          },
        },
        {
          title: "Bold",
          description: "Strong text",
          icon: Bold,
          searchTerms: ["bold", "strong", "b"],
          command: ({ editor, range }) => {
            del(editor, range).toggleBold().run();
          },
        },
        {
          title: "Italic",
          description: "Emphasized text",
          icon: Italic,
          searchTerms: ["italic", "em", "i"],
          command: ({ editor, range }) => {
            del(editor, range).toggleItalic().run();
          },
        },
        {
          title: "Strikethrough",
          description: "Crossed out",
          icon: Strikethrough,
          searchTerms: ["strike", "strikethrough", "del"],
          command: ({ editor, range }) => {
            del(editor, range).toggleStrike().run();
          },
        },
        {
          title: "Inline code",
          description: "Code span",
          icon: Code2,
          searchTerms: ["code", "inline", "mono"],
          command: ({ editor, range }) => {
            del(editor, range).toggleCode().run();
          },
        },
        {
          title: "Website link",
          description: "Add a URL",
          icon: Link2,
          searchTerms: ["link", "url", "href", "website"],
          command: ({ editor, range }) => {
            del(editor, range).run();
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("URL", prev ?? "https://");
            if (url === null) return;
            if (!url.trim()) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            let href = url.trim();
            if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
              href = `https://${href}`;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
          },
        },
      ],
    },
    {
      id: "advanced",
      label: "Advanced Blocks",
      items: [
        {
          title: "Columns",
          description: "2-column layout",
          icon: Columns2,
          searchTerms: ["columns", "layout", "grid", "side"],
          command: ({ editor, range }) => {
            del(editor, range).setColumns(2).run();
          },
        },
        {
          title: "Divider",
          description: "Horizontal line",
          icon: Minus,
          searchTerms: ["hr", "divider", "line", "separator"],
          command: ({ editor, range }) => {
            del(editor, range).setHorizontalRule().run();
          },
        },
        {
          title: "Button",
          description: "Link button",
          icon: MousePointerClick,
          searchTerms: ["button", "cta", "link", "action"],
          command: ({ editor, range }) => {
            del(editor, range).run();
            const label = window.prompt("Button label", "Click me") ?? "Click me";
            const href = window.prompt("Button URL", "https://") ?? "https://";
            editor.chain().focus().setActionButton({ label, href }).run();
          },
        },
        {
          title: "Table of contents",
          description: "From headings",
          icon: ListTree,
          searchTerms: ["toc", "contents", "outline", "headings"],
          command: ({ editor, range }) => {
            insertTableOfContents(editor as never, range);
          },
        },
        {
          title: "Table",
          description: "3×3 with header",
          icon: Table2,
          searchTerms: ["table", "grid", "spreadsheet", "cells"],
          command: ({ editor, range }) => {
            del(editor, range)
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run();
          },
        },
        {
          title: "Template",
          description: "Starter outline",
          icon: FileText,
          searchTerms: ["template", "outline", "scaffold"],
          command: ({ editor, range }) => {
            del(editor, range)
              .insertContent([
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Overview" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Describe the goal…" }],
                },
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Next steps" }],
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "First task" }],
                        },
                      ],
                    },
                  ],
                },
              ])
              .run();
          },
        },
        {
          title: "Markdown",
          description: "Code for markdown",
          icon: FileText,
          searchTerms: ["markdown", "md", "code"],
          command: ({ editor, range }) => {
            del(editor, range)
              .insertContent({
                type: "codeBlock",
                content: [
                  {
                    type: "text",
                    text: "# Title\n\n- item one\n- item two\n",
                  },
                ],
              })
              .run();
          },
        },
        ...(options.onInsertImage
          ? [
              {
                title: "Image",
                description: "Upload or paste",
                icon: ImageIcon,
                searchTerms: ["image", "photo", "picture", "screenshot", "img"],
                command: ({ editor, range }: { editor: Editor; range: { from: number; to: number } }) => {
                  del(editor, range).run();
                  options.onInsertImage?.();
                },
              } satisfies SlashItem,
            ]
          : []),
        ...(options.onAttachFile
          ? [
              {
                title: "Attachment",
                description: "Attach a file",
                icon: Paperclip,
                searchTerms: ["file", "attach", "attachment", "upload", "pdf"],
                command: ({ editor, range }: { editor: Editor; range: { from: number; to: number } }) => {
                  del(editor, range).run();
                  options.onAttachFile?.();
                },
              } satisfies SlashItem,
            ]
          : []),
      ],
    },
    {
      id: "text-colors",
      label: "Text Colors",
      items: [
        colorItem("default", "Default"),
        colorItem("red", "Red"),
        colorItem("orange", "Orange"),
        colorItem("yellow", "Yellow"),
        colorItem("blue", "Blue"),
        colorItem("purple", "Purple"),
        colorItem("pink", "Pink"),
        colorItem("green", "Green"),
        colorItem("grey", "Grey"),
      ],
    },
    {
      id: "highlights",
      label: "Highlights",
      items: [
        highlightItem("default", "Remove highlight"),
        highlightItem("red", "Red highlight"),
        highlightItem("orange", "Orange highlight"),
        highlightItem("yellow", "Yellow highlight"),
        highlightItem("blue", "Blue highlight"),
        highlightItem("purple", "Purple highlight"),
        highlightItem("pink", "Pink highlight"),
        highlightItem("green", "Green highlight"),
        highlightItem("grey", "Grey highlight"),
      ],
    },
    {
      id: "badges",
      label: "Badges",
      items: [
        badgeItem("remove", "Remove badge"),
        badgeItem("strong-red", "Strong red badge"),
        badgeItem("strong-orange", "Strong orange badge"),
        badgeItem("strong-yellow", "Strong yellow badge"),
        badgeItem("strong-blue", "Strong blue badge"),
        badgeItem("strong-purple", "Strong purple badge"),
        badgeItem("strong-pink", "Strong pink badge"),
        badgeItem("strong-green", "Strong green badge"),
        badgeItem("strong-grey", "Strong grey badge"),
        badgeItem("red", "Red badge"),
        badgeItem("orange", "Orange badge"),
        badgeItem("yellow", "Yellow badge"),
        badgeItem("blue", "Blue badge"),
        badgeItem("purple", "Purple badge"),
        badgeItem("pink", "Pink badge"),
        badgeItem("green", "Green badge"),
        badgeItem("grey", "Grey badge"),
      ],
    },
  ];

  return sections;
}

export type SlashListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type FlatEntry = { section: string; item: SlashItem; flatIndex: number };

function flattenSections(
  sections: SlashSection[],
  query: string,
): { sections: SlashSection[]; flat: FlatEntry[] } {
  const q = query.toLowerCase().trim();
  const filtered: SlashSection[] = [];
  const flat: FlatEntry[] = [];
  let flatIndex = 0;

  for (const section of sections) {
    const items = !q
      ? section.items
      : section.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.searchTerms.some((t) => t.includes(q) || q.includes(t)) ||
            section.label.toLowerCase().includes(q),
        );
    if (items.length === 0) continue;
    filtered.push({ ...section, items });
    for (const item of items) {
      flat.push({ section: section.label, item, flatIndex });
      flatIndex += 1;
    }
  }
  return { sections: filtered, flat };
}

const COLS = 2;

const SlashCommandList = forwardRef<
  SlashListRef,
  {
    sections: SlashSection[];
    query: string;
    command: (item: SlashItem) => void;
  }
>(function SlashCommandList({ sections: allSections, query, command }, ref) {
  const { sections, flat } = flattenSections(allSections, query);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [query, allSections]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = Math.max(flat.length, 1);
      if (event.key === "ArrowLeft") {
        setSelected((i) => (i + n - 1) % n);
        return true;
      }
      if (event.key === "ArrowRight") {
        setSelected((i) => (i + 1) % n);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => {
          const next = i - COLS;
          return next >= 0 ? next : i;
        });
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((i) => {
          const next = i + COLS;
          return next < n ? next : i;
        });
        return true;
      }
      if (event.key === "Enter") {
        const entry = flat[selected];
        if (entry) command(entry.item);
        return true;
      }
      return false;
    },
  }));

  if (flat.length === 0) {
    return (
      <div className="z-[100] w-56 rounded-lg border border-border bg-popover px-2.5 py-2 text-xs text-muted-foreground shadow-xl ring-1 ring-foreground/10">
        No matching commands
      </div>
    );
  }

  let runningIndex = 0;

  return (
    <div className="z-[100] w-[18.5rem] overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
      <div className="max-h-[22rem] space-y-1.5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="px-1.5 pb-0.5 pt-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <div className="grid grid-cols-2 gap-0.5">
              {section.items.map((item) => {
                const index = runningIndex++;
                const Icon = item.icon;
                const active = index === selected;
                return (
                  <button
                    key={`${section.id}-${item.title}`}
                    type="button"
                    onClick={() => command(item)}
                    onMouseEnter={() => setSelected(index)}
                    className={cn(
                      "flex min-w-0 flex-col items-start gap-1 rounded-md px-1.5 py-1.5 text-left transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      {item.swatch !== undefined ? (
                        <span
                          className="size-3.5 shrink-0 rounded-sm border border-border"
                          style={{
                            background:
                              item.swatch === null || item.swatch === "transparent"
                                ? "var(--background)"
                                : item.swatch,
                          }}
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-background",
                            active && "border-primary/30 bg-primary/10 text-primary",
                          )}
                        >
                          <Icon className="size-2.5" />
                        </span>
                      )}
                      <span className="min-w-0 truncate text-[11px] font-medium leading-tight">
                        {item.title}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "w-full truncate pl-0 text-[9px] leading-snug",
                        active
                          ? "text-accent-foreground/65"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 border-t border-border px-1.5 py-1 text-[9px] text-muted-foreground">
        <kbd className="rounded border border-border bg-muted px-0.5 font-mono text-[9px] text-foreground">
          ↑↓←→
        </kbd>{" "}
        move{" "}
        <kbd className="ml-0.5 rounded border border-border bg-muted px-0.5 font-mono text-[9px] text-foreground">
          ↵
        </kbd>{" "}
        pick
      </div>
    </div>
  );
});

/** Create a slash-command extension; pass file pickers when taskId is available. */
export function createSlashCommand(options: SlashCommandOptions = {}) {
  const sections = buildSlashSections(options);

  const suggestionConfig: Omit<SuggestionOptions<SlashItem, SlashItem>, "editor"> = {
    pluginKey: slashPluginKey,
    char: "/",
    allowSpaces: false,
    allowedPrefixes: null,
    startOfLine: false,
    items: ({ query }) => {
      // items still used by suggestion for matching; list UI uses sections
      const { flat } = flattenSections(sections, query);
      return flat.map((f) => f.item);
    },
    command: ({ editor, range, props: item }) => {
      item.command({ editor, range });
    },
    render: () => {
      let component: ReactRenderer<SlashListRef> | null = null;
      let unmount: (() => void) | null = null;
      let lastQuery = "";

      return {
        onStart: (props) => {
          lastQuery = props.query;
          component = new ReactRenderer(SlashCommandList, {
            props: {
              sections,
              query: props.query,
              command: (item: SlashItem) => {
                props.command(item);
              },
            },
            editor: props.editor,
          });
          component.element.style.zIndex = "200";
          unmount = props.mount(component.element);
        },
        onUpdate: (props) => {
          lastQuery = props.query;
          component?.updateProps({
            sections,
            query: props.query,
            command: (item: SlashItem) => {
              props.command(item);
            },
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            return true;
          }
          return (
            component?.ref?.onKeyDown({
              event: props.event as KeyboardEvent,
            }) ?? false
          );
        },
        onExit: () => {
          unmount?.();
          unmount = null;
          component?.destroy();
          component = null;
          void lastQuery;
        },
      };
    },
  };

  return Extension.create({
    name: "slashCommand",
    addOptions() {
      return { suggestion: suggestionConfig };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

/** Default slash command (no file uploads). */
export const SlashCommand = createSlashCommand();
