"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, DumbbellIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export interface WorkoutNote {
  logged_date: string;
  note: string;
}

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

function shortLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const AUTOSAVE_MS = 900;

const PLACEHOLDER =
  "What did you train, and what did you accomplish? e.g. Push day — bench 5×5 @185, added 10lb. First three unbroken sets of dips. 45 min.";

/**
 * The training log: one plain-text note per day, plus the recent history under it.
 *
 * Deliberately a plain `<textarea>` rather than the tiptap editor the daily journal
 * uses. A workout note is three lines typed with one hand on the way out of the gym —
 * a rich-text toolbar is friction there, and plain text is also exactly what Cael
 * reads back through `list_workout_notes`.
 *
 * Saves are debounced by `AUTOSAVE_MS` and flushed on unmount, on the day changing,
 * and on the tab closing (via `sendBeacon`, the only save that survives it).
 */
export function TrainingLog({ onSaved }: { onSaved?: () => void }) {
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<WorkoutNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // What is currently on the server for `date`, so an unchanged note never POSTs.
  const savedNote = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read by the flush-on-unmount effect, which must not re-run on every keystroke.
  const pending = useRef<{ date: string; note: string } | null>(null);

  // The card fetches its own history rather than taking it as a prop. The home
  // screen loads its data through one `Promise.all`, so a single unrelated route
  // failing in there would silently leave this list empty; owning the request keeps
  // the training log working regardless of what else on the page is broken.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workout-notes?limit=60")
      .then((r) => r.json())
      .then((rows: WorkoutNote[]) => {
        if (!cancelled && Array.isArray(rows)) setHistory(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (d: string, value: string) => {
      if (value === savedNote.current) return;
      savedNote.current = value;
      pending.current = null;
      await fetch("/api/workout-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, note: value }),
      });
      const trimmed = value.trim();
      setHistory((prev) => {
        const rest = prev.filter((h) => h.logged_date !== d);
        const next = trimmed ? [...rest, { logged_date: d, note: trimmed }] : rest;
        return next.sort((a, b) => b.logged_date.localeCompare(a.logged_date));
      });
      setSaved(true);
      onSaved?.();
    },
    [onSaved],
  );

  // Load the selected day. Flushing the previous day's pending edit happens in the
  // cleanup below, which runs before this effect re-runs for the new date.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/workout-notes?date=${date}`)
      .then((r) => r.json())
      .then((data: { note?: string }) => {
        if (cancelled) return;
        const value = data.note ?? "";
        savedNote.current = value;
        setNote(value);
        setSaved(false);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Flush an in-flight edit when the day changes or the card unmounts.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const p = pending.current;
      if (p) void save(p.date, p.note);
    };
  }, [save]);

  // The tab closing: only sendBeacon survives it, and only as a POST.
  useEffect(() => {
    const flush = () => {
      const p = pending.current;
      if (!p) return;
      navigator.sendBeacon(
        "/api/workout-notes",
        new Blob([JSON.stringify({ date: p.date, note: p.note })], { type: "application/json" }),
      );
      pending.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  function handleChange(value: string) {
    setNote(value);
    setSaved(false);
    pending.current = { date, note: value };
    if (timer.current) clearTimeout(timer.current);
    const d = date;
    timer.current = setTimeout(() => void save(d, value), AUTOSAVE_MS);
  }

  const isToday = date === todayISO();

  return (
    <Card className="rounded-xl px-5 py-4 shadow-none gap-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <DumbbellIcon className="size-4" />
          </span>
          <span className="text-sm font-medium truncate">{dayLabel(date)}</span>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckIcon className="size-3" />
              saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Previous day"
            onClick={() => setDate((d) => addDays(d, -1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Next day"
            disabled={isToday}
            onClick={() => setDate((d) => addDays(d, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          {!isToday && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-xs text-muted-foreground"
              onClick={() => setDate(todayISO())}
            >
              Today
            </Button>
          )}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={loading ? "" : PLACEHOLDER}
        spellCheck
        rows={3}
        className={cn(
          // 16px on purpose: typed on a phone, and under 16px iOS zooms on focus.
          "w-full resize-y bg-transparent text-base leading-7 outline-none",
          "placeholder:text-muted-foreground/50 placeholder:leading-relaxed",
          loading && "opacity-0",
        )}
      />

      {history.length > 0 && (
        <div className="mt-3 border-t pt-3 max-h-56 overflow-y-auto">
          {history.map((h) => (
            <button
              key={h.logged_date}
              type="button"
              onClick={() => setDate(h.logged_date)}
              className={cn(
                "w-full text-left flex gap-3 py-1.5 rounded-md px-1 -mx-1 hover:bg-accent/50 transition-colors",
                h.logged_date === date && "bg-accent/40",
              )}
            >
              <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 pt-0.5">
                {shortLabel(h.logged_date)}
              </span>
              <span className="text-sm text-foreground/80 truncate">
                {h.note.replace(/\s+/g, " ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
