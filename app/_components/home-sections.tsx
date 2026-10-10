"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, MoreHorizontalIcon, PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownDoc } from "@/app/_components/markdown-doc";
import { cn } from "@/lib/utils";
import type { HomeSection } from "@/lib/home-sections";

/** "5-year review" → "5-year-review", for the section's /#anchor. */
function sectionSlug(s: Pick<HomeSection, "id" | "title">): string {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `section-${s.id}`;
}

/**
 * Berto's own sections at the top of Home — "5-year review", "5-year plan",
 * whatever he adds. Each is a titled Notion-style page (MarkdownDoc) stored in
 * home_sections (lib/home-sections.ts); the title renames inline, the ⋯ menu
 * reorders and deletes. Anchored by title, e.g. /#5-year-review.
 */
export function HomeSections() {
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  /** The section just added, whose title should open focused. */
  const [fresh, setFresh] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/home-sections")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setSections)
      .catch(() => setSections([]));
  }, []);

  async function add() {
    setAdding(true);
    const res = await fetch("/api/home-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    }).finally(() => setAdding(false));
    if (!res.ok) return toast.error("Couldn't add a section");
    const section: HomeSection = await res.json();
    setSections((s) => [...(s ?? []), section]);
    setFresh(section.id);
  }

  async function rename(id: number, title: string) {
    const res = await fetch(`/api/home-sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return toast.error("Couldn't rename the section");
    setSections((s) => s?.map((x) => (x.id === id ? { ...x, title } : x)) ?? null);
  }

  async function move(id: number, direction: "up" | "down") {
    const res = await fetch(`/api/home-sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: direction }),
    });
    if (!res.ok) return toast.error("Couldn't move the section");
    setSections(await res.json());
  }

  async function remove(section: HomeSection) {
    if (!window.confirm(`Delete "${section.title}"? Its text goes with it.`)) return;
    const res = await fetch(`/api/home-sections/${section.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete the section");
    setSections((s) => s?.filter((x) => x.id !== section.id) ?? null);
  }

  if (sections === null) return null;

  return (
    <div className="mb-10">
      {sections.map((section, i) => (
        <MarkdownDoc
          key={section.id}
          id={sectionSlug(section)}
          endpoint={`/api/home-sections/${section.id}`}
          className="mb-10"
          placeholder="Start writing. Type '/' for headings, lists, toggles…"
          heading={
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <SectionTitle
                title={section.title}
                autoFocus={fresh === section.id}
                onRename={(title) => rename(section.id, title)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="Section options">
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem disabled={i === 0} onSelect={() => move(section.id, "up")}>
                    <ArrowUpIcon /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === sections.length - 1} onSelect={() => move(section.id, "down")}>
                    <ArrowDownIcon /> Move down
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => remove(section)}>
                    <TrashIcon /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      ))}
      <Button variant="ghost" size="sm" onClick={add} disabled={adding} className="-ml-2 text-muted-foreground">
        <PlusIcon /> Add section
      </Button>
    </div>
  );
}

/** The section's heading, editable in place: saves on Enter or blur, Escape reverts. */
function SectionTitle({ title, autoFocus, onRename }: { title: string; autoFocus: boolean; onRename: (t: string) => void }) {
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    if (autoFocus) ref.current?.select();
  }, [autoFocus]);

  const commit = useCallback(() => {
    const next = value.trim();
    if (!next) return setValue(title);
    if (next !== title) onRename(next);
  }, [value, title, onRename]);

  // The input sizes to its text through an invisible twin in the same grid cell
  // (field-sizing isn't in Safari, which the iOS shell runs on).
  const text = "min-w-0 bg-transparent text-xs font-medium uppercase tracking-widest";
  return (
    <span className="inline-grid min-w-0 max-w-full">
      <span aria-hidden className={cn(text, "invisible col-start-1 row-start-1 whitespace-pre pr-1")}>{value || " "}</span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(title);
            requestAnimationFrame(() => ref.current?.blur());
          }
        }}
        aria-label="Section title"
        className={cn(text, "col-start-1 row-start-1 w-full text-muted-foreground outline-none focus:text-foreground")}
      />
    </span>
  );
}
