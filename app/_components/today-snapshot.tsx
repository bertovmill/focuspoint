"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRightIcon, CheckIcon, ChevronRightIcon, FlagIcon, ShuffleIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionHref } from "@/app/_components/session-editor";
import { SwapWorkoutDialog } from "@/app/_components/swap-workout-dialog";
import { daysUntil, isTraining, sessionMeta, targetLabel, type Activity, type TrainingEvent, type TrainingSession } from "@/lib/training";
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
function dayPossessive(iso: string): string {
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
 * another bank meal for that sitting.
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

  return (
    <div>
      <Heading href="/meals">{`${dayPossessive(today)} meals`}</Heading>
      {meals === null ? (
        <div className="grid grid-cols-3 gap-3">
          {MEAL_SLOTS.map((s) => (
            <Skeleton key={s.key} className="aspect-[4/5] w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {slotsShown(bySlot.has("snack")).map(({ key }) => {
            const m = bySlot.get(key);
            return (
              <figure key={key} className="group/pick min-w-0">
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
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
                      className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background md:opacity-0 md:group-hover/pick:opacity-100"
                    >
                      <ShuffleIcon className={cn("size-4", swapping === key && "animate-spin")} />
                    </button>
                  )}
                </div>
                <figcaption className="mt-2">
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

/** How many of the day's events the home screen shows (his ask, 2026-10-25). */
const CALENDAR_LIMIT = 3;

/** "2:30 PM" for an ISO date-time, in local time. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The next three timed events on his Google Calendar for the day, from now on:
 * anything already over drops off, and an empty day just says so. On another
 * day (the home screen's swipe) it's that day's first three. All-day events are
 * left out, since they aren't something coming up at a time.
 */
export function CalendarToday({ today }: { today: string }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [connected, setConnected] = useState(true);
  // Ticks each minute so events fall off as they end, without a refetch.
  const [now, setNow] = useState(() => Date.now());

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

  const upcoming = (events ?? [])
    .filter((e) => !e.allDay && new Date(e.end ?? e.start).getTime() > now)
    .slice(0, CALENDAR_LIMIT);

  return (
    <div>
      <Heading href="/calendar">{`${dayPossessive(today)} calendar`}</Heading>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {events === null ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : !connected ? (
          <Link href="/calendar" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Connect Google Calendar
          </Link>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing{today === todayISO() ? " left today" : " on"}.</p>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((e) => {
              const live = new Date(e.start).getTime() <= now;
              return (
                <li key={e.id} className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      "w-16 shrink-0 text-xs tabular-nums",
                      live ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {live ? "Now" : clockTime(e.start)}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium" title={e.title}>
                    {e.title}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
