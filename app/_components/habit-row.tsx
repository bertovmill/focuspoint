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

/** One colour per habit, like the rings above — amber, teal, rose. */
const PALETTE: Record<HabitKey, { tile: string; doneTile: string; icon: string; text: string }> = {
  read: {
    tile: "bg-amber-500/[0.07]",
    doneTile: "bg-amber-500/15 ring-1 ring-amber-500/40",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-400",
  },
  meditate: {
    tile: "bg-teal-500/[0.07]",
    doneTile: "bg-teal-500/15 ring-1 ring-teal-500/40",
    icon: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    text: "text-teal-700 dark:text-teal-400",
  },
  journal: {
    tile: "bg-rose-500/[0.07]",
    doneTile: "bg-rose-500/15 ring-1 ring-rose-500/40",
    icon: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    text: "text-rose-700 dark:text-rose-400",
  },
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
        const c = PALETTE[def.key];
        return (
          <button
            key={def.key}
            type="button"
            disabled={!def.manual || pending === def.key}
            onClick={() => toggle(def)}
            title={def.hint}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-3xl px-2 py-4 transition-colors",
              done ? c.doneTile : c.tile,
              def.manual && !done && "active:scale-95",
            )}
          >
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                c.icon,
              )}
            >
              {done ? <CheckIcon className="size-5.5" /> : <Icon className="size-5.5" />}
            </span>
            <span className={cn("truncate text-sm font-semibold leading-tight", c.text)}>
              {def.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
