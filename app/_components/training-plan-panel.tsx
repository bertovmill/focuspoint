"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const draft = async () => {
    const undone = sessions.filter((s) => !s.done).length;
    if (undone > 0 && !window.confirm(`Replace the ${undone} unfinished session${undone === 1 ? "" : "s"} this week with a fresh draft?`)) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/training/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, sessions_per_week: SESSIONS_PER_WEEK }),
      });
      if (!res.ok) throw new Error();
      const r = (await res.json()) as { summary: string };
      toast.success(r.summary, { duration: 8000 });
      await load();
    } catch {
      toast.error("Couldn't draft the week — the model may be busy.");
    } finally {
      setDrafting(false);
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

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold">Training</h1>
        <Link href="/nutrition/plan" className="text-xs text-muted-foreground hover:text-foreground">
          Meal plan →
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setWeekStart((w) => addDaysISO(w, -7))} className="tap-target rounded-md border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Previous week">
            <ChevronLeftIcon className="size-3.5" />
          </button>
          <span className="min-w-28 text-center text-xs tabular-nums">{weekRangeLabel(weekStart)}</span>
          <button type="button" onClick={() => setWeekStart((w) => addDaysISO(w, 7))} className="tap-target rounded-md border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Next week">
            <ChevronRightIcon className="size-3.5" />
          </button>
          {!isCurrentWeek && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setWeekStart(weekStartISO(today))}>
              This week
            </Button>
          )}
        </div>
      </div>

      {/* Races + week summary + actions */}
      <section className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {upcoming.map((e) =>
              editingEvent === e.id ? (
                <EventForm key={e.id} initial={e} onSave={(n, d) => saveEvent(e.id, n, d)} onCancel={() => setEditingEvent(null)} onDelete={() => removeEvent(e.id)} />
              ) : (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEditingEvent(e.id)}
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                    daysUntil(e.event_date) <= 7 ? "border-rose-500/60 text-rose-600 dark:text-rose-400" : "text-foreground",
                  )}
                  title={`${e.event_date}${e.notes ? ` — ${e.notes}` : ""} · click to edit`}
                >
                  <FlagIcon className="size-3" />
                  <span className="font-medium">{e.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {daysUntil(e.event_date) === 0 ? "today" : `${daysUntil(e.event_date)}d`}
                  </span>
                  <PencilIcon className="size-2.5 opacity-0 group-hover:opacity-60" />
                </button>
              ),
            )}
            {editingEvent === "new" ? (
              <EventForm onSave={(n, d) => saveEvent("new", n, d)} onCancel={() => setEditingEvent(null)} />
            ) : (
              <button type="button" onClick={() => setEditingEvent("new")} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                <PlusIcon className="size-3" /> race
              </button>
            )}
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            <span className={cn("font-medium", week.done >= week.planned && week.planned > 0 ? "text-emerald-600" : "text-foreground")}>
              {week.done}/{week.planned} sessions
            </span>
            {week.plannedKm > 0 && ` · ${week.plannedKm.toFixed(0)} km planned`}
            {week.doneKm > 0 && ` · ${week.doneKm.toFixed(1)} km done`}
            {week.minutes > 0 && ` · ${Math.round(week.minutes)} min`}
            {week.effort > 0 && ` · effort ${week.effort}`}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={drafting} onClick={draft}>
            {drafting ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
            {drafting ? "Drafting…" : "Draft week with Cael"}
          </Button>
          {strava.connected ? (
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={syncing} onClick={() => sync()} title={strava.last_synced_at ? `Last synced ${new Date(strava.last_synced_at).toLocaleString()}` : undefined}>
              {syncing ? <Spinner className="size-3" /> : <RefreshCwIcon className="size-3" />}
              Sync Strava
            </Button>
          ) : strava.configured ? (
            <Button size="sm" className="h-8 gap-1 bg-[#fc4c02] text-xs text-white hover:bg-[#fc4c02]/90" asChild>
              <a href="/api/strava/connect">
                <ActivityIcon className="size-3" /> Connect Strava
              </a>
            </Button>
          ) : (
            <span className="max-w-56 text-xs text-muted-foreground" title="Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET (strava.com/settings/api) in .env.local and on Vercel">
              Strava needs API keys before it can connect.
            </span>
          )}
        </div>
      </section>

      {/* Week — columns on wide screens, stacked on phones */}
      <section className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const acts = activitiesByDay.get(d) ?? [];
          const isToday = d === today;
          const past = d < today;
          const race = events.find((e) => e.event_date === d);
          return (
            <div key={d} className={cn("flex flex-col rounded-lg border", isToday && "border-foreground/40", race && "border-rose-500/60")}>
              <div className={cn("flex items-center justify-between border-b px-2 py-1.5", isToday && "bg-foreground text-background")}>
                <span className={cn("text-xs font-semibold uppercase tracking-wide", past && !isToday && "text-muted-foreground/70")}>{shortDayLabel(d)}</span>
                <button type="button" onClick={() => setEditor({ date: d })} className={cn("tap-target rounded p-0.5", isToday ? "text-background/80 hover:text-background" : "text-muted-foreground hover:text-foreground")} aria-label={`Add session on ${shortDayLabel(d)}`}>
                  <PlusIcon className="size-3.5" />
                </button>
              </div>
              {race && (
                <div className="flex items-center gap-1 border-b bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                  <FlagIcon className="size-3" /> {race.name}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                {list.length === 0 && acts.length === 0 && (
                  <p className={cn("py-3 text-center text-xs text-muted-foreground/60", past && "opacity-60")}>—</p>
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

      <p className="text-xs text-muted-foreground">
        Tick a session or let Strava do it: a run marks the day&apos;s long run, a workout marks Hyrox or strength. Unmatched
        activities show under the day in grey. Lift numbers and the day&apos;s note still live on the Home screen&apos;s Training card.
      </p>

      <SessionEditor target={editor} saving={saving} onClose={() => setEditor(null)} onSave={saveSession} onDelete={removeSession} />
    </div>
  );
}

function SessionCard({ s, past, onToggle, onEdit }: { s: TrainingSession; past: boolean; onToggle: () => void; onEdit: () => void }) {
  const meta = sessionMeta(s.type);
  const rest = s.type === "rest";
  return (
    <div className={cn("group relative rounded-md border p-2", s.done && "border-emerald-500/50 bg-emerald-500/5", past && !s.done && !rest && "border-dashed opacity-70")}>
      <div className="flex items-start gap-1.5">
        {!rest && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={s.done ? "Mark not done" : "Mark done"}
            className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border", s.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40")}
          >
            {s.done && <CheckIcon className="size-3" />}
          </button>
        )}
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title={s.notes ?? undefined}>
          <span className="flex items-center gap-1">
            <span className={cn("size-1.5 shrink-0 rounded-full", meta.color)} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.short}</span>
            {s.intensity === "hard" && <span className="text-[10px] text-rose-500">hard</span>}
          </span>
          <span className={cn("block text-xs font-medium leading-snug", s.done && "line-through text-muted-foreground")}>{s.title}</span>
          {(s.target_km !== null || s.target_minutes !== null) && (
            <span className="block text-[11px] tabular-nums text-muted-foreground">
              {s.target_km !== null && `${s.target_km} km`}
              {s.target_km !== null && s.target_minutes !== null && " · "}
              {s.target_minutes !== null && `${s.target_minutes} min`}
            </span>
          )}
          {s.done && (s.actual_km !== null || s.actual_minutes !== null) && (
            <span className="block text-[11px] tabular-nums text-emerald-700 dark:text-emerald-400">
              {s.actual_km !== null && s.actual_km > 0 && `${s.actual_km} km`}
              {s.actual_km !== null && s.actual_km > 0 && s.actual_minutes !== null && " · "}
              {s.actual_minutes !== null && `${s.actual_minutes} min`}
              {s.actual_effort !== null && ` · RE ${s.actual_effort}`}
              {s.strava_activity_id && " · Strava"}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function ActivityChip({ a }: { a: StravaActivity }) {
  const km = a.distance_m / 1000;
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1 text-[11px] leading-snug text-muted-foreground" title={a.name}>
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
      <Input autoFocus className="h-7 w-32 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Race" />
      <Input type="date" className="h-7 w-36 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button type="submit" size="sm" className="h-7 text-xs" disabled={!name.trim() || !date}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
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
