"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  InfoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, toClock, type PlannedHabit } from "@/lib/day-plan";
import { PRINCIPLES_CHANGED_EVENT } from "@/app/_components/principles-doc";
import { cn } from "@/lib/utils";

type Habit = PlannedHabit & { done: boolean; auto: boolean };
type Plan = {
  now: number;
  /** "HH:MM" — when the morning block begins. */
  dayStart: string;
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
  /** The habit whose "why" is open — one at a time. */
  const [openWhy, setOpenWhy] = useState<string | null>(null);

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

  // A standing setting, not a morning tap — he doesn't open Cael first thing.
  const saveDayStart = async (value: string) => {
    if (!value || value === plan?.dayStart) return;
    try {
      const res = await fetch("/api/day-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayStart: value }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      toast.error("Couldn't save the start time.");
    }
  };

  // Permanent: rewrites the habit's line in Principles, which is where its time lives.
  const saveHabitTime = async (h: Habit, value: string) => {
    if (!value || (h.start !== null && value === toClock(h.start))) return;
    try {
      const res = await fetch("/api/day-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habit: h.key, time: value }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new Event(PRINCIPLES_CHANGED_EVENT));
      await load();
    } catch {
      toast.error(`Couldn't move ${h.name}.`);
    }
  };

  const toggle = async (h: Habit) => {
    if (h.auto) return;
    const prev = plan;
    setPlan(
      (p) =>
        p && {
          ...p,
          habits: p.habits.map((x) =>
            x.key === h.key ? { ...x, done: !h.done } : x,
          ),
        },
    );
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
          h.start === null || h.end === null
            ? []
            : [{ kind: "habit", start: h.start, end: h.end, habit: h }],
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
        {plan && (
          <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <label className="flex items-center gap-1.5">
              Day starts
              <input
                key={plan.dayStart}
                type="time"
                step={300}
                defaultValue={plan.dayStart}
                onBlur={(e) => saveDayStart(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                aria-label="When the day starts"
                className="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-foreground tabular-nums hover:border-border focus:border-border focus:outline-none"
              />
            </label>
            {plan.habits.length > 0 && (
              <span>
                {doneCount}/{plan.habits.length} habits
              </span>
            )}
          </span>
        )}
      </div>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {failed ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t build today&apos;s plan.
          </p>
        ) : !plan ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        ) : (
          <div className="space-y-1">
            {rows.length === 0 && unplaced.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No daily habits yet.
              </p>
            )}
            {rows.map((r) => {
              const current = plan.now >= r.start && plan.now < r.end;
              return r.kind === "event" ? (
                <div
                  key={`e-${r.start}-${r.title}`}
                  className="flex items-center gap-3 py-1 text-muted-foreground"
                >
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                    {formatTime(r.start)}
                  </span>
                  <span className="flex size-7 shrink-0 items-center justify-center">
                    <CalendarIcon className="size-3.5" />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      current && "text-foreground",
                    )}
                  >
                    {r.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {formatTime(r.end)}
                  </span>
                </div>
              ) : (
                <div key={`h-${r.habit.key}`}>
                  <div
                    className={cn(
                      "-mx-2 flex items-center gap-3 rounded-md px-2 py-1",
                      current && !r.habit.done && "bg-muted/60",
                    )}
                  >
                    <HabitTime
                      habit={r.habit}
                      start={r.start}
                      onSave={(v) => saveHabitTime(r.habit, v)}
                    />
                    <button
                      type="button"
                      onClick={() => toggle(r.habit)}
                      disabled={r.habit.auto}
                      aria-label={
                        r.habit.done
                          ? `Mark ${r.habit.name} not done`
                          : `Mark ${r.habit.name} done`
                      }
                      title={
                        r.habit.auto
                          ? "Ticked from what you logged today"
                          : undefined
                      }
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
                    <button
                      type="button"
                      onClick={() =>
                        setOpenWhy((k) =>
                          k === r.habit.key ? null : r.habit.key,
                        )
                      }
                      aria-expanded={openWhy === r.habit.key}
                      aria-label={`Why ${r.habit.name} matters`}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
                        openWhy === r.habit.key && "text-foreground",
                      )}
                    >
                      <InfoIcon className="size-4" />
                    </button>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {r.habit.minutes} min
                    </span>
                  </div>
                  {openWhy === r.habit.key && <WhyNote habit={r.habit} />}
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
                    Default habits. Add a{" "}
                    <span className="font-medium">Daily habits</span> list to{" "}
                    <a
                      href="#principles"
                      className="underline underline-offset-2"
                    >
                      Principles
                    </a>{" "}
                    to set your own.{" "}
                  </>
                )}
                {plan.calendar === "not_connected" &&
                  "Calendar isn't connected, so meetings aren't accounted for."}
                {plan.calendar === "error" &&
                  "Couldn't read the calendar, so meetings aren't accounted for."}
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

/**
 * A habit's start time; tap it for a time picker. The new time becomes the habit's
 * usual time, every day (saved into its Principles line).
 */
function HabitTime({
  habit,
  start,
  onSave,
}: {
  habit: Habit;
  start: number;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    try {
      input.current?.showPicker?.();
    } catch {
      // Not every browser allows it; focusing the field is enough.
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Change when ${habit.name} happens`}
        title="Change the time"
        className="-my-0.5 w-14 shrink-0 rounded-md py-0.5 text-right text-xs font-medium tabular-nums decoration-dotted underline-offset-4 hover:underline"
      >
        {formatTime(start)}
      </button>
    );
  }
  return (
    <input
      ref={input}
      type="time"
      step={300}
      defaultValue={toClock(start)}
      onBlur={(e) => {
        setEditing(false);
        onSave(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={`When ${habit.name} happens`}
      className="w-[6.75rem] shrink-0 rounded-md border border-border bg-transparent px-1 py-0.5 text-right text-xs font-medium tabular-nums focus:outline-none"
    />
  );
}

/**
 * Why a habit matters — only ever his own words from Principles (sub-bullets
 * under the habit, or the matching "On …" section). Never generated.
 */
function WhyNote({ habit }: { habit: Habit }) {
  return (
    <div className="mb-2 ml-[6.25rem] mt-1 rounded-md bg-muted/60 px-3 py-2 text-sm leading-relaxed">
      {habit.why.length > 0 ? (
        <ul className="space-y-1">
          {habit.why.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No why yet. Add an indented bullet under {habit.name} in{" "}
          <a href="#principles" className="underline underline-offset-2">
            Principles
          </a>
          , in your own words.
        </p>
      )}
    </div>
  );
}
