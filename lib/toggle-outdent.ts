import { Fragment } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/** Containers whose children are free-standing blocks, one per line. */
const FLOW = new Set(["doc", "detailsContent", "blockquote"]);
const ITEMS = new Set(["listItem", "taskItem"]);

/**
 * Tab on a block right under a toggle: tucks it into that toggle's body, at the
 * end, and opens the toggle so it stays in sight (Notion's Tab). A list item
 * goes in alone, joining a list of its kind already at the end of the body.
 * Returns null when the block above isn't a toggle — and for any list item but
 * a list's first, so the list's own Tab nests it under the item above.
 */
export function indentIntoToggle(state: EditorState): Transaction | null {
  const { $from, $to } = state.selection;
  let itemDepth: number | null = null;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (ITEMS.has(node.type.name)) {
      if (itemDepth !== null || $from.index(depth - 1) > 0) return null;
      itemDepth = depth;
      continue;
    }
    if (!FLOW.has($from.node(depth - 1).type.name)) continue;

    const index = $from.index(depth - 1);
    const toggle = index > 0 ? $from.node(depth - 1).child(index - 1) : null;
    if (toggle?.type.name !== "details") return null;
    const togglePos = $from.before(depth) - toggle.nodeSize;

    // What moves: the block, or just the first item of a list (wrapped in a list of its own).
    const moved = itemDepth === null ? node : $from.node(itemDepth);
    const movedStart = $from.before(itemDepth ?? depth);
    const block = itemDepth === null ? node : node.copy(Fragment.from(moved));
    const removeWhole = itemDepth === null || node.childCount === 1;

    const { tr } = state;
    if (removeWhole) tr.delete($from.before(depth), $from.after(depth));
    else tr.delete(movedStart, $from.after(itemDepth!));

    // The toggle sits before what was removed, so its positions still hold.
    const body = toggle.child(1);
    const bodyEnd = togglePos + toggle.nodeSize - 2;
    const last = body.lastChild!;
    let newStart: number;
    if (body.childCount === 1 && last.type.name === "paragraph" && last.content.size === 0) {
      // An empty body is one blank line: put the block in its place.
      tr.replaceWith(bodyEnd - last.nodeSize, bodyEnd, block);
      newStart = bodyEnd - last.nodeSize + (itemDepth === null ? 0 : 1);
    } else if (itemDepth !== null && last.type === block.type) {
      tr.insert(bodyEnd - 1, moved);
      newStart = bodyEnd - 1;
    } else {
      tr.insert(bodyEnd, block);
      newStart = bodyEnd + (itemDepth === null ? 0 : 1);
    }
    tr.setNodeMarkup(togglePos, undefined, { ...toggle.attrs, open: true });

    // Keep the caret (or selection) where it was in the moved text.
    const from = newStart + ($from.pos - movedStart);
    const to = $to.pos <= movedStart + moved.nodeSize ? newStart + ($to.pos - movedStart) : from;
    return tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView();
  }
  return null;
}

/**
 * Shift+Tab on a block inside a toggle's body: steps it out to sit right after
 * that toggle as its sibling (otherwise it's stuck inside). Returns the
 * transaction, or null when the caret isn't in a toggle's body — and also when it
 * is inside a list item, so the list's own Shift+Tab outdents the item first.
 */
export function outdentFromToggle(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "listItem" || name === "taskItem") return null;
    if ($from.node(depth - 1).type.name !== "detailsContent") continue;

    const block = $from.node(depth);
    const from = $from.before(depth);
    const to = $from.after(depth);
    const afterToggle = $from.after(depth - 2);
    const { tr } = state;
    // A body can't be empty: if this was its only block, leave a blank line behind.
    if ($from.node(depth - 1).childCount === 1) tr.replaceWith(from, to, state.schema.nodes.paragraph.create());
    else tr.delete(from, to);
    const insertAt = tr.mapping.map(afterToggle);
    tr.insert(insertAt, block);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1))).scrollIntoView();
  }
  return null;
}
