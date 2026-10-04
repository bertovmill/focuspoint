"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarRangeIcon,
  DumbbellIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SessionPage, newSessionHref, sessionHref } from "@/app/_components/session-editor";
import { TrainingPlanDoc } from "@/app/_components/training-plan-doc";
import { WorkoutLog } from "@/app/_components/workout-log";
import { WorkoutBank, WorkoutEditor } from "@/app/_components/workout-bank";
import { WorkoutChart, type WorkoutLog as OldWorkoutLog } from "@/app/_components/workout-chart";
import { workoutHref } from "@/lib/workout-templates";
import { daysUntil, formatPace, isTraining, sessionMeta, targetLabel, type Activity, type TrainingEvent, type TrainingSession } from "@/lib/training";
import { addDaysISO, shortDayLabel, todayISO, weekDates, weekRangeLabel, weekStartISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import { ZoneBar } from "@/app/_components/zone-bar";

interface SyncStatus {
  connected: boolean;
  last_synced_at: string | null;
}

/**
 * /training — the week of sessions building toward the races, with Fitbit
 * workouts marking them done. Sessions are the plan; the workout strip under each
 * day is training that happened but matched nothing (walks and bike rides hidden).
 */
export function TrainingPlanPanel() {
  const pathname = usePathname();
  // The workout bank and its editor.
  if (/^\/training\/workouts\/?$/.test(pathname)) return <WorkoutBank />;
  if (/^\/training\/workouts\/new\/?$/.test(pathname)) return <WorkoutEditor />;
  const editing = pathname.match(/^\/training\/workouts\/([^/]+)\/edit\/?$/);
  if (editing) return <WorkoutEditor key={editing[1]} slug={editing[1]} />;
  // /training/workouts/<template>/<date> opens one structured session in place of the week.
  const m = pathname.match(/^\/training\/workouts\/([^/]+)(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
  if (m) return <WorkoutLog slug={m[1]} date={m[2] ?? todayISO()} />;
  // /training/sessions/<id> edits a session; /training/sessions/new/<date> adds one.
  const edit = pathname.match(/^\/training\/sessions\/(\d+)\/?$/);
  if (edit) return <SessionPage key={edit[1]} id={Number(edit[1])} />;
  const add = pathname.match(/^\/training\/sessions\/new\/(\d{4}-\d{2}-\d{2})\/?$/);
  if (add) return <SessionPage key={add[1]} date={add[1]} />;
  return <TrainingWeek />;
}

function TrainingWeek() {
  const today = todayISO();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  // ?week=YYYY-MM-DD opens that week, so coming back from a session page lands where
  // you were. Read after mount: on a client navigation the URL updates after first render.
  useEffect(() => {
    const t = setTimeout(() => {
      const w = new URLSearchParams(window.location.search).get("week");
      if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) setWeekStart(weekStartISO(w));
    });
    return () => clearTimeout(t);
  }, []);
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [watch, setWatch] = useState<SyncStatus>({ connected: false, last_synced_at: null });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<number | "new" | null>(null);

  // Only the latest week's response lands — switching weeks quickly (or ?week= on
  // mount) mustn't let a slower earlier fetch overwrite the grid.
  const latestWeek = useRef(days[0]);
  latestWeek.current = days[0];
  const load = useCallback(async () => {
    const forWeek = days[0];
    try {
      const [s, e, st] = await Promise.all([
        fetch(`/api/training/sessions?from=${days[0]}&to=${days[6]}`),
        fetch("/api/training/events"),
        fetch("/api/training/sync"),
      ]);
      if (s.ok) {
        const data = (await s.json()) as { sessions: TrainingSession[]; activities: Activity[] };
        if (forWeek !== latestWeek.current) return;
        setSessions(data.sessions);
        setActivities(data.activities.filter(isTraining));
      }
      if (e.ok) setEvents(await e.json());
      if (st.ok) setWatch(await st.json());
    } catch {
      // leave what's on screen
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const sync = useCallback(
    async (quiet = false) => {
      setSyncing(true);
      try {
        const res = await fetch("/api/training/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 14 }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Sync failed");
        const r = (await res.json()) as { connected: boolean; fetched: number; matched: number };
        if (!quiet) toast.success(r.connected ? `${r.fetched} workouts · ${r.matched} session${r.matched === 1 ? "" : "s"} marked done` : "Your watch isn't connected.");
        await load();
      } catch (err) {
        if (!quiet) toast.error(err instanceof Error ? err.message : "Sync failed");
      } finally {
        setSyncing(false);
      }
    },
    [load],
  );

  // A quiet sync on open when the cache is over half an hour old.
  useEffect(() => {
    if (loading || !watch.connected) return;
    const age = watch.last_synced_at ? Date.now() - new Date(watch.last_synced_at).getTime() : Infinity;
    if (age > 30 * 60 * 1000) sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, watch.connected]);

  // ── session actions ───────────────────────────────────────────────────

  // Drag a session to another day (Berto, 2026-10-05: some days the workout just
  // won't happen). Mouse drags after 6px; on a phone it's press-and-hold, so
  // scrolling and tapping the card still work.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [dragging, setDragging] = useState<TrainingSession | null>(null);
  const moveSession = async (e: DragEndEvent) => {
    setDragging(null);
    const s = sessions.find((x) => x.id === Number(e.active.id));
    const to = e.over ? String(e.over.id) : null;
    if (!s || !to || to === s.session_date) return;
    const prev = sessions;
    setSessions((ss) => ss.map((x) => (x.id === s.id ? { ...x, session_date: to } : x)));
    try {
      const res = await fetch(`/api/training/sessions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_date: to }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${s.title} moved to ${shortDayLabel(to)}`);
    } catch {
      setSessions(prev);
      toast.error("Couldn't move that.");
    }
  };

  const toggleDone = async (s: TrainingSession) => {
    const prev = sessions;
    setSessions((ss) => ss.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x)));
    try {
      const res = await fetch(`/api/training/sessions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !s.done }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as TrainingSession;
      setSessions((ss) => ss.map((x) => (x.id === s.id ? row : x)));
    } catch {
      setSessions(prev);
      toast.error("Couldn't save that.");
    }
  };

  // ── races ─────────────────────────────────────────────────────────────

  const saveEvent = async (id: number | "new", name: string, date: string) => {
    try {
      const res = await fetch(id === "new" ? "/api/training/events" : `/api/training/events/${id}`, {
        method: id === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, event_date: date, ...(id !== "new" ? { notes: null } : {}) }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as TrainingEvent;
      setEvents((es) => (id === "new" ? [...es, row] : es.map((e) => (e.id === id ? row : e))).sort((a, b) => a.event_date.localeCompare(b.event_date)));
      setEditingEvent(null);
    } catch {
      toast.error("Couldn't save the race.");
    }
  };

  const removeEvent = async (id: number) => {
    const prev = events;
    setEvents((es) => es.filter((e) => e.id !== id));
    setEditingEvent(null);
    try {
      const res = await fetch(`/api/training/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setEvents(prev);
      toast.error("Couldn't remove the race.");
    }
  };

  // ── derived ───────────────────────────────────────────────────────────

  const byDay = useMemo(() => {
    const m = new Map<string, TrainingSession[]>();
    for (const s of sessions) m.set(s.session_date, [...(m.get(s.session_date) ?? []), s]);
    return m;
  }, [sessions]);
  const activitiesByDay = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of activities) {
      const d = a.start_local.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return m;
  }, [activities]);
  const linked = useMemo(() => new Set(sessions.map((s) => s.activity_id).filter(Boolean) as string[]), [sessions]);

  const week = useMemo(() => {
    const real = sessions.filter((s) => s.type !== "rest");
    const done = real.filter((s) => s.done);
    const plannedKm = real.reduce((n, s) => n + (s.target_km ?? 0), 0);
    // Distance and time are what he typed in; the watch only supplies effort.
    const doneKm = done.reduce((n, s) => n + (s.actual_km ?? 0), 0);
    const effort = activities.reduce((n, a) => n + (a.azm ?? 0), 0);
    const minutes = done.reduce((n, s) => n + (s.actual_minutes ?? 0), 0);
    return { planned: real.length, done: done.length, plannedKm, doneKm, effort, minutes };
  }, [sessions, activities]);

  const upcoming = events.filter((e) => daysUntil(e.event_date) >= 0);
  const isCurrentWeek = weekStart === weekStartISO(today);

  // "Fill from bank": lay the default lineup over this week, keeping anything done.
  const [filling, setFilling] = useState(false);
  const fillFromBank = async () => {
    if (!window.confirm(`Replace ${weekRangeLabel(weekStart)}'s unfinished sessions with the workout bank's default week? Sessions you've done stay.`)) return;
    setFilling(true);
    try {
      const res = await fetch("/api/training/sessions/fill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week_start: weekStart }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't fill the week");
      await load();
      toast.success("Week filled from the bank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't fill the week");
    } finally {
      setFilling(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const todayList = byDay.get(today) ?? [];
  const todayActs = (activitiesByDay.get(today) ?? []).filter((a) => !linked.has(a.id));
  const todayRace = events.find((e) => e.event_date === today);

  return (
    <div className="space-y-6 pb-10">
      {/* Title + goal */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Training</h1>
        <GoalLine />
      </header>

      {/* Races */}
      <div className="flex flex-wrap items-center gap-2">
        {upcoming.map((e) =>
          editingEvent === e.id ? (
            <EventForm key={e.id} initial={e} onSave={(n, d) => saveEvent(e.id, n, d)} onCancel={() => setEditingEvent(null)} onDelete={() => removeEvent(e.id)} />
          ) : (
            <button
              key={e.id}
              type="button"
              onClick={() => setEditingEvent(e.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm",
                daysUntil(e.event_date) <= 7 ? "border-rose-500/60 bg-rose-500/5 text-rose-600 dark:text-rose-400" : "text-foreground",
              )}
              title={`${e.event_date}${e.notes ? ` — ${e.notes}` : ""} · tap to edit`}
            >
              <FlagIcon className="size-4" />
              <span className="font-semibold">{e.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {daysUntil(e.event_date) === 0 ? "today" : `${daysUntil(e.event_date)} days`}
              </span>
            </button>
          ),
        )}
        {editingEvent === "new" ? (
          <EventForm onSave={(n, d) => saveEvent("new", n, d)} onCancel={() => setEditingEvent(null)} />
        ) : (
          <button type="button" onClick={() => setEditingEvent("new")} className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            <PlusIcon className="size-4" /> Race
          </button>
        )}
      </div>

      {/* Today, front and centre */}
      {isCurrentWeek && (
        <section className={cn("rounded-2xl border-2 p-5", todayRace ? "border-rose-500/60" : "border-foreground/20")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
              <p className="text-xl font-semibold">{shortDayLabel(today)}</p>
            </div>
            <Button variant="outline" className="h-11 gap-1.5 px-4 text-base" onClick={() => router.push(newSessionHref(today))}>
              <PlusIcon className="size-5" /> Add
            </Button>
          </div>
          {todayRace && (
            <p className="mb-3 flex items-center gap-2 text-lg font-semibold text-rose-600 dark:text-rose-400">
              <FlagIcon className="size-5" /> Race day: {todayRace.name}
            </p>
          )}
          <div className="space-y-3">
            {todayList.length === 0 && todayActs.length === 0 && !todayRace && (
              <p className="py-4 text-lg text-muted-foreground">Nothing planned today.</p>
            )}
            {todayList.map((s) => (
              <SessionCard key={s.id} s={s} past={false} big onToggle={() => toggleDone(s)} onEdit={() => router.push(sessionHref(s.id))} />
            ))}
            {todayActs.map((a) => (
              <ActivityChip key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}

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
        <span className={cn("text-base font-medium tabular-nums", week.done >= week.planned && week.planned > 0 ? "text-emerald-600" : "text-muted-foreground")}>
          {week.done}/{week.planned} done{week.doneKm > 0 && ` · ${week.doneKm.toFixed(1)} km`}
        </span>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button variant="outline" className="h-11 gap-2 px-4 text-base" asChild>
            <Link href="/training/workouts">
              <DumbbellIcon className="size-4" /> Workout bank
            </Link>
          </Button>
          {weekStart >= weekStartISO(today) && (
            <Button variant="outline" className="h-11 gap-2 px-4 text-base" disabled={filling} onClick={fillFromBank}>
              {filling ? <Spinner className="size-4" /> : <CalendarRangeIcon className="size-4" />}
              Fill from bank
            </Button>
          )}
          {watch.connected && (
            <Button variant="outline" className="h-11 gap-2 px-4 text-base" disabled={syncing} onClick={() => sync()} title={watch.last_synced_at ? `Workouts last synced ${new Date(watch.last_synced_at).toLocaleString()}` : undefined}>
              {syncing ? <Spinner className="size-4" /> : <RefreshCwIcon className="size-4" />}
              Sync Fitbit
            </Button>
          )}
        </div>
      </div>

      {/* Week — stacked rows on phones, columns on wide screens. Cards drag between days. */}
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(sessions.find((x) => x.id === Number(e.active.id)) ?? null)}
        onDragEnd={moveSession}
        onDragCancel={() => setDragging(null)}
      >
      <section className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const acts = activitiesByDay.get(d) ?? [];
          const isToday = d === today;
          const past = d < today;
          const race = events.find((e) => e.event_date === d);
          return (
            <DropDay key={d} day={d} className={cn("flex flex-col rounded-xl border transition-shadow", isToday && "border-foreground/40", race && "border-rose-500/60")}>
              <div className={cn("flex items-center justify-between rounded-t-[11px] border-b px-3 py-2", isToday && "bg-foreground text-background")}>
                <span className={cn("text-sm font-semibold uppercase tracking-wide", past && !isToday && "text-muted-foreground/70")}>{shortDayLabel(d)}</span>
                <button type="button" onClick={() => router.push(newSessionHref(d))} className={cn("flex size-9 items-center justify-center rounded-md", isToday ? "text-background/80 hover:text-background" : "text-muted-foreground hover:text-foreground")} aria-label={`Add session on ${shortDayLabel(d)}`}>
                  <PlusIcon className="size-5" />
                </button>
              </div>
              {race && (
                <div className="flex items-center gap-1.5 border-b bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400">
                  <FlagIcon className="size-4" /> {race.name}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-2">
                {list.length === 0 && acts.length === 0 && (
                  <p className={cn("py-3 text-center text-sm text-muted-foreground/60", past && "opacity-60")}>—</p>
                )}
                {list.map((s) => (
                  <DragSession key={s.id} id={s.id}>
                    <SessionCard s={s} past={past} onToggle={() => toggleDone(s)} onEdit={() => router.push(sessionHref(s.id))} />
                  </DragSession>
                ))}
                {acts.filter((a) => !linked.has(a.id)).map((a) => (
                  <ActivityChip key={a.id} a={a} />
                ))}
              </div>
            </DropDay>
          );
        })}
      </section>
        <DragOverlay>
          {dragging && (
            <div className="rotate-1 rounded-lg bg-background shadow-xl">
              <SessionCard s={dragging} past={false} onToggle={() => {}} onEdit={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* The long-form plan, tucked away until it's wanted */}
      <details className="group rounded-xl border p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">
          Your written plan
          <ChevronRightIcon className="size-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-4">
          <TrainingPlanDoc />
        </div>
      </details>

      <PastPrograms />

    </div>
  );
}

/** The one-sentence goal under the title; tap to rewrite it. Cael drafts every week toward it. */
function GoalLine() {
  const [goal, setGoal] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    fetch("/api/training/goal")
      .then((r) => r.json())
      .then((r: { goal: string }) => setGoal(r.goal))
      .catch(() => setGoal(""));
  }, []);

  const save = async () => {
    const next = text.trim();
    setEditing(false);
    if (!next || next === goal) return;
    const prev = goal;
    setGoal(next);
    try {
      const res = await fetch("/api/training/goal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: next }) });
      if (!res.ok) throw new Error();
    } catch {
      setGoal(prev);
      toast.error("Couldn't save the goal.");
    }
  };

  if (goal === null) return <Skeleton className="h-6 w-80" />;
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
        <span className="font-semibold text-foreground">Goal:</span> {goal}
      </span>
      <PencilIcon className="size-4 shrink-0 opacity-40 group-hover:opacity-80" />
    </button>
  );
}

/** A day column that takes dropped sessions; lights up while one hovers over it. */
function DropDay({ day, className, children }: { day: string; className: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "border-primary ring-2 ring-primary/40")}>
      {children}
    </div>
  );
}

/** Makes a session card draggable. The card stays in place, faded, while its copy follows the finger. */
function DragSession({ id, children }: { id: number; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // No text selection or iOS callout on the press-and-hold that starts a drag.
      className={cn("select-none [-webkit-touch-callout:none]", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
}

function SessionCard({ s, past, big, onToggle, onEdit }: { s: TrainingSession; past: boolean; big?: boolean; onToggle: () => void; onEdit: () => void }) {
  const meta = sessionMeta(s.type);
  const rest = s.type === "rest";
  const template = s.workout_slug ? { slug: s.workout_slug } : null;
  return (
    <div className={cn("group relative rounded-lg border", big ? "p-4" : "p-2.5", s.done && "border-emerald-500/50 bg-emerald-500/5", past && !s.done && !rest && "border-dashed opacity-70")}>
      <div className={cn("flex items-start", big ? "gap-4" : "gap-2.5")}>
        {!rest && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={s.done ? "Mark not done" : "Mark done"}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md border-2",
              big ? "size-9" : "size-6",
              s.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40",
            )}
          >
            {s.done && <CheckIcon className={big ? "size-6" : "size-4"} />}
          </button>
        )}
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title={s.notes ?? undefined}>
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2 shrink-0 rounded-full", meta.color)} />
            <span className={cn("font-semibold uppercase tracking-wide text-muted-foreground", big ? "text-sm" : "text-xs")}>{meta.short}</span>
            {s.intensity === "hard" && <span className={cn("text-rose-500", big ? "text-sm" : "text-xs")}>hard</span>}
          </span>
          <span className={cn("block font-medium leading-snug", big ? "text-xl" : "text-sm", s.done && "line-through text-muted-foreground")}>{s.title}</span>
          {targetLabel(s) && (
            <span className={cn("block tabular-nums text-muted-foreground", big ? "text-base" : "text-xs")}>
              {targetLabel(s)}
            </span>
          )}
          {big && s.notes && !template && <span className="mt-1 block text-base text-muted-foreground">{s.notes}</span>}
          {s.done && (s.actual_km !== null || s.actual_minutes !== null) && (
            <span className={cn("block tabular-nums text-emerald-700 dark:text-emerald-400", big ? "text-base" : "text-xs")}>
              {[
                s.actual_km !== null && s.actual_km > 0 && `${s.actual_km} km`,
                s.actual_pace_sec ? `${formatPace(s.actual_pace_sec)}/km` : s.actual_km && s.actual_minutes && `${formatPace((s.actual_minutes * 60) / s.actual_km)}/km`,
                s.actual_minutes !== null && `${s.actual_minutes} min`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {s.done && (s.actual_avg_hr !== null || s.actual_effort !== null) && (
            <span className={cn("block tabular-nums text-muted-foreground", big ? "text-base" : "text-xs")}>
              {[s.actual_avg_hr !== null && `♥ ${s.actual_avg_hr} avg`, s.actual_effort !== null && `${s.actual_effort} AZM`].filter(Boolean).join(" · ")}
            </span>
          )}
          {s.done && s.actual_zones && <ZoneBar zones={s.actual_zones} className={big ? "mt-1.5 h-2" : "mt-1 h-1.5"} />}
        </button>
      </div>
      {template && (
        <Link
          href={workoutHref(template.slug, s.session_date)}
          className={cn(
            "mt-2 flex items-center justify-center gap-1 rounded-md bg-violet-500/10 font-medium text-violet-700 hover:bg-violet-500/20 dark:text-violet-300",
            big ? "h-11 text-base" : "h-8 text-xs",
          )}
        >
          {s.done ? (s.type === "strength" ? "View sets" : "View splits") : s.type === "strength" ? "Log sets" : "Log splits"} <ChevronRightIcon className={big ? "size-5" : "size-3.5"} />
        </Link>
      )}
    </div>
  );
}

/** The old one-number-per-lift log (workout_logs), archived when the structured workouts replaced it. */
function PastPrograms() {
  const [logs, setLogs] = useState<OldWorkoutLog[] | null>(null);
  return (
    <details
      id="past-programs"
      className="group rounded-xl border p-4"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && logs === null)
          fetch("/api/workouts").then((r) => r.json()).then(setLogs).catch(() => setLogs([]));
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">
        Past programs
        <ChevronRightIcon className="size-5 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-4 space-y-2">
        <p className="text-sm text-muted-foreground">5×5 lifts and 10K times, logged one number per day before the structured workouts.</p>
        {logs === null ? <Skeleton className="h-40 w-full" /> : <WorkoutChart logs={logs} />}
      </div>
    </details>
  );
}

/** A Fitbit workout no ticked session has claimed. Heart rate only — its distance and time aren't trusted. */
function ActivityChip({ a }: { a: Activity }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs leading-snug text-muted-foreground" title={`${a.name} on your Fitbit — tick the session to attach its heart rate`}>
      <span className="font-medium">{a.name}</span>
      {a.avg_hr ? ` · ♥ ${a.avg_hr}` : ""}
      {a.azm ? ` · ${a.azm} AZM` : ""}
      {a.zones && <ZoneBar zones={a.zones} className="mt-1 h-1" />}
    </div>
  );
}

function EventForm({ initial, onSave, onCancel, onDelete }: { initial?: TrainingEvent; onSave: (name: string, date: string) => void; onCancel: () => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "Hyrox");
  const [date, setDate] = useState(initial?.event_date ?? "");
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && date) onSave(name.trim(), date);
      }}
    >
      <Input autoFocus className="h-10 w-36 text-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="Race" />
      <Input type="date" className="h-10 w-40 text-base" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button type="submit" size="sm" className="h-10 text-base" disabled={!name.trim() || !date}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-10 text-base" onClick={onCancel}>
        Cancel
      </Button>
      {onDelete && (
        <button type="button" onClick={onDelete} className="tap-target rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove race">
          <TrashIcon className="size-3.5" />
        </button>
      )}
    </form>
  );
}
