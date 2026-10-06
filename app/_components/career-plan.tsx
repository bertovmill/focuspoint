"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FlagIcon, MountainIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { CareerAction, CareerActionTick, CareerCheckpoint, CareerDestination, CareerPlan as Plan } from "@/lib/career-plan";
import { addDaysISO, shortDayLabel, todayISO, weekDates, weekRangeLabel, weekStartISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/** Calendar days from `from` to `to` (both YYYY-MM-DD). */
function daysBetween(from: string, to: string) {
  const ms = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** "Tu" for a Tuesday — the week grid's column heads. */
function weekdayLetter(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
}

function monthDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The top of /career, laid out like /training: where he's headed and by when, the
 * checkpoints on the way, today's daily actions to tick, his pace carried out to
 * the date, and the week at a glance. The actions are the list in the Daily
 * actions doc further down the page.
 */
export function CareerPlan() {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [failed, setFailed] = useState(false);

  // Only the latest week's response lands, so flicking through weeks can't show a stale grid.
  const latest = useRef(weekStart);
  latest.current = weekStart;
  const load = useCallback(async () => {
    const forWeek = days[0];
    const from = days[0] < today ? days[0] : today;
    const to = days[6] > today ? days[6] : today;
    try {
      const res = await fetch(`/api/career/plan?today=${today}&from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Plan;
      if (forWeek === latest.current) setPlan(data);
    } catch {
      setFailed(true);
    }
  }, [days, today]);

  useEffect(() => {
    load();
  }, [load]);

  // The Daily actions doc lower on the page defines the list; pick up edits when he comes back to the tab.
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [load]);

  // ── ticks ─────────────────────────────────────────────────────────────

  const tickSet = useMemo(() => new Map((plan?.ticks ?? []).map((t) => [`${t.day}|${t.key}`, t])), [plan]);

  const setTick = async (day: string, a: CareerAction, done: boolean, note?: string | null) => {
    if (!plan) return;
    const prev = plan;
    const others = plan.ticks.filter((t) => !(t.day === day && t.key === a.key));
    const existing = tickSet.get(`${day}|${a.key}`);
    const ticks: CareerActionTick[] = done ? [...others, { day, key: a.key, note: note !== undefined ? note : existing?.note ?? null }] : others;
    setPlan({ ...plan, ticks });
    try {
      const res = await fetch("/api/career/actions", { method: "POST", ...json({ day, key: a.key, done, ...(note !== undefined ? { note } : {}) }) });
      if (!res.ok) throw new Error();
      // Refresh the pace quietly; the tick is already on screen.
      load();
    } catch {
      setPlan(prev);
      toast.error("Couldn't save that.");
    }
  };

  // ── destination + checkpoints ────────────────────────────────────────

  const saveDestination = async (change: { goal?: string; target_date?: string | null }) => {
    if (!plan) return;
    const prev = plan;
    setPlan({ ...plan, destination: { ...plan.destination, ...change } });
    try {
      const res = await fetch("/api/career/plan", { method: "PUT", ...json({ ...change, today }) });
      if (!res.ok) throw new Error();
      const destination = (await res.json()) as CareerDestination;
      setPlan((p) => (p ? { ...p, destination } : p));
      load();
    } catch {
      setPlan(prev);
      toast.error("Couldn't save the destination.");
    }
  };

  const [editingCheckpoint, setEditingCheckpoint] = useState<number | "new" | null>(null);
  const saveCheckpoint = async (id: number | "new", change: { name: string; due_date: string; done?: boolean }) => {
    try {
      const res = await fetch(id === "new" ? "/api/career/checkpoints" : `/api/career/checkpoints/${id}`, {
        method: id === "new" ? "POST" : "PATCH",
        ...json({ ...change, today }),
      });
      if (!res.ok) throw new Error();
      setEditingCheckpoint(null);
      await load();
    } catch {
      toast.error("Couldn't save the checkpoint.");
    }
  };
  const removeCheckpoint = async (id: number) => {
    setEditingCheckpoint(null);
    try {
      const res = await fetch(`/api/career/checkpoints/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      toast.error("Couldn't remove the checkpoint.");
    }
  };

  if (!plan) {
    if (failed) return <p className="text-muted-foreground">Couldn&apos;t load the career plan.</p>;
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const { destination, checkpoints, actions, pace } = plan;
  const isCurrentWeek = weekStart === weekStartISO(today);
  const todayDone = actions.filter((a) => tickSet.has(`${today}|${a.key}`)).length;
  const weekDone = plan.ticks.filter((t) => t.day >= days[0] && t.day <= days[6]).length;

  return (
    <div className="space-y-6">
      {/* Title + destination */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Career</h1>
        <DestinationLine goal={destination.goal} onSave={(goal) => saveDestination({ goal })} />
      </header>

      {/* The date, then the checkpoints on the way to it */}
      <div className="flex flex-wrap items-center gap-2">
        <TargetDateChip date={destination.target_date} today={today} onSave={(target_date) => saveDestination({ target_date })} />
        {checkpoints.map((c) =>
          editingCheckpoint === c.id ? (
            <CheckpointForm
              key={c.id}
              initial={c}
              onSave={(name, due_date, done) => saveCheckpoint(c.id, { name, due_date, done })}
              onCancel={() => setEditingCheckpoint(null)}
              onDelete={() => removeCheckpoint(c.id)}
            />
          ) : (
            <CheckpointChip key={c.id} c={c} today={today} onEdit={() => setEditingCheckpoint(c.id)} />
          ),
        )}
        {editingCheckpoint === "new" ? (
          <CheckpointForm onSave={(name, due_date) => saveCheckpoint("new", { name, due_date })} onCancel={() => setEditingCheckpoint(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditingCheckpoint("new")}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <PlusIcon className="size-4" /> Checkpoint
          </button>
        )}
      </div>

      {/* Today, front and centre */}
      <section className="rounded-2xl border-2 border-foreground/20 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
            <p className="text-xl font-semibold">{shortDayLabel(today)}</p>
          </div>
          {actions.length > 0 && (
            <span className={cn("text-base font-medium tabular-nums", todayDone === actions.length ? "text-emerald-600" : "text-muted-foreground")}>
              {todayDone}/{actions.length} done
            </span>
          )}
        </div>
        {actions.length === 0 ? (
          <p className="py-4 text-lg text-muted-foreground">
            No daily actions yet. Write them as a numbered list in <a href="#daily-actions" className="underline">Daily actions</a> below.
          </p>
        ) : (
          <div className="space-y-3">
            {actions.map((a) => (
              <ActionCard key={a.key} a={a} tick={tickSet.get(`${today}|${a.key}`) ?? null} onSet={(done, note) => setTick(today, a, done, note)} />
            ))}
          </div>
        )}
      </section>

      <Trajectory plan={plan} today={today} />

      {/* Week controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekStart((w) => addDaysISO(w, -7))} className="flex size-11 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground" aria-label="Previous week">
            <ChevronLeftIcon className="size-5" />
          </button>
          <span className="min-w-36 text-center text-base font-medium tabular-nums">{weekRangeLabel(weekStart)}</span>
          <button type="button" onClick={() => setWeekStart((w) => addDaysISO(w, 7))} className="flex size-11 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground" aria-label="Next week">
            <ChevronRightIcon className="size-5" />
          </button>
          {!isCurrentWeek && (
            <Button variant="ghost" className="h-11 text-base" onClick={() => setWeekStart(weekStartISO(today))}>
              This week
            </Button>
          )}
        </div>
        {actions.length > 0 && (
          <span className={cn("text-base font-medium tabular-nums", weekDone >= actions.length * 7 ? "text-emerald-600" : "text-muted-foreground")}>
            {weekDone}/{actions.length * 7} done
          </span>
        )}
      </div>

      {/* The week: one row per action, a box per day. Past days can be back-filled. */}
      {actions.length > 0 && (
        <section className="rounded-xl border p-3">
          {/* Phones: each action's name on its own line over its seven boxes. Wider: name in a column. */}
          <div className="grid grid-cols-7 items-center gap-x-1.5 gap-y-1 sm:grid-cols-[minmax(0,1fr)_repeat(7,2.5rem)] sm:gap-y-2">
            <span className="hidden sm:block" />
            {days.map((d) => (
              <span key={d} className={cn("text-center text-xs font-semibold uppercase tabular-nums", d === today ? "text-foreground" : "text-muted-foreground")}>
                {weekdayLetter(d)}
                <span className="block font-normal">{Number(d.slice(8))}</span>
              </span>
            ))}
            {actions.map((a) => (
              <WeekRow key={a.key} a={a} days={days} today={today} tickSet={tickSet} onSet={(day, done) => setTick(day, a, done)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** The one-sentence destination under the title; tap to rewrite it. */
function DestinationLine({ goal, onSave }: { goal: string; onSave: (goal: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const save = () => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== goal) onSave(next);
  };
  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input autoFocus className="h-11 text-base" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} />
      </form>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(goal);
        setEditing(true);
      }}
      className="group flex items-center gap-2 text-left text-lg text-muted-foreground hover:text-foreground"
    >
      <span>
        <span className="font-semibold text-foreground">Destination:</span> {goal}
      </span>
      <PencilIcon className="size-4 shrink-0 opacity-40 group-hover:opacity-80" />
    </button>
  );
}

/** "By Feb 27 · 144 days" — the race-day chip of the career plan. */
function TargetDateChip({ date, today, onSave }: { date: string | null; today: string; onSave: (date: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(date ?? "");
  if (editing) {
    return (
      <form
        className="inline-flex flex-wrap items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSave(value);
          setEditing(false);
        }}
      >
        <Input autoFocus type="date" className="h-10 w-40 text-base" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" size="sm" className="h-10 text-base" disabled={!value}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10 text-base" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  }
  if (!date) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
        <MountainIcon className="size-4" /> Set a date
      </button>
    );
  }
  const left = daysBetween(today, date);
  return (
    <button
      type="button"
      onClick={() => {
        setValue(date);
        setEditing(true);
      }}
      className="inline-flex items-center gap-2 rounded-full border-2 border-foreground/30 px-4 py-2 text-sm"
      title={`${date} · tap to change`}
    >
      <MountainIcon className="size-4" />
      <span className="font-semibold">By {monthDay(date)}</span>
      <span className="tabular-nums text-muted-foreground">{left > 0 ? `${left} days` : left === 0 ? "today" : `${-left} days ago`}</span>
    </button>
  );
}

function CheckpointChip({ c, today, onEdit }: { c: CareerCheckpoint; today: string; onEdit: () => void }) {
  const left = daysBetween(today, c.due_date);
  const overdue = !c.done_on && left < 0;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm",
        c.done_on && "border-emerald-500/50 bg-emerald-500/5",
        overdue && "border-rose-500/60 bg-rose-500/5 text-rose-600 dark:text-rose-400",
      )}
      title={`${c.due_date}${c.notes ? ` — ${c.notes}` : ""} · tap to edit`}
    >
      {c.done_on ? <CheckIcon className="size-4 shrink-0 text-emerald-600" /> : <FlagIcon className="size-4 shrink-0" />}
      <span className={cn("truncate font-semibold", c.done_on && "text-muted-foreground line-through")}>{c.name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {c.done_on ? monthDay(c.done_on) : left === 0 ? "today" : overdue ? `${-left}d late` : `${left} days`}
      </span>
    </button>
  );
}

function CheckpointForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: CareerCheckpoint;
  onSave: (name: string, date: string, done?: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.due_date ?? "");
  return (
    <form
      className="flex w-full flex-wrap items-center gap-1 rounded-xl border p-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && date) onSave(name.trim(), date);
      }}
    >
      <Input autoFocus className="h-10 min-w-0 flex-1 text-base sm:w-56 sm:flex-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 10 hiring-manager chats" />
      <Input type="date" className="h-10 w-40 text-base" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button type="submit" size="sm" className="h-10 text-base" disabled={!name.trim() || !date}>
        Save
      </Button>
      {initial && (
        <Button type="button" size="sm" variant="outline" className="h-10 gap-1 text-base" disabled={!name.trim() || !date} onClick={() => onSave(name.trim(), date, !initial.done_on)}>
          <CheckIcon className="size-4" /> {initial.done_on ? "Not reached" : "Reached"}
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" className="h-10 text-base" onClick={onCancel}>
        Cancel
      </Button>
      {onDelete && (
        <button type="button" onClick={onDelete} className="tap-target rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove checkpoint">
          <TrashIcon className="size-4" />
        </button>
      )}
    </form>
  );
}

/** One daily action on the Today card: a big tick, and a note of who or what once it's done. */
function ActionCard({ a, tick, onSet }: { a: CareerAction; tick: CareerActionTick | null; onSet: (done: boolean, note?: string | null) => void }) {
  const done = Boolean(tick);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const saveNote = () => {
    setNoting(false);
    const next = note.trim();
    if (next !== (tick?.note ?? "")) onSet(true, next || null);
  };
  return (
    <div className={cn("rounded-lg border p-4", done && "border-emerald-500/50 bg-emerald-500/5")}>
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => onSet(!done)}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={cn("flex size-9 shrink-0 items-center justify-center rounded-md border-2", done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40")}
        >
          {done && <CheckIcon className="size-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-xl font-medium leading-snug", done && "text-muted-foreground line-through")}>{a.title}</p>
          {a.detail && <p className="text-base text-muted-foreground">{a.detail}</p>}
          {a.principles && <p className="text-xs text-muted-foreground/80">Principles {a.principles}</p>}
          {noting ? (
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveNote();
              }}
            >
              <Input autoFocus className="h-11 text-base" value={note} placeholder="Who or what? e.g. Messaged Dana at Glean" onChange={(e) => setNote(e.target.value)} onBlur={saveNote} onKeyDown={(e) => e.key === "Escape" && setNoting(false)} />
            </form>
          ) : tick?.note ? (
            <button type="button" onClick={() => (setNote(tick.note ?? ""), setNoting(true))} className="mt-1 block text-left text-base text-emerald-700 dark:text-emerald-400">
              {tick.note}
            </button>
          ) : (
            done && (
              <button type="button" onClick={() => (setNote(""), setNoting(true))} className="mt-1 text-sm text-muted-foreground underline-offset-2 hover:underline">
                + Add who or what
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function WeekRow({
  a,
  days,
  today,
  tickSet,
  onSet,
}: {
  a: CareerAction;
  days: string[];
  today: string;
  tickSet: Map<string, CareerActionTick>;
  onSet: (day: string, done: boolean) => void;
}) {
  return (
    <>
      <span className="col-span-7 mt-2 truncate text-sm font-medium sm:col-span-1 sm:mt-0" title={a.detail || a.title}>
        {a.title}
      </span>
      {days.map((d) => {
        const t = tickSet.get(`${d}|${a.key}`);
        const future = d > today;
        return (
          <button
            key={d}
            type="button"
            disabled={future}
            onClick={() => onSet(d, !t)}
            title={t?.note ?? undefined}
            aria-label={`${a.title}, ${shortDayLabel(d)}: ${t ? "done" : "not done"}`}
            className={cn(
              "flex size-8 items-center justify-center justify-self-center rounded-md border-2 sm:size-9",
              t ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/30",
              d === today && !t && "border-foreground/60",
              future && "opacity-30",
            )}
          >
            {t && <CheckIcon className="size-4" />}
          </button>
        );
      })}
    </>
  );
}

/**
 * Where he is on the line from start to destination, with the checkpoints on it,
 * and his last four weeks of daily actions carried forward to the date.
 */
function Trajectory({ plan, today }: { plan: Plan; today: string }) {
  const { destination, checkpoints, pace } = plan;
  const target = destination.target_date;
  const pct = pace.possible ? Math.round((pace.done / pace.possible) * 100) : 0;
  const open = checkpoints.filter((c) => !c.done_on);
  const overdue = open.filter((c) => c.due_date < today);
  const next = open.find((c) => c.due_date >= today);

  let line: React.ReactNode = null;
  if (target) {
    const firstCheckpoint = checkpoints[0]?.due_date;
    let start = destination.started_on ?? today;
    if (firstCheckpoint && firstCheckpoint < start) start = firstCheckpoint;
    if (today < start) start = today;
    const span = Math.max(1, daysBetween(start, target));
    const at = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100))}%`;
    line = (
      <div className="space-y-1">
        <div className="relative h-8">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/70" style={{ width: at(today) }} />
          {checkpoints.map((c) => (
            <span
              key={c.id}
              title={`${c.name} · ${c.due_date}${c.done_on ? " · reached" : ""}`}
              className={cn(
                "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background",
                c.done_on ? "border-emerald-600 bg-emerald-600" : c.due_date < today ? "border-rose-500" : "border-foreground/60",
              )}
              style={{ left: at(c.due_date) }}
            />
          ))}
          <span className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground" style={{ left: at(today) }} title="Today" />
          <MountainIcon className="absolute right-0 top-1/2 size-5 -translate-y-1/2 translate-x-1/2 bg-background" />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>{monthDay(start)}</span>
          <span>{monthDay(target)}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Trajectory</h2>
        {pace.window_days > 0 && (
          <span className={cn("text-sm tabular-nums", pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400")}>
            {pct}% of actions · last {pace.window_days} day{pace.window_days === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {line ?? <p className="text-base text-muted-foreground">Set a date for the destination and your pace gets carried out to it.</p>}

      {(next || overdue.length > 0) && (
        <div className="space-y-1 text-base">
          {overdue.map((c) => (
            <p key={c.id} className="text-rose-600 dark:text-rose-400">
              <FlagIcon className="mr-1.5 inline size-4" />
              {c.name} was due {monthDay(c.due_date)}
            </p>
          ))}
          {next && (
            <p>
              <FlagIcon className="mr-1.5 inline size-4" />
              Next: <span className="font-medium">{next.name}</span>{" "}
              <span className="text-muted-foreground">in {daysBetween(today, next.due_date)} days</span>
            </p>
          )}
        </div>
      )}

      {pace.window_days === 0 ? (
        <p className="text-base text-muted-foreground">Tick today&apos;s actions and this starts projecting where your pace gets you.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Action</span>
            <span className="w-14 text-right">Pace</span>
            <span className="w-20 text-right">{target ? `By ${monthDay(target)}` : "By the date"}</span>
          </div>
          {pace.actions.map((a) => (
            <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 px-3 py-2 text-sm">
              <span className="truncate">{a.title}</span>
              <span className="w-14 text-right tabular-nums text-muted-foreground">{a.per_week}/wk</span>
              <span className="w-20 text-right font-medium tabular-nums">{a.projected === null ? "—" : `~${a.projected} more`}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
