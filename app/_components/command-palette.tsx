"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRightIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface PaletteItem {
  /** Unique within the palette. Not matched against the query. */
  id: string;
  label: string;
  /** Small muted text on the right: a date, "Draft", a key hint. */
  hint?: string;
  icon?: ReactNode;
  /** Extra words the query may match (an org name, a slug, a synonym). */
  keywords?: string[];
  /** Opens in a new tab; shown with an arrow. */
  external?: boolean;
  onSelect: () => void;
}

export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
  /** Hidden until the user has typed something, so the idle view stays short. */
  whenTyping?: boolean;
  /** With an empty query, show at most this many (e.g. the five latest chats). */
  idleLimit?: number;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Replaces cmdk's fuzzy scorer, which matches letters in any order at any
 * distance — with hundreds of notes in the list that put a long paragraph above
 * the section or workout whose name was typed exactly. Here every word of the
 * query has to appear somewhere, and where it appears sets the rank: the start
 * of the label, a word in the label, anywhere in the label, then the keywords.
 */
function scoreItem(value: string, search: string, keywords?: string[]): number {
  const q = normalize(search).trim();
  if (!q) return 1;
  const label = normalize(value);
  if (label.startsWith(q)) return 1;
  const extra = keywords?.length ? normalize(keywords.join(" ")) : "";
  let total = 0;
  const words = q.split(/\s+/);
  for (const w of words) {
    if (label.startsWith(w)) total += 0.9;
    else if (label.includes(` ${w}`)) total += 0.7;
    else if (label.includes(w)) total += 0.5;
    else if (extra.includes(w)) total += 0.25;
    else return 0;
  }
  return total / words.length;
}

/**
 * The search box behind `/` and ⌘K: one input, grouped results, keyboard first.
 * It knows nothing about the app or the site — each hands it groups of items with
 * an onSelect — so both surfaces look and behave the same. Built on cmdk through
 * the shadcn Command primitives (components/ui/command.tsx); the dialog is placed
 * near the top like Raycast/Linear rather than centred, so results grow downward.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder,
  loading = false,
  title = "Search",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
  placeholder: string;
  /** The index is still on its way: the empty state says so instead of "nothing matches". */
  loading?: boolean;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  // Every opening starts blank, like Spotlight.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const typing = query.trim().length > 0;

  // cmdk keys items by their value and matches the query against it, so the value
  // has to be the label — and two notes with the same first line must not collapse
  // into one row. Repeats get an invisible " (2)" suffix in the value only.
  const seen = new Map<string, number>();
  const valueFor = (label: string) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} (${n})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "top-[10%] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[16%] sm:max-w-xl",
          "data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2",
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">Type to search, arrow keys to move, Enter to open.</DialogDescription>
        <Command
          loop
          filter={scoreItem}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4.5"
        >
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} className="h-12 text-base" />
          <CommandList className="max-h-[min(60vh,26rem)] py-1">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading…" : `Nothing matches “${query.trim()}”.`}
            </CommandEmpty>
            {groups.map((group) => {
              if (group.whenTyping && !typing) return null;
              const items = !typing && group.idleLimit ? group.items.slice(0, group.idleLimit) : group.items;
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={valueFor(item.label)}
                      keywords={item.keywords}
                      onSelect={() => {
                        onOpenChange(false);
                        item.onSelect();
                      }}
                      className="gap-3 rounded-md"
                    >
                      {item.icon ?? <span className="size-4.5 shrink-0" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {item.hint}
                        </span>
                      )}
                      {item.external && <ArrowUpRightIcon className="shrink-0 text-muted-foreground" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
          <div className="flex items-center gap-4 border-t px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <span><kbd className="font-sans">↑↓</kbd> move</span>
            <span><kbd className="font-sans">↵</kbd> open</span>
            <span><kbd className="font-sans">esc</kbd> close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
