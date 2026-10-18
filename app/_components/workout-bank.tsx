"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { INTENSITIES, SESSION_TYPES, formatPace, parsePace, sessionMeta } from "@/lib/training";
import { todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import { formatTime, parseTime, workoutHref, type TemplateBlock, type TemplateExercise, type WorkoutTemplate } from "@/lib/workout-templates";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RUN_TYPES = ["long_run", "intervals", "easy"];

function summary(w: WorkoutTemplate) {
  const exercises = w.blocks.flatMap((b) => b.exercises);
  const p = w.plan ?? {};
  const target = [
    p.km ? `${p.km} km` : null,
    p.pace_sec ? `${formatPace(p.pace_sec)}/km` : null,
    !p.km && p.minutes ? `${p.minutes} min` : null,
  ].filter(Boolean);
  return [...target, `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`].join(" · ");
}

/**
 * /training/workouts — the workout bank: every workout he repeats, in the order of
 * the default week. Each new week fills itself from the day set on each one.
 */
export function WorkoutBank() {
  const [workouts, setWorkouts] = useState<WorkoutTemplate[] | null>(null);
  useEffect(() => {
    fetch("/api/training/bank")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setWorkouts)
      .catch(() => {
        setWorkouts([]);
        toast.error("Couldn't load the workout bank");
      });
  }, []);

  const byDay = useMemo(() => {
    const list = workouts ?? [];
    return {
      week: DAYS.map((label, day) => ({ label, day, items: list.filter((w) => w.default_day === day) })),
      unscheduled: list.filter((w) => w.default_day === null),
    };
  }, [workouts]);
  const today = todayISO();

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="space-y-2">
        <Link href="/training" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Training
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Workout bank</h1>
            <p className="mt-1 text-muted-foreground">Each new week fills itself from the day set on each workout.</p>
          </div>
          <Button asChild className="h-11 gap-1.5 px-4 text-base">
            <Link href="/training/workouts/new">
              <PlusIcon className="size-4" /> New workout
            </Link>
          </Button>
        </div>
      </header>

      {!workouts ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section id="default-week" className="space-y-2">
            {byDay.week.map(({ label, day, items }) => (
              <div key={day} className="flex gap-3">
                <span className="w-10 shrink-0 pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-4 py-3.5 text-muted-foreground">Rest</div>
                  ) : (
                    items.map((w) => <BankCard key={w.slug} w={w} today={today} />)
                  )}
                </div>
              </div>
            ))}
          </section>
          {byDay.unscheduled.length > 0 && (
            <section id="unscheduled" className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Not in the default week</h2>
              {byDay.unscheduled.map((w) => (
                <BankCard key={w.slug} w={w} today={today} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BankCard({ w, today }: { w: WorkoutTemplate; today: string }) {
  const meta = sessionMeta(w.session_type);
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2 shrink-0 rounded-full", meta.color)} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.short}</span>
        </span>
        <span className="block font-medium leading-snug">{w.name}</span>
        <span className="block text-sm text-muted-foreground">{summary(w)}</span>
      </div>
      <Button asChild variant="ghost" className="h-10 px-3">
        <Link href={workoutHref(w.slug, today)}>Log</Link>
      </Button>
      <Button asChild variant="outline" className="h-10 gap-1.5 px-3">
        <Link href={`/training/workouts/${w.slug}/edit`}>
          <PencilIcon className="size-3.5" /> Edit
        </Link>
      </Button>
    </div>
  );
}

// ── the editor ────────────────────────────────────────────────────────────

/** An exercise while it's being edited: targets and weight as typed text. */
type DraftExercise = TemplateExercise & { targetsText: string; weightText: string; amountText: string };
type DraftBlock = Omit<TemplateBlock, "exercises"> & { exercises: DraftExercise[] };
type Draft = Omit<WorkoutTemplate, "blocks"> & { blocks: DraftBlock[]; kmText: string; paceText: string; minutesText: string };

function toDraftExercise(e: TemplateExercise): DraftExercise {
  return {
    ...e,
    targetsText: e.ladder.map((n) => (e.measure === "time" ? formatTime(n) : String(n))).join(", "),
    weightText: e.weight === null ? "" : String(e.weight),
    amountText: e.amount == null ? "" : String(e.amount),
  };
}

function toDraft(w: WorkoutTemplate): Draft {
  const p = w.plan ?? {};
  return {
    ...w,
    blocks: w.blocks.map((b) => ({ ...b, exercises: b.exercises.map(toDraftExercise) })),
    kmText: p.km ? String(p.km) : "",
    paceText: p.pace_sec ? formatPace(p.pace_sec) : "",
    minutesText: p.minutes ? String(p.minutes) : "",
  };
}

function blankExercise(): DraftExercise {
  return { key: "", name: "", sets: 4, ladder: [10, 15, 20], weight: null, targetsText: "10, 15, 20", weightText: "", amountText: "" };
}

function blankDraft(): Draft {
  return {
    slug: "",
    name: "",
    session_type: "strength",
    default_day: null,
    plan: { intensity: "moderate" },
    blocks: [{ key: "", label: "Block 1", exercises: [blankExercise()] }],
    kmText: "",
    paceText: "",
    minutesText: "",
  };
}

function fromDraft(d: Draft): Partial<WorkoutTemplate> & { name: string } {
  const isRun = RUN_TYPES.includes(d.session_type);
  const num = (t: string) => (t.trim() === "" || !Number.isFinite(Number(t)) ? null : Number(t));
  const { kmText, paceText, minutesText, ...rest } = d;
  return {
    ...rest,
    plan: {
      intensity: d.plan?.intensity ?? null,
      km: isRun ? num(kmText) : null,
      pace_sec: isRun ? parsePace(paceText) : null,
      minutes: isRun ? null : num(minutesText),
    },
    blocks: d.blocks.map((b) => ({
      key: b.key,
      label: b.label,
      exercises: b.exercises.map(({ targetsText, weightText, amountText, ...e }) => ({
        ...e,
        amount: e.measure === "time" ? (num(amountText) ?? undefined) : undefined,
        ladder: targetsText
          .split(/[,\s]+/)
          .map((t) => (e.measure === "time" ? parseTime(t) : num(t)))
          .filter((n): n is number => n !== null && n > 0),
        weight: num(weightText),
        loaded: e.loaded || undefined,
      })),
    })),
  };
}

function move<T>(list: T[], i: number, by: number) {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** /training/workouts/<slug>/edit and /training/workouts/new — change a workout's whole structure. */
export function WorkoutEditor({ slug }: { slug?: string }) {
  const router = useRouter();
  const [d, setD] = useState<Draft | null>(slug ? null : blankDraft());
  const [others, setOthers] = useState<WorkoutTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/training/bank")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: WorkoutTemplate[]) => setOthers(list.filter((w) => w.slug !== slug)))
      .catch(() => {});
    if (!slug) return;
    fetch(`/api/training/bank/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((w: WorkoutTemplate) => setD(toDraft(w)))
      .catch(() => toast.error("Couldn't find that workout"));
  }, [slug]);

  if (!d) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setD((x) => (x ? { ...x, ...patch } : x));
  const setBlocks = (fn: (b: DraftBlock[]) => DraftBlock[]) => setD((x) => (x ? { ...x, blocks: fn(x.blocks) } : x));
  const setBlock = (bi: number, patch: Partial<DraftBlock>) => setBlocks((bs) => bs.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const setExercises = (bi: number, fn: (e: DraftExercise[]) => DraftExercise[]) =>
    setBlocks((bs) => bs.map((b, i) => (i === bi ? { ...b, exercises: fn(b.exercises) } : b)));
  const setExercise = (bi: number, ei: number, patch: Partial<DraftExercise>) =>
    setExercises(bi, (es) => es.map((e, i) => (i === ei ? { ...e, ...patch } : e)));

  const isRun = RUN_TYPES.includes(d.session_type);
  const clash = d.default_day === null ? [] : others.filter((w) => w.default_day === d.default_day);
  const back = slug ? workoutHref(slug, todayISO()) : "/training/workouts";

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(slug ? `/api/training/bank/${slug}` : "/api/training/bank", {
        method: slug ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fromDraft(d)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't save");
      toast.success("Workout saved");
      router.push("/training/workouts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!slug || !window.confirm(`Take ${d.name} out of the bank? Its logs and past sessions stay.`)) return;
    setSaving(true);
    await fetch(`/api/training/bank/${slug}`, { method: "DELETE" }).catch(() => {});
    router.push("/training/workouts");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <header className="space-y-2">
        <Link href="/training/workouts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Workout bank
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{slug ? "Edit workout" : "New workout"}</h1>
      </header>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name">
          <Input className="h-12 text-base" placeholder="e.g. Unity Standard Upper Body" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <Field label="Type on the calendar">
          <Chips
            options={SESSION_TYPES.filter((t) => t.key !== "rest").map((t) => ({ value: t.key, label: t.label }))}
            value={d.session_type}
            onChange={(v) => set({ session_type: v })}
          />
        </Field>

        <Field label="Day in the default week">
          <Chips
            options={[...DAYS.map((label, i) => ({ value: String(i), label })), { value: "", label: "None" }]}
            value={d.default_day === null ? "" : String(d.default_day)}
            onChange={(v) => set({ default_day: v === "" ? null : Number(v) })}
          />
          {clash.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">{clash.map((w) => w.name).join(", ")} is also on {DAYS[d.default_day!]}. Both will land that day.</p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {isRun ? (
            <>
              <Field label="Distance (km)">
                <Input className="h-12 text-base" inputMode="decimal" value={d.kmText} onChange={(e) => set({ kmText: e.target.value })} />
              </Field>
              <Field label="Pace (per km)">
                <Input className="h-12 text-base" inputMode="decimal" placeholder="5:00" value={d.paceText} onChange={(e) => set({ paceText: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="Minutes">
              <Input className="h-12 text-base" inputMode="numeric" value={d.minutesText} onChange={(e) => set({ minutesText: e.target.value })} />
            </Field>
          )}
          <Field label="Intensity" className="col-span-2">
            <Chips
              options={INTENSITIES.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) }))}
              value={d.plan?.intensity ?? ""}
              onChange={(v) => set({ plan: { ...d.plan, intensity: v } })}
            />
          </Field>
        </div>

        <Field label="Warm-up">
          <Input className="h-12 text-base" placeholder="Optional" value={d.warmup ?? ""} onChange={(e) => set({ warmup: e.target.value })} />
        </Field>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Exercises</h2>
          {d.blocks.map((b, bi) => (
            <div key={bi} className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <Input
                  className="h-10 flex-1 border-transparent bg-transparent text-sm font-semibold uppercase tracking-wide shadow-none focus-visible:border-ring"
                  value={b.label}
                  onChange={(e) => setBlock(bi, { label: e.target.value })}
                  aria-label="Block name"
                />
                <IconButton label="Move block up" onClick={() => setBlocks((bs) => move(bs, bi, -1))} disabled={bi === 0}>
                  <ArrowUpIcon className="size-4" />
                </IconButton>
                <IconButton label="Move block down" onClick={() => setBlocks((bs) => move(bs, bi, 1))} disabled={bi === d.blocks.length - 1}>
                  <ArrowDownIcon className="size-4" />
                </IconButton>
                <IconButton label="Remove block" onClick={() => setBlocks((bs) => bs.filter((_, i) => i !== bi))}>
                  <XIcon className="size-4" />
                </IconButton>
              </div>
              <div className="divide-y">
                {b.exercises.map((e, ei) => (
                  <ExerciseEditor
                    key={ei}
                    e={e}
                    first={ei === 0}
                    last={ei === b.exercises.length - 1}
                    onChange={(patch) => setExercise(bi, ei, patch)}
                    onMove={(by) => setExercises(bi, (es) => move(es, ei, by))}
                    onRemove={() => setExercises(bi, (es) => es.filter((_, i) => i !== ei))}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setExercises(bi, (es) => [...es, { ...blankExercise(), measure: es[0]?.measure, targetsText: es[0]?.measure === "time" ? "" : "10, 15, 20", ladder: [] }])}
                className="flex h-12 w-full items-center justify-center gap-1.5 border-t text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PlusIcon className="size-4" /> Add exercise
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full gap-1.5 text-base"
            onClick={() => setBlocks((bs) => [...bs, { key: "", label: `Block ${bs.length + 1}`, exercises: [blankExercise()] }])}
          >
            <PlusIcon className="size-4" /> Add block
          </Button>
        </section>

        <Field label="Cool-down">
          <Input className="h-12 text-base" placeholder="Optional" value={d.cooldown ?? ""} onChange={(e) => set({ cooldown: e.target.value })} />
        </Field>

        <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-xl border bg-background/95 p-3 backdrop-blur lg:bottom-4">
          {slug && (
            <Button type="button" variant="ghost" className="h-11 text-base text-destructive" disabled={saving} onClick={archive}>
              Remove
            </Button>
          )}
          <Button asChild type="button" variant="ghost" className="ml-auto h-11 text-base">
            <Link href={back}>Cancel</Link>
          </Button>
          <Button type="submit" className="h-11 min-w-24 text-base" disabled={saving || !d.name.trim()}>
            {saving ? <Spinner className="size-4" /> : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ExerciseEditor({
  e,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  e: DraftExercise;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<DraftExercise>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const timed = e.measure === "time";
  const weighted = e.weightText !== "" || !!e.loaded;
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <Input className="h-11 flex-1 text-base" placeholder="Exercise name" value={e.name} onChange={(ev) => onChange({ name: ev.target.value })} aria-label="Exercise name" />
        <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}>
          <ArrowUpIcon className="size-4" />
        </IconButton>
        <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
          <ArrowDownIcon className="size-4" />
        </IconButton>
        <IconButton label="Remove exercise" onClick={onRemove}>
          <XIcon className="size-4" />
        </IconButton>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Sets">
          <Input className="h-11 text-base" inputMode="numeric" value={String(e.sets)} onChange={(ev) => onChange({ sets: Number(ev.target.value.replace(/\D/g, "")) || 1 })} />
        </Field>
        <Field label="Count">
          <Chips
            small
            options={[
              { value: "reps", label: "Reps" },
              { value: "time", label: "Time" },
            ]}
            value={timed ? "time" : "reps"}
            onChange={(v) => onChange({ measure: v === "time" ? "time" : undefined, targetsText: "" })}
          />
        </Field>
        <Field label={timed ? "Target time" : "Rep ladder"} className="col-span-2">
          <Input
            className="h-11 text-base"
            placeholder={timed ? "3:45 (blank = no target)" : "10, 15, 20 (or one number)"}
            value={e.targetsText}
            onChange={(ev) => onChange({ targetsText: ev.target.value })}
          />
        </Field>
      </div>
      {timed && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Count (changeable on the day)">
            <Input className="h-11 w-28 text-base" inputMode="numeric" placeholder="e.g. 100" value={e.amountText} onChange={(ev) => onChange({ amountText: ev.target.value.replace(/\D/g, "") })} />
          </Field>
          <Chips
            small
            options={[
              { value: "reps", label: "reps" },
              { value: "m", label: "metres" },
            ]}
            value={e.amountUnit ?? "reps"}
            onChange={(v) => onChange({ amountUnit: v === "m" ? "m" : "reps" })}
          />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={weighted} onChange={(ev) => onChange(ev.target.checked ? { loaded: true } : { loaded: false, weightText: "" })} />
          Weighted
        </label>
        {weighted && (
          <>
            <Input className="h-11 w-24 text-base" inputMode="decimal" placeholder="Weight" value={e.weightText} onChange={(ev) => onChange({ weightText: ev.target.value.replace(/[^\d.]/g, "") })} aria-label="Weight" />
            <Chips
              small
              options={[
                { value: "lbs", label: "lbs" },
                { value: "kg", label: "kg" },
              ]}
              value={e.weightUnit ?? "lbs"}
              onChange={(v) => onChange({ weightUnit: v === "kg" ? "kg" : undefined })}
            />
            <label className="flex h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={!!e.perSide} onChange={(ev) => onChange({ perSide: ev.target.checked || undefined })} />
              Per side
            </label>
          </>
        )}
        <label className="flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={!!e.tracked} onChange={(ev) => onChange({ tracked: ev.target.checked || undefined })} />
          Chart it
        </label>
      </div>
      <Input className="h-11 text-base" placeholder="Note (optional), e.g. 90 s easy jog between" value={e.note ?? ""} onChange={(ev) => onChange({ note: ev.target.value || undefined })} />
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange, small }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border text-sm",
            small ? "h-11 px-3" : "h-10 px-4",
            value === o.value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
