"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export const Suggestions = ({ className, children, ...props }: SuggestionsProps) => (
  <div className={cn("flex flex-wrap justify-center gap-2", className)} {...props}>
    {children}
  </div>
);

export type SuggestionProps = Omit<HTMLAttributes<HTMLButtonElement>, "onSelect"> & {
  onSelect?: (text: string) => void;
  text: string;
};

export const Suggestion = ({ className, text, onSelect, children, ...props }: SuggestionProps) => (
  <button
    className={cn(
      "rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground",
      "transition-colors hover:bg-muted hover:text-foreground cursor-pointer",
    )}
    onClick={() => onSelect?.(text)}
    type="button"
    {...props}
  >
    {children ?? text}
  </button>
);
