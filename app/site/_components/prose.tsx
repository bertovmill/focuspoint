"use client";

import { Streamdown } from "streamdown";

/**
 * Long-form markdown for articles and episode notes.
 *
 * Uses the same renderer Cael's chat does, so a code block or table looks
 * identical whether you read it here or in the agent. Typography is set with
 * explicit child selectors rather than a typography plugin — the project
 * doesn't ship one, and this keeps the article on the same tokens as the app.
 */
export function Prose({ children }: { children: string }) {
  return (
    <div
      className={[
        "max-w-none text-[15px]/7 text-foreground/90",
        "[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
        "[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_p]:my-4",
        "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:no-underline",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-10 [&_hr]:border-border",
        "[&_img]:my-6 [&_img]:rounded-lg [&_img]:border [&_img]:border-border",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]",
      ].join(" ")}
    >
      <Streamdown>{children}</Streamdown>
    </div>
  );
}
