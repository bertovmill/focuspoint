"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NotionEditor } from "@/app/_components/notion-editor";

const AUTOSAVE_MS = 900;

/**
 * Berto's principles: a Notion-style page at the bottom of Home, under the
 * dashboard. One markdown document in app_settings (lib/principles.ts); Cael
 * reads and edits the same text through the principles_doc tool. Autosaves.
 */
export function PrinciplesDoc() {
  const [initial, setInitial] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/principles")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((row: { content: string; updated_at: string | null }) => {
        if (cancelled) return;
        setInitial(row.content);
        setSavedAt(row.updated_at ? new Date(row.updated_at) : null);
      })
      .catch(() => {
        if (cancelled) return;
        // Don't open an empty editor over principles we failed to load: the
        // first keystroke would autosave the blank page on top of them.
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (content: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/principles", {
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
  }, []);

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
      if (!navigator.sendBeacon?.("/api/principles", body)) save(content);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [save]);

  return (
    <section id="principles" className="mb-10">
      <div className="mb-3 flex items-baseline gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Principles</p>
        <span className="ml-auto text-xs text-muted-foreground">
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
          <NotionEditor
            initialContent={initial}
            onChange={handleChange}
            placeholder="Write a principle you want to live by. Type '/' for headings, lists, toggles…"
            className="min-h-[8rem]"
          />
        )}
      </div>
    </section>
  );
}
