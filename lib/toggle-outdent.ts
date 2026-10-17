import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

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
