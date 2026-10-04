"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronRightIcon, FlagIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProteinRing } from "@/app/_components/protein-ring";
import { daysUntil, isTraining, sessionMeta, targetLabel, type Activity, type TrainingEvent, type TrainingSession } from "@/lib/training";
import type { PlannedMeal } from "@/lib/nutrition-plan";
import { DEFAULT_PROTEIN_TARGET_G, slotsShown, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/**
 * The home screen's "what's on today" pair: today's sessions from /training and
 * today's three sittings from /meals, side by side on desktop. Each heading links
 * through to the full page; the only action here is ticking a session done.
 */
export function TodaySnapshot() {
  return (
    <section id="today-snapshot" className="mb-6 grid gap-6 md:grid-cols-2">
      <TrainingToday />
      <MealsToday />
    </section>
  );
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

function TrainingToday() {
  const today = todayISO();
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<TrainingEvent[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        fetch(`/api/training/sessions?from=${today}&to=${today}`),
        fetch("/api/training/events"),
      ]);
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
    load();
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
      <Heading href="/training">Today&apos;s training</Heading>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {sessions === null ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : (
          <div className="space-y-3">
            {list.length === 0 && extras.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing planned today.</p>
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
                  <div className="min-w-0 flex-1">
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
                  </div>
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

function MealsToday() {
  const today = todayISO();
  const [meals, setMeals] = useState<PlannedMeal[] | null>(null);
  const [protein, setProtein] = useState({ target: DEFAULT_PROTEIN_TARGET_G, eaten: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [p, t] = await Promise.all([
          fetch(`/api/nutrition/plan?date=${today}`),
          fetch(`/api/nutrition/target?date=${today}`),
        ]);
        setMeals(p.ok ? await p.json() : []);
        if (t.ok) {
          const data = (await t.json()) as { target_g: number; eaten_g: number };
          setProtein({ target: data.target_g, eaten: data.eaten_g });
        }
      } catch {
        setMeals([]);
      }
    })();
  }, [today]);

  const bySlot = new Map((meals ?? []).map((m) => [m.slot, m]));
  // The first meal still to plan — no clock: his meal times move around.
  const live = slotsShown(false).find((s) => !bySlot.has(s.key))?.key;

  return (
    <div>
      <Heading href="/meals">Today&apos;s meals</Heading>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {meals === null ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <ul className="min-w-0 flex-1 space-y-3">
              {slotsShown(bySlot.has("snack")).map(({ key, label }) => {
                const m = bySlot.get(key);
                return (
                  <li key={key} className="flex items-center gap-3">
                    {m?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image_url} alt={m.name} className="size-11 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="size-11 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wide",
                          key === live ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {label}
                        {key === live && <span className="ml-1.5 font-normal normal-case tracking-normal text-emerald-600 dark:text-emerald-400">next</span>}
                      </p>
                      <p className={cn("line-clamp-2 text-sm leading-snug", m ? "font-medium" : "text-muted-foreground")}>
                        {m?.name ?? "Not planned"}
                      </p>
                      {m?.protein_g != null && <p className="text-xs tabular-nums text-muted-foreground">{m.protein_g} g protein</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <ProteinRing eaten={protein.eaten} target={protein.target} size={72} />
              <p className="text-xs text-muted-foreground">protein</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
