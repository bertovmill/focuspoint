"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarRangeIcon,
  FileTextIcon,
  DumbbellIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/** The order the server lists sessions in: by day, then top to bottom. */
const bySessionOrder = (a: TrainingSession, b: TrainingSession) =>
  a.session_date.localeCompare(b.session_date) || a.position - b.position || a.id - b.id;

/** Day columns are droppables keyed by date; cards are sortables keyed by session id. */
const isDayId = (id: UniqueIdentifier) => typeof id === "string";

/**
 * Where a dragged card is over the week: the day column under the pointer, then the
 * nearest card in it — so a drop between two cards lands between them, and one on an
 * empty day (or below its last card) goes to the end of that day.
 */
const dayThenCard: CollisionDetection = (args) => {
  const dayColumns = args.droppableContainers.filter((c) => isDayId(c.id));
  let days = pointerWithin({ ...args, droppableContainers: dayColumns });
  if (days.length === 0) days = rectIntersection({ ...args, droppableContainers: dayColumns });
  const day = days[0]?.id;
  if (day === undefined) return [];
  const cards = args.droppableContainers.filter((c) => !isDayId(c.id) && c.data.current?.sortable?.containerId === day);
  return cards.length > 0 ? closestCenter({ ...args, droppableContainers: cards }) : days;
};

/**
 * /training — the week of sessions building toward the races, with Fitbit
 * workouts marking them done. Sessions are the plan; the workout strip under each
 * day is training that happened but matched nothing (walks and bike rides hidden).
 */
export function TrainingPlanPanel() {
  const pathname = usePathname();
  // The workout bank and its editor.
  if (/^\/training\/workouts\/?$/.test(pathname)) return <WorkoutBank />;
  // The written plan and the old lift log, moved off the week view into the ⋯ menu (Berto, 2026-10-17).
  if (/^\/training\/plan\/?$/.test(pathname)) return <SubPage title="Written plan"><TrainingPlanDoc /></SubPage>;
  if (/^\/training\/past\/?$/.test(pathname)) return <SubPage title="Past programs" blurb="5×5 lifts and 10K times, logged one number per day before the structured workouts."><PastPrograms /></SubPage>;
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
  // The session waiting on the in-page "Remove?" dialog (was a browser confirm()).
  // Kept after close so the title doesn't blank out during the exit animation.
  const [removing, setRemoving] = useState<TrainingSession | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const askRemove = (s: TrainingSession) => { setRemoving(s); setRemoveOpen(true); };
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
  // won't happen) or up and down within one (2026-10-11: speed before the lift).
  // Mouse drags after 6px; on a phone it's press-and-hold, so scrolling and tapping
  // the card still work.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [dragging, setDragging] = useState<TrainingSession | null>(null);
  // The day the dragged card is over, so that column lights up even while the card
  // is over one of its sessions rather than the column itself.
  const [overDay, setOverDay] = useState<string | null>(null);
  const dayOf = (id: UniqueIdentifier) => (isDayId(id) ? String(id) : (sessions.find((x) => x.id === id)?.session_date ?? null));

  // One write for both kinds of move: the day's sessions in their new order, top to
  // bottom. The server puts an id from another day onto this one at that spot.
  const saveOrder = async (date: string, ids: number[], moved: TrainingSession) => {
    const prev = sessions;
    setSessions((ss) =>
      ss
        .map((x) => {
          const i = ids.indexOf(x.id);
          return i === -1 ? x : { ...x, session_date: date, position: i };
        })
        .sort(bySessionOrder),
    );
    try {
      const res = await fetch("/api/training/sessions/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ids }),
      });
      if (!res.ok) throw new Error();
      const { sessions: day } = (await res.json()) as { sessions: TrainingSession[] };
      setSessions((ss) => [...ss.filter((x) => x.session_date !== date), ...day].sort(bySessionOrder));
      if (moved.session_date !== date) toast.success(`${moved.title} moved to ${shortDayLabel(date)}`);
    } catch {
      setSessions(prev);
      toast.error("Couldn't move that.");
    }
  };

  // A card was let go: over another card it takes that spot; over a day it goes last.
  const dropSession = (e: DragEndEvent) => {
    setDragging(null);
    setOverDay(null);
    const s = sessions.find((x) => x.id === Number(e.active.id));
    if (!s || !e.over) return;
    const overId = e.over.id;
    const target = isDayId(overId) ? undefined : sessions.find((x) => x.id === overId);
    const date = target ? target.session_date : String(overId);
    const dayIds = sessions.filter((x) => x.session_date === date).map((x) => x.id);
    let ids: number[];
    if (date === s.session_date) {
      const from = dayIds.indexOf(s.id);
      const to = target ? dayIds.indexOf(target.id) : dayIds.length - 1;
      if (from === to) return;
      ids = arrayMove(dayIds, from, to);
    } else {
      const at = target ? dayIds.indexOf(target.id) : dayIds.length;
      ids = [...dayIds.slice(0, at), s.id, ...dayIds.slice(at)];
    }
    saveOrder(date, ids, s);
  };

  // Take a session off its day (Berto swaps workouts out). Logged splits/sets stay
  // in the workout log — they're keyed by workout and date, not the session.
  const removeSession = async (s: TrainingSession) => {
    const prev = sessions;
    setSessions((ss) => ss.filter((x) => x.id !== s.id));
    try {
      const res = await fetch(`/api/training/sessions/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${s.title} removed`);
    } catch {
      setSessions(prev);
      toast.error("Couldn't remove that.");
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

  const week = useMemo(() => weekStats(sessions, activities), [sessions, activities]);
  const upcoming = events.filter((e) => daysUntil(e.event_date) >= 0);
  const isCurrentWeek = weekStart === weekStartISO(today);
  // Phone: which day the week strip shows. Today when it's in view, else the week's first day.
  const [pickedDay, setPickedDay] = useState(today);
  const selectedDay = days.includes(pickedDay) ? pickedDay : days.includes(today) ? today : days[0];

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
  const selectedList = byDay.get(selectedDay) ?? [];
  const selectedActs = (activitiesByDay.get(selectedDay) ?? []).filter((a) => !linked.has(a.id));
  const selectedRace = events.find((e) => e.event_date === selectedDay);

  return (
    <div className="space-y-6 pb-10">
      {/* Title, with one ⋯ menu for everything that isn't this week (Berto, 2026-10-17: as simple as possible). */}
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Training</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="More">
                {filling || syncing ? <Spinner className="size-5" /> : <MoreHorizontalIcon className="size-5" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={() => setEditingEvent("new")}>
                <FlagIcon /> Add race
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/training/workouts">
                  <DumbbellIcon /> Workout bank
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/training/plan">
                  <FileTextIcon /> Written plan
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/training/past">
                  <ArchiveIcon /> Past programs
                </Link>
              </DropdownMenuItem>
              {weekStart >= weekStartISO(today) && (
                <DropdownMenuItem disabled={filling} onSelect={fillFromBank}>
                  <CalendarRangeIcon /> Fill from bank
                </DropdownMenuItem>
              )}
              {watch.connected && (
                <DropdownMenuItem disabled={syncing} onSelect={() => sync()}>
                  <RefreshCwIcon /> Sync Fitbit
                  {watch.last_synced_at && <span className="ml-auto text-xs text-muted-foreground">{new Date(watch.last_synced_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Races read as one line ("Hyrox in 123 days"); tap one to edit it. */}
        {editingEvent === null ? (
          upcoming.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {upcoming.map((e) => {
                const n = daysUntil(e.event_date);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEditingEvent(e.id)}
                    className={cn("inline-flex items-center gap-1.5 text-base", n <= 7 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground hover:text-foreground")}
                    title={`${e.event_date}${e.notes ? ` — ${e.notes}` : ""} · tap to edit`}
                  >
                    <FlagIcon className="size-4" />
                    {e.name} {n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <div className="pt-2">
            <EventForm
              key={String(editingEvent)}
              initial={editingEvent === "new" ? undefined : upcoming.find((e) => e.id === editingEvent)}
              onSave={(n, d) => saveEvent(editingEvent, n, d)}
              onCancel={() => setEditingEvent(null)}
              onDelete={editingEvent === "new" ? undefined : () => removeEvent(editingEvent)}
            />
          </div>
        )}
      </header>

      {/* Today, front and centre. No frame of its own: the session card is the card. Desktop only: the phone's week strip below shows the selected day. */}
      {isCurrentWeek && (
        <section className="hidden max-w-xl space-y-3 md:block">
          <p className="text-sm text-muted-foreground">Today</p>
          {todayRace && (
            <p className="flex items-center gap-2 text-lg font-semibold text-rose-600 dark:text-rose-400">
              <FlagIcon className="size-5" /> Race day: {todayRace.name}
            </p>
          )}
          {/* Today's cards drag up and down to change the day's order (speed before the lift). */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropSession}>
            <SortableContext items={todayList.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {todayList.length === 0 && todayActs.length === 0 && !todayRace && (
                  <p className="rounded-2xl bg-muted/50 px-5 py-6 text-center text-base text-muted-foreground">Nothing planned today.</p>
                )}
                {todayList.map((s) => (
                  <SortableSession key={s.id} id={s.id}>
                    <SessionCard s={s} past={false} big onToggle={() => toggleDone(s)} onEdit={() => router.push(sessionHref(s.id))} onDelete={() => askRemove(s)} />
                  </SortableSession>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {/* Watch workouts no ticked session has claimed, grouped under one caption so they don't read as strays. */}
          {todayActs.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From your Fitbit</p>
              <div className="divide-y">
                {todayActs.map((a) => (
                  <ActivityChip key={a.id} a={a} big />
                ))}
              </div>
            </div>
          )}
          <AddSessionLink date={today} />
        </section>
      )}

      {/* Week: small and quiet — the strip and the sessions are the page. */}
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setWeekStart((w) => addDaysISO(w, -7))} className="-ml-2 flex size-9 items-center justify-center rounded-full hover:bg-muted hover:text-foreground" aria-label="Previous week">
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="whitespace-nowrap tabular-nums">{weekRangeLabel(weekStart)}</span>
          <button type="button" onClick={() => setWeekStart((w) => addDaysISO(w, 7))} className="flex size-9 items-center justify-center rounded-full hover:bg-muted hover:text-foreground" aria-label="Next week">
            <ChevronRightIcon className="size-4" />
          </button>
          {!isCurrentWeek && (
            <button type="button" onClick={() => setWeekStart(weekStartISO(today))} className="rounded-full px-2 py-1 hover:bg-muted hover:text-foreground">
              This week
            </button>
          )}
        </div>
        <span className={cn("whitespace-nowrap tabular-nums", week.done >= week.planned && week.planned > 0 && "text-emerald-600")}>
          {week.done} of {week.planned} done{week.doneKm > 0 && ` · ${week.doneKm.toFixed(1)} km`}
        </span>
      </div>

      {/* Phone: a Runna-style week strip — no boxes; the selected day is a filled circle, a green dot means done (2026-10-17). */}
      <section className="space-y-5 md:hidden">
        <div className="grid grid-cols-7 text-center">
          {days.map((d) => {
            const list = (byDay.get(d) ?? []).filter((s) => s.type !== "rest");
            const isToday = d === today;
            const isSelected = d === selectedDay;
            const race = events.some((e) => e.event_date === d);
            const allDone = list.length > 0 && list.every((s) => s.done);
            return (
              <button key={d} type="button" onClick={() => setPickedDay(d)} aria-label={shortDayLabel(d)} aria-pressed={isSelected} className="flex flex-col items-center gap-1 py-1">
                <span className="text-[11px] font-medium uppercase text-muted-foreground">{weekdayLetter(d)}</span>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-base tabular-nums",
                    isSelected ? "bg-foreground font-semibold text-background" : isToday ? "font-semibold text-foreground ring-1 ring-foreground/30" : d < today ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <span className={cn("size-1.5 rounded-full", race ? "bg-rose-500" : list.length === 0 ? "bg-transparent" : allDone ? "bg-emerald-500" : "bg-muted-foreground/30")} />
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{selectedDay === today ? "Today" : shortDayLabel(selectedDay)}</p>
          {selectedRace && (
            <p className="flex items-center gap-2 text-lg font-semibold text-rose-600 dark:text-rose-400">
              <FlagIcon className="size-5" /> {selectedDay === today ? "Race day" : "Race"}: {selectedRace.name}
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropSession}>
            <SortableContext items={selectedList.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {selectedList.length === 0 && selectedActs.length === 0 && !selectedRace && (
                  <p className="rounded-2xl bg-muted/50 px-5 py-6 text-center text-base text-muted-foreground">{selectedDay < today ? "Nothing logged." : "Nothing planned."}</p>
                )}
                {selectedList.map((s) => (
                  <SortableSession key={s.id} id={s.id}>
                    <SessionCard s={s} past={selectedDay < today} big onToggle={() => toggleDone(s)} onEdit={() => router.push(sessionHref(s.id))} onDelete={() => removeSession(s)} />
                  </SortableSession>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {selectedActs.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From your Fitbit</p>
              <div className="divide-y">
                {selectedActs.map((a) => (
                  <ActivityChip key={a.id} a={a} big />
                ))}
              </div>
            </div>
          )}
          <AddSessionLink date={selectedDay} />
        </div>
      </section>

      {/* Week — seven columns on wide screens (the phone has the strip above). Cards drag between days. */}
      <DndContext
        sensors={sensors}
        collisionDetection={dayThenCard}
        onDragStart={(e) => setDragging(sessions.find((x) => x.id === Number(e.active.id)) ?? null)}
        onDragOver={(e: DragOverEvent) => setOverDay(e.over ? dayOf(e.over.id) : null)}
        onDragEnd={dropSession}
        onDragCancel={() => {
          setDragging(null);
          setOverDay(null);
        }}
      >
      <section className="hidden gap-2 md:grid md:grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const acts = activitiesByDay.get(d) ?? [];
          const isToday = d === today;
          const past = d < today;
          const race = events.find((e) => e.event_date === d);
          return (
            <DropDay key={d} day={d} over={overDay === d && dragging !== null && dragging.session_date !== d} className="group/day flex min-w-0 flex-col gap-2 rounded-xl p-1 transition-shadow">
              <div className="flex items-center justify-between pl-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-medium uppercase text-muted-foreground">{weekdayShort(d)}</span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm tabular-nums",
                      isToday ? "bg-foreground font-semibold text-background" : past ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => router.push(newSessionHref(d))}
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/day:opacity-100"
                  aria-label={`Add session on ${shortDayLabel(d)}`}
                >
                  <PlusIcon className="size-4" />
                </button>
              </div>
              {race && (
                <p className="flex items-center gap-1 px-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                  <FlagIcon className="size-3.5" /> {race.name}
                </p>
              )}
              <div className="flex min-h-24 flex-1 flex-col gap-2">
                <SortableContext id={d} items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {list.map((s) => (
                    <DragSession key={s.id} id={s.id}>
                      <SessionCard s={s} past={past} onToggle={() => toggleDone(s)} onEdit={() => router.push(sessionHref(s.id))} onDelete={() => askRemove(s)} />
                    </DragSession>
                  ))}
                </SortableContext>
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
            <div className="rotate-1 rounded-xl bg-background shadow-xl">
              <SessionCard s={dragging} past={false} onToggle={() => {}} onEdit={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>


      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off {removing ? shortDayLabel(removing.session_date) : "that day"}. Splits and sets you logged stay in your workout log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && removeSession(removing)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Mon", "Tue"… for the desktop grid's day headers. */
function weekdayShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

/** "M", "T", "W"… for the phone's week strip; the date number beside it tells the two T's and S's apart. */
function weekdayLetter(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "narrow" });
}

interface WeekStats {
  planned: number;
  done: number;
  plannedKm: number;
  doneKm: number;
  effort: number;
  minutes: number;
}

function weekStats(sessions: TrainingSession[], activities: Activity[]): WeekStats {
  const real = sessions.filter((s) => s.type !== "rest");
  const done = real.filter((s) => s.done);
  const plannedKm = real.reduce((n, s) => n + (s.target_km ?? 0), 0);
  // Distance and time are what he typed in; the watch only supplies effort.
  const doneKm = done.reduce((n, s) => n + (s.actual_km ?? 0), 0);
  const effort = activities.reduce((n, a) => n + (a.azm ?? 0), 0);
  const minutes = done.reduce((n, s) => n + (s.actual_minutes ?? 0), 0);
  return { planned: real.length, done: done.length, plannedKm, doneKm, effort, minutes };
}

/** A day column that takes dropped sessions; lights up while one from another day hovers over it. */
function DropDay({ day, over, className, children }: { day: string; over: boolean; className: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: day });
  return (
    <div ref={setNodeRef} className={cn(className, over && "bg-primary/5 ring-2 ring-primary/40")}>
      {children}
    </div>
  );
}

/**
 * Makes a session card draggable in the week grid. The card stays in place, faded,
 * while its copy follows the finger; its neighbours slide apart to show where it
 * will land.
 */
function DragSession({ id, children }: { id: number; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // No text selection or iOS callout on the press-and-hold that starts a drag.
      className={cn("select-none [-webkit-touch-callout:none]", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
}

/** Today's big cards: the card itself lifts and slides as it's dragged up or down the list. */
function SortableSession({ id, children }: { id: number; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("select-none rounded-xl [-webkit-touch-callout:none]", isDragging && "relative z-10 bg-background shadow-xl")}
    >
      {children}
    </div>
  );
}

function SessionCard({ s, past, big, onToggle, onEdit, onDelete }: { s: TrainingSession; past: boolean; big?: boolean; onToggle: () => void; onEdit: () => void; onDelete?: () => void }) {
  const meta = sessionMeta(s.type);
  const rest = s.type === "rest";
  const template = s.workout_slug ? { slug: s.workout_slug } : null;
  const logLabel = s.done ? (s.type === "strength" ? "View sets" : "View splits") : s.type === "strength" ? "Log sets" : "Log splits";
  const actuals =
    s.done && (s.actual_km !== null || s.actual_minutes !== null)
      ? [
          s.actual_km !== null && s.actual_km > 0 && `${s.actual_km} km`,
          s.actual_pace_sec ? `${formatPace(s.actual_pace_sec)}/km` : s.actual_km && s.actual_minutes && `${formatPace((s.actual_minutes * 60) / s.actual_km)}/km`,
          s.actual_minutes !== null && `${s.actual_minutes} min`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
  const heart =
    s.done && (s.actual_avg_hr !== null || s.actual_effort !== null)
      ? [s.actual_avg_hr !== null && `♥ ${s.actual_avg_hr} avg`, s.actual_effort !== null && `${s.actual_effort} AZM`].filter(Boolean).join(" · ")
      : null;

  if (big) {
    // The day's hero, Runna-style (Berto, 2026-10-17): one soft card, no borders — a meta line,
    // the title, a round tick, then one dark button. Delete lives on the session page.
    const metaLine = [meta.short, s.intensity === "hard" ? "hard" : null, targetLabel(s)].filter(Boolean).join(" · ");
    return (
      <div className="rounded-2xl bg-muted/60 p-5 dark:bg-muted/40">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title={s.notes ?? undefined}>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", meta.color)} />
              <span className="tabular-nums">{metaLine}</span>
            </span>
            <span className="mt-1 block text-xl font-semibold leading-snug tracking-tight">{s.title}</span>
            {s.notes && !template && <span className="mt-2 block text-base text-muted-foreground">{s.notes}</span>}
            {actuals && <span className="mt-2 block text-base tabular-nums text-emerald-700 dark:text-emerald-400">{actuals}</span>}
            {heart && <span className={cn("block text-base tabular-nums text-muted-foreground", !actuals && "mt-2")}>{heart}</span>}
            {s.done && s.actual_zones && <ZoneBar zones={s.actual_zones} className="mt-2.5 h-2" />}
          </button>
          {!rest && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={s.done ? "Mark not done" : "Mark done"}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                s.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/30 text-transparent hover:border-muted-foreground/60",
              )}
            >
              <CheckIcon className="size-5" />
            </button>
          )}
        </div>
        {template && (
          <Link
            href={workoutHref(template.slug, s.session_date)}
            className="mt-4 flex h-11 items-center justify-center rounded-lg bg-foreground text-base font-medium text-background hover:bg-foreground/90"
          >
            {logLabel}
          </Link>
        )}
      </div>
    );
  }

  // Week-grid card (desktop): a small soft card like the day's hero — no border, a round tick,
  // a quiet log link. Done is said by the tick; a missed session just fades (2026-10-17).
  return (
    <div className={cn("group relative rounded-xl bg-muted/60 p-3 dark:bg-muted/40", past && !s.done && !rest && "opacity-60")}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title={s.notes ?? undefined}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-1.5 shrink-0 rounded-full", meta.color)} />
            {meta.short}
            {s.intensity === "hard" && " · hard"}
          </span>
          <span className="mt-0.5 block text-sm font-medium leading-snug">{s.title}</span>
          {targetLabel(s) && <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{targetLabel(s)}</span>}
          {actuals && <span className="mt-0.5 block text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{actuals}</span>}
          {heart && <span className="block text-xs tabular-nums text-muted-foreground">{heart}</span>}
          {s.done && s.actual_zones && <ZoneBar zones={s.actual_zones} className="mt-1.5 h-1.5" />}
        </button>
        {!rest && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={s.done ? "Mark not done" : "Mark done"}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
              s.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/30 text-transparent hover:border-muted-foreground/60",
            )}
          >
            <CheckIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {template ? (
          <Link href={workoutHref(template.slug, s.session_date)} className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            {logLabel} <ChevronRightIcon className="size-3.5" />
          </Link>
        ) : (
          <span />
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove ${s.title}`}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <TrashIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** The old one-number-per-lift log (workout_logs), archived when the structured workouts replaced it. */
function PastPrograms() {
  const [logs, setLogs] = useState<OldWorkoutLog[] | null>(null);
  useEffect(() => {
    fetch("/api/workouts").then((r) => r.json()).then(setLogs).catch(() => setLogs([]));
  }, []);
  return logs === null ? <Skeleton className="h-40 w-full" /> : <WorkoutChart logs={logs} />;
}

/** "+ Add session" under a day's cards — a quiet link, not another box. */
function AddSessionLink({ date }: { date: string }) {
  return (
    <Link href={newSessionHref(date)} className="inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground">
      <PlusIcon className="size-4" /> Add session
    </Link>
  );
}

/** A page off the week view, in the workout bank's style: back to Training, then a title. */
function SubPage({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="space-y-2">
        <Link href="/training" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Training
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {blurb && <p className="text-muted-foreground">{blurb}</p>}
      </header>
      {children}
    </div>
  );
}

/** A Fitbit workout no ticked session has claimed. Heart rate only — its distance and time aren't trusted. */
function ActivityChip({ a, big }: { a: Activity; big?: boolean }) {
  const hint = `${a.name} on your Fitbit — tick the session to attach its heart rate`;
  if (big)
    return (
      <div className="py-3 text-base leading-snug text-muted-foreground" title={hint}>
        <span className="font-medium text-foreground">{a.name}</span>
        {a.avg_hr ? ` · ♥ ${a.avg_hr}` : ""}
        {a.azm ? ` · ${a.azm} AZM` : ""}
        {a.zones && <ZoneBar zones={a.zones} className="mt-2 h-2" />}
      </div>
    );
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs leading-snug text-muted-foreground" title={hint}>
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
  // A soft card like the session cards, stacked on a phone so nothing runs off the edge.
  return (
    <form
      className="space-y-3 rounded-2xl bg-muted/60 p-4 dark:bg-muted/40"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && date) onSave(name.trim(), date);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Input autoFocus className="h-11 bg-background text-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="Race" aria-label="Race name" />
        <Input type="date" className="h-11 bg-background text-base" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Race date" />
      </div>
      <div className="flex items-center gap-2">
        {onDelete && (
          <button type="button" onClick={onDelete} className="text-sm text-muted-foreground hover:text-destructive">
            Remove race
          </button>
        )}
        <Button type="button" variant="ghost" className="ml-auto h-10 text-base" onClick={onCancel}>
          Cancel
        </Button>
        <button type="submit" disabled={!name.trim() || !date} className="h-10 rounded-lg bg-foreground px-5 text-base font-medium text-background hover:bg-foreground/90 disabled:opacity-40">
          Save
        </button>
      </div>
    </form>
  );
}
