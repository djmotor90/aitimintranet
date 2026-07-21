"use client";

import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { NodeSelection } from "@tiptap/pm/state";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type GripTarget = {
  pos: number;
  dom: HTMLElement;
};

type DragState = {
  from: number;
  nodeSize: number;
  insertPos: number;
};

/**
 * Resolve the top-level block under the pointer by scanning doc children and
 * their DOM rects. More reliable than posAtCoords for images, tables, node
 * views, empty paragraphs, and the left gutter.
 */
function findTopLevelBlock(
  view: EditorView,
  clientX: number,
  clientY: number,
): GripTarget | null {
  const root = view.dom;
  const editorRect = root.getBoundingClientRect();

  // Allow a little slack left of the content (gutter) and right edge
  if (
    clientY < editorRect.top - 4 ||
    clientY > editorRect.bottom + 4 ||
    clientX < editorRect.left - 40 ||
    clientX > editorRect.right + 8
  ) {
    return null;
  }

  const { doc } = view.state;
  let pos = 0;
  let best: GripTarget | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const dom = view.nodeDOM(pos);

    // nodeDOM can be Element, DocumentFragment, or text — normalize
    let el: HTMLElement | null = null;
    if (dom instanceof HTMLElement) {
      el = dom;
    } else if (dom && (dom as Node).parentElement) {
      el = (dom as Node).parentElement;
    }

    // TableView / image resize: prefer outer wrapper if present
    if (el) {
      const wrap =
        el.closest?.(".tableWrapper") ??
        el.closest?.(".aitim-image-resize") ??
        el.closest?.("[data-resize-container]") ??
        el.closest?.('[data-type="file-attachment"]');
      if (wrap instanceof HTMLElement && root.contains(wrap)) {
        // Only use wrapper if it's still a direct-ish descendant of the editor
        el = wrap;
      }
    }

    if (el) {
      const rect = el.getBoundingClientRect();
      // Vertical hit (with small padding for short lines)
      const top = rect.top - 3;
      const bottom = rect.bottom + 3;
      if (clientY >= top && clientY <= bottom) {
        // Prefer the block whose vertical center is closest to the cursor
        const mid = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(clientY - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = { pos, dom: el };
        }
      }
    }

    pos += child.nodeSize;
  }

  return best;
}

/**
 * ClickUp-style 6-dot grip. Works for every top-level block (text, heading,
 * list, image, table, file, code, quote). First mousedown starts the drag.
 */
export function BlockDragGrip({
  editor,
  enabled = true,
}: {
  editor: Editor | null;
  enabled?: boolean;
}) {
  const [target, setTarget] = useState<GripTarget | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [dropY, setDropY] = useState<number | null>(null);
  const [dropWidth, setDropWidth] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const dragRef = useRef<DragState | null>(null);

  const placeGrip = useCallback((dom: HTMLElement) => {
    const rect = dom.getBoundingClientRect();
    // Align to vertical center of first line-ish (top + small offset)
    setCoords({
      top: rect.top + window.scrollY + Math.min(6, Math.max(0, rect.height / 2 - 10)),
      left: Math.max(2, rect.left + window.scrollX - 22),
    });
  }, []);

  const endDrag = useCallback(() => {
    document.body.classList.remove("aitim-block-dragging");
    document.documentElement.classList.remove("aitim-block-dragging");
    setDragging(false);
    setDropY(null);
    setDropWidth(null);
    dragRef.current = null;
  }, []);

  const resolveInsertPos = useCallback(
    (view: EditorView, clientY: number): number | null => {
      const { doc } = view.state;
      let pos = 0;
      let insertAt = 0;

      for (let i = 0; i < doc.childCount; i++) {
        const child = doc.child(i);
        const dom = view.nodeDOM(pos);
        const el =
          dom instanceof HTMLElement
            ? dom
            : dom && (dom as Node).parentElement instanceof HTMLElement
              ? ((dom as Node).parentElement as HTMLElement)
              : null;

        if (el) {
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (clientY < mid) {
            return pos; // insert before this block
          }
          insertAt = pos + child.nodeSize; // after this block
        } else {
          insertAt = pos + child.nodeSize;
        }
        pos += child.nodeSize;
      }
      return insertAt;
    },
    [],
  );

  useEffect(() => {
    if (!editor || !enabled || editor.isDestroyed) return;
    const view = editor.view;
    // Listen on parent too so the left padding/gutter still updates the grip
    const root = view.dom;
    const host = root.parentElement ?? root;

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) return;
      if ((e.target as HTMLElement)?.closest?.(".aitim-block-grip")) return;

      const next = findTopLevelBlock(view, e.clientX, e.clientY);
      if (!next) {
        setTarget(null);
        setCoords(null);
        return;
      }
      setTarget((prev) =>
        prev?.pos === next.pos && prev.dom === next.dom ? prev : next,
      );
      placeGrip(next.dom);
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (dragRef.current) return;
      const rel = e.relatedTarget as HTMLElement | null;
      if (rel?.closest?.(".aitim-block-grip")) return;
      // Leaving host entirely
      if (rel && host.contains(rel)) return;
      setTarget(null);
      setCoords(null);
    };

    host.addEventListener("mousemove", onMouseMove);
    host.addEventListener("mouseleave", onMouseLeave);
    return () => {
      host.removeEventListener("mousemove", onMouseMove);
      host.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [editor, enabled, placeGrip]);

  // Keep grip aligned on scroll / resize / editor updates
  useEffect(() => {
    if (!target || !editor) return;
    const update = () => {
      // Re-resolve DOM in case node view remounted
      const dom = editor.view.nodeDOM(target.pos);
      const el =
        dom instanceof HTMLElement
          ? dom
          : target.dom.isConnected
            ? target.dom
            : null;
      if (el) placeGrip(el);
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    editor.on("update", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      editor.off("update", update);
    };
  }, [target, editor, placeGrip]);

  const onGripMouseDown = (e: React.MouseEvent) => {
    if (!editor || !target) return;
    e.preventDefault();
    e.stopPropagation();

    const { state, view } = editor;
    // Re-read node at pos in case doc changed
    const node = state.doc.nodeAt(target.pos);
    if (!node) return;

    // Select block on first press
    view.dispatch(
      state.tr.setSelection(NodeSelection.create(state.doc, target.pos)),
    );
    view.focus();

    dragRef.current = {
      from: target.pos,
      nodeSize: node.nodeSize,
      insertPos: target.pos,
    };
    setDragging(true);
    document.body.classList.add("aitim-block-dragging");
    document.documentElement.classList.add("aitim-block-dragging");

    const rect = target.dom.getBoundingClientRect();
    setDropWidth({
      left: rect.left + window.scrollX,
      width: rect.width,
    });

    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !editor) return;

      const insertPos = resolveInsertPos(editor.view, ev.clientY);
      if (insertPos == null) return;

      // No drop line when target is still "on" the dragged block
      if (insertPos > drag.from && insertPos < drag.from + drag.nodeSize) {
        setDropY(null);
        drag.insertPos = drag.from;
        return;
      }

      drag.insertPos = insertPos;
      try {
        const size = editor.view.state.doc.content.size;
        const safe = Math.max(0, Math.min(insertPos, size));
        const c = editor.view.coordsAtPos(safe);
        setDropY(c.top + window.scrollY);
      } catch {
        setDropY(null);
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      const drag = dragRef.current;
      if (!drag || !editor) {
        endDrag();
        return;
      }

      const { from, nodeSize, insertPos } = drag;
      const { state: st, view: vw } = editor;
      const moved = st.doc.nodeAt(from);
      if (!moved) {
        endDrag();
        return;
      }

      if (insertPos === from || insertPos === from + nodeSize) {
        endDrag();
        return;
      }

      let to = insertPos;
      if (to > from) to -= nodeSize;

      let tr = st.tr.delete(from, from + nodeSize);
      tr = tr.insert(to, moved);
      tr = tr.setSelection(NodeSelection.create(tr.doc, to));
      vw.dispatch(tr.scrollIntoView());
      vw.focus();
      endDrag();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!enabled || !editor || !target || !coords) return null;

  return createPortal(
    <>
      <div
        className={cn(
          "aitim-block-grip",
          dragging && "aitim-block-grip--dragging",
        )}
        style={{
          position: "absolute",
          top: coords.top,
          left: coords.left,
          zIndex: 80,
        }}
        onMouseDown={onGripMouseDown}
        onMouseEnter={() => {
          if (target?.dom?.isConnected) placeGrip(target.dom);
        }}
        title="Drag to move"
        role="button"
        aria-label="Drag to move block"
      >
        <GripVertical className="size-4" strokeWidth={2.25} />
      </div>

      {dragging && dropY != null && dropWidth && (
        <div
          className="aitim-block-drop-line"
          style={{
            position: "absolute",
            top: dropY - 1,
            left: dropWidth.left,
            width: dropWidth.width,
            zIndex: 90,
          }}
        />
      )}
    </>,
    document.body,
  );
}
