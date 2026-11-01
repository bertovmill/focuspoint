"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, ChevronRightIcon, MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { todayISO } from "@/lib/nutrition";
import type { WeeklyProgress } from "@/lib/progress";
import type { GoalRow, TrainingOverview, WorkoutGoals } from "@/lib/training-overview";
import { cn } from "@/lib/utils";

/** Today | Progress, under the Training title. Real routes, so each tab has its own URL. */
export function TrainingTabs({ active }: { active: "today" | "progress" }) {
  const tab = (key: "today" | "progress", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn(
        "flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
        active === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav className="inline-flex gap-1 rounded-full bg-muted/60 p-1 dark:bg-muted/40" aria-label="Training views">
      {tab("today", "/training", "Today")}
      {tab("progress", "/training/progress", "Progress")}
    </nav>
  );
}

const pctText = (n: number) => `${Math.abs(n * 100).toFixed(1)}%`;

/**
 * /training/progress — what the training is for (Berto, 2026-11-01): stat tiles with
 * change vs before, Shopify-admin style; the Dec 31 goals as bars; two weekly trends.
 */
export function TrainingProgress({ slug }: { slug?: string }) {
  const [data, setData] = useState<TrainingOverview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/training/overview?today=${todayISO()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="space-y-6 pb-10">
      {!slug && (
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Training</h1>
          <TrainingTabs active="progress" />
        </header>
      )}
      {failed ? (
        <p className="text-muted-foreground">Couldn’t load your progress.</p>
      ) : !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : slug ? (
        <WorkoutDetail data={data} slug={slug} />
      ) : (
        <Overview data={data} />
      )}
    </div>
  );
}

function Overview({ data }: { data: TrainingOverview }) {
  const monthChange = data.month.prev > 0 ? (data.month.done - data.month.prev) / data.month.prev : null;
  const measured = data.goals.filter((g) => g.pct !== null);
  const avg = measured.length ? measured.reduce((n, g) => n + g.pct!, 0) / measured.length : null;
  const hit = measured.filter((g) => g.pct! >= 1).length;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="This month at a glance">
        <Tile label="Workouts · 30 days" value={String(data.month.done)} change={monthChange} hint={`${data.month.prev} the 30 days before`} />
        <Tile
          label="Getting better"
          value={data.week.change === null ? "–" : `${data.week.change >= 0 ? "+" : "−"}${pctText(data.week.change)}`}
          hint={data.week.change === null ? "Repeat a workout this week" : "vs last time, this week"}
          tone={data.week.change === null ? undefined : data.week.change >= 0 ? "up" : "down"}
        />
        <Tile label={data.race ? data.race.name : "Next race"} value={data.race ? `${data.race.days}` : "–"} hint={data.race ? "days to go" : "No race set"} />
        <Tile label="Dec 31 goals" value={avg === null ? "–" : `${Math.round(avg * 100)}%`} hint={`of the way there · ${hit} of ${measured.length} hit`} />
      </section>

      {/* This week's per-exercise detail, moved here from the Today tab. */}
      <WeeklyProgressLine />

      <section className="rounded-2xl bg-muted/60 p-5 dark:bg-muted/40">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Goals by Dec 31</h2>
          <span className="text-sm text-muted-foreground">Average of each workout’s goals</span>
        </div>
        <ul className="mt-3 divide-y divide-foreground/5">
          {data.workouts.map((w) => (
            <WorkoutItem key={w.slug} w={w} />
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeekBars
          title="Workouts per week"
          hint="Sessions ticked done, last 8 weeks"
          weeks={data.weeks.map((w) => ({ start: w.start, value: w.done }))}
          format={(v) => `${v} workout${v === 1 ? "" : "s"}`}
        />
        <WeekBars
          title="Better than last time"
          hint="Average change per exercise, by week"
          weeks={data.weeks.map((w) => ({ start: w.start, value: w.change }))}
          format={(v) => `${v >= 0 ? "+" : "−"}${pctText(v)}`}
          signed
        />
      </div>
    </>
  );
}

function Tile({ label, value, hint, change, tone }: { label: string; value: string; hint: string; change?: number | null; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-2xl bg-muted/60 p-4 dark:bg-muted/40">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-3xl font-semibold tabular-nums tracking-tight", tone === "up" && "text-emerald-700 dark:text-emerald-400", tone === "down" && "text-rose-600 dark:text-rose-400")}>{value}</span>
        {change !== undefined && change !== null && <Delta change={change} />}
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

/** Shopify-style change chip: an arrow and a percent, green up, red down. */
function Delta({ change }: { change: number }) {
  const up = change >= 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums", up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
      <Icon className="size-3.5" />
      {pctText(change)}
    </span>
  );
}

/** One standard workout: its goals averaged into one bar. Opens the per-exercise detail. */
function WorkoutItem({ w }: { w: WorkoutGoals }) {
  const done = w.pct !== null && w.pct >= 1;
  return (
    <li>
      <Link href={`/training/progress/${w.slug}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,16rem)_1fr_4rem]">
        <span className="min-w-0">
          <span className="block truncate font-medium">{w.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {w.total} goal{w.total === 1 ? "" : "s"}
            {w.measured > 0 && w.hit > 0 && ` · ${w.hit} hit`}
          </span>
        </span>
        <span className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
          {w.pct === null ? (
            <span className="text-sm text-muted-foreground">No numbers yet. Log it once to start.</span>
          ) : (
            <span className="block h-2 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
              <span className={cn("block h-full rounded-full", done ? "bg-emerald-600" : "bg-foreground/70")} style={{ width: `${Math.max(2, w.pct * 100)}%` }} />
            </span>
          )}
        </span>
        <span className="flex items-center justify-end gap-1 text-sm tabular-nums">
          <span className={cn("font-medium", w.pct === null && "text-muted-foreground")}>{w.pct === null ? "–" : `${Math.round(w.pct * 100)}%`}</span>
          <ChevronRightIcon className="size-4 text-muted-foreground/50 group-hover:text-foreground" />
        </span>
      </Link>
    </li>
  );
}

/** /training/progress/<workout> — one workout's goals, exercise by exercise. */
function WorkoutDetail({ data, slug }: { data: TrainingOverview; slug: string }) {
  const w = data.workouts.find((x) => x.slug === slug);
  const goals = data.goals.filter((g) => g.slug === slug);
  return (
    <>
      <header className="space-y-2">
        <Link href="/training/progress" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Progress
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{w?.name ?? "Workout"}</h1>
        {w && (
          <p className="text-muted-foreground">
            {w.pct === null ? "No numbers yet" : `${Math.round(w.pct * 100)}% of the way to the Dec 31 goals`}
            {w.measured > 0 && ` · ${w.hit} of ${w.measured} hit`}
          </p>
        )}
      </header>
      {goals.length === 0 ? (
        <p className="text-muted-foreground">No goals on this workout.</p>
      ) : (
        <section className="rounded-2xl bg-muted/60 p-5 dark:bg-muted/40">
          <ul className="divide-y divide-foreground/5">
            {goals.map((g) => (
              <GoalItem key={`${g.name}|${g.label}`} g={g} hideWorkout />
            ))}
          </ul>
        </section>
      )}
      {goals[0] && (
        <Link href={goals[0].href} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          Open the workout log <ChevronRightIcon className="size-4" />
        </Link>
      )}
    </>
  );
}

function GoalItem({ g, hideWorkout }: { g: GoalRow; hideWorkout?: boolean }) {
  const done = g.pct !== null && g.pct >= 1;
  return (
    <li>
      <Link href={g.href} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,14rem)_1fr_4rem]">
        <span className="min-w-0">
          <span className="block truncate font-medium">{g.name}</span>
          {!hideWorkout && <span className="block truncate text-xs text-muted-foreground">{g.workout}</span>}
        </span>
        <span className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
          <span className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">
              {g.now && <span className="tabular-nums text-foreground/80">{g.now} → </span>}
              {g.label}
            </span>
          </span>
          {g.pct !== null && (
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
              <span className={cn("block h-full rounded-full", done ? "bg-emerald-600" : "bg-foreground/70")} style={{ width: `${Math.max(2, g.pct * 100)}%` }} />
            </span>
          )}
        </span>
        <span className="flex items-center justify-end gap-1 text-sm tabular-nums">
          {g.pct === null ? (
            <span className="text-muted-foreground">–</span>
          ) : done ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckIcon className="size-4" /> Hit
            </span>
          ) : (
            <span className="font-medium">{Math.round(g.pct * 100)}%</span>
          )}
          <ChevronRightIcon className="hidden size-4 text-muted-foreground/50 group-hover:text-foreground sm:block" />
        </span>
      </Link>
    </li>
  );
}

function shortWeek(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Eight weekly bars, one series (the title names it, so no legend). `signed` draws them
 * from a zero line: green above, red below, with the sign in the label too.
 */
function WeekBars({ title, hint, weeks, format, signed }: { title: string; hint: string; weeks: { start: string; value: number | null }[]; format: (v: number) => string; signed?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 140;
  const vals = weeks.map((w) => w.value ?? 0);
  const max = Math.max(...vals.map((v) => Math.abs(v)), signed ? 0.01 : 1);
  const zero = signed && vals.some((v) => v < 0) ? H / 2 : H;
  const span = signed && vals.some((v) => v < 0) ? H / 2 - 6 : H - 6;
  const slot = W / weeks.length;
  const bw = Math.min(24, slot - 8);
  const shown = hover ?? weeks.length - 1;
  const cur = weeks[shown];
  return (
    <section className="rounded-2xl bg-muted/60 p-5 dark:bg-muted/40">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {shortWeek(cur.start)}: <span className="font-medium text-foreground">{cur.value === null ? "–" : format(cur.value)}</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="mt-3 w-full" role="img" aria-label={`${title}: ${weeks.map((w) => `${shortWeek(w.start)} ${w.value === null ? "none" : format(w.value)}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={zero} y2={zero} stroke="currentColor" strokeOpacity={0.15} />
        {weeks.map((w, i) => {
          const v = w.value ?? 0;
          const h = Math.max(w.value === null ? 0 : 2, (Math.abs(v) / max) * span);
          const x = i * slot + (slot - bw) / 2;
          const y = v >= 0 ? zero - h : zero;
          const fill = signed ? (v >= 0 ? "fill-emerald-600 dark:fill-emerald-500" : "fill-rose-500") : "fill-foreground/70";
          return (
            <g key={w.start} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              {/* Hit target: the whole column, bigger than the bar. */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {w.value !== null && <rect x={x} y={y} width={bw} height={h} rx={4} className={cn(fill, hover !== null && hover !== i && "opacity-40")} />}
              {(i === 0 || i === weeks.length - 1 || i === hover) && (
                <text x={i * slot + slot / 2} y={H + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {shortWeek(w.start)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

/**
 * "You've gotten X% better this week": every exercise logged in the past 7 days against the
 * last time that workout was done — volume for rep sets, faster for timed ones, averaged
 * (lib/progress.ts). Tap for the per-exercise list.
 */
function WeeklyProgressLine() {
  const [data, setData] = useState<WeeklyProgress | null>(null);
  useEffect(() => {
    fetch(`/api/training/progress?today=${todayISO()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  if (data.change === null) {
    return <p className="text-sm text-muted-foreground">Repeat a workout this week to see how much better you’re getting.</p>;
  }
  const pct = Math.abs(data.change * 100).toFixed(1);
  const up = data.change >= 0.0005;
  const down = data.change <= -0.0005;
  const headline = up ? `You’ve gotten ${pct}% better this week` : down ? `You’re ${pct}% down this week` : "Holding steady this week";
  const n = data.items.length;
  return (
    <details className="group rounded-2xl bg-muted/60 p-4 dark:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : down ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground",
          )}
        >
          {up ? <TrendingUpIcon className="size-5" /> : down ? <TrendingDownIcon className="size-5" /> : <MinusIcon className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{headline}</span>
          <span className="block text-sm text-muted-foreground">
            {n} exercise{n === 1 ? "" : "s"} vs last time
          </span>
        </span>
        <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <ul className="mt-3 divide-y divide-foreground/5">
        {data.items.map((i) => (
          <li key={`${i.template}|${i.exercise}`} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="min-w-0">
              <span className="font-medium">{i.name}</span> <span className="text-muted-foreground">· {i.workout}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="text-muted-foreground">
                {i.before} → {i.now}
              </span>{" "}
              <span className={cn("font-medium", i.change > 0 ? "text-emerald-700 dark:text-emerald-400" : i.change < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                {i.change >= 0 ? "+" : "−"}
                {Math.abs(i.change * 100).toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
