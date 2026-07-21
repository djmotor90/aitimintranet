"use client";

import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

/**
 * ClickUp-like block reordering:
 * - Alt/Option + ↑ / ↓ moves the selected block (image, table, file chip, etc.)
 * Works when the node is selected (clicked) or when the cursor is inside a block
 * that can be lifted as a whole (tables, etc.).
 */
export const BlockMove = Extension.create({
  name: "blockMove",

  addKeyboardShortcuts() {
    return {
      "Alt-ArrowUp": () => moveSelectedBlock(this.editor, "up"),
      "Alt-ArrowDown": () => moveSelectedBlock(this.editor, "down"),
      "Mod-Alt-ArrowUp": () => moveSelectedBlock(this.editor, "up"),
      "Mod-Alt-ArrowDown": () => moveSelectedBlock(this.editor, "down"),
    };
  },
});

function moveSelectedBlock(editor: Editor, direction: "up" | "down"): boolean {
  const { state, view } = editor;
  const { selection, doc, tr } = state;

  // Prefer an explicit node selection (image / file / whole table selected)
  let from: number;
  let to: number;
  let nodeSize: number;

  if (selection instanceof NodeSelection) {
    from = selection.from;
    to = selection.to;
    nodeSize = selection.node.nodeSize;
  } else {
    // Cursor inside a block — move the top-level block under the doc
    const $from = selection.$from;
    if ($from.depth < 1) return false;
    // depth 1 = direct child of doc
    let depth = 1;
    // If deeper (e.g. inside table cell), try to find a movable atom/block at depth 1
    // Prefer moving the whole table when inside one
    for (let d = $from.depth; d >= 1; d--) {
      const n = $from.node(d);
      if (n.type.name === "table" || n.type.name === "fileAttachment" || n.type.name === "image") {
        depth = d;
        break;
      }
      if (d === 1) depth = 1;
    }
    from = $from.before(depth);
    const node = doc.nodeAt(from);
    if (!node) return false;
    // Don't move tiny empty paragraphs as "blocks" unless they're the only content nearby
    nodeSize = node.nodeSize;
    to = from + nodeSize;
  }

  if (direction === "up") {
    if (from === 0) return false;
    const $before = doc.resolve(from);
    const index = $before.index(0);
    if (index === 0) return false;
    const prev = doc.child(index - 1);
    const prevPos = from - prev.nodeSize;
    const slice = doc.slice(from, to);
    tr.delete(from, to);
    // After delete, positions before `from` are unchanged
    tr.insert(prevPos, slice.content);
    // Select the moved node at its new position
    const newPos = prevPos;
    tr.setSelection(NodeSelection.create(tr.doc, newPos));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // down
  const $after = doc.resolve(to);
  const index = $after.index(0);
  if (index >= doc.childCount) return false;
  // After our node is child at index-1? 
  // from is start of our node; our index among doc children:
  const ourIndex = doc.resolve(from).index(0);
  if (ourIndex >= doc.childCount - 1) return false;
  const next = doc.child(ourIndex + 1);
  const slice = doc.slice(from, to);
  // Delete first, then insert after where next ends (adjusted)
  tr.delete(from, to);
  // next started at `to`; after delete, next starts at `from`
  const insertAt = from + next.nodeSize;
  tr.insert(insertAt, slice.content);
  tr.setSelection(NodeSelection.create(tr.doc, insertAt));
  view.dispatch(tr.scrollIntoView());
  return true;
}
