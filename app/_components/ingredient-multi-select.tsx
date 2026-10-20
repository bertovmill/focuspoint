"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Ingredients as a multi-select: pick from every ingredient already used across
 * the meal bank, or type a new one and add it. Changes save as soon as an item
 * is toggled, so the grocery list is always current.
 */
export function IngredientMultiSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = new Set(value.map((v) => v.toLowerCase()));
  const q = query.trim();
  const isNew = q.length > 0 && !options.some((o) => o.toLowerCase() === q.toLowerCase()) && !chosen.has(q.toLowerCase());

  const toggle = (item: string) => {
    const k = item.toLowerCase();
    onChange(chosen.has(k) ? value.filter((v) => v.toLowerCase() !== k) : [...value, item]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50"
          aria-label="Edit ingredients"
        >
          {value.length === 0 ? (
            <span className="text-xs text-muted-foreground/70">Add ingredients…</span>
          ) : (
            value.map((v) => (
              <span key={v} className="rounded-full bg-muted px-2 py-0.5 text-[11px] leading-4 text-foreground/80">
                {v}
              </span>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search or add…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No match — type to add it.</CommandEmpty>
            {isNew && (
              <CommandGroup>
                <CommandItem
                  value={`__add__${q}`}
                  onSelect={() => {
                    onChange([...value, q]);
                    setQuery("");
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  Add “{q}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {/* Picked ones first, then the rest of the shared list. */}
              {[...value, ...options.filter((o) => !chosen.has(o.toLowerCase()))].map((item) => {
                const on = chosen.has(item.toLowerCase());
                return (
                  <CommandItem key={item} value={item} onSelect={() => toggle(item)}>
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/40",
                      )}
                    >
                      {on && <CheckIcon className="size-3" />}
                    </span>
                    {item}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
