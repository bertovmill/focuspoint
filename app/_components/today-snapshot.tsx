"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRightIcon, CheckIcon, ChevronRightIcon, FlagIcon, RefreshCwIcon, ShuffleIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { sessionHref } from "@/app/_components/session-editor";
import { MealFeedback } from "@/app/_components/meal-feedback";
import { SwapWorkoutDialog } from "@/app/_components/swap-workout-dialog";
import { daysUntil, isTraining, sessionMeta, targetLabel, type Activity, type TrainingEvent, type TrainingSession } from "@/lib/training";
import type { DayStrategy, StrategyBlock } from "@/lib/day-strategy";
import type { PlannedMeal } from "@/lib/nutrition-plan";
import { MEAL_SLOTS, addDaysISO, recipeHref, slotsShown, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/**
 * The home screen's "what's on today" pair: today's sessions from /training and
 * today's three meal picks from /meals as photos. Each heading links through to
 * the full page; the actions here are ticking a session done and swapping a pick.
 * `date` follows the home screen's day swipe; it defaults to today.
 */
export function TodaySnapshot({ date }: { date?: string } = {}) {
  const day = date ?? todayISO();
  return (
    // Meals take the full width under training so the photos can be big.
    <section id="today-snapshot" className="mb-6 grid gap-6">
      <TrainingToday today={day} />
      <MealsToday today={day} />
    </section>
  );
}

/** "Today's", "Tomorrow's", "Yesterday's", else the weekday: "Thursday's". */
export function dayPossessive(iso: string): string {
  const now = todayISO();
  if (iso === now) return "Today's";
  if (iso === addDaysISO(now, 1)) return "Tomorrow's";
  if (iso === addDaysISO(now, -1)) return "Yesterday's";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" })}'s`;
}

function Heading({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="group mb-3 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ChevronRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function TrainingToday({ today }: { today: string }) {
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [swapping, setSwapping] = useState<TrainingSession | null>(null);

  // `isStale` drops an answer for a day the home screen has already swiped past.
  const load = useCallback(async (isStale: () => boolean = () => false) => {
    try {
      const [s, e] = await Promise.all([
        fetch(`/api/training/sessions?from=${today}&to=${today}`),
        fetch("/api/training/events"),
      ]);
      if (isStale()) return;
      if (s.ok) {
        const data = (await s.json()) as { sessions: TrainingSession[]; activities: Activity[] };
        setSessions(data.sessions);
        setActivities(data.activities.filter(isTraining));
      } else setSessions([]);
      if (e.ok) setEvents(await e.json());
    } catch {
      setSessions([]);
    }
  }, [today]);

  useEffect(() => {
    let stale = false;
    load(() => stale);
    return () => {
      stale = true;
    };
  }, [load]);

  const toggleDone = async (s: TrainingSession) => {
    const prev = sessions;
    setSessions((ss) => ss?.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x)) ?? ss);
    try {
      const res = await fetch(`/api/training/sessions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !s.done }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as TrainingSession;
      setSessions((ss) => ss?.map((x) => (x.id === s.id ? row : x)) ?? ss);
    } catch {
      setSessions(prev);
      toast.error("Couldn't save that.");
    }
  };

  const nextRace = events
    .filter((e) => daysUntil(e.event_date) >= 0)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
  const list = (sessions ?? []).slice().sort((a, b) => a.position - b.position);
  // Fitbit workouts not already matched to a session — extra work done today.
  const matched = new Set(list.map((s) => s.activity_id).filter(Boolean));
  const extras = activities.filter((a) => !matched.has(a.id));

  return (
    <div>
      <Heading href="/training">{`${dayPossessive(today)} training`}</Heading>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {sessions === null ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : (
          <div className="space-y-3">
            {list.length === 0 && extras.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing planned{today === todayISO() ? " today" : ""}.</p>
            )}
            {list.map((s) => {
              const meta = sessionMeta(s.type);
              const rest = s.type === "rest";
              return (
                <div key={s.id} className="flex items-start gap-3">
                  {rest ? (
                    <span className="size-7 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleDone(s)}
                      aria-label={s.done ? "Mark not done" : "Mark done"}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md border-2",
                        s.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40 hover:border-foreground",
                      )}
                    >
                      {s.done && <CheckIcon className="size-4" />}
                    </button>
                  )}
                  <Link
                    href={sessionHref(s.id)}
                    className="group/session -m-1 min-w-0 flex-1 rounded-md p-1 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={cn("size-2 shrink-0 rounded-full", meta.color)} />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.short}</span>
                      {s.intensity === "hard" && <span className="text-xs text-rose-500">hard</span>}
                    </span>
                    <p className={cn("text-sm font-medium leading-snug", s.done && "text-muted-foreground line-through")}>{s.title}</p>
                    {targetLabel(s) && (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {targetLabel(s)}
                      </p>
                    )}
                  </Link>
                  {!rest && !s.done && (
                    <button
                      type="button"
                      onClick={() => setSwapping(s)}
                      aria-label="Swap workout"
                      title="Swap workout"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ArrowLeftRightIcon className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {extras.map((a) => (
              <p key={a.id} className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground" title={a.name}>
                <span className="font-medium">{a.name}</span>
                {a.avg_hr ? ` · ♥ ${a.avg_hr}` : ""}
                {a.azm ? ` · ${a.azm} AZM` : ""}
              </p>
            ))}
          </div>
        )}
        {swapping && (
          <SwapWorkoutDialog
            session={swapping}
            open
            onOpenChange={(o) => !o && setSwapping(null)}
            onSwapped={() => load()}
          />
        )}
        {nextRace && (
          <p
            className={cn(
              "mt-4 flex items-center gap-1.5 border-t pt-3 text-xs",
              daysUntil(nextRace.event_date) <= 7 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
            )}
          >
            <FlagIcon className="size-3.5" />
            <span className="font-medium">{nextRace.name}</span>
            <span className="tabular-nums">
              · {daysUntil(nextRace.event_date) === 0 ? "today" : `${daysUntil(nextRace.event_date)} days`}
            </span>
          </p>
        )}
      </Card>
    </div>
  );
}

// Friendlier names than Meal 1/2/3 for the picks, following the Robbins day:
// fruit alone in the morning, then two water-rich meals.
const PICK_LABELS: Record<string, string> = { meal1: "Morning", meal2: "Midday", meal3: "Evening", snack: "Snack" };

/**
 * Today's three picks from the meal bank, shown as photos to get excited about
 * rather than a log to fill in — no protein ring, no ticking (Berto's call,
 * 2026-10-23). Tapping a pick opens its full recipe; each can be swapped for
 * another bank meal for that sitting, or rated 👍/👎 with a one-liner, which
 * steers future picks (lib/meal-feedback.ts).
 * A day from today on with nothing planned is filled on first view.
 */
export function MealsToday({ today }: { today: string }) {
  const [meals, setMeals] = useState<PlannedMeal[] | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        let p = await fetch(`/api/nutrition/plan?date=${today}`);
        let rows: PlannedMeal[] = p.ok ? await p.json() : [];
        if (rows.length < MEAL_SLOTS.length && today >= todayISO()) {
          await fetch("/api/nutrition/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: today }),
          });
          p = await fetch(`/api/nutrition/plan?date=${today}`);
          if (p.ok) rows = await p.json();
        }
        if (!stale) setMeals(rows);
      } catch {
        if (!stale) setMeals([]);
      }
    })();
    return () => {
      stale = true;
    };
  }, [today]);

  const swap = async (slot: string) => {
    setSwapping(slot);
    try {
      const res = await fetch("/api/nutrition/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, slot }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as PlannedMeal;
      setMeals((ms) => [...(ms ?? []).filter((m) => m.slot !== slot), row]);
    } catch {
      toast.error("Couldn't find another meal.");
    } finally {
      setSwapping(null);
    }
  };

  // A bank meal without a photo gets one the first time it's shown (one
  // FLUX call, then stored on the meal and every cell made from it).
  const painting = useRef(new Set<number>());
  useEffect(() => {
    for (const m of meals ?? []) {
      const id = m.recipe_id;
      if (m.image_url || !id || painting.current.has(id)) continue;
      painting.current.add(id);
      fetch(`/api/nutrition/recipes/${id}/image`, { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((recipe: { image_url: string | null } | null) => {
          if (!recipe?.image_url) return;
          setMeals((ms) => ms?.map((x) => (x.recipe_id === id ? { ...x, image_url: recipe.image_url } : x)) ?? ms);
        })
        .catch(() => {});
    }
  }, [meals]);

  const bySlot = new Map((meals ?? []).map((m) => [m.slot, m]));

  // Sized to its home block, not the window: a narrow block lists the picks as
  // rows (photo beside the name) instead of crushing three photos side by side.
  return (
    <div className="@container">
      <Heading href="/meals">{`${dayPossessive(today)} meals`}</Heading>
      {meals === null ? (
        <div className="grid gap-3 @md:grid-cols-3">
          {MEAL_SLOTS.map((s) => (
            <Skeleton key={s.key} className="h-20 w-full rounded-lg @md:aspect-[4/5] @md:h-auto @md:rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 @md:grid-cols-3">
          {slotsShown(bySlot.has("snack")).map(({ key }) => {
            const m = bySlot.get(key);
            return (
              <figure key={key} className="group/pick flex min-w-0 items-start gap-3 @md:block">
                <div className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg bg-muted @md:aspect-[4/5] @md:w-auto @md:rounded-xl">
                  {m?.recipe_id ? (
                    <Link href={recipeHref({ id: m.recipe_id, name: m.name })} aria-label={`Open the ${m.name} recipe`} className="block size-full">
                      {m.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.image_url}
                          alt={m.name}
                          className="size-full object-cover transition-transform duration-500 group-hover/pick:scale-105"
                        />
                      )}
                    </Link>
                  ) : (
                    m?.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image_url} alt={m.name} className="size-full object-cover" />
                    )
                  )}
                  {m && (
                    <button
                      type="button"
                      onClick={() => swap(key)}
                      disabled={swapping === key}
                      aria-label={`Swap ${PICK_LABELS[key]} pick`}
                      title="Show me something else"
                      className="absolute right-1 top-1 flex size-7 items-center @md:right-2 @md:top-2 @md:size-8 justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background md:opacity-0 md:group-hover/pick:opacity-100"
                    >
                      <ShuffleIcon className={cn("size-4", swapping === key && "animate-spin")} />
                    </button>
                  )}
                </div>
                <figcaption className="min-w-0 flex-1 @md:mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{PICK_LABELS[key]}</p>
                  {m?.recipe_id ? (
                    <Link
                      href={recipeHref({ id: m.recipe_id, name: m.name })}
                      className="line-clamp-2 text-sm font-medium leading-snug hover:underline"
                    >
                      {m.name}
                    </Link>
                  ) : (
                    <p className={cn("line-clamp-2 text-sm leading-snug", m ? "font-medium" : "text-muted-foreground")}>
                      {m?.name ?? "Not planned"}
                    </p>
                  )}
                  {m?.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{m.description}</p>
                  )}
                  {m?.recipe_id && (
                    <MealFeedback
                      compact
                      className="mt-1.5"
                      recipeId={m.recipe_id}
                      rating={m.rating ?? null}
                      reason={m.rating_reason ?? null}
                      onChange={(rating, rating_reason) =>
                        setMeals((ms) => ms?.map((x) => (x.recipe_id === m.recipe_id ? { ...x, rating, rating_reason } : x)) ?? ms)
                      }
                    />
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
}

/** "2:30 PM" for an ISO date-time, in local time. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Pixels per hour on the timeline. */
const HOUR_PX = 48;
/** The timeline always covers at least this much of the day; events outside widen it. */
const DAY_FROM_H = 6;
const DAY_TO_H = 22;

/** Minutes since local midnight of `day`, clamped to the day. */
function minuteOfDay(iso: string, day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const mins = (new Date(iso).getTime() - new Date(y, m - 1, d).getTime()) / 60_000;
  return Math.min(Math.max(mins, 0), 24 * 60);
}

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** The browser's view of a day: local-midnight bounds and time zone, for the strategy's calendar read. */
function planWindow(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return {
    day,
    timeMin: new Date(y, m - 1, d).toISOString(),
    timeMax: new Date(y, m - 1, d + 1).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** "13:30" → minutes since midnight. */
function hhmmMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

type Placed = CalendarEvent & { top: number; bottom: number; lane: number; lanes: number };

/** Side-by-side lanes for overlapping events, the way a calendar day view does it. */
function placeEvents(events: CalendarEvent[], day: string): Placed[] {
  const items = events
    .map((e) => {
      const top = minuteOfDay(e.start, day);
      return { ...e, top, bottom: Math.max(minuteOfDay(e.end ?? e.start, day), top + 15), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => (p.lanes = lanes));
  };
  for (const item of items) {
    if (item.top >= clusterEnd && cluster.length) {
      close();
      cluster = [];
    }
    const used = new Set(cluster.filter((p) => p.bottom > item.top).map((p) => p.lane));
    while (used.has(item.lane)) item.lane++;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.bottom);
  }
  if (cluster.length) close();
  return items;
}

/**
 * The whole day on his Google Calendar as an hour timeline (his ask, 2026-10-25),
 * 6 AM–10 PM, widened for anything earlier or later. Past events fade, the one on
 * now is green, and a line marks the time; it opens scrolled to now. All-day
 * events sit as chips above the hours. Follows the home screen's day swipe.
 *
 * Cael's strategy for the day lives in here too (lib/day-strategy.ts; his ask,
 * 2026-10-25, replacing a separate block): a theme line on top, and suggested
 * activities in the free time as dashed outlines with ✓ keep / ✕ drop. A kept one
 * turns solid with a box to tick when done. Today's strategy writes itself on
 * first view; "Rewrite" takes a note and replaces the suggestions, keeping what
 * he kept.
 */
export function CalendarToday({ today }: { today: string }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [connected, setConnected] = useState(true);
  // Ticks each minute so the now line and fading keep up, without a refetch.
  const [now, setNow] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  // undefined while loading, null when the day has none yet.
  const [strategy, setStrategy] = useState<DayStrategy | null | undefined>(undefined);
  const [writing, setWriting] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [note, setNote] = useState("");

  const writeStrategy = async (feedback?: string) => {
    setWriting(true);
    try {
      const res = await fetch("/api/day-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...planWindow(today), feedback }),
      });
      if (!res.ok) throw new Error();
      setStrategy((await res.json()) as DayStrategy);
      setRewriting(false);
      setNote("");
    } catch {
      toast.error("Couldn't write a strategy.");
    } finally {
      setWriting(false);
    }
  };

  useEffect(() => {
    let stale = false;
    setStrategy(undefined);
    setRewriting(false);
    fetch(`/api/day-strategy?day=${today}`)
      .then(async (res) => {
        if (stale) return;
        const data = res.ok ? ((await res.json()) as DayStrategy | null) : null;
        setStrategy(data);
        // Today's plan writes itself the first time Home opens that day.
        if (!data && res.ok && today === todayISO()) void writeStrategy();
      })
      .catch(() => !stale && setStrategy(null));
    return () => {
      stale = true;
    };
    // writeStrategy only reads `today`, which this effect already keys on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const updateBlock = async (index: number, patch: Partial<Pick<StrategyBlock, "state" | "done">>) => {
    if (!strategy) return;
    const prev = strategy;
    setStrategy({ ...strategy, blocks: strategy.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
    const res = await fetch("/api/day-strategy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: today, index, ...patch }),
    }).catch(() => null);
    if (!res?.ok) {
      setStrategy(prev);
      toast.error("Couldn't save that.");
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stale = false;
    setEvents(null);
    const [y, m, d] = today.split("-").map(Number);
    const params = new URLSearchParams({
      timeMin: new Date(y, m - 1, d).toISOString(),
      timeMax: new Date(y, m - 1, d + 1).toISOString(),
    });
    fetch(`/api/calendar/events?${params}`)
      .then(async (res) => {
        if (stale) return;
        setConnected(res.status !== 409);
        setEvents(res.ok ? ((await res.json()) as CalendarEvent[]) : []);
      })
      .catch(() => !stale && setEvents([]));
    return () => {
      stale = true;
    };
  }, [today]);

  // An event that runs through the whole day (a multi-day block like a two-week
  // sprint) reads as an all-day chip, not a column filling the timeline.
  const spansDay = (e: CalendarEvent) =>
    e.allDay || (minuteOfDay(e.start, today) === 0 && minuteOfDay(e.end ?? e.start, today) === 24 * 60);
  const timed = (events ?? []).filter((e) => !spansDay(e));
  const allDay = (events ?? []).filter(spansDay);
  const placed = placeEvents(timed, today);
  // Index kept from `blocks`, which the PATCH addresses activities by.
  const planned = (strategy?.blocks ?? [])
    .map((b, index) => ({ ...b, index, top: hhmmMinutes(b.start), bottom: Math.max(hhmmMinutes(b.end), hhmmMinutes(b.start) + 15) }))
    .filter((b) => b.state !== "dropped");
  const isPast = today < todayISO();
  const fromH = Math.min(DAY_FROM_H, ...placed.map((p) => Math.floor(p.top / 60)), ...planned.map((b) => Math.floor(b.top / 60)));
  const toH = Math.max(DAY_TO_H, ...placed.map((p) => Math.ceil(p.bottom / 60)), ...planned.map((b) => Math.ceil(b.bottom / 60)));
  const y = (mins: number) => ((mins - fromH * 60) / 60) * HOUR_PX;
  const isToday = today === todayISO();
  const nowMin = isToday ? minuteOfDay(new Date(now).toISOString(), today) : null;
  const showNow = nowMin !== null && nowMin >= fromH * 60 && nowMin <= toH * 60;

  // Open on the current hour today (an hour of context above), else the first event.
  const loaded = events !== null;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !loaded) return;
    const anchor = nowMin ?? placed[0]?.top ?? 8 * 60;
    el.scrollTop = Math.max(0, y(anchor) - HOUR_PX);
    // Only on load and day change, not every minute's tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, today]);

  return (
    <div>
      <Heading href="/calendar">{`${dayPossessive(today)} calendar`}</Heading>
      <Card className="gap-0 rounded-xl px-3 py-3 shadow-none">
        {events === null ? (
          <div className="space-y-2 px-2 py-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : !connected ? (
          <Link href="/calendar" className="px-2 text-sm text-muted-foreground hover:text-foreground hover:underline">
            Connect Google Calendar
          </Link>
        ) : (
          <>
            <div id="day-strategy" className="mb-3 px-2">
              {strategy === undefined || writing ? (
                <div className="space-y-1.5">
                  {writing && <p className="text-xs text-muted-foreground">Cael is planning your day…</p>}
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : strategy === null ? (
                !isPast && (
                  <button type="button" onClick={() => writeStrategy()} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Plan this day
                  </button>
                )
              ) : rewriting ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void writeStrategy(note.trim() || "Try a different plan.");
                  }}
                >
                  <Textarea
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What should change? (optional) — kept activities stay"
                    className="min-h-16 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                    }}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">
                      <RefreshCwIcon />
                      Rewrite
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRewriting(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium leading-snug">{strategy.theme}</p>
                  <button
                    type="button"
                    onClick={() => setRewriting(true)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Rewrite
                  </button>
                </div>
              )}
            </div>
            {allDay.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5 pl-14">
                {allDay.map((e) => (
                  <span key={e.id} className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-xs font-medium" title={e.title}>
                    {e.title}
                  </span>
                ))}
              </div>
            )}
            <div ref={scroller} id="calendar-timeline" className="max-h-[480px] overflow-y-auto">
              <div className="relative" style={{ height: (toH - fromH) * HOUR_PX }}>
                {Array.from({ length: toH - fromH + 1 }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 flex items-start" style={{ top: i * HOUR_PX }}>
                    <span className="-mt-2 w-12 shrink-0 pr-2 text-right text-[10px] tabular-nums text-muted-foreground">
                      {hourLabel(fromH + i)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ))}

                <div className="absolute inset-y-0 left-14 right-1">
                  {planned.map((b) => {
                    const height = Math.max(y(b.bottom) - y(b.top) - 2, 20);
                    const kept = b.state === "kept";
                    return (
                      <div
                        key={`plan-${b.index}`}
                        data-plan-block={b.state}
                        title={`${b.title} — ${b.why}`}
                        className={cn(
                          "absolute inset-x-0 flex items-start gap-1.5 overflow-hidden rounded-md px-1.5 py-0.5 text-xs leading-tight text-emerald-800 dark:text-emerald-200",
                          kept
                            ? "border-l-2 border-emerald-600 bg-emerald-500/10"
                            : "border border-dashed border-emerald-500/60 bg-emerald-500/5",
                          b.done && "opacity-50",
                        )}
                        style={{ top: y(b.top) + 1, height }}
                      >
                        {kept && (
                          <button
                            type="button"
                            onClick={() => updateBlock(b.index, { done: !b.done })}
                            aria-label={b.done ? "Mark not done" : "Mark done"}
                            className={cn(
                              "mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                              b.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-600/70 hover:bg-emerald-500/20",
                            )}
                          >
                            {b.done && <CheckIcon className="size-2.5" strokeWidth={3} />}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className={cn("font-medium", b.done && "line-through")}>{b.title}</span>
                          {height >= 34 && (
                            <span className="block text-[10px] opacity-75">
                              {clockTime(`2000-01-01T${b.start}`)}–{clockTime(`2000-01-01T${b.end}`)}
                              {!kept && " · suggested"}
                            </span>
                          )}
                        </div>
                        {!kept && (
                          <span className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              onClick={() => updateBlock(b.index, { state: "kept" })}
                              aria-label={`Keep ${b.title}`}
                              title="Keep"
                              className="flex size-4 items-center justify-center rounded text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                            >
                              <CheckIcon className="size-3" strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => updateBlock(b.index, { state: "dropped" })}
                              aria-label={`Drop ${b.title}`}
                              title="Drop"
                              className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <XIcon className="size-3" strokeWidth={2.5} />
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {placed.map((e) => {
                    const end = new Date(e.end ?? e.start).getTime();
                    const past = end <= now;
                    const live = !past && new Date(e.start).getTime() <= now;
                    const height = Math.max(y(e.bottom) - y(e.top) - 2, 18);
                    return (
                      <div
                        key={e.id}
                        title={`${clockTime(e.start)} ${e.title}`}
                        className={cn(
                          "absolute overflow-hidden rounded-md border-l-2 px-2 py-0.5 text-xs leading-tight",
                          live
                            ? "border-emerald-500 bg-emerald-500/15 text-foreground"
                            : "border-primary/50 bg-muted text-foreground",
                          past && "opacity-45",
                        )}
                        style={{
                          top: y(e.top) + 1,
                          height,
                          left: `${(e.lane / e.lanes) * 100}%`,
                          width: `calc(${100 / e.lanes}% - 2px)`,
                        }}
                      >
                        <span className="font-medium">{e.title}</span>
                        {height >= 34 && (
                          <span className="block text-[10px] text-muted-foreground">
                            {clockTime(e.start)}
                            {e.end ? `–${clockTime(e.end)}` : ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {showNow && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: y(nowMin!) }}>
                    <span className="w-14 shrink-0" />
                    <span className="-ml-0.5 size-2 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                )}
              </div>
            </div>
            {timed.length === 0 && allDay.length === 0 && (
              <p className="px-2 pt-2 text-xs text-muted-foreground">Nothing on the calendar{isToday ? " today" : ""}.</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
