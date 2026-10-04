"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarIcon, CheckIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, type PlannedHabit } from "@/lib/day-plan";
import { cn } from "@/lib/utils";

type Habit = PlannedHabit & { done: boolean; auto: boolean };
type Plan = {
  now: number;
  source: "doc" | "defaults";
  calendar: "ok" | "not_connected" | "error";
  events: { title: string; start: number; end: number }[];
  habits: Habit[];
};

type Row =
  | { kind: "habit"; start: number; end: number; habit: Habit }
  | { kind: "event"; start: number; end: number; title: string };

/**
 * "Today's plan" on Home: the daily habits from the Principles doc slotted into
 * the gaps in today's calendar (app/api/day-plan, lib/day-plan.ts). The timeline
 * doubles as the habit checklist — tick a block when it's done. Meetings are shown
 * for context only.
 */
export function DayPlanCard() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/day-plan");
      if (!res.ok) throw new Error();
      setPlan(await res.json());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (h: Habit) => {
    if (h.auto) return;
    const prev = plan;
    setPlan((p) => p && { ...p, habits: p.habits.map((x) => (x.key === h.key ? { ...x, done: !h.done } : x)) });
    try {
      const res = await fetch("/api/day-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: h.key, done: !h.done }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPlan(prev);
      toast.error("Couldn't save that.");
    }
  };

  const rows: Row[] = plan
    ? [
        ...plan.habits.flatMap((h): Row[] =>
          h.start === null || h.end === null ? [] : [{ kind: "habit", start: h.start, end: h.end, habit: h }],
        ),
        ...plan.events.map((e): Row => ({ kind: "event", ...e })),
      ].sort((a, b) => a.start - b.start || (a.kind === "event" ? -1 : 1))
    : [];
  const unplaced = plan?.habits.filter((h) => h.start === null) ?? [];
  const doneCount = plan?.habits.filter((h) => h.done).length ?? 0;

  return (
    <section id="today-plan" className="mb-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Link
          href="/calendar"
          className="group inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Today&apos;s plan
          <ChevronRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
        {plan && plan.habits.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{plan.habits.length} habits
          </span>
        )}
      </div>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {failed ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t build today&apos;s plan.</p>
        ) : !plan ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        ) : (
          <div className="space-y-1">
            {rows.length === 0 && unplaced.length === 0 && (
              <p className="text-sm text-muted-foreground">No daily habits yet.</p>
            )}
            {rows.map((r) => {
              const current = plan.now >= r.start && plan.now < r.end;
              return r.kind === "event" ? (
                <div key={`e-${r.start}-${r.title}`} className="flex items-center gap-3 py-1 text-muted-foreground">
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums">{formatTime(r.start)}</span>
                  <span className="flex size-7 shrink-0 items-center justify-center">
                    <CalendarIcon className="size-3.5" />
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-sm", current && "text-foreground")}>{r.title}</span>
                  <span className="shrink-0 text-xs tabular-nums">{formatTime(r.end)}</span>
                </div>
              ) : (
                <div
                  key={`h-${r.habit.key}`}
                  className={cn("-mx-2 flex items-center gap-3 rounded-md px-2 py-1", current && !r.habit.done && "bg-muted/60")}
                >
                  <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">{formatTime(r.start)}</span>
                  <button
                    type="button"
                    onClick={() => toggle(r.habit)}
                    disabled={r.habit.auto}
                    aria-label={r.habit.done ? `Mark ${r.habit.name} not done` : `Mark ${r.habit.name} done`}
                    title={r.habit.auto ? "Ticked from what you logged today" : undefined}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md border-2",
                      r.habit.done
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-muted-foreground/40 hover:border-foreground",
                    )}
                  >
                    {r.habit.done && <CheckIcon className="size-4" />}
                  </button>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium",
                      r.habit.done && "text-muted-foreground line-through",
                    )}
                  >
                    {r.habit.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.habit.minutes} min</span>
                </div>
              );
            })}
            {unplaced.length > 0 && (
              <p className="pt-2 text-xs text-muted-foreground">
                No gap left today for {unplaced.map((h) => h.name).join(", ")}.
              </p>
            )}
            {(plan.source === "defaults" || plan.calendar !== "ok") && (
              <p className="pt-2 text-xs text-muted-foreground">
                {plan.source === "defaults" && (
                  <>
                    Default habits. Add a <span className="font-medium">Daily habits</span> list to{" "}
                    <a href="#principles" className="underline underline-offset-2">
                      Principles
                    </a>{" "}
                    to set your own.{" "}
                  </>
                )}
                {plan.calendar === "not_connected" && "Calendar isn't connected, so meetings aren't accounted for."}
                {plan.calendar === "error" && "Couldn't read the calendar, so meetings aren't accounted for."}
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
