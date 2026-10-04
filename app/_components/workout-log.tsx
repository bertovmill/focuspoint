"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { addDaysISO, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import {
  formatTime,
  hitAll,
  hitSet,
  parseTime,
  totalReps,
  workoutHref,
  type Prescription,
  type StrengthLog,
  type TemplateExercise,
  type WorkoutTemplate,
} from "@/lib/workout-templates";

interface DayData {
  template: WorkoutTemplate;
  date: string;
  logs: StrengthLog[];
  prescriptions: Record<string, Prescription & { last: StrengthLog | null }>;
  history: StrengthLog[];
}

interface Row {
  weight: string;
  target: number;
  reps: string[];
}

function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const isTime = (ex: TemplateExercise) => ex.measure === "time";

/** A typed cell → its number: reps as written, times as seconds. */
function valueOf(ex: TemplateExercise, s: string) {
  return isTime(ex) ? parseTime(s) : parseNum(s);
}

/** A stored number → what the cell shows. */
function display(ex: TemplateExercise, n: number | null | undefined) {
  if (n == null) return "";
  return isTime(ex) ? formatTime(n) : String(n);
}

function initialRows(t: WorkoutTemplate, data: DayData): Record<string, Row> {
  const rows: Record<string, Row> = {};
  for (const ex of t.blocks.flatMap((b) => b.exercises)) {
    const log = data.logs.find((l) => l.exercise === ex.key);
    const p = data.prescriptions[ex.key];
    rows[ex.key] = log
      ? { weight: log.weight === null ? "" : String(log.weight), target: log.target_reps, reps: Array.from({ length: ex.sets }, (_, i) => display(ex, log.reps[i])) }
      : { weight: p?.weight == null ? "" : String(p.weight), target: p?.target ?? ex.ladder[0] ?? 0, reps: Array(ex.sets).fill("") };
  }
  return rows;
}

/**
 * /training/workouts/<template>/<date> — one session of a structured workout as
 * a table: type the reps of each set, last session's reps sit underneath as
 * placeholders, and it saves as you go. Charts of total reps per session sit below.
 */
export function WorkoutLog({ slug, date }: { slug: string; date: string }) {
  const [data, setData] = useState<DayData | null>(null);
  const [missing, setMissing] = useState(false);
  const t = data?.template ?? null;
  const tRef = useRef<WorkoutTemplate | null>(null);
  tRef.current = t;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setMissing(false);
    fetch(`/api/training/workouts/${slug}?date=${date}`)
      .then((r) => (r.ok ? r.json() : r.status === 400 ? (setMissing(true), Promise.reject(new Error("missing"))) : Promise.reject()))
      .then((d: DayData) => {
        if (cancelled) return;
        setData(d);
        setRows(initialRows(d.template, d));
        dirty.current = false;
        setStatus("idle");
      })
      .catch((err) => {
        if (err?.message !== "missing") toast.error("Couldn't load the workout");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, date]);

  const save = useCallback(
    async (next: Record<string, Row>) => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/training/workouts/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            entries: Object.entries(next).map(([exercise, r]) => {
              const ex = tRef.current?.blocks.flatMap((b) => b.exercises).find((e) => e.key === exercise);
              return { exercise, weight: parseNum(r.weight), target_reps: r.target, reps: r.reps.map((v) => (ex ? valueOf(ex, v) : parseNum(v))) };
            }),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't save");
        const d = (await res.json()) as DayData;
        // Keep what's typed; only refresh the history the charts read.
        setData((cur) => (cur ? { ...cur, history: d.history, logs: d.logs } : d));
        setStatus("saved");
      } catch (err) {
        setStatus("idle");
        toast.error(err instanceof Error ? err.message : "Couldn't save");
      }
    },
    [slug, date],
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const update = (key: string, fn: (r: Row) => Row) => {
    const next = { ...rowsRef.current, [key]: fn(rowsRef.current[key]) };
    rowsRef.current = next;
    setRows(next);
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      dirty.current = false;
      save(next);
    }, 700);
  };

  // Flush a pending save when leaving the page.
  useEffect(
    () => () => {
      if (saveTimer.current && dirty.current) {
        clearTimeout(saveTimer.current);
        save(rowsRef.current);
      }
    },
    [save],
  );

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-6">
        <p className="text-lg">No workout called “{slug}”.</p>
        <Link href="/training/workouts" className="text-primary underline">Open the workout bank</Link>
      </div>
    );
  }
  if (!t || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 py-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  // Every rep table shares the same columns so the sets line up down the page.
  const repBlocks = t.blocks.filter((b) => !b.exercises.every(isTime));
  const maxSets = Math.max(1, ...repBlocks.flatMap((b) => b.exercises.map((e) => e.sets)));
  const pastDates = data ? [...new Set(data.history.map((l) => l.log_date))].filter((d) => d !== date).sort().reverse() : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <header className="space-y-3">
        <Link href="/training" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Training
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t.name}</h1>
            <Link href={`/training/workouts/${t.slug}/edit`} className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Edit workout</Link>
            <div className="mt-1 flex items-center gap-1">
              <Link href={workoutHref(t.slug, addDaysISO(date, -7))} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label="A week earlier">
                <ChevronLeftIcon className="size-5" />
              </Link>
              <span className="text-lg text-muted-foreground">{longDate(date)}</span>
              <Link href={workoutHref(t.slug, addDaysISO(date, 7))} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label="A week later">
                <ChevronRightIcon className="size-5" />
              </Link>
              {date !== todayISO() && (
                <Link href={workoutHref(t.slug, todayISO())} className="ml-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">Today</Link>
              )}
            </div>
          </div>
          <span className={cn("text-sm text-muted-foreground transition-opacity", status === "idle" && "opacity-0")} aria-live="polite">
            {status === "saving" ? "Saving…" : "Saved"}
          </span>
        </div>
      </header>

      {t.warmup && (
        <p className="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Warm-up</span> · {t.warmup}
        </p>
      )}

      {t.blocks.map((b) =>
          b.exercises.every(isTime) ? (
            <section key={b.key} id={b.key} className="overflow-hidden rounded-xl border">
              <h2 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</h2>
              {b.exercises.map((ex) => (
                <TimeRow key={ex.key} ex={ex} row={rows[ex.key]} p={data.prescriptions[ex.key]} onChange={(fn) => update(ex.key, fn)} />
              ))}
            </section>
          ) : (
          <section key={b.key} id={b.key} className="overflow-hidden rounded-xl border">
            <h2 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium sm:px-4">Exercise</th>
                    {Array.from({ length: maxSets }, (_, i) => (
                      <th key={i} className="w-11 px-0.5 py-2 text-center font-medium sm:w-16 sm:px-1">{i < Math.max(...b.exercises.map((e) => e.sets)) ? <><span className="hidden sm:inline">Set </span>{i + 1}</> : ""}</th>
                    ))}
                    <th className="w-[4.75rem] px-2 py-2 text-right font-medium sm:w-32 sm:px-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {b.exercises.map((ex) => (
                    <ExerciseRow
                      key={ex.key}
                      ex={ex}
                      row={rows[ex.key]}
                      p={data.prescriptions[ex.key]}
                      columns={maxSets}
                      onChange={(fn) => update(ex.key, fn)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          ),
      )}

      {t.cooldown && (
        <p className="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Cool-down</span> · {t.cooldown}
        </p>
      )}

      {t.blocks.some((b) => b.exercises.some((e) => e.tracked)) && (
        <section id="progress" className="space-y-3">
          <h2 className="text-xl font-semibold">Progress</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {t.blocks.flatMap((b) => b.exercises).filter((e) => e.tracked).map((ex) => (
              <RepsChart key={ex.key} ex={ex} logs={data.history.filter((l) => l.exercise === ex.key)} />
            ))}
          </div>
        </section>
      )}

      {pastDates.length > 0 && (
        <section id="past-sessions" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past sessions</h2>
          <div className="flex flex-wrap gap-2">
            {pastDates.map((d) => (
              <Link key={d} href={workoutHref(t.slug, d)} className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted">{shortDate(d)}</Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ExerciseRow({ ex, row, p, columns, onChange }: { ex: TemplateExercise; row: Row | undefined; p: (Prescription & { last: StrengthLog | null }) | undefined; columns: number; onChange: (fn: (r: Row) => Row) => void }) {
  if (!row) return null;
  const reps = row.reps.map(parseNum);
  const total = totalReps(reps);
  const goal = row.target * ex.sets;
  const allHit = hitAll(ex, { reps, target_reps: row.target });
  const rung = ex.ladder.indexOf(row.target);
  const nextRung = rung >= 0 ? ex.ladder[rung + 1] : undefined;
  const sameWeightAsLast = p?.last && String(p.last.weight ?? "") === row.weight;
  const placeholders = sameWeightAsLast ? p!.last!.reps : [];

  const setWeight = (w: string) =>
    onChange((r) => {
      // A new weight starts back at the bottom of the ladder.
      const back = p && String(p.weight ?? "") === w;
      return { ...r, weight: w, target: back ? p.target : ex.ladder[0] };
    });

  return (
    <tr className="border-t align-middle">
      <td className="px-3 py-2.5 sm:px-4">
        <span className="block font-medium leading-snug">{ex.name}</span>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground/80">{row.target ? `× ${row.target}${ex.unit === "m" ? " m" : ""}` : "log it"}</span>
          <span aria-hidden>·</span>
          <WeightField ex={ex} value={row.weight} onChange={setWeight} />
        </div>
        {p?.bumpSuggested && sameWeightAsLast && (
          <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">All sets hit {row.target} last time. Add weight?</p>
        )}
      </td>
      {row.reps.map((v, i) => {
        const n = parseNum(v);
        return (
          <td key={i} className="px-0.5 py-2.5 text-center sm:px-1">
            <input
              // pattern brings up the plain number pad on iOS; selecting on every
              // tap (even of the box already focused) means typing replaces it.
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              value={v}
              placeholder={display(ex, placeholders[i])}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 3);
                onChange((r) => ({ ...r, reps: r.reps.map((x, j) => (j === i ? val : x)) }));
              }}
              className={cn(
                "h-11 w-10 rounded-md border bg-background text-center text-lg tabular-nums placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 sm:w-14",
                hitSet(ex, n, row.target) && "border-emerald-500/60 bg-emerald-500/10",
              )}
              aria-label={`${ex.name} set ${i + 1} reps`}
            />
          </td>
        );
      })}
      {Array.from({ length: columns - row.reps.length }, (_, i) => (
        <td key={`pad-${i}`} />
      ))}
      <td className="px-2 py-2.5 text-right sm:px-4">
        {/* Tap the total to fill any empty sets with the target (typed sets are kept). */}
        <button
          type="button"
          onClick={() => r0Fill(onChange)}
          className="inline-flex h-11 items-center justify-end gap-1.5 rounded-md px-1 hover:bg-muted sm:px-2"
          aria-label={`Fill empty ${ex.name} sets with ${row.target}`}
          title={`Fill empty sets with ${row.target}`}
        >
          <span className={cn("text-base tabular-nums sm:text-lg", allHit ? "font-semibold text-emerald-700 dark:text-emerald-400" : total ? "" : "text-muted-foreground/50")}>
            {total}/{goal}
          </span>
          <CheckIcon className="hidden size-4 text-muted-foreground sm:block" />
        </button>
        {allHit && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">{nextRung ? `Next: × ${nextRung}` : ex.ladder.length > 1 ? "Top rung, add weight" : ""}</p>
        )}
      </td>
    </tr>
  );
}

/** Fill any empty sets with the target (typed sets are kept). */
function r0Fill(onChange: (fn: (r: Row) => Row) => void, ex?: TemplateExercise) {
  onChange((r) => (r.target ? { ...r, reps: r.reps.map((x) => (x === "" ? (ex ? display(ex, r.target) : String(r.target)) : x)) } : r));
}

/** The weight next to an exercise's name: "BW" for bodyweight, else an editable number. */
function WeightField({ ex, value, onChange }: { ex: TemplateExercise; value: string; onChange: (w: string) => void }) {
  if (ex.weight === null && !ex.loaded) return isTime(ex) ? null : <span>BW</span>;
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      <input
        inputMode="decimal"
        autoComplete="off"
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.currentTarget.select()}
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className={cn("w-10 rounded border px-0.5 py-0.5 text-base tabular-nums sm:w-11 sm:text-sm hover:border-border focus:border-ring focus:outline-none", value ? "border-transparent bg-transparent" : "border-border bg-background")}
        aria-label={`${ex.name} weight`}
      />
      <span>{ex.perSide ? "/side" : (ex.weightUnit ?? "lbs")}</span>
    </span>
  );
}

/**
 * A timed exercise (a 1 km rep, a station, a 5 km split): one time box per set,
 * wrapping on a phone. Type "345" for 3:45 — the number pad has no colon.
 */
function TimeRow({ ex, row, p, onChange }: { ex: TemplateExercise; row: Row | undefined; p: (Prescription & { last: StrengthLog | null }) | undefined; onChange: (fn: (r: Row) => Row) => void }) {
  if (!row) return null;
  const values = row.reps.map((v) => parseTime(v));
  const done = values.filter((v): v is number => v !== null);
  const total = done.reduce((a, b) => a + b, 0);
  const allHit = hitAll(ex, { reps: values, target_reps: row.target });
  const placeholders = p?.last?.reps ?? [];
  const single = ex.sets === 1;
  const box = (v: string, i: number) => (
    <input
      inputMode="numeric"
      pattern="[0-9:]*"
      autoComplete="off"
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.currentTarget.select()}
      value={v}
      placeholder={display(ex, placeholders[i]) || "m:ss"}
      onChange={(e) => {
        const val = e.target.value.replace(/[^\d:]/g, "").slice(0, 8);
        onChange((r) => ({ ...r, reps: r.reps.map((x, j) => (j === i ? val : x)) }));
      }}
      // Typed as digits; tidied to m:ss once he moves on.
      onBlur={(e) => {
        const sec = parseTime(e.target.value);
        if (sec !== null && formatTime(sec) !== e.target.value) onChange((r) => ({ ...r, reps: r.reps.map((x, j) => (j === i ? formatTime(sec) : x)) }));
      }}
      className={cn(
        "h-11 w-[4.75rem] shrink-0 rounded-md border bg-background text-center text-lg tabular-nums placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30",
        hitSet(ex, values[i], row.target) && "border-emerald-500/60 bg-emerald-500/10",
      )}
      aria-label={`${ex.name}${ex.sets > 1 ? ` set ${i + 1}` : ""} time`}
    />
  );
  return (
    <div className="border-t px-3 py-3 first:border-t-0 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-medium leading-snug">{ex.name}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground/80">{row.target ? `≤ ${formatTime(row.target)}` : "log the time"}</span>
            {ex.sets > 1 && <span>· {ex.sets} sets</span>}
            {(ex.weight !== null || ex.loaded) && (
              <>
                <span aria-hidden>·</span>
                <WeightField ex={ex} value={row.weight} onChange={(w) => onChange((r) => ({ ...r, weight: w }))} />
              </>
            )}
          </div>
          {ex.note && <p className="mt-0.5 text-xs text-muted-foreground">{ex.note}</p>}
        </div>
        {single ? (
          box(row.reps[0], 0)
        ) : done.length > 0 && (
          <div className="shrink-0 text-right">
            <span className={cn("text-base tabular-nums sm:text-lg", allHit && "font-semibold text-emerald-700 dark:text-emerald-400")}>{formatTime(total)}</span>
            {done.length > 1 && <p className="text-xs tabular-nums text-muted-foreground">avg {formatTime(total / done.length)}</p>}
          </div>
        )}
      </div>
      {!single && (
        <div className="mt-2 flex flex-wrap gap-2">
          {row.reps.map((v, i) => (
            <label key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              {box(v, i)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── progress chart: total per session against the target ─────────────────

const CW = 360;
const CH = 170;
const M = { top: 16, right: 12, bottom: 24, left: 32 };

function RepsChart({ ex, logs }: { ex: TemplateExercise; logs: StrengthLog[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Reps chart the session total against sets × rung. Times chart the average per
  // set against the target, so a half-logged session doesn't read as a fast one.
  const points = useMemo(
    () =>
      logs.map((l) => {
        const done = l.reps.filter((r): r is number => r !== null);
        return isTime(ex)
          ? { date: l.log_date, total: done.length ? totalReps(done) / done.length : 0, goal: l.target_reps, weight: l.weight, target: l.target_reps }
          : { date: l.log_date, total: totalReps(l.reps), goal: l.target_reps * ex.sets, weight: l.weight, target: l.target_reps };
      }),
    [logs, ex],
  );
  const latest = points[points.length - 1];
  const timed = isTime(ex);
  const fmt = (v: number) => (timed ? formatTime(v) : String(v));
  const hit = (p: { total: number; goal: number }) => p.goal > 0 && (timed ? p.total <= p.goal : p.total >= p.goal);

  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-medium">{ex.name}</h3>
      {latest && (
        <span className="text-sm tabular-nums text-muted-foreground">
          {timed && ex.sets > 1 ? "avg " : ""}
          {latest.goal ? `${fmt(latest.total)} / ${timed ? "≤ " : ""}${fmt(latest.goal)}` : fmt(latest.total)}
          {latest.weight !== null && ` · ${latest.weight}${ex.perSide ? "/side" : ` ${ex.weightUnit ?? "lbs"}`}`}
        </span>
      )}
    </div>
  );

  if (points.length === 0) {
    return (
      <div className="rounded-xl border p-4">
        {header}
        <p className="mt-6 pb-4 text-center text-sm text-muted-foreground/70">Log a session to start the line.</p>
      </div>
    );
  }

  // Reps: scaled to the top of the ladder (4 × 20 = 80) so the whole climb fits from
  // day one. Times: a little headroom over the slowest session, ticks on whole minutes.
  const ceiling = timed ? 0 : ex.sets * (ex.ladder[ex.ladder.length - 1] ?? 0);
  // Times zoom in on the band around his paces — the seconds are what move.
  const vals = points.flatMap((p) => (p.goal ? [p.total, p.goal] : [p.total])).filter((v) => v > 0);
  const step = timed ? (Math.max(...vals) > 1200 ? 60 : 15) : ceiling <= 40 ? 10 : 20;
  const yMin = timed ? Math.max(0, Math.floor((Math.min(...vals) * 0.95) / step) * step) : 0;
  const yMax = timed ? Math.ceil((Math.max(...vals) * 1.05) / step) * step : Math.max(ceiling, ...points.map((p) => p.total)) * 1.08 || 1;
  const ticks = Array.from({ length: Math.floor((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step).filter((_, i, a) => a.length <= 6 || i % Math.ceil(a.length / 5) === 0);
  const n = points.length;
  const x = (i: number) => (n === 1 ? (M.left + CW - M.right) / 2 : M.left + (i / (n - 1)) * (CW - M.left - M.right));
  const y = (v: number) => CH - M.bottom - ((v - yMin) / (yMax - yMin || 1)) * (CH - M.top - M.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.total)}`).join(" ");
  // The target steps up the ladder: a dashed step line, flat until the rung changes.
  const goalPath = points
    .map((p, i) => {
      const half = n === 1 ? 40 : (CW - M.left - M.right) / (n - 1) / 2;
      const x0 = i === 0 ? x(i) - (n === 1 ? half : 0) : x(i) - half;
      const x1 = i === n - 1 ? x(i) + (n === 1 ? half : 0) : x(i) + half;
      return `M ${x0} ${y(p.goal)} L ${x1} ${y(p.goal)}`;
    })
    .join(" ");
  const weightJumps = points.map((p, i) => (i > 0 && p.weight !== points[i - 1].weight ? i : -1)).filter((i) => i > 0);
  const h = hover === null ? null : points[hover];

  return (
    <div className="rounded-xl border p-4">
      {header}
      <svg viewBox={`0 0 ${CW} ${CH}`} className="mt-2 h-auto w-full overflow-visible" role="img" aria-label={`${ex.name}: total ${timed ? "time" : "reps"} per session`} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={CW - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeOpacity={v === yMin ? 1 : 0.35} />
            <text x={M.left - 6} y={y(v)} dy={3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">{fmt(v)}</text>
          </g>
        ))}
        {weightJumps.map((i) => (
          <g key={i}>
            <line x1={x(i) - (CW - M.left - M.right) / Math.max(1, n - 1) / 2} x2={x(i) - (CW - M.left - M.right) / Math.max(1, n - 1) / 2} y1={M.top} y2={CH - M.bottom} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
            <text x={x(i)} y={M.top - 4} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">{points[i].weight}</text>
          </g>
        ))}
        <path d={points.some((p) => p.goal > 0) ? goalPath : ""} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 3" />
        {n > 1 && <path d={line} fill="none" stroke="var(--chart-series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.total)} r={hover === i ? 6 : 4} fill={hit(p) ? "var(--chart-series-3)" : "var(--chart-series-1)"} stroke="var(--background)" strokeWidth={2} />
            {/* A wide invisible target so hovering anywhere near the point works. */}
            <rect x={x(i) - 16} y={M.top} width={32} height={CH - M.top - M.bottom} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          </g>
        ))}
        <text x={M.left} y={CH - 6} fontSize={10} fill="var(--muted-foreground)">{shortDate(points[0].date)}</text>
        {n > 1 && <text x={CW - M.right} y={CH - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">{shortDate(latest.date)}</text>}
      </svg>
      <p className="mt-1 min-h-5 text-xs tabular-nums text-muted-foreground">
        {h
          ? `${shortDate(h.date)} · ${timed ? `${ex.sets > 1 ? "avg " : ""}${fmt(h.total)}${h.goal ? ` vs ${fmt(h.goal)}` : ""}` : `${h.total}/${h.goal} reps (× ${h.target})`}${h.weight !== null ? ` at ${h.weight}${ex.perSide ? "/side" : ` ${ex.weightUnit ?? "lbs"}`}` : ""}`
          : timed ? `${ex.sets > 1 ? "Average per set · " : ""}lower is faster · dashed: target` : "Dashed line: the target (sets × rung)"}
      </p>
    </div>
  );
}
