"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

/**
 * Long-form markdown for articles and episode notes.
 *
 * Uses the same renderer Cael's chat does, so a code block or table looks
 * identical whether you read it here or in the agent. Typography is set with
 * explicit child selectors rather than a typography plugin — the project
 * doesn't ship one, and this keeps the article on the same tokens as the app.
 */
export function Prose({
  children,
  className,
  variant = "default",
}: {
  children: string;
  className?: string;
  /** `article` is the Writing section's serif reading type (needs its layout's fonts). */
  variant?: "default" | "article";
}) {
  return (
    <div
      className={cn(variant === "article" ? ARTICLE : DEFAULT, className)}
    >
      <Streamdown>{children}</Streamdown>
    </div>
  );
}

const DEFAULT = [
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
].join(" ");

/*
 * Long reads: a big serif at a comfortable measure, a drop cap on the opening
 * paragraph, and pull-quote blockquotes, so an essay reads like one.
 */
const ARTICLE = [
  "max-w-none font-serif text-[1.25rem]/[1.75] text-foreground/90 sm:text-[1.35rem]/[1.75]",
  "[&>div>p:first-child]:first-letter:float-left [&>div>p:first-child]:first-letter:mr-3 [&>div>p:first-child]:first-letter:mt-1.5 [&>div>p:first-child]:first-letter:font-display [&>div>p:first-child]:first-letter:text-[5.6rem] [&>div>p:first-child]:first-letter:leading-[0.78] [&>div>p:first-child]:first-letter:font-semibold [&>div>p:first-child]:first-letter:text-primary",
  "[&_h2]:mt-16 [&_h2]:mb-5 [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-foreground sm:[&_h2]:text-4xl",
  "[&_h3]:mt-10 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:font-display [&_h3]:text-2xl [&_h3]:font-medium [&_h3]:text-foreground",
  "[&_p]:my-6",
  "[&_ul]:my-6 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:my-6 [&_ol]:list-decimal [&_ol]:pl-7 [&_li]:my-2 [&_li]:marker:text-primary",
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-2 [&_a]:underline-offset-4 hover:[&_a]:bg-[var(--tint-1)]",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_blockquote]:my-12 [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-6 [&_blockquote]:font-display [&_blockquote]:text-[1.6rem] [&_blockquote]:leading-snug [&_blockquote]:italic [&_blockquote]:text-foreground sm:[&_blockquote]:-ml-8 sm:[&_blockquote]:text-3xl",
  "[&_hr]:my-14 [&_hr]:border-0 [&_hr]:text-center [&_hr]:after:font-display [&_hr]:after:text-2xl [&_hr]:after:tracking-[1em] [&_hr]:after:text-primary [&_hr]:after:content-['✳✳✳']",
  "[&_img]:my-10 [&_img]:rounded-2xl",
  "[&_pre]:font-mono [&_pre]:text-sm",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.8em]",
].join(" ");
