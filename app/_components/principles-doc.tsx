"use client";

import { MarkdownDoc } from "@/app/_components/markdown-doc";

/** Fired when something other than the editor rewrites the doc (a habit's time on the Today card). */
export const PRINCIPLES_CHANGED_EVENT = "cael:principles-changed";

/**
 * Berto's principles: a Notion-style page among Home's blocks, as tall as its
 * text (no inner scroll). One markdown document in app_settings (lib/principles.ts); Cael
 * reads and edits the same text through the principles_doc tool. Autosaves.
 */
export function PrinciplesDoc() {
  return (
    <MarkdownDoc
      id="principles"
      endpoint="/api/principles"
      reloadEvent={PRINCIPLES_CHANGED_EVENT}
      className="mb-10 pt-4"
      // A page title rather than the small caps label the other blocks use, so his
      // principles stand out on Home (2026-10-26).
      heading={<h2 className="text-3xl font-semibold tracking-tight">Principles</h2>}
      placeholder="Write a principle you want to live by. Type '/' for headings, lists, toggles…"
    />
  );
}
