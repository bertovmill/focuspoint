"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenIcon, CheckIcon, NotebookPenIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { HABITS, type HabitKey, type HabitsToday } from "@/lib/habits";
import { cn } from "@/lib/utils";

/**
 * Second row on the scorecard: the three core habits (read, meditate, journal) as a
 * plain checklist — no points, just done/not done. Berto's ask (2026-09-03): "a
 * second row for core habits"; fast-til-noon came off on 2026-09-05. Read and
 * journal are derived from data already logged elsewhere; meditate is tapped here.
 */

const ICONS: Record<HabitKey, typeof BookOpenIcon> = {
  read: BookOpenIcon,
  meditate: SparklesIcon,
  journal: NotebookPenIcon,
};

export function HabitRow() {
  const [habits, setHabits] = useState<HabitsToday | null>(null);
  const [pending, setPending] = useState<HabitKey | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/habits");
      if (res.ok) setHabits(await res.json());
    } catch {
      // A dead habits fetch shouldn't take the rings with it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("scorecard:refresh", refresh);
    return () => window.removeEventListener("scorecard:refresh", refresh);
  }, [load]);

  const toggle = useCallback(
    async (def: (typeof HABITS)[number]) => {
      if (!def.manual || !habits) return;
      const next = !habits[def.key];
      setPending(def.key);
      setHabits({ ...habits, [def.key]: next });
      try {
        const res = await fetch("/api/habits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [def.key]: next }),
        });
        if (!res.ok) throw new Error();
        setHabits(await res.json());
      } catch {
        setHabits(habits);
        toast.error("Couldn't save that");
      } finally {
        setPending(null);
      }
    },
    [habits],
  );

  if (!habits) return null;

  return (
    <div className="mt-3 flex gap-2 border-t pt-3 sm:gap-3">
      {HABITS.map((def) => {
        const done = habits[def.key];
        const Icon = ICONS[def.key];
        return (
          <button
            key={def.key}
            type="button"
            disabled={!def.manual || pending === def.key}
            onClick={() => toggle(def)}
            title={def.hint}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors",
              done ? "border-emerald-600/30 bg-emerald-600/[0.06]" : "border-border",
              def.manual && !done && "hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md",
                done ? "bg-emerald-600/15 text-emerald-600 dark:text-emerald-500" : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : <Icon className="size-3.5" />}
            </span>
            <span className={cn("truncate text-xs font-medium leading-tight", done ? "text-emerald-600 dark:text-emerald-500" : "text-foreground")}>
              {def.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
