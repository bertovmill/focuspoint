"use client";

import { MarkdownDoc } from "@/app/_components/markdown-doc";

/** Fired when something other than the editor rewrites the doc (a habit's time on the Today card). */
export const PRINCIPLES_CHANGED_EVENT = "cael:principles-changed";

/**
 * Berto's principles: a Notion-style page at the bottom of Home, under the
 * dashboard. One markdown document in app_settings (lib/principles.ts); Cael
 * reads and edits the same text through the principles_doc tool. Autosaves.
 */
export function PrinciplesDoc() {
  return (
    <MarkdownDoc
      id="principles"
      endpoint="/api/principles"
      reloadEvent={PRINCIPLES_CHANGED_EVENT}
      className="mb-10"
      heading={<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Principles</p>}
      placeholder="Write a principle you want to live by. Type '/' for headings, lists, toggles…"
    />
  );
}
