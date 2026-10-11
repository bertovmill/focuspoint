"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon, MinusIcon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkoutTimer, useSegments, type Segment } from "@/app/_components/workout-timer";
import { addDaysISO, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import {
  checklistParts,
  cuesFor,
  formatTime,
  hitAll,
  hitSet,
  nextPrescription,
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
  /** Warm-up / cool-down ticks for the day, one per part. */
  checks?: Record<string, boolean[]>;
}

interface Row {
  weight: string;
  /** Timed sets: how many reps / metres, e.g. "100". */
  amount: string;
  target: number;
  reps: string[];
  /** Next session's target if he set one (10 → 12); "" = follow the ladder. */
  next: string;
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
      ? { weight: log.weight === null ? "" : String(log.weight), amount: log.amount == null ? (p?.amount == null ? "" : String(p.amount)) : String(log.amount), target: log.target_reps, reps: Array.from({ length: Math.max(ex.sets, log.reps.length) }, (_, i) => display(ex, log.reps[i])), next: log.next_target ? String(log.next_target) : "" }
      : { weight: p?.weight == null ? "" : String(p.weight), amount: p?.amount == null ? "" : String(p.amount), target: p?.target ?? ex.ladder[0] ?? 0, reps: Array(ex.sets).fill(""), next: "" };
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
              return { exercise, weight: parseNum(r.weight), amount: parseNum(r.amount), target_reps: r.target, next_target: parseNum(r.next), reps: r.reps.map((v) => (ex ? valueOf(ex, v) : parseNum(v))) };
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
  const segments = useSegments(t);
  const [active, setActive] = useState<Segment | null>(null);

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

  // The lap timer writes each split straight into its time box (and so autosaves).
  const onSplit = (seg: Segment, seconds: number) =>
    update(seg.exKey, (r) => ({ ...r, reps: r.reps.map((x, j) => (j === seg.set ? formatTime(seconds) : x)) }));

  // Renaming an exercise or rewriting its cues here changes it in the bank, so every
  // later session (and the charts) use it. The key stays, so its history carries over.
  const updateExercise = async (key: string, patch: Partial<Pick<TemplateExercise, "name" | "cues">>) => {
    const res = await fetch(`/api/training/bank/${slug}`);
    if (!res.ok) throw new Error("Couldn't load the workout");
    const def = (await res.json()) as WorkoutTemplate;
    for (const b of def.blocks) for (const e of b.exercises) if (e.key === key) Object.assign(e, patch);
    const put = await fetch(`/api/training/bank/${slug}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(def) });
    if (!put.ok) throw new Error((await put.json().catch(() => ({})))?.error ?? "Couldn't save");
    const saved = (await put.json()) as WorkoutTemplate;
    setData((cur) => (cur ? { ...cur, template: { ...cur.template, blocks: saved.blocks } } : cur));
  };
  const renameExercise = (key: string, name: string) => updateExercise(key, { name });
  const saveCues = (key: string, cues: string) => updateExercise(key, { cues });

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

      <VsLastWeek t={t} date={date} history={data.history} rows={rows} />

      {t.warmup && <Checklist key={`warmup-${date}`} id="warm-up" label="Warm-up" part="warmup" text={t.warmup} slug={t.slug} date={date} initial={data.checks?.warmup} />}

      {t.blocks.map((b) =>
          b.exercises.every(isTime) ? (
            <section key={b.key} id={b.key} className="overflow-hidden rounded-xl border">
              <h2 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</h2>
              {b.exercises.map((ex) => (
                <TimeRow key={ex.key} ex={ex} row={rows[ex.key]} p={data.prescriptions[ex.key]} activeSet={active?.exKey === ex.key ? active.set : null} onChange={(fn) => update(ex.key, fn)} onRename={(n) => renameExercise(ex.key, n)} onSaveCues={(c) => saveCues(ex.key, c)} />
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
                      onRename={(n) => renameExercise(ex.key, n)}
                      onSaveCues={(c) => saveCues(ex.key, c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          ),
      )}

      {t.cooldown && <Checklist key={`cooldown-${date}`} id="cool-down" label="Cool-down" part="cooldown" text={t.cooldown} slug={t.slug} date={date} initial={data.checks?.cooldown} />}

      <WeekCompare t={t} date={date} history={data.history} rows={rows} />

      {t.blocks.some((b) => b.exercises.some((e) => e.tracked)) && (
        <section id="progress" className="space-y-3">
          <h2 className="text-xl font-semibold">Progress</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(() => {
              // Same exercise in two rounds (wall balls) → title each chart with its round.
              const tracked = t.blocks.flatMap((b) => b.exercises.filter((e) => e.tracked).map((ex) => ({ ex, block: b.label })));
              const dup = (name: string) => tracked.filter((x) => x.ex.name === name).length > 1;
              return tracked.map(({ ex, block }) => (
                <RepsChart key={ex.key} ex={dup(ex.name) ? { ...ex, name: `${ex.name} · ${block}` } : ex} logs={data.history.filter((l) => l.exercise === ex.key)} />
              ));
            })()}
          </div>
        </section>
      )}

      {segments.length > 0 && <WorkoutTimer slug={t.slug} date={date} segments={segments} onSplit={onSplit} onActive={setActive} />}

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

function ExerciseRow({ ex, row, p, columns, onChange, onRename, onSaveCues }: { ex: TemplateExercise; row: Row | undefined; p: (Prescription & { last: StrengthLog | null }) | undefined; columns: number; onChange: (fn: (r: Row) => Row) => void; onRename: (name: string) => Promise<void>; onSaveCues: (cues: string) => Promise<void> }) {
  const [showCues, setShowCues] = useState(false);
  const [showNext, setShowNext] = useState(false);
  if (!row) return null;
  const reps = row.reps.map(parseNum);
  const total = totalReps(reps);
  const goal = row.target * ex.sets;
  const allHit = hitAll(ex, { reps, target_reps: row.target });
  // What next session would aim for on the ladder alone, and what he's set instead.
  const ladderNext = nextPrescription(ex, { template: "", log_date: "", exercise: ex.key, weight: parseNum(row.weight), target_reps: row.target, reps }).target;
  const chosenNext = parseNum(row.next);
  const next = chosenNext ?? ladderNext;
  const setNext = (n: number | null) => onChange((r) => ({ ...r, next: n === null || n === ladderNext ? "" : String(n) }));
  const sameWeightAsLast = p?.last && String(p.last.weight ?? "") === row.weight;
  const placeholders = sameWeightAsLast ? p!.last!.reps : [];

  const setWeight = (w: string) =>
    onChange((r) => {
      // A new weight starts back at the bottom of the ladder.
      const back = p && String(p.weight ?? "") === w;
      return { ...r, weight: w, target: back ? p.target : ex.ladder[0] };
    });

  return (
    <>
    <tr className="border-t align-middle">
      <td className="px-3 py-2.5 sm:px-4">
        {/* Inline, so the ⓘ follows the name and pencil instead of narrowing the column. */}
        <span className="block">
          <ExerciseName name={ex.name} onRename={onRename} className="inline" />
          <CuesButton name={ex.name} open={showCues} onClick={() => setShowCues((o) => !o)} />
        </span>
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
        // An empty set with a target is one tap to log: the tap fills it with the
        // target and no keyboard comes up (read-only, then blurred). Most sets hit
        // the target, so the number pad is only for the ones that don't — tap the
        // filled box again to change it.
        const fillable = v === "" && row.target > 0;
        const setRep = (val: string) => onChange((r) => ({ ...r, reps: r.reps.map((x, j) => (j === i ? val : x)) }));
        return (
          <td key={i} className="px-0.5 py-2.5 text-center sm:px-1">
            <input
              // pattern brings up the plain number pad on iOS; selecting on every
              // tap (even of the box already focused) means typing replaces it.
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              readOnly={fillable}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => {
                if (fillable) {
                  setRep(String(row.target));
                  e.currentTarget.blur();
                } else e.currentTarget.select();
              }}
              // Tabbed in on a computer: a typed digit still goes in.
              onKeyDown={(e) => {
                if (fillable && /^\d$/.test(e.key)) {
                  e.preventDefault();
                  setRep(e.key);
                }
              }}
              value={v}
              placeholder={display(ex, placeholders[i])}
              onChange={(e) => {
                setRep(e.target.value.replace(/\D/g, "").slice(0, 3));
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
        {(allHit || chosenNext !== null) && row.target > 0 && (
          // Tap to set next session's target yourself (10 → 12 instead of the ladder's 15).
          <button
            type="button"
            onClick={() => setShowNext((o) => !o)}
            aria-expanded={showNext}
            className="inline-flex min-h-8 items-center text-xs font-medium text-emerald-700 underline decoration-dotted underline-offset-2 dark:text-emerald-400"
          >
            {next > row.target || chosenNext !== null ? `Next: × ${next}` : ex.ladder.length > 1 ? "Top rung, add weight" : `Next: × ${next}`}
          </button>
        )}
      </td>
    </tr>
    {showNext && (
      <tr>
        <td colSpan={columns + 2} className="px-3 pb-3 sm:px-4">
          <NextTarget ex={ex} current={row.target} ladderNext={ladderNext} value={next} chosen={chosenNext !== null} onSet={setNext} />
        </td>
      </tr>
    )}
    {showCues && (
      <tr>
        <td colSpan={columns + 2} className="px-3 pb-3 sm:px-4">
          <Cues ex={ex} onSave={onSaveCues} />
        </td>
      </tr>
    )}
    </>
  );
}

/**
 * Set next session's target from today's log (Berto, 2026-10-11: after a clean
 * set of 10s he goes to 12, not the ladder's 15). Saved with today's row, so next
 * week opens at that number.
 */
function NextTarget({ ex, current, ladderNext, value, chosen, onSet }: { ex: TemplateExercise; current: number; ladderNext: number; value: number; chosen: boolean; onSet: (n: number | null) => void }) {
  const unit = ex.unit === "m" ? " m" : "";
  const options = [
    { label: "Same", n: current },
    { label: "+1", n: current + 1 },
    { label: "+2", n: current + 2 },
    ...(ex.ladder.length > 1 && ladderNext > current + 2 ? [{ label: "Ladder", n: ladderNext }] : []),
  ];
  return (
    <div className="space-y-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Next session</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onSet(Math.max(1, value - 1))} className="flex size-9 items-center justify-center rounded-md border bg-background" aria-label="One fewer rep next session">
            <MinusIcon className="size-4" />
          </button>
          <span className="w-14 text-center text-lg font-semibold tabular-nums" aria-live="polite">× {value}{unit}</span>
          <button type="button" onClick={() => onSet(value + 1)} className="flex size-9 items-center justify-center rounded-md border bg-background" aria-label="One more rep next session">
            <PlusIcon className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onSet(o.n)}
            className={cn("h-9 rounded-full border px-3 tabular-nums", value === o.n ? "border-foreground bg-foreground text-background" : "bg-background")}
          >
            {o.label} · {o.n}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {chosen ? `Next session starts at × ${value}. ` : `Following the ladder: × ${ladderNext}. `}
        {chosen && (
          <button type="button" onClick={() => onSet(null)} className="underline underline-offset-2">Back to the ladder</button>
        )}
      </p>
    </div>
  );
}

/** The ⓘ next to an exercise's name: opens its coaching cues. */
function CuesButton({ name, open, onClick }: { name: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`Coaching cues for ${name}`}
      className={cn("-my-1.5 ml-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full align-middle", open ? "text-primary" : "text-muted-foreground/60 hover:text-foreground")}
    >
      <InfoIcon className="size-4" />
    </button>
  );
}

/**
 * One or two coaching cues for an exercise (Berto, 2026-10-11). Stock cues until
 * he edits them; saving writes them into the bank, so every later session shows his.
 */
function Cues({ ex, onSave }: { ex: TemplateExercise; onSave: (cues: string) => Promise<void> }) {
  const text = cuesFor(ex);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const next = (draft ?? "").trim();
    if (next === text) return setDraft(null);
    setSaving(true);
    try {
      await onSave(next);
      setDraft(null);
      toast.success("Cues saved", { description: "Every session from now on shows them." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the cues");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
      {draft !== null ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            disabled={saving}
            maxLength={400}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
            placeholder="One or two things to remember on this one"
            className="w-full resize-y rounded-md border bg-background px-2.5 py-2 text-base leading-snug focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            aria-label={`Coaching cues for ${ex.name}`}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="h-9 rounded-md px-3 text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="h-9 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">Save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className={cn("flex-1 whitespace-pre-line leading-snug", !text && "text-muted-foreground")}>{text || "No cues yet."}</p>
          <button type="button" onClick={() => setDraft(text)} className="-my-1 flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-muted-foreground hover:text-foreground">
            <PencilIcon className="size-3.5" /> {text ? "Edit" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * An exercise's name; tap it to rename. The new name goes into the bank, so it
 * sticks for every session after this one, not just today's (Berto, 2026-10-06).
 */
function ExerciseName({ name, onRename, className }: { name: string; onRename: (name: string) => Promise<void>; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    const next = (draft ?? "").trim();
    if (!next || next === name) return setDraft(null);
    setSaving(true);
    try {
      await onRename(next);
      setDraft(null);
      toast.success(`Renamed to ${next}`, { description: "Every session from now on uses it." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename");
    } finally {
      setSaving(false);
    }
  };
  if (draft !== null) {
    return (
      <input
        autoFocus
        enterKeyHint="done"
        autoComplete="off"
        value={draft}
        disabled={saving}
        maxLength={80}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-full min-w-0 rounded-md border bg-background px-2 py-1 text-base font-medium focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
        aria-label="Exercise name"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setDraft(name)}
      className={cn("group text-left font-medium leading-snug", className)}
      title="Rename for this and every future session"
    >
      {name}
      <PencilIcon className="ml-1.5 inline size-3.5 align-[-1px] text-muted-foreground/40 group-hover:text-muted-foreground" aria-hidden />
      <span className="sr-only"> (rename)</span>
    </button>
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
function TimeRow({ ex, row, p, activeSet, onChange, onRename, onSaveCues }: { ex: TemplateExercise; row: Row | undefined; p: (Prescription & { last: StrengthLog | null }) | undefined; activeSet: number | null; onChange: (fn: (r: Row) => Row) => void; onRename: (name: string) => Promise<void>; onSaveCues: (cues: string) => Promise<void> }) {
  const [showCues, setShowCues] = useState(false);
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
        activeSet === i && "ring-2 ring-primary",
      )}
      aria-label={`${ex.name}${ex.sets > 1 ? ` set ${i + 1}` : ""} time`}
    />
  );
  return (
    <div className="border-t px-3 py-3 first:border-t-0 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-1.5 font-medium leading-snug">
            <ExerciseName name={ex.name} onRename={onRename} />
            <CuesButton name={ex.name} open={showCues} onClick={() => setShowCues((o) => !o)} />
            {ex.amount !== undefined && (
              // The count is his to change on the day (100 wall balls → 120).
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-normal text-muted-foreground">
                ×
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  value={row.amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    onChange((r) => ({ ...r, amount: v }));
                  }}
                  className="h-8 w-14 rounded border bg-background text-center text-base tabular-nums focus:border-ring focus:outline-none"
                  aria-label={`${ex.name} ${ex.amountUnit ?? "reps"}`}
                />
                {ex.amountUnit ?? "reps"}
              </span>
            )}
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground/80">{row.target ? `≤ ${formatTime(row.target)}` : "log the time"}</span>
            {!single && <span>· {row.reps.length} {row.reps.length === 1 ? "rep" : "reps"}{row.reps.length !== ex.sets ? ` (plan ${ex.sets})` : ""}</span>}
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
      {showCues && (
        <div className="mt-2">
          <Cues ex={ex} onSave={onSaveCues} />
        </div>
      )}
      {!single && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {row.reps.map((v, i) => (
            <label key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              {box(v, i)}
            </label>
          ))}
          {/* Some days are 8 or 10 reps instead of the planned 6 (Berto, 2026-10-04). */}
          <button
            type="button"
            onClick={() => onChange((r) => ({ ...r, reps: [...r.reps, ""] }))}
            className="flex h-11 items-center gap-1 rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:border-solid hover:text-foreground"
            aria-label={`Add a ${ex.name}`}
          >
            <PlusIcon className="size-4" /> Rep
          </button>
          {row.reps.length > ex.sets && (
            <button
              type="button"
              onClick={() => onChange((r) => ({ ...r, reps: r.reps.slice(0, -1) }))}
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove the last ${ex.name}`}
              title="Remove the last rep"
            >
              <MinusIcon className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The warm-up or cool-down as tick boxes, one per part ("15 min easy", "4 × 20 s
 * strides"). Saved per day straight away.
 */
function Checklist({ id, label, part, text, slug, date, initial }: { id: string; label: string; part: "warmup" | "cooldown"; text: string; slug: string; date: string; initial?: boolean[] }) {
  const parts = checklistParts(text);
  const [done, setDone] = useState<boolean[]>(() => parts.map((_, i) => Boolean(initial?.[i])));
  const all = parts.length > 0 && done.every(Boolean);
  const toggle = async (i: number) => {
    const next = parts.map((_, j) => (j === i ? !done[j] : Boolean(done[j])));
    setDone(next);
    try {
      const res = await fetch(`/api/training/workouts/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, part, done: next }) });
      if (!res.ok) throw new Error();
    } catch {
      setDone(done);
      toast.error(`Couldn't save the ${label.toLowerCase()}`);
    }
  };
  return (
    <section id={id} className={cn("overflow-hidden rounded-xl border", all && "border-emerald-500/40")}>
      <h2 className={cn("flex items-center justify-between border-b px-4 py-2 text-sm font-semibold uppercase tracking-wide", all ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted/40 text-muted-foreground")}>
        {label}
        {all && <CheckIcon className="size-4" />}
      </h2>
      <ul>
        {parts.map((p, i) => (
          <li key={i} className="border-t first:border-t-0">
            <button type="button" onClick={() => toggle(i)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/40" aria-pressed={done[i]} aria-label={p}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2", done[i] ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40")}>
                {done[i] && <CheckIcon className="size-4" />}
              </span>
              <span className={cn("text-base", done[i] && "text-muted-foreground line-through")}>{p}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── this week against the weeks before ────────────────────────────────────

/** One exercise on one day: total reps, or the average time per set; weight alongside. */
interface Score {
  value: number;
  weight: number | null;
}

function scoreOf(ex: TemplateExercise, reps: (number | null)[], weight: number | null): Score | null {
  const done = reps.filter((r): r is number => r !== null && r > 0);
  if (done.length === 0) return null;
  return { value: isTime(ex) ? totalReps(done) / done.length : totalReps(done), weight };
}

/** Better than the week before: more reps (or any at a heavier weight), or a faster time. */
function beats(ex: TemplateExercise, cur: Score, prev: Score) {
  if (isTime(ex)) return cur.value < prev.value;
  const w = cur.weight ?? 0;
  const pw = prev.weight ?? 0;
  return w > pw || (w === pw && cur.value > prev.value);
}

/**
 * The last few sessions of this workout and this one, side by side (Berto,
 * 2026-10-11: something motivating to hold this week up against). Today's column
 * reads what's typed, so it moves as he logs.
 */
function useWeeks(t: WorkoutTemplate, date: string, history: StrengthLog[], rows: Record<string, Row>, previous = 3) {
  return useMemo(() => {
    const exercises = t.blocks.flatMap((b) => b.exercises);
    const logged = (l: StrengthLog) => l.log_date < date && l.reps.some((r) => r !== null && r > 0);
    const dates = [...new Set(history.filter(logged).map((l) => l.log_date))].sort().slice(-previous);
    const scores = new Map<string, (Score | null)[]>();
    for (const ex of exercises) {
      const past = dates.map((d) => {
        const l = history.find((h) => h.exercise === ex.key && h.log_date === d);
        return l ? scoreOf(ex, l.reps, l.weight) : null;
      });
      const r = rows[ex.key];
      const now = r ? scoreOf(ex, r.reps.map((v) => valueOf(ex, v)), parseNum(r.weight)) : null;
      scores.set(ex.key, [...past, now]);
    }
    // Total reps across the rep exercises (timed sets don't add up with reps).
    const totals = [...dates, date].map((_, i) =>
      exercises.filter((ex) => !isTime(ex)).reduce((n, ex) => n + (scores.get(ex.key)?.[i]?.value ?? 0), 0),
    );
    return { exercises, dates, scores, totals };
  }, [t, date, history, rows, previous]);
}

/** One line near the top: this session's reps against last week's, linking down to the table. */
function VsLastWeek({ t, date, history, rows }: { t: WorkoutTemplate; date: string; history: StrengthLog[]; rows: Record<string, Row> }) {
  const { dates, totals } = useWeeks(t, date, history, rows, 1);
  if (dates.length === 0) return null;
  const last = totals[0];
  const now = totals[1];
  if (!last) return null;
  const ahead = now - last;
  return (
    <a href="#week-compare" className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-base hover:bg-muted/40", ahead > 0 && "border-emerald-500/40 bg-emerald-500/5")}>
      <span>
        {now === 0 ? (
          <>Last time: <span className="font-semibold tabular-nums">{last} reps</span>. Beat it.</>
        ) : ahead > 0 ? (
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{ahead} reps up on last time</span>
        ) : ahead === 0 ? (
          <span className="font-semibold">Level with last time</span>
        ) : (
          <><span className="font-semibold tabular-nums">{-ahead} more</span> to match last time</>
        )}
        <span className="text-muted-foreground tabular-nums"> · {now}/{last}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

/** Each exercise across the last three sessions and this one. Green = better than the week before. */
function WeekCompare({ t, date, history, rows }: { t: WorkoutTemplate; date: string; history: StrengthLog[]; rows: Record<string, Row> }) {
  const { exercises, dates, scores, totals } = useWeeks(t, date, history, rows);
  if (dates.length === 0) return null;
  const cols = [...dates, date];
  const cur = cols.length - 1;
  const label = (d: string, i: number) => (i === cur ? (d === todayISO() ? "Today" : shortDate(d)) : shortDate(d));
  const weightLabel = (ex: TemplateExercise, w: number | null) => (w === null ? "" : `${w}${ex.perSide ? "/side" : ex.weightUnit ?? ""}`);
  return (
    <section id="week-compare" className="scroll-mt-4 space-y-2">
      <h2 className="text-xl font-semibold">Week over week</h2>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium sm:px-4">Exercise</th>
              {cols.map((d, i) => (
                <th key={d} className={cn("w-14 px-1 py-2 text-right font-medium sm:w-20 sm:px-3", i === cur && "text-foreground")}>{label(d, i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exercises.map((ex) => {
              const row = scores.get(ex.key)!;
              if (row.every((s) => s === null)) return null;
              return (
                <tr key={ex.key} className="border-t first:border-t-0">
                  <td className="px-3 py-2 text-sm leading-snug sm:px-4">{ex.name}</td>
                  {row.map((s, i) => {
                    // Against the nearest earlier week that has a number.
                    const prev = row.slice(0, i).reverse().find((x): x is Score => x !== null);
                    const up = s && prev && beats(ex, s, prev);
                    const newWeight = s && prev && s.weight !== prev.weight && s.weight !== null;
                    return (
                      <td key={i} className={cn("px-1 py-2 text-right tabular-nums sm:px-3", i === cur && "bg-muted/30 font-semibold")}>
                        {s ? (
                          <>
                            <span className={cn(up && "text-emerald-700 dark:text-emerald-400")}>{isTime(ex) ? formatTime(s.value) : s.value}</span>
                            {newWeight && <span className="block text-[11px] font-normal text-muted-foreground">{weightLabel(ex, s.weight)}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground/40">–</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {totals.some(Boolean) && (
              <tr className="border-t-2 font-semibold">
                <td className="px-3 py-2 text-sm sm:px-4">Total reps</td>
                {totals.map((n, i) => (
                  <td key={i} className={cn("px-1 py-2 text-right tabular-nums sm:px-3", i === cur && "bg-muted/30", i > 0 && n > totals[i - 1] && totals[i - 1] > 0 && "text-emerald-700 dark:text-emerald-400")}>
                    {n || <span className="font-normal text-muted-foreground/40">–</span>}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Green: better than the session before — more reps, a heavier weight, or a faster time. Times are the average per set.</p>
    </section>
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
          ? { date: l.log_date, total: done.length ? totalReps(done) / done.length : 0, goal: l.target_reps, weight: l.weight, target: l.target_reps, amount: l.amount ?? null }
          : { date: l.log_date, total: totalReps(l.reps), goal: l.target_reps * ex.sets, weight: l.weight, target: l.target_reps, amount: null };
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
  // A new weight — or, for a timed station, a new count (100 → 120 wall balls) — starts a new segment.
  const weightJumps = points.map((p, i) => (i > 0 && (p.weight !== points[i - 1].weight || p.amount !== points[i - 1].amount) ? i : -1)).filter((i) => i > 0);
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
            <text x={x(i)} y={M.top - 4} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">{points[i].amount !== points[i - 1].amount ? `× ${points[i].amount}` : points[i].weight}</text>
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
          ? `${shortDate(h.date)} · ${h.amount ? `× ${h.amount} ${ex.amountUnit ?? "reps"} · ` : ""}${timed ? `${ex.sets > 1 ? "avg " : ""}${fmt(h.total)}${h.goal ? ` vs ${fmt(h.goal)}` : ""}` : `${h.total}/${h.goal} reps (× ${h.target})`}${h.weight !== null ? ` at ${h.weight}${ex.perSide ? "/side" : ` ${ex.weightUnit ?? "lbs"}`}` : ""}`
          : timed ? `${ex.sets > 1 ? "Average per set · " : ""}lower is faster · dashed: target` : "Dashed line: the target (sets × rung)"}
      </p>
    </div>
  );
}
