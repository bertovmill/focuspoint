"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import {
  BoldIcon,
  ItalicIcon,
  Heading1Icon,
  Heading2Icon,
  ListIcon,
  ListOrderedIcon,
  ListChecksIcon,
  QuoteIcon,
  CodeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { todayISO } from "@/lib/nutrition";
// The daily target: 250 words of whatever is on his mind. Small on purpose — the
// point is to sit down and write every day, not to write a lot. Shared with the
// habit row's "Journal" check so the bar and the checkmark always agree.
import { JOURNAL_WORD_GOAL } from "@/lib/habits";
import { cn } from "@/lib/utils";

/** Shift a YYYY-MM-DD string by whole days without going through UTC. */
function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function dayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * tiptap-markdown hangs its serializer off `editor.storage.markdown` but doesn't
 * augment Tiptap's `Storage` type, so read it through one narrow cast here
 * instead of casting at every call site.
 */
function toMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

const AUTOSAVE_MS = 900;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function ToolbarButton({
  editor,
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  editor: Editor;
  label: string;
  icon: typeof BoldIcon;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={isActive}
      // Mousedown, not click: the editor must not lose the selection before the
      // command runs, or "bold" applies to nothing.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
        editor.commands.focus();
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        isActive && "bg-accent text-foreground",
      )}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

/**
 * The hand-written journal page for one day, sitting under the metrics on the
 * home page. A real WYSIWYG (Tiptap/ProseMirror) rather than a markdown box:
 * typing "# " makes a heading, "- " a bullet, "[] " a checkbox — but what gets
 * stored is still plain markdown, so Cael can read a day back as text.
 *
 * Saves itself. There is no save button on purpose — a journal you have to
 * remember to commit is a journal with half-written days in it.
 */
export function DailyJournal() {
  const [date, setDate] = useState(todayISO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [, forceRender] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The date the loaded document belongs to. Guards the autosave against writing
  // yesterday's text onto today when the day is switched mid-debounce.
  const loadedDate = useRef(date);

  const save = useCallback(async (forDate: string, content: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/daily-journal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: forDate, content }),
      });
      if (!res.ok) throw new Error("save failed");
      setSavedAt(new Date());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, []);

  const editor = useEditor({
    // Next renders this on the server first; let the editor mount on the client.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "What's on your mind? 250 words, no editing." }),
      Markdown.configure({ transformPastedText: true, breaks: true }),
    ],
    editorProps: {
      attributes: {
        class: "journal-prose focus:outline-none min-h-[12rem]",
      },
    },
    onUpdate({ editor }) {
      const forDate = loadedDate.current;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        save(forDate, toMarkdown(editor));
      }, AUTOSAVE_MS);
    },
    onSelectionUpdate: () => forceRender((n) => n + 1),
    onTransaction: () => forceRender((n) => n + 1),
  });

  // Load the day, and flush any pending edit for the day being left first.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (loadedDate.current !== date) {
        save(loadedDate.current, toMarkdown(editor));
      }
    }
    setLoading(true);
    fetch(`/api/daily-journal?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((row: { content: string; updated_at: string | null }) => {
        if (cancelled) return;
        loadedDate.current = date;
        // `false` = don't fire onUpdate; loading a day is not an edit to save back.
        editor.commands.setContent(row.content || "", { emitUpdate: false });
        setSavedAt(row.updated_at ? new Date(row.updated_at) : null);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `save` is stable; re-running on it would reload the day on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, date]);

  // Don't lose the last few keystrokes to a closed tab.
  useEffect(() => {
    const flush = () => {
      if (!editor || !timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      const body = JSON.stringify({
        date: loadedDate.current,
        content: toMarkdown(editor),
      });
      // sendBeacon survives the page teardown that would abort a fetch mid-flight.
      const sent = navigator.sendBeacon?.(
        "/api/daily-journal",
        new Blob([body], { type: "application/json" }),
      );
      if (!sent) save(loadedDate.current, toMarkdown(editor));
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [editor, save]);

  const isToday = date === todayISO();
  const words = editor && !loading ? countWords(editor.getText()) : 0;
  const goalMet = words >= JOURNAL_WORD_GOAL;
  const progress = Math.min(1, words / JOURNAL_WORD_GOAL);

  return (
    <div className="mb-6">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
        Daily journal
      </p>
      <Card className="rounded-xl px-5 py-4 shadow-none gap-0">
        <div className="flex items-center gap-1 border-b pb-2.5 mb-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Previous day"
            onClick={() => setDate((d) => addDays(d, -1))}
            className="text-muted-foreground"
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <span className="text-sm font-medium">{dayLabel(date)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Next day"
            disabled={isToday}
            onClick={() => setDate((d) => addDays(d, 1))}
            className="text-muted-foreground"
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
          {!isToday && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setDate(todayISO())}
            >
              Today
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            {editor && (
              <div className="hidden sm:flex items-center gap-0.5">
                <ToolbarButton
                  editor={editor}
                  label="Heading"
                  icon={Heading1Icon}
                  isActive={editor.isActive("heading", { level: 1 })}
                  onClick={() => editor.chain().toggleHeading({ level: 1 }).run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Subheading"
                  icon={Heading2Icon}
                  isActive={editor.isActive("heading", { level: 2 })}
                  onClick={() => editor.chain().toggleHeading({ level: 2 }).run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Bold"
                  icon={BoldIcon}
                  isActive={editor.isActive("bold")}
                  onClick={() => editor.chain().toggleBold().run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Italic"
                  icon={ItalicIcon}
                  isActive={editor.isActive("italic")}
                  onClick={() => editor.chain().toggleItalic().run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Bullet list"
                  icon={ListIcon}
                  isActive={editor.isActive("bulletList")}
                  onClick={() => editor.chain().toggleBulletList().run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Numbered list"
                  icon={ListOrderedIcon}
                  isActive={editor.isActive("orderedList")}
                  onClick={() => editor.chain().toggleOrderedList().run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Checklist"
                  icon={ListChecksIcon}
                  isActive={editor.isActive("taskList")}
                  onClick={() => editor.chain().toggleTaskList().run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Quote"
                  icon={QuoteIcon}
                  isActive={editor.isActive("blockquote")}
                  onClick={() => editor.chain().toggleBlockquote().run()}
                />
                <ToolbarButton
                  editor={editor}
                  label="Code"
                  icon={CodeIcon}
                  isActive={editor.isActive("codeBlock")}
                  onClick={() => editor.chain().toggleCodeBlock().run()}
                />
              </div>
            )}
            <span
              className="text-[11px] text-muted-foreground tabular-nums w-14 text-right"
              aria-live="polite"
            >
              {error ? (
                <span className="text-destructive">Not saved</span>
              ) : saving ? (
                "Saving…"
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1">
                  <CheckIcon className="size-3" /> Saved
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}

        {/* The 250-word target. A thin bar that fills as he types and a count next to
            it; at 250 the count turns green and gets a check. Nothing blocks past the
            goal — it's a floor, not a ceiling. */}
        <div
          className="mt-3 flex items-center gap-3 border-t pt-2.5"
          role="progressbar"
          aria-label="Words written today"
          aria-valuemin={0}
          aria-valuemax={JOURNAL_WORD_GOAL}
          aria-valuenow={Math.min(words, JOURNAL_WORD_GOAL)}
        >
          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                goalMet ? "bg-emerald-500" : "bg-foreground/60",
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs tabular-nums shrink-0",
              goalMet ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {goalMet && <CheckIcon className="size-3" />}
            {words} / {JOURNAL_WORD_GOAL} words
          </span>
        </div>
      </Card>
    </div>
  );
}
