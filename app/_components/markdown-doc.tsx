"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NotionEditor } from "@/app/_components/notion-editor";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 900;

/**
 * A Notion-style page backed by one markdown document: loads it from
 * `endpoint` (GET → { content, updated_at }), autosaves the whole text with
 * PUT { content }, and flushes the last keystrokes with sendBeacon (POST) on
 * unload. Principles on Home and Notes on Meals are both one of these.
 */
export function MarkdownDoc({
  id,
  endpoint,
  heading,
  placeholder,
  className,
  reloadEvent,
}: {
  /** Section anchor, e.g. "principles" → /#principles. */
  id: string;
  endpoint: string;
  heading: ReactNode;
  placeholder: string;
  className?: string;
  /** A window event meaning the doc changed elsewhere; reload it if nothing's unsaved. */
  reloadEvent?: string;
}) {
  const [initial, setInitial] = useState<string | null>(null);
  /** Bumped to remount the editor on a reload — it only reads its content once. */
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((row: { content: string; updated_at: string | null }) => {
        if (cancelled) return;
        setInitial(row.content);
        setSavedAt(row.updated_at ? new Date(row.updated_at) : null);
      })
      .catch(() => {
        if (cancelled) return;
        // Don't open an empty editor over a doc we failed to load: the first
        // keystroke would autosave the blank page on top of it.
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    if (!reloadEvent) return;
    const reload = () => {
      // Unsaved keystrokes win; they'd be lost under a remount.
      if (pending.current !== null) return;
      fetch(endpoint)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        .then((row: { content: string; updated_at: string | null }) => {
          if (pending.current !== null) return;
          setInitial(row.content);
          setSavedAt(row.updated_at ? new Date(row.updated_at) : null);
          setVersion((v) => v + 1);
        })
        .catch(() => {});
    };
    window.addEventListener(reloadEvent, reload);
    return () => window.removeEventListener(reloadEvent, reload);
  }, [endpoint, reloadEvent]);

  const save = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error();
        setSavedAt(new Date());
        setError(false);
      } catch {
        setError(true);
      } finally {
        setSaving(false);
      }
    },
    [endpoint],
  );

  const handleChange = useCallback(
    (markdown: string) => {
      pending.current = markdown;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        pending.current = null;
        save(markdown);
      }, AUTOSAVE_MS);
    },
    [save],
  );

  // Don't lose the last keystrokes to a closed tab or a section switch.
  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const content = pending.current;
      pending.current = null;
      if (content === null) return;
      const body = new Blob([JSON.stringify({ content })], { type: "application/json" });
      if (!navigator.sendBeacon?.(endpoint, body)) save(content);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [endpoint, save]);

  return (
    <section id={id} className={cn("scroll-mt-4", className)}>
      <div className="mb-3 flex items-baseline gap-3">
        {heading}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{initial === null ? "Couldn't load" : "Not saved"}</span>
          ) : saving ? (
            "Saving…"
          ) : savedAt ? (
            `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          ) : null}
        </span>
      </div>
      <div className="max-w-3xl">
        {initial === null ? (
          error ? null : <Skeleton className="h-28 w-full" />
        ) : (
          <NotionEditor key={version} initialContent={initial} onChange={handleChange} placeholder={placeholder} className="min-h-[8rem]" />
        )}
      </div>
    </section>
  );
}
