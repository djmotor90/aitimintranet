"use client";

import "tippy.js/dist/tippy.css";

import type { AnyExtension, Editor } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  AtSign,
  Bold,
  BetweenHorizonalEnd,
  BetweenHorizonalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  CheckSquare,
  Code,
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
  Maximize2,
  Minimize2,
  Paperclip,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  docToPlainText,
  docToStored,
  isDocEmpty,
  storedToDoc,
  type StoredRichDoc,
} from "./doc-utils";
import { BlockDragGrip } from "./block-drag-grip";
import { BlockMove } from "./block-move-extension";
import {
  ActionButton,
  Badge,
  Banner,
  Column,
  Columns,
  HIGHLIGHT_COLORS,
  PullQuote,
  TEXT_COLORS,
  ToggleBlock,
  type BadgeVariant,
  type ColorName,
} from "./editor-extras";
import { FileAttachment } from "./file-attachment-extension";
import {
  createMentionExtension,
  type MentionUser,
} from "./mention-extension";
import { ResizableImage } from "./resizable-image-extension";
import { createSlashCommand } from "./slash-command";
import {
  collectFiles,
  isImageFile,
  uploadTaskFile,
} from "./upload-file";

/** Read-only image (no resize chrome). */
const StaticImage = ResizableImage.configure({
  inline: false,
  allowBase64: false,
  resizable: false,
  HTMLAttributes: {
    class: "aitim-editor-image",
  },
});

const EditableImage = ResizableImage.configure({
  inline: false,
  allowBase64: false,
  resizable: true,
  HTMLAttributes: {
    class: "aitim-editor-image",
  },
});

/** Table that can be dragged as a block + column resize. */
const DraggableTable = Table.extend({
  draggable: true,
}).configure({
  resizable: true,
  renderWrapper: true,
  HTMLAttributes: {
    class: "aitim-table",
  },
});

const StaticTable = Table.configure({
  resizable: false,
  renderWrapper: true,
  HTMLAttributes: {
    class: "aitim-table",
  },
});

const MENTION_HTML_CLASS =
  "mention rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary not-prose";

/** Read-only Mention node (no suggestion popup) for viewers. */
const MentionDisplay = Mention.configure({
  HTMLAttributes: { class: MENTION_HTML_CLASS },
  renderText({ node }) {
    return `@${node.attrs.label ?? node.attrs.id ?? ""}`;
  },
  renderHTML({ node, options }) {
    return [
      "span",
      {
        ...options.HTMLAttributes,
        "data-type": "mention",
        "data-id": node.attrs.id,
        "data-label": node.attrs.label,
      },
      `@${node.attrs.label ?? node.attrs.id ?? ""}`,
    ];
  },
});

type EditorVariant = "default" | "minimal" | "compact";

type RichTextEditorProps = {
  /** Initial value: TipTap doc, hybrid `{ text, doc }`, or legacy `{ text }`. */
  initialContent?: StoredRichDoc | JSONContent | string | null;
  placeholder?: string;
  editable?: boolean;
  /**
   * Visual density / chrome:
   * - `default` — full bordered card + top toolbar (forms)
   * - `minimal` — ClickUp description style (soft chrome, bubble on select)
   * - `compact` — comments (shorter, denser)
   */
  variant?: EditorVariant;
  /** @deprecated use variant="compact" */
  compact?: boolean;
  className?: string;
  editorClassName?: string;
  autoFocus?: boolean;
  onChange?: (payload: {
    text: string;
    doc: JSONContent;
    empty: boolean;
  }) => void;
  /** Hidden input name to submit JSON `{ text, doc }` in forms. */
  name?: string;
  /** Users available for @-mentions (list-access filtered). Enables @ suggestion. */
  mentionUsers?: MentionUser[];
  /** Show expand control for full-screen document writing. */
  expandable?: boolean;
  /** Title shown in the full-screen header. */
  expandTitle?: string;
  /**
   * Task id for uploading pasted/dropped images & files (stored as attachments
   * and embedded via `/api/attachments/:id`).
   */
  taskId?: string;
  /** Called after a file/image was uploaded (e.g. refresh attachments list). */
  onFilesUploaded?: () => void;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
  className,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => {
        // Keep selection in the editor
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-foreground/70 transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-accent-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}

function insertDefaultTable(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
}

function TableControls({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        title="Add column before"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        <BetweenVerticalStart className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Add column after"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <BetweenVerticalEnd className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <span className="text-[10px] font-semibold leading-none">Col−</span>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        title="Add row before"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        <BetweenHorizonalStart className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Add row after"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <BetweenHorizonalEnd className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete row"
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <span className="text-[10px] font-semibold leading-none">Row−</span>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        title="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </ToolbarButton>
    </div>
  );
}

const COLOR_KEYS = [
  "default",
  "red",
  "orange",
  "yellow",
  "blue",
  "purple",
  "pink",
  "green",
  "grey",
] as const satisfies readonly ColorName[];

const BADGE_KEYS: BadgeVariant[] = [
  "red",
  "orange",
  "yellow",
  "blue",
  "purple",
  "pink",
  "green",
  "grey",
];

function ColorSwatch({
  color,
  title,
  active,
  onClick,
}: {
  color: string | null;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "size-4 shrink-0 rounded-sm border border-border transition-transform hover:scale-110",
        active && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
      )}
      style={{
        background:
          color === null || color === "transparent"
            ? "var(--background)"
            : color,
      }}
    />
  );
}

/**
 * Floating toolbar on text selection — full formatting suite for
 * description and comments (marks, colors, highlights, badges, structure).
 */
function SelectionFormatToolbar({
  editor,
  hasMentions,
}: {
  editor: Editor;
  hasMentions: boolean;
}) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste a URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    let href = url.trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
      href = `https://${href}`;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const currentHighlight =
    (editor.getAttributes("highlight").color as string | undefined) ?? null;
  const currentBadge = (editor.getAttributes("badge").variant as string | undefined) ?? null;

  return (
    <div className="flex max-w-[min(92vw,28rem)] flex-col gap-1 p-0.5">
      {/* Marks */}
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolbarButton
          title="Bold (⌘B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (⌘I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (⌘U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <Link2 className="size-3.5" />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton
            title="Remove link"
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
          >
            <Unlink className="size-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton
          title="Clear formatting"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().unsetBadge().run()
          }
        >
          <RemoveFormatting className="size-3.5" />
        </ToolbarButton>
        {hasMentions && (
          <ToolbarButton
            title="Mention someone"
            onClick={() => {
              editor.chain().focus().insertContent("@").run();
            }}
          >
            <AtSign className="size-3.5" />
          </ToolbarButton>
        )}
      </div>

      {/* Structure */}
      <div className="flex flex-wrap items-center gap-0.5 border-t border-border/70 pt-1">
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 4"
          active={editor.isActive("heading", { level: 4 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 4 }).run()
          }
        >
          <Heading4 className="size-3.5" />
        </ToolbarButton>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <CheckSquare className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-3.5" />
        </ToolbarButton>
      </div>

      {/* Text color */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 px-0.5 pt-1">
        <Type className="size-3 shrink-0 text-muted-foreground" />
        <span className="mr-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Color
        </span>
        {COLOR_KEYS.map((key) => {
          const value = TEXT_COLORS[key];
          const active =
            key === "default"
              ? !currentColor
              : currentColor?.toLowerCase() === value?.toLowerCase();
          return (
            <ColorSwatch
              key={`c-${key}`}
              color={value}
              title={key === "default" ? "Default color" : `${key} text`}
              active={active}
              onClick={() => {
                if (!value) editor.chain().focus().unsetColor().run();
                else editor.chain().focus().setColor(value).run();
              }}
            />
          );
        })}
      </div>

      {/* Highlight */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 px-0.5 pt-1">
        <Highlighter className="size-3 shrink-0 text-muted-foreground" />
        <span className="mr-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Highlight
        </span>
        {COLOR_KEYS.map((key) => {
          const value = HIGHLIGHT_COLORS[key];
          const active =
            key === "default"
              ? !currentHighlight
              : currentHighlight?.toLowerCase() === value?.toLowerCase();
          return (
            <ColorSwatch
              key={`h-${key}`}
              color={value}
              title={
                key === "default" ? "Remove highlight" : `${key} highlight`
              }
              active={active}
              onClick={() => {
                if (!value) editor.chain().focus().unsetHighlight().run();
                else editor.chain().focus().setHighlight({ color: value }).run();
              }}
            />
          );
        })}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 px-0.5 pt-1">
        <span className="mr-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Badge
        </span>
        <button
          type="button"
          title="Remove badge"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().unsetBadge().run();
          }}
          className={cn(
            "rounded px-1 text-[9px] font-medium text-muted-foreground hover:bg-muted",
            !currentBadge && "ring-1 ring-primary",
          )}
        >
          None
        </button>
        {BADGE_KEYS.map((key) => {
          const active = currentBadge === key;
          return (
            <button
              key={`b-${key}`}
              type="button"
              title={`${key} badge — select text first`}
              onMouseDown={(e) => {
                e.preventDefault();
                // setBadge returns false if selection is empty
                const ok = editor.chain().focus().setBadge(key).run();
                if (!ok) {
                  // Expand to word if caret-only so badge still applies
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(editor.state.selection)
                    .setBadge(key)
                    .run();
                }
              }}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                "aitim-badge aitim-badge--" + key,
                "cursor-pointer",
                active && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
              )}
            >
              Aa
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Compact top toolbar for non-minimal editors (comments, full-screen). */
function FormatToolbar({
  editor,
  hasMentions,
  onInsertImage,
  onAttachFile,
  fileUploading,
}: {
  editor: Editor;
  hasMentions: boolean;
  onInsertImage?: () => void;
  onAttachFile?: () => void;
  fileUploading?: boolean;
}) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste a URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    let href = url.trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
      href = `https://${href}`;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        title="Bold (⌘B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Underline (⌘U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Link2 className="size-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        title="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="To-do list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Insert table"
        active={editor.isActive("table")}
        onClick={() => insertDefaultTable(editor)}
      >
        <Table2 className="size-3.5" />
      </ToolbarButton>
      {onInsertImage && (
        <ToolbarButton
          title={
            fileUploading ? "Uploading…" : "Insert image (or paste screenshot)"
          }
          disabled={fileUploading}
          onClick={onInsertImage}
        >
          <ImageIcon className="size-3.5" />
        </ToolbarButton>
      )}
      {onAttachFile && (
        <ToolbarButton
          title={fileUploading ? "Uploading…" : "Attach file"}
          disabled={fileUploading}
          onClick={onAttachFile}
        >
          <Paperclip className="size-3.5" />
        </ToolbarButton>
      )}
      {hasMentions && (
        <>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <ToolbarButton
            title="Mention someone"
            onClick={() => {
              editor.chain().focus().insertContent("@").run();
            }}
          >
            <AtSign className="size-3.5" />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

function createTableExtensions(editable: boolean): AnyExtension[] {
  return [
    editable ? DraggableTable : StaticTable,
    TableRow,
    TableHeader,
    TableCell,
  ];
}

/**
 * ClickUp-inspired TipTap editor: `/` slash commands, optional `@` mentions,
 * bubble format menu on selection, polished typography.
 */
export function RichTextEditor({
  initialContent,
  placeholder = "Write something… Type / for commands",
  editable = true,
  variant,
  compact = false,
  className,
  editorClassName,
  autoFocus,
  onChange,
  name,
  mentionUsers,
  expandable = false,
  expandTitle = "Description",
  taskId,
  onFilesUploaded,
}: RichTextEditorProps) {
  const resolvedVariant: EditorVariant =
    variant ?? (compact ? "compact" : "default");
  const isCompact = resolvedVariant === "compact";
  const isMinimal = resolvedVariant === "minimal";

  const [storedJson, setStoredJson] = useState(() =>
    name
      ? JSON.stringify(docToStored(storedToDoc(initialContent as StoredRichDoc)))
      : "",
  );
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const taskIdRef = useRef(taskId);
  const insertFilesRef = useRef<
    ((files: File[], ed: Editor) => Promise<void>) | null
  >(null);
  const onFilesUploadedRef = useRef(onFilesUploaded);
  onFilesUploadedRef.current = onFilesUploaded;
  // TipTap/ProseMirror must only mount on the client — keep a stable skeleton
  // for SSR + the first client paint to avoid hydration attribute mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  taskIdRef.current = taskId;

  // Lock page scroll + Esc to exit full screen
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let slash/@ menus handle Esc first (they stop propagation when open)
        e.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const hasMentions = Boolean(mentionUsers && mentionUsers.length > 0);
  const canUploadImages = Boolean(taskId && editable);

  // Stable callbacks for slash menu → file pickers
  const slashImageRef = useRef<() => void>(() => {});
  const slashFileRef = useRef<() => void>(() => {});
  slashImageRef.current = () => imageInputRef.current?.click();
  slashFileRef.current = () => fileInputRef.current?.click();

  const extensions = useMemo((): AnyExtension[] => {
    const slash = createSlashCommand({
      onInsertImage: canUploadImages
        ? () => slashImageRef.current()
        : undefined,
      onAttachFile: canUploadImages ? () => slashFileRef.current() : undefined,
    });

    const base: AnyExtension[] = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        dropcursor: {
          color: "var(--primary)",
          width: 2,
        },
        codeBlock: {
          HTMLAttributes: {
            class:
              "rounded-lg border border-border bg-muted/60 px-3.5 py-3 font-mono text-[13px] leading-relaxed",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class:
              "border-l-[3px] border-primary/35 pl-3.5 text-muted-foreground italic",
          },
        },
        horizontalRule: {
          HTMLAttributes: {
            class: "my-5 border-border",
          },
        },
        code: {
          HTMLAttributes: {
            class:
              "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground before:content-none after:content-none",
          },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Link.configure({
        openOnClick: !editable,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          class:
            "text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary",
          rel: "noopener noreferrer nofollow",
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: "not-prose list-none space-y-1.5 pl-0",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2.5",
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-empty",
      }),
      Badge,
      Banner,
      PullQuote,
      ToggleBlock,
      Column,
      Columns,
      ActionButton,
      EditableImage,
      FileAttachment,
      ...createTableExtensions(true),
      BlockMove,
      slash,
    ];
    if (mentionUsers && mentionUsers.length > 0) {
      base.push(createMentionExtension(mentionUsers));
    }
    return base;
    // mentionUsers / canUpload captured on mount; remount via key when needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMentions, placeholder, editable, canUploadImages]);

  /** Images → embed; other files → ClickUp-style chip. */
  const insertFiles = useCallback(
    async (files: File[], ed: Editor) => {
      if (!taskId || files.length === 0) return;
      setFileError(null);
      setFileUploading(true);
      try {
        for (const file of files) {
          const uploaded = await uploadTaskFile(taskId, file);
          if (isImageFile(file)) {
            ed.chain()
              .focus()
              .setImage({
                src: uploaded.url,
                alt: uploaded.fileName,
                title: uploaded.fileName,
              })
              .run();
          } else {
            ed.chain()
              .focus()
              .setFileAttachment({
                id: uploaded.id,
                href: uploaded.url,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
              })
              .run();
          }
        }
        onFilesUploadedRef.current?.();
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setFileUploading(false);
      }
    },
    [taskId],
  );
  insertFilesRef.current = insertFiles;

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      autofocus: autoFocus ? "end" : false,
      extensions,
      content: storedToDoc(initialContent as StoredRichDoc),
      editorProps: {
        attributes: {
          class: cn(
            "aitim-editor prose prose-sm dark:prose-invert max-w-none focus:outline-none",
            "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
            "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base",
            "prose-p:my-1.5 prose-p:leading-relaxed",
            "prose-headings:my-2.5",
            "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:leading-relaxed",
            "prose-strong:font-semibold prose-strong:text-foreground",
            // Left padding leaves room for the 6-dot drag handle
            isCompact
              ? "min-h-[4.5rem] pl-8 pr-3 py-2.5 text-sm"
              : isMinimal
                ? "min-h-[7rem] pl-8 pr-1 py-1 text-[15px] leading-relaxed"
                : "min-h-[8rem] pl-9 pr-3.5 py-3 text-sm",
            editorClassName,
          ),
          spellcheck: "true",
        },
        handleDOMEvents: {
          focus: () => {
            setFocused(true);
            return false;
          },
          blur: () => {
            setFocused(false);
            return false;
          },
        },
        handlePaste: (_view, event) => {
          if (!taskIdRef.current) return false;
          const files = collectFiles(event.clipboardData);
          if (files.length === 0) return false;
          event.preventDefault();
          const ed = editorRef.current;
          if (ed && insertFilesRef.current) {
            void insertFilesRef.current(files, ed);
          }
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          // Internal block drag (from the 6-dot handle) — let ProseMirror move it
          if (moved || view.dragging) return false;
          if (!taskIdRef.current) return false;
          const files = collectFiles(event.dataTransfer);
          if (files.length === 0) return false;
          // Don't steal drops that aren't file uploads
          if (!files.some((f) => f.size > 0)) return false;
          event.preventDefault();
          const ed = editorRef.current;
          if (ed && insertFilesRef.current) {
            void insertFilesRef.current(files, ed);
          }
          return true;
        },
        // Prefer plain text over messy Word/HTML paste; keep basic structure via TipTap defaults.
        transformPastedHTML(html) {
          return html
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<\/?o:p[^>]*>/gi, "")
            .replace(/\sstyle="[^"]*"/gi, "")
            .replace(/\sclass="[^"]*"/gi, "");
        },
      },
      onUpdate: ({ editor: ed }) => {
        const doc = ed.getJSON();
        // Include [Image] markers so image-only docs still have non-empty text.
        const text = docToPlainText(doc);
        if (name) setStoredJson(JSON.stringify(docToStored(doc)));
        onChange?.({ text, doc, empty: isDocEmpty(doc) });
      },
    },
    // Only construct the editor after mount (client).
    [mounted],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  if (!mounted || !editor) {
    return (
      <div
        className={cn(
          "animate-pulse rounded-xl border border-border bg-muted/30",
          isCompact ? "h-24" : "h-36",
          className,
        )}
        aria-hidden
      />
    );
  }

  // Full-screen mode always shows a full toolbar (document writing).
  // Permanent top bar: full-screen description only (not compact comments / inline description).
  // Comments still get the floating selection toolbar on text select.
  const showTopToolbar = editable && expanded;
  const showMinimalHint = editable && isMinimal && focused && !expanded;

  const expandToggle =
    expandable && editable ? (
      <ToolbarButton
        title={expanded ? "Exit full screen" : "Write full screen"}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <Minimize2 className="size-3.5" />
        ) : (
          <Maximize2 className="size-3.5" />
        )}
      </ToolbarButton>
    ) : null;

  const editorChrome = (
    <div
      className={cn(
        "group/editor relative flex flex-col transition-all duration-150",
        expanded
          ? "h-full min-h-0 border-0 bg-background shadow-none"
          : isMinimal
            ? cn(
                "rounded-lg border border-transparent bg-transparent",
                "hover:border-border/60 hover:bg-muted/20",
                focused &&
                  "border-primary/30 bg-card shadow-sm ring-2 ring-primary/10",
              )
            : cn(
                // overflow-visible so the left drag handle isn't clipped
                "overflow-visible rounded-xl border border-border bg-card shadow-sm",
                "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15",
              ),
        !editable && !expanded && "bg-muted/20",
        !expanded && className,
      )}
    >
      {expanded && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              {expandTitle}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Full-screen document mode ·{" "}
              <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                esc
              </kbd>{" "}
              to exit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded(false)}
            >
              <Minimize2 className="size-3.5" />
              Exit full screen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setExpanded(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {showTopToolbar && (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-muted/25 px-1.5 py-1",
            "supports-[backdrop-filter]:bg-muted/20 supports-[backdrop-filter]:backdrop-blur-sm",
            expanded && "px-4 sm:px-6",
          )}
        >
          <FormatToolbar
            editor={editor}
            hasMentions={hasMentions}
            fileUploading={fileUploading}
            onInsertImage={
              canUploadImages
                ? () => imageInputRef.current?.click()
                : undefined
            }
            onAttachFile={
              canUploadImages ? () => fileInputRef.current?.click() : undefined
            }
          />
          <div className="ml-auto flex items-center gap-1 pr-0.5">
            {expandToggle}
            <span className="hidden items-center gap-1.5 pl-1.5 text-[10px] text-muted-foreground sm:inline-flex">
              {hasMentions && (
                <>
                  <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                    @
                  </kbd>
                  <span>mention</span>
                  <span className="text-border">·</span>
                </>
              )}
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                /
              </kbd>
              <span>commands</span>
              {canUploadImages && (
                <>
                  <span className="text-border">·</span>
                  <span>drop files</span>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Minimal description: icon-only full-screen toggle */}
      {editable && isMinimal && !expanded && expandable && (
        <div className="absolute top-1.5 right-1.5 z-10 opacity-0 transition-opacity group-hover/editor:opacity-100 group-focus-within/editor:opacity-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-7 bg-card/95 p-0 shadow-sm backdrop-blur-sm"
            onClick={() => setExpanded(true)}
            title="Full screen"
            aria-label="Full screen"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      )}

      {canUploadImages && (
        <>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).filter((f) =>
                f.type.startsWith("image/"),
              );
              e.target.value = "";
              if (files.length && editor) void insertFiles(files, editor);
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length && editor) void insertFiles(files, editor);
            }}
          />
        </>
      )}

      {editable && (
        <>
          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 8,
              flip: true,
            }}
            shouldShow={({ editor: ed, state }) => {
              const { from, to } = state.selection;
              if (from === to) return false;
              // Dedicated menus for tables / media
              if (
                ed.isActive("table") ||
                ed.isActive("image") ||
                ed.isActive("fileAttachment")
              ) {
                return false;
              }
              return true;
            }}
            className={cn(
              "z-[210] max-w-[min(92vw,28rem)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "ring-1 ring-foreground/10",
            )}
          >
            <SelectionFormatToolbar
              editor={editor}
              hasMentions={hasMentions}
            />
          </BubbleMenu>

          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 10,
              flip: true,
            }}
            shouldShow={({ editor: ed }) => ed.isActive("table")}
            className={cn(
              "z-[210] flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "ring-1 ring-foreground/10",
            )}
          >
            <TableControls editor={editor} />
          </BubbleMenu>

          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 8,
              flip: true,
            }}
            shouldShow={({ editor: ed, state }) => {
              const { from, to } = state.selection;
              // Node-selected image or file chip
              return (
                ed.isActive("image") ||
                ed.isActive("fileAttachment") ||
                (from === to - 1 && ed.isActive("image"))
              );
            }}
            className={cn(
              "z-[210] flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "ring-1 ring-foreground/10",
            )}
          >
            <ToolbarButton
              title="Delete"
              onClick={() => {
                editor.chain().focus().deleteSelection().run();
              }}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </ToolbarButton>
          </BubbleMenu>
        </>
      )}

      <div
        className={cn(
          "relative",
          expanded
            ? "min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 md:px-[max(2.5rem,calc((100%-48rem)/2))]"
            : isMinimal
              ? "px-2.5 py-2"
              : undefined,
        )}
      >
        <div
          className={cn(
            expanded &&
              "mx-auto min-h-full max-w-3xl rounded-xl border border-border/60 bg-card px-6 py-8 shadow-sm sm:px-10 sm:py-10",
          )}
        >
          {editable && <BlockDragGrip editor={editor} enabled />}
          <EditorContent
            editor={editor}
            className={cn(
              expanded &&
                "[&_.ProseMirror]:min-h-[calc(100vh-14rem)] [&_.ProseMirror]:text-base [&_.ProseMirror]:leading-relaxed",
            )}
          />
        </div>
      </div>

      {showMinimalHint && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1 font-mono">
              /
            </kbd>
            blocks
          </span>
          {canUploadImages && (
            <span className="inline-flex items-center gap-1">
              paste / drop files
            </span>
          )}
          {expandable && (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="size-3" />
              full screen
            </span>
          )}
          {hasMentions && (
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted/50 px-1 font-mono">
                @
              </kbd>
              people
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            Select text for formatting
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1 font-mono">
              ⌥↑↓
            </kbd>
            move blocks
          </span>
        </div>
      )}

      {(fileUploading || fileError) && (
        <div
          className={cn(
            "border-t border-border/60 px-3 py-1.5 text-xs",
            fileError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {fileUploading ? "Uploading…" : fileError}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Stay in the form so task save still receives the description */}
      {name && <input type="hidden" name={name} value={storedJson} readOnly />}

      {expanded ? (
        <>
          <div
            className={cn(
              "flex min-h-[7rem] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground",
              className,
            )}
          >
            <span className="inline-flex items-center gap-2">
              <Maximize2 className="size-4" />
              Editing in full screen…
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setExpanded(false)}
              >
                Return
              </button>
            </span>
          </div>
          {createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col bg-background"
              role="dialog"
              aria-modal="true"
              aria-label={`${expandTitle} full screen editor`}
            >
              {editorChrome}
            </div>,
            document.body,
          )}
        </>
      ) : (
        editorChrome
      )}
    </>
  );
}

/** Read-only renderer for stored rich content (comments / activity). */
export function RichTextViewer({
  content,
  className,
}: {
  content: StoredRichDoc | JSONContent | string | null | undefined;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const plain =
    typeof content === "string"
      ? content
      : content && typeof content === "object" && "text" in content
        ? String((content as { text?: string }).text ?? "")
        : "";

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          code: {
            HTMLAttributes: {
              class:
                "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] before:content-none after:content-none",
            },
          },
        }),
        Underline,
        Link.configure({
          openOnClick: true,
          HTMLAttributes: {
            class:
              "text-primary underline decoration-primary/40 underline-offset-2",
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        Badge,
        Banner,
        PullQuote,
        ToggleBlock,
        Column,
        Columns,
        ActionButton,
        StaticImage,
        FileAttachment,
        ...createTableExtensions(false),
        MentionDisplay,
      ],
      content: storedToDoc(content as StoredRichDoc),
      editorProps: {
        attributes: {
          class: cn(
            "aitim-editor prose prose-sm dark:prose-invert max-w-none",
            "prose-p:my-1 prose-p:leading-relaxed",
            "prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1",
            className,
          ),
        },
      },
    },
    [mounted],
  );

  // Stable SSR + first paint: plain text only (no ProseMirror DOM).
  if (!mounted || !editor) {
    if (!plain) return null;
    return (
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", className)}>
        {plain}
      </p>
    );
  }
  return <EditorContent editor={editor} />;
}
