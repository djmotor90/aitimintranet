"use client";

import { mergeAttributes, Node, nodeInputRule, ResizableNodeView } from "@tiptap/core";

export type ResizableImageOptions = {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
  /** When false, no resize handles (viewer). */
  resizable: boolean;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: number;
        height?: number;
      }) => ReturnType;
    };
  }
}

const inputRegex =
  /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

/**
 * Block image with reliable click-to-select + corner resize.
 *
 * TipTap's stock Image node view starts with pointer-events:none and only
 * clears it on `img.onload` — cached images never fire onload, so they stay
 * unselectable. We always restore pointer events after mount.
 */
export const ResizableImage = Node.create<ResizableImageOptions>({
  name: "image",

  addOptions() {
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
      resizable: true,
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? "inline" : "block";
  },

  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = (el as HTMLElement).getAttribute("width")
            ?? (el as HTMLElement).style.width;
          if (!w) return null;
          const n = parseInt(String(w), 10);
          return Number.isFinite(n) ? n : null;
        },
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = (el as HTMLElement).getAttribute("height")
            ?? (el as HTMLElement).style.height;
          if (!h) return null;
          const n = parseInt(String(h), 10);
          return Number.isFinite(n) ? n : null;
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: this.options.allowBase64
          ? "img[src]"
          : 'img[src]:not([src^="data:"])',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: options,
          }),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match;
          return { src, alt, title };
        },
      }),
    ];
  },

  addNodeView() {
    if (!this.options.resizable || typeof document === "undefined") {
      return null;
    }

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const el = document.createElement("img");
      el.draggable = false;
      el.classList.add("aitim-editor-image");

      const merged = mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
      ) as Record<string, unknown>;

      Object.entries(merged).forEach(([key, value]) => {
        if (value == null) return;
        if (key === "width" || key === "height") return;
        el.setAttribute(key, String(value));
      });

      if (merged.src != null) {
        el.src = String(merged.src);
      }

      /** Keep outer selection box the same size as the image (not full editor width). */
      const syncFrame = (width?: number | null, height?: number | null) => {
        const w =
          width ??
          (el.style.width ? parseInt(el.style.width, 10) : el.offsetWidth);
        const h =
          height ??
          (el.style.height ? parseInt(el.style.height, 10) : el.offsetHeight);
        if (!w || !h) return;

        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.maxWidth = "100%";

        const wrap = el.parentElement as HTMLElement | null;
        if (wrap) {
          wrap.style.width = `${w}px`;
          wrap.style.height = `${h}px`;
          wrap.style.maxWidth = "100%";
        }
        const container = wrap?.parentElement as HTMLElement | null;
        if (container) {
          // Shrink-wrap so ProseMirror-selectednode outline hugs the image
          container.style.width = `${w}px`;
          container.style.maxWidth = "100%";
          container.style.height = "auto";
        }
      };

      const reveal = (container: HTMLElement) => {
        container.style.visibility = "";
        container.style.pointerEvents = "";
        const attrW = node.attrs.width as number | null;
        const attrH = node.attrs.height as number | null;
        if (attrW && attrH) {
          syncFrame(attrW, attrH);
        } else if (el.naturalWidth > 0) {
          // Fit to natural size (capped by parent) so frame starts correct
          const maxW = container.parentElement?.clientWidth || el.naturalWidth;
          const scale = Math.min(1, maxW / el.naturalWidth);
          syncFrame(
            Math.round(el.naturalWidth * scale),
            Math.round(el.naturalHeight * scale),
          );
        } else {
          syncFrame();
        }
      };

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos: getPos as () => number | undefined,
        onResize: (width, height) => {
          syncFrame(width, height);
        },
        onCommit: (width, height) => {
          syncFrame(width, height);
          const pos = getPos();
          if (pos === undefined) return;
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, { width, height })
            .run();
        },
        onUpdate: (updatedNode) => {
          if (updatedNode.type !== this.type) return false;
          const src = updatedNode.attrs.src as string | null;
          if (src && el.getAttribute("src") !== src) {
            el.src = src;
          }
          if (updatedNode.attrs.alt != null) {
            el.alt = String(updatedNode.attrs.alt);
          }
          const w = updatedNode.attrs.width as number | null;
          const h = updatedNode.attrs.height as number | null;
          if (w && h) syncFrame(w, h);
          return true;
        },
        options: {
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          min: { width: 48, height: 48 },
          max: { width: 2400, height: 2400 },
          preserveAspectRatio: true,
          className: {
            container: "aitim-image-resize",
            wrapper: "aitim-image-resize__wrap",
            handle: "aitim-image-resize__handle",
            resizing: "aitim-image-resize--active",
          },
        },
      });

      const dom = nodeView.dom as HTMLElement;
      // Avoid FOUC, but NEVER leave pointer-events stuck off (cached images).
      dom.style.visibility = "hidden";

      const done = () => reveal(dom);

      if (el.complete && el.naturalWidth > 0) {
        requestAnimationFrame(done);
      } else {
        el.addEventListener("load", done, { once: true });
        el.addEventListener("error", done, { once: true });
        window.setTimeout(done, 1500);
      }

      // Click on image selects the node so handles appear
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const pos = getPos();
        if (pos === undefined) return;
        editor.chain().focus().setNodeSelection(pos).run();
      });

      return nodeView;
    };
  },
});
