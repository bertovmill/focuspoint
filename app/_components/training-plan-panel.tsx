"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SessionEditor, type SessionDraft } from "@/app/_components/session-editor";
import { TrainingPlanDoc } from "@/app/_components/training-plan-doc";
import { draftWeekWithCoach } from "@/app/_components/training-coach-stream";
import { WorkoutLog } from "@/app/_components/workout-log";
import { WorkoutChart, type WorkoutLog as OldWorkoutLog } from "@/app/_components/workout-chart";
import { templateForSession, workoutHref } from "@/lib/workout-templates";
import type { StravaActivity } from "@/lib/strava";
import { daysUntil, sessionMeta, type TrainingEvent, type TrainingSession } from "@/lib/training";
import { addDaysISO, shortDayLabel, todayISO, weekDates, weekRangeLabel, weekStartISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

interface StravaStatus {
  configured: boolean;
  connected: boolean;
  last_synced_at: string | null;
}

const SESSIONS_PER_WEEK = 6;

/**
 * /training — the week of sessions building toward the races, with Strava
 * marking them done. Sessions are the plan; the Strava strip under each day is
 * what actually happened, matched or not.
 */
export function TrainingPlanPanel() {
  // /training/workouts/<template>/<date> opens one structured session in place of the week.
  const pathname = usePathname();
  const m = pathname.match(/^\/training\/workouts\/([^/]+)(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
  if (m) return <WorkoutLog slug={m[1]} date={m[2] ?? todayISO()} />;
  return <TrainingWeek />;
}

function TrainingWeek() {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [strava, setStrava] = useState<StravaStatus>({ configured: false, connected: false, last_synced_at: null });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [coachStatus, setCoachStatus] = useState<string | null>(null);
  const [coachDay, setCoachDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{ date: string } | TrainingSession | null>(null);
  const [editingEvent, setEditingEvent] = useState<number | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e, st] = await Promise.all([
        fetch(`/api/training/sessions?from=${days[0]}&to=${days[6]}`),
        fetch("/api/training/events"),
        fetch("/api/strava/status"),
      ]);
      if (s.ok) {
        const data = (await s.json()) as { sessions: TrainingSession[]; activities: StravaActivity[] };
        setSessions(data.sessions);
        setActivities(data.activities);
      }
      if (e.ok) setEvents(await e.json());
      if (st.ok) setStrava(await st.json());
    } catch {
      // leave what's on screen
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Back from the Strava grant. Read from the URL directly rather than
  // useSearchParams, which would force a Suspense boundary on the whole shell.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("strava");
    if (s === "connected") toast.success("Strava connected — activities will mark sessions done.");
    else if (s === "error") toast.error(`Strava didn't connect (${params.get("reason") ?? "unknown"}).`);
    if (s) window.history.replaceState(null, "", "/training");
  }, []);

  const sync = useCallback(
    async (quiet = false) => {
      setSyncing(true);
      try {
        const res = await fetch("/api/strava/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 14 }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Sync failed");
        const r = (await res.json()) as { connected: boolean; fetched: number; matched: number };
        if (!quiet) toast.success(r.connected ? `${r.fetched} activities · ${r.matched} session${r.matched === 1 ? "" : "s"} marked done` : "Strava isn't connected.");
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
    if (loading || !strava.connected) return;
    const age = strava.last_synced_at ? Date.now() - new Date(strava.last_synced_at).getTime() : Infinity;
    if (age > 30 * 60 * 1000) sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, strava.connected]);

  // ── session actions ───────────────────────────────────────────────────

  const saveSession = async (d: SessionDraft, id?: number) => {
    setSaving(true);
    try {
      const body = {
        session_date: d.session_date,
        type: d.type,
        title: d.title,
        target_km: d.target_km === "" ? null : Number(d.target_km),
        target_minutes: d.target_minutes === "" ? null : Number(d.target_minutes),
        intensity: d.intensity,
        notes: d.notes,
      };
      const res = await fetch(id ? `/api/training/sessions/${id}` : "/api/training/sessions", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as TrainingSession;
      setSessions((ss) => (id ? ss.map((s) => (s.id === id ? row : s)) : [...ss, row]));
      setEditor(null);
    } catch {
      toast.error("Couldn't save that session.");
    } finally {
      setSaving(false);
    }
  };

  const removeSession = async (id: number) => {
    const prev = sessions;
    setSessions((ss) => ss.filter((s) => s.id !== id));
    setEditor(null);
    try {
      const res = await fetch(`/api/training/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setSessions(prev);
      toast.error("Couldn't delete that.");
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

  // The coach works the week session by session; each write re-reads the grid
  // so cards appear, change and disappear while it goes. Undone sessions are
  // edited in place rather than wiped, so there's nothing to confirm first.
  const draft = async () => {
    setDrafting(true);
    try {
      const summary = await draftWeekWithCoach(weekStart, SESSIONS_PER_WEEK, {
        onStatus: setCoachStatus,
        onWriting: setCoachDay,
        onWrote: () => void load(),
      });
      await load();
      if (summary) toast.success(summary, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't draft the week.");
    } finally {
      setDrafting(false);
      setCoachStatus(null);
      setCoachDay(null);
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
    const m = new Map<string, StravaActivity[]>();
    for (const a of activities) {
      const d = a.start_local.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return m;
  }, [activities]);
  const linked = useMemo(() => new Set(sessions.map((s) => s.strava_activity_id).filter(Boolean) as number[]), [sessions]);

  const week = useMemo(() => {
    const real = sessions.filter((s) => s.type !== "rest");
    const done = real.filter((s) => s.done);
    const plannedKm = real.reduce((n, s) => n + (s.target_km ?? 0), 0);
    const doneKm = activities.filter((a) => a.sport_type !== "Walk").reduce((n, a) => n + a.distance_m / 1000, 0);
    const effort = activities.reduce((n, a) => n + (a.relative_effort ?? 0), 0);
    const minutes = activities.filter((a) => a.sport_type !== "Walk").reduce((n, a) => n + a.moving_time_s / 60, 0);
    return { planned: real.length, done: done.length, plannedKm, doneKm, effort, minutes };
  }, [sessions, activities]);

  const upcoming = events.filter((e) => daysUntil(e.event_date) >= 0);
  const isCurrentWeek = weekStart === weekStartISO(today);

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
            <Button variant="outline" className="h-11 gap-1.5 px-4 text-base" onClick={() => setEditor({ date: today })}>
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
              <SessionCard key={s.id} s={s} past={false} big onToggle={() => toggleDone(s)} onEdit={() => setEditor(s)} />
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
          <Button className="h-11 gap-2 px-5 text-base" disabled={drafting} onClick={draft}>
            {drafting ? <Spinner className="size-4" /> : <SparklesIcon className="size-4" />}
            {drafting ? "Drafting…" : "Draft this week"}
          </Button>
          {strava.connected ? (
            <Button variant="outline" className="h-11 gap-2 px-4 text-base" disabled={syncing} onClick={() => sync()} title={strava.last_synced_at ? `Last synced ${new Date(strava.last_synced_at).toLocaleString()}` : undefined}>
              {syncing ? <Spinner className="size-4" /> : <RefreshCwIcon className="size-4" />}
              Sync
            </Button>
          ) : strava.configured ? (
            <Button className="h-11 gap-2 bg-[#fc4c02] px-4 text-base text-white hover:bg-[#fc4c02]/90" asChild>
              <a href="/api/strava/connect">
                <ActivityIcon className="size-4" /> Connect Strava
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {drafting && coachStatus && (
        <p className="flex items-center gap-2 text-base text-muted-foreground" aria-live="polite">
          <SparklesIcon className="size-4 shrink-0 animate-pulse text-foreground" />
          {coachStatus}
        </p>
      )}

      {/* Week — stacked rows on phones, columns on wide screens */}
      <section className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const acts = activitiesByDay.get(d) ?? [];
          const isToday = d === today;
          const past = d < today;
          const race = events.find((e) => e.event_date === d);
          return (
            <div key={d} className={cn("flex flex-col rounded-xl border transition-shadow", isToday && "border-foreground/40", race && "border-rose-500/60", drafting && coachDay === d && "ring-2 ring-primary/60")}>
              <div className={cn("flex items-center justify-between border-b px-3 py-2", isToday && "bg-foreground text-background")}>
                <span className={cn("text-sm font-semibold uppercase tracking-wide", past && !isToday && "text-muted-foreground/70")}>{shortDayLabel(d)}</span>
                <button type="button" onClick={() => setEditor({ date: d })} className={cn("flex size-9 items-center justify-center rounded-md", isToday ? "text-background/80 hover:text-background" : "text-muted-foreground hover:text-foreground")} aria-label={`Add session on ${shortDayLabel(d)}`}>
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
                  <SessionCard key={s.id} s={s} past={past} onToggle={() => toggleDone(s)} onEdit={() => setEditor(s)} />
                ))}
                {acts.filter((a) => !linked.has(a.id)).map((a) => (
                  <ActivityChip key={a.id} a={a} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

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

      <SessionEditor target={editor} saving={saving} onClose={() => setEditor(null)} onSave={saveSession} onDelete={removeSession} />
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

function SessionCard({ s, past, big, onToggle, onEdit }: { s: TrainingSession; past: boolean; big?: boolean; onToggle: () => void; onEdit: () => void }) {
  const meta = sessionMeta(s.type);
  const rest = s.type === "rest";
  const template = templateForSession(s);
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
          {(s.target_km !== null || s.target_minutes !== null) && (
            <span className={cn("block tabular-nums text-muted-foreground", big ? "text-base" : "text-xs")}>
              {s.target_km !== null && `${s.target_km} km`}
              {s.target_km !== null && s.target_minutes !== null && " · "}
              {s.target_minutes !== null && `${s.target_minutes} min`}
            </span>
          )}
          {big && s.notes && !template && <span className="mt-1 block text-base text-muted-foreground">{s.notes}</span>}
          {s.done && (s.actual_km !== null || s.actual_minutes !== null) && (
            <span className={cn("block tabular-nums text-emerald-700 dark:text-emerald-400", big ? "text-base" : "text-xs")}>
              {s.actual_km !== null && s.actual_km > 0 && `${s.actual_km} km`}
              {s.actual_km !== null && s.actual_km > 0 && s.actual_minutes !== null && " · "}
              {s.actual_minutes !== null && `${s.actual_minutes} min`}
              {s.actual_effort !== null && ` · RE ${s.actual_effort}`}
              {s.strava_activity_id && " · Strava"}
            </span>
          )}
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
          {s.done ? "View sets" : "Log sets"} <ChevronRightIcon className={big ? "size-5" : "size-3.5"} />
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

function ActivityChip({ a }: { a: StravaActivity }) {
  const km = a.distance_m / 1000;
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs leading-snug text-muted-foreground" title={a.name}>
      <span className="font-medium">{a.sport_type}</span>
      {km >= 0.5 && ` ${km.toFixed(1)} km`}
      {a.moving_time_s >= 60 && ` · ${Math.round(a.moving_time_s / 60)} min`}
      {a.relative_effort ? ` · RE ${a.relative_effort}` : ""}
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
