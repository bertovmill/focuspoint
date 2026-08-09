"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRightIcon,
  MessageCircleIcon,
  ListTodoIcon,
  FileTextIcon,
  ListChecksIcon,
  BookOpenIcon,
  BrainIcon,
  BrushIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ImageIcon,
  GaugeIcon,
  TelescopeIcon,
  EyeIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
} from "lucide-react";
import {
  BarbellIcon,
  CoinsIcon,
  CompassIcon,
  HandHeartIcon,
  HandsClappingIcon,
  PenNibIcon,
  PlantIcon,
  UsersThreeIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { PinButton } from "@/app/_components/pin-button";
import { WorkoutChart, type WorkoutLog } from "@/app/_components/workout-chart";
import { ReadingChart, type ReadingLog } from "@/app/_components/reading-chart";
import { Sparkline } from "@/app/_components/sparkline";
import { bucketAggregate, type Granularity } from "@/lib/chart-buckets";
import { cn } from "@/lib/utils";

export type HomeTarget =
  | "chat"
  | "tasks"
  | "notes"
  | "lists"
  | "calendar"
  | "journal-templates"
  | "dreams"
  | "schedule"
  | "media"
  | "sketches"
  | "measures"
  | "vision";

interface MeasureRow {
  category: string;
  recorded_date: string;
  data: Record<string, number | string | undefined>;
}

interface Meal {
  id: number;
  meal_date: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  feedback: "up" | "down" | null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const SECTIONS: { tab: HomeTarget; label: string; icon: typeof BookOpenIcon; hotkey: string }[] = [
  { tab: "chat", label: "Chat", icon: MessageCircleIcon, hotkey: "1" },
  { tab: "tasks", label: "Tasks", icon: ListTodoIcon, hotkey: "2" },
  { tab: "notes", label: "Notes", icon: FileTextIcon, hotkey: "3" },
  { tab: "lists", label: "Lists", icon: ListChecksIcon, hotkey: "4" },
  { tab: "journal-templates", label: "Journal", icon: BookOpenIcon, hotkey: "5" },
  { tab: "dreams", label: "Dreams", icon: BrainIcon, hotkey: "6" },
  { tab: "schedule", label: "Schedule", icon: CalendarClockIcon, hotkey: "7" },
  { tab: "media", label: "Media", icon: ImageIcon, hotkey: "8" },
  { tab: "measures", label: "Measures", icon: GaugeIcon, hotkey: "9" },
  { tab: "vision", label: "Vision", icon: TelescopeIcon, hotkey: "0" },
  { tab: "sketches", label: "Sketches", icon: BrushIcon, hotkey: "s" },
  { tab: "calendar", label: "Calendar", icon: CalendarDaysIcon, hotkey: "g" },
];

/**
 * Daily artwork — one piece of "what it's all for" per day, rotating by day of year.
 * All images hand-verified Unsplash photos (hotlinking per Unsplash guidelines).
 * `place` (optional) is a Google Maps query — set it only for captions that name a
 * verifiable real location; those captions render as a maps link on the hero.
 */
const DAILY_ART: { url: string; caption: string; place?: string }[] = [
  { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80&fm=jpg", caption: "Peaks above the clouds" },
  { url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1600&q=80&fm=jpg", caption: "Golden hour with good people" },
  { url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80&fm=jpg", caption: "Dinner done right" },
  { url: "https://images.unsplash.com/photo-1547153760-18fc86324498?w=1600&q=80&fm=jpg", caption: "Lost in the dance" },
  { url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80&fm=jpg", caption: "Lago di Braies, Dolomites", place: "Lago di Braies, Braies, Italy" },
  { url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1600&q=80&fm=jpg", caption: "The peloton rolls" },
  { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80&fm=jpg", caption: "Ocean morning" },
  { url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=80&fm=jpg", caption: "Shoulder to shoulder" },
  { url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1600&q=80&fm=jpg", caption: "Butterfly, full flight" },
  { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&q=80&fm=jpg", caption: "A sky full of stars" },
  { url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80&fm=jpg", caption: "A table waiting for friends" },
  { url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1600&q=80&fm=jpg", caption: "On your marks" },
  { url: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=80&fm=jpg", caption: "Out on the water" },
  { url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1600&q=80&fm=jpg", caption: "Confetti night" },
  { url: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=1600&q=80&fm=jpg", caption: "Still water, clear head" },
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

/** The 8 forms of wealth — Berto's life philosophy. Icon + the section each card opens. */
const WEALTH_FORMS: { label: string; icon: PhosphorIcon; target: HomeTarget }[] = [
  { label: "Growth", icon: PlantIcon, target: "vision" },
  { label: "Wellness", icon: BarbellIcon, target: "measures" },
  { label: "Family", icon: UsersThreeIcon, target: "vision" },
  { label: "Craft", icon: PenNibIcon, target: "vision" },
  { label: "Money", icon: CoinsIcon, target: "measures" },
  { label: "Community", icon: HandsClappingIcon, target: "vision" },
  { label: "Adventure", icon: CompassIcon, target: "dreams" },
  { label: "Service", icon: HandHeartIcon, target: "vision" },
];

/** Routine schedule lines are "Day (period): text" or "Goal: text"; this parses one into a week grid. */
const ROUTINE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROUTINE_DAY_RE = new RegExp(`^(${ROUTINE_DAYS.join("|")})\\s*(?:\\(([^)]+)\\))?:\\s*(.*)$`);

function parseRoutine(content: string) {
  let goal: string | null = null;
  const days: Record<string, { period: string | null; text: string }[]> = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^goal:/i.test(line)) {
      goal = line.slice(line.indexOf(":") + 1).trim();
      continue;
    }
    const m = line.match(ROUTINE_DAY_RE);
    if (m) {
      const [, day, period, text] = m;
      (days[day] ??= []).push({ period: period ?? null, text: text.trim() });
    }
  }
  return { goal, days };
}

/** One day's entries, as editable lines: "(period): text" or bare "text" when there's no period. */
function dayEntriesToLines(entries: { period: string | null; text: string }[]): string {
  return entries.map((e) => (e.period ? `(${e.period}): ${e.text}` : e.text)).join("\n");
}

const EDIT_LINE_RE = /^\(([^)]+)\):\s*(.*)$/;

/** Replaces a single day's lines within a routine's raw content, preserving every other line's position. */
function rebuildContentForDay(content: string, day: string, editedLines: string): string {
  const newEntryLines = editedLines
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(EDIT_LINE_RE);
      return m ? `${day} (${m[1]}): ${m[2]}` : `${day}: ${l}`;
    });

  const lines = content.split("\n");
  const kept: string[] = [];
  let insertAt = -1;
  for (const raw of lines) {
    const m = raw.trim().match(ROUTINE_DAY_RE);
    if (m && m[1] === day) {
      if (insertAt === -1) insertAt = kept.length;
    } else {
      kept.push(raw);
    }
  }
  kept.splice(insertAt === -1 ? kept.length : insertAt, 0, ...newEntryLines);
  return kept.join("\n").trim();
}

/** Replaces (or inserts) the "Goal: ..." line within a routine's raw content. */
function rebuildContentForGoal(content: string, newGoal: string): string {
  const lines = content.split("\n");
  let found = false;
  const out = lines.map((raw) => {
    if (/^\s*goal:/i.test(raw)) {
      found = true;
      return newGoal ? `Goal: ${newGoal}` : null;
    }
    return raw;
  });
  const filtered = out.filter((l): l is string => l !== null);
  if (!found && newGoal) filtered.unshift(`Goal: ${newGoal}`);
  return filtered.join("\n").trim();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ onNavigate }: { onNavigate: (tab: HomeTarget) => void }) {
  // Vision statements and methods per form of wealth, keyed by lowercased form label.
  // Sourced from vision_items whose title matches the form name. null = still loading.
  const [formVisions, setFormVisions] = useState<Record<string, string> | null>(null);
  const [formMethods, setFormMethods] = useState<Record<string, string> | null>(null);
  const [routines, setRoutines] = useState<{ id: number; title: string; content: string }[] | null>(null);
  // Which single field of which routine is being edited inline — the title, the goal line, or one day's box.
  const [routineEditTarget, setRoutineEditTarget] = useState<
    { routineId: number; field: "title" | "goal" } | { routineId: number; field: "day"; day: string } | null
  >(null);
  const [routineEditValue, setRoutineEditValue] = useState("");
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [savings, setSavings] = useState<{ total: number; goal: number | null } | null>(null);
  const [todayMeal, setTodayMeal] = useState<Meal | null | undefined>(undefined);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([]);
  const [savingsHistory, setSavingsHistory] = useState<MeasureRow[]>([]);
  const [thoughts, setThoughts] = useState<{ tags: string[] | null; created_at: string }[]>([]);
  const [artFailed, setArtFailed] = useState(false);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);
  const [wealthGranularity, setWealthGranularity] = useState<Granularity>("year");
  const art = DAILY_ART[dayOfYear(new Date()) % DAILY_ART.length];

  const handleMealFeedback = async (feedback: "up" | "down") => {
    if (!todayMeal) return;
    const prev = todayMeal;
    const next = todayMeal.feedback === feedback ? null : feedback;
    setTodayMeal({ ...todayMeal, feedback: next });
    try {
      const res = await fetch(`/api/meals/${todayMeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodayMeal(prev);
      toast.error("Couldn't save feedback.");
    }
  };

  const startEditingRoutineTitle = (routine: { id: number; title: string }) => {
    setRoutineEditTarget({ routineId: routine.id, field: "title" });
    setRoutineEditValue(routine.title);
  };

  const startEditingRoutineGoal = (routine: { id: number; content: string }) => {
    setRoutineEditTarget({ routineId: routine.id, field: "goal" });
    setRoutineEditValue(parseRoutine(routine.content).goal ?? "");
  };

  const startEditingRoutineDay = (routine: { id: number; content: string }, day: string) => {
    setRoutineEditTarget({ routineId: routine.id, field: "day", day });
    setRoutineEditValue(dayEntriesToLines(parseRoutine(routine.content).days[day] ?? []));
  };

  const cancelEditingRoutineField = () => {
    setRoutineEditTarget(null);
    setRoutineEditValue("");
  };

  const saveRoutineField = async () => {
    const target = routineEditTarget;
    if (!target) return;
    const routine = routines?.find((r) => r.id === target.routineId);
    if (!routine) return cancelEditingRoutineField();

    let patch: { title?: string; content?: string };
    if (target.field === "title") {
      const title = routineEditValue.trim();
      if (!title || title === routine.title) return cancelEditingRoutineField();
      patch = { title };
    } else if (target.field === "goal") {
      const content = rebuildContentForGoal(routine.content, routineEditValue.trim());
      if (content === routine.content) return cancelEditingRoutineField();
      patch = { content };
    } else if (target.field === "day") {
      const content = rebuildContentForDay(routine.content, target.day, routineEditValue);
      if (content === routine.content) return cancelEditingRoutineField();
      patch = { content };
    } else {
      return cancelEditingRoutineField();
    }

    cancelEditingRoutineField();
    setRoutines((prev) => (prev ? prev.map((r) => (r.id === routine.id ? { ...r, ...patch } : r)) : prev));
    try {
      const res = await fetch(`/api/vision/${routine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setRoutines((prev) =>
        prev ? prev.map((r) => (r.id === routine.id ? { id: routine.id, title: updated.title, content: updated.content } : r)) : prev,
      );
    } catch {
      setRoutines((prev) => (prev ? prev.map((r) => (r.id === routine.id ? routine : r)) : prev));
      toast.error("Couldn't save routine.");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [visionRes, methodRes, routineRes, todosRes, measuresRes, mealsRes, workoutsRes, readingRes, thoughtsRes] =
          await Promise.all([
            fetch("/api/vision?kind=statement"),
            fetch("/api/vision?kind=method"),
            fetch("/api/vision?kind=routine"),
            fetch("/api/todos?limit=200"),
            fetch("/api/measures?category=savings_snapshot&limit=400"),
            fetch("/api/meals?limit=1"),
            fetch("/api/workouts"),
            fetch("/api/reading"),
            fetch("/api/thoughts?limit=1000"),
          ]);
        // Rows are newest-first; keep the first (most recent) item per form.
        const toFormMap = (rows: { title: string | null; content: string | null }[]) => {
          const map: Record<string, string> = {};
          for (const row of rows) {
            const key = row.title?.trim().toLowerCase();
            if (key && row.content && !(key in map)) map[key] = row.content;
          }
          return map;
        };
        // Rows are newest-first; keep the first (most recent) item per routine name.
        const toRoutineList = (rows: { id: number; title: string | null; content: string | null }[]) => {
          const seen = new Set<string>();
          const list: { id: number; title: string; content: string }[] = [];
          for (const row of rows) {
            const key = row.title?.trim().toLowerCase();
            if (key && row.content && !seen.has(key)) {
              seen.add(key);
              list.push({ id: row.id, title: row.title!.trim(), content: row.content });
            }
          }
          return list;
        };
        setFormVisions(visionRes.ok ? toFormMap(await visionRes.json()) : {});
        setFormMethods(methodRes.ok ? toFormMap(await methodRes.json()) : {});
        setRoutines(routineRes.ok ? toRoutineList(await routineRes.json()) : []);
        if (todosRes.ok) {
          const todos: { completed: boolean }[] = await todosRes.json();
          setOpenTasks(todos.filter((t) => !t.completed).length);
        }
        if (measuresRes.ok) {
          const rows: MeasureRow[] = await measuresRes.json();
          setSavingsHistory(rows);
          const latest = rows[0];
          const total = Number(latest?.data?.total_savings);
          if (Number.isFinite(total)) {
            const goal = Number(latest?.data?.goal);
            setSavings({ total, goal: Number.isFinite(goal) && goal > 0 ? goal : null });
          }
        }
        if (mealsRes.ok) {
          const meals: Meal[] = await mealsRes.json();
          setTodayMeal(meals[0] && isToday(meals[0].meal_date) ? meals[0] : null);
        } else {
          setTodayMeal(null);
        }
        if (workoutsRes.ok) setWorkoutLogs(await workoutsRes.json());
        if (readingRes.ok) setReadingLogs(await readingRes.json());
        if (thoughtsRes.ok) setThoughts(await thoughtsRes.json());
      } catch {
        setFormVisions({});
        setFormMethods({});
        setRoutines([]);
        setTodayMeal(null);
      }
    })();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const section = SECTIONS.find((s) => s.hotkey === e.key);
      if (section) {
        e.preventDefault();
        onNavigate(section.tab);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNavigate]);

  // One sparkline per form of wealth, all sharing the Month/Year/Decade toggle above the grid.
  // Growth/Wellness/Money reuse data already tracked elsewhere (pages, workouts, savings);
  // the remaining 5 forms use a count of thoughts tagged with that form's name as a proxy
  // signal until they get dedicated tracking.
  const wealthSparklines = useMemo(() => {
    const taggedCount = (tag: string) =>
      thoughts
        .filter((t) => t.tags?.some((x) => x.toLowerCase() === tag))
        .map((t) => ({ t: new Date(t.created_at).getTime(), value: 1 }));

    const series: Record<string, { points: { t: number; value: number }[]; mode: "sum" | "last"; unit: string }> = {
      growth: {
        points: readingLogs.map((l) => ({ t: new Date(l.logged_date).getTime(), value: Number(l.pages) })),
        mode: "sum",
        unit: "pages",
      },
      wellness: {
        points: workoutLogs.map((l) => ({ t: new Date(l.logged_date).getTime(), value: 1 })),
        mode: "sum",
        unit: "sessions",
      },
      money: {
        points: savingsHistory
          .map((m) => ({ t: new Date(m.recorded_date).getTime(), value: Number(m.data?.total_savings) }))
          .filter((p) => Number.isFinite(p.value)),
        mode: "last",
        unit: "$",
      },
      family: { points: taggedCount("family"), mode: "sum", unit: "notes" },
      craft: { points: taggedCount("craft"), mode: "sum", unit: "notes" },
      community: { points: taggedCount("community"), mode: "sum", unit: "notes" },
      adventure: { points: taggedCount("adventure"), mode: "sum", unit: "notes" },
      service: { points: taggedCount("service"), mode: "sum", unit: "notes" },
    };

    const out: Record<string, { buckets: ReturnType<typeof bucketAggregate>; unit: string; mode: "sum" | "last" }> = {};
    for (const [key, { points, mode, unit }] of Object.entries(series)) {
      out[key] = { buckets: bucketAggregate(points, wealthGranularity, mode), unit, mode };
    }
    return out;
  }, [readingLogs, workoutLogs, savingsHistory, thoughts, wealthGranularity]);

  const header = (onImage: boolean) => (
    <>
      <button
        onClick={() => onNavigate("chat")}
        className="flex items-center gap-2.5 group"
        aria-label="Open chat with Cael"
      >
        <CaelAvatar size={36} />
        <div className="text-left">
          <p
            className={cn(
              "text-sm font-medium leading-tight transition-colors",
              onImage ? "text-white drop-shadow-sm group-hover:text-white/80" : "group-hover:text-primary",
            )}
          >
            Cael
          </p>
          <p
            className={cn(
              "text-[11px] leading-tight",
              onImage ? "text-white/75 drop-shadow-sm" : "text-muted-foreground",
            )}
          >
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-1">
        <PinButton
          iconClassName="size-3.5"
          className={onImage ? "text-white/80 hover:text-white hover:bg-white/15" : undefined}
        />
        <ModeToggle className={onImage ? "text-white/80 hover:text-white hover:bg-white/15" : undefined} />
      </div>
    </>
  );

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* Daily artwork — full-bleed hero with the header overlaid */}
      {!artFailed && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.url}
            alt={art.caption}
            onError={() => setArtFailed(true)}
            className="w-full h-52 sm:h-72 lg:h-80 object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute inset-x-0 top-0 mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
            {header(true)}
          </div>
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-3 text-xs font-medium text-white/95">
            {art.place ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(art.place)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-white hover:underline underline-offset-2"
                title={`Open ${art.place} in Google Maps`}
              >
                {art.caption}
                <ArrowUpRightIcon className="size-3 opacity-80" />
              </a>
            ) : (
              art.caption
            )}
          </div>
        </div>
      )}

      <div className={cn("pb-24 lg:pb-12", artFailed ? "py-8" : "pt-10")}>
      <div className="mx-auto max-w-6xl px-6">
        {/* Header falls back into the page flow when the artwork fails to load */}
        {artFailed && <div className="flex items-center justify-between mb-10">{header(false)}</div>}

        {/* Today's meal — Mediterranean/Italian pick, informed by prior thumbs up/down */}
        {todayMeal && (
          <div className="mb-6">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Today's meal
            </p>
            <Card className="overflow-hidden py-0 gap-0 rounded-xl shadow-none">
              {todayMeal.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={todayMeal.image_url}
                  alt={todayMeal.name}
                  className="w-full aspect-[16/9] object-cover"
                />
              )}
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{todayMeal.name}</p>
                    {todayMeal.cuisine && (
                      <Badge variant="outline" className="mt-1.5">
                        {todayMeal.cuisine}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant={todayMeal.feedback === "up" ? "default" : "outline"}
                      aria-label="Liked it"
                      onClick={() => handleMealFeedback("up")}
                    >
                      <ThumbsUpIcon className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={todayMeal.feedback === "down" ? "default" : "outline"}
                      aria-label="Not for me"
                      onClick={() => handleMealFeedback("down")}
                    >
                      <ThumbsDownIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                {todayMeal.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                    {todayMeal.description}
                  </p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Training — 5 standard workouts, indexed to % change from the first logged number */}
        {workoutLogs.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Training
            </p>
            <Card className="rounded-xl px-5 py-4 shadow-none">
              <WorkoutChart logs={workoutLogs} />
            </Card>
          </div>
        )}

        {/* Reading — cumulative pages read this year, with a projected year-end total at current pace */}
        {readingLogs.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Reading
            </p>
            <Card className="rounded-xl px-5 py-4 shadow-none">
              <ReadingChart logs={readingLogs} />
            </Card>
          </div>
        )}

        {/* 8 forms of wealth */}
        <div className="mb-10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
              {greeting()}, Berto — your 8 forms of wealth
            </p>
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 shrink-0">
              {(["month", "year", "decade"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setWealthGranularity(g)}
                  aria-pressed={wealthGranularity === g}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-medium capitalize whitespace-nowrap transition-colors",
                    wealthGranularity === g
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {WEALTH_FORMS.map(({ label, icon: Icon, target }) => {
              const isExpanded = expandedForm === label;
              const visionText = formVisions?.[label.toLowerCase()];
              const methodText = formMethods?.[label.toLowerCase()];
              const spark = wealthSparklines[label.toLowerCase()];
              return (
                <Card
                  key={label}
                  className={cn(
                    "relative gap-2 h-full rounded-xl px-4 py-3.5 shadow-none hover:border-primary/40 transition-colors",
                    isExpanded && "col-span-2 sm:col-span-4",
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedForm(isExpanded ? null : label);
                    }}
                    aria-label={isExpanded ? `Collapse ${label}` : `View ${label} vision`}
                    aria-expanded={isExpanded}
                    className="absolute top-2.5 right-2.5 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <EyeIcon size={14} />
                  </button>
                  <button onClick={() => onNavigate(target)} className="text-left contents">
                    <Icon size={22} weight="duotone" className="text-primary" />
                    <p className="text-sm font-medium leading-snug pr-4">{label}</p>
                    <div className="mt-auto">
                      {label === "Money" && savings?.goal && (
                        <div
                          className="h-1.5 rounded-full overflow-hidden mb-1"
                          style={{ background: "var(--chart-track)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (savings.total / savings.goal) * 100)}%`,
                              background: "var(--chart-essential)",
                            }}
                          />
                        </div>
                      )}
                      {spark && <Sparkline data={spark.buckets} unit={spark.unit} mode={spark.mode} />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="mt-1 pt-3 border-t space-y-3">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          Vision
                        </p>
                        {visionText ? (
                          <p className="text-sm leading-relaxed">{visionText}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground/60 italic leading-relaxed">
                            No vision written yet for {label}.
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          Methods
                        </p>
                        {methodText ? (
                          <p className="text-sm leading-relaxed">{methodText}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground/60 italic leading-relaxed">
                            No methods added yet for {label}.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full px-6 lg:px-12">
        {/* Routines — named recurring schedules, e.g. the weekly workout routine. Every field
            (title, goal, each day) is independently click-to-edit; blur saves, Escape cancels. */}
        <div className="mb-10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Routines
          </p>
          {routines && routines.length > 0 ? (
            <div className="space-y-8">
              {routines.map((routine) => {
                const { goal, days } = parseRoutine(routine.content);
                const editingTitle =
                  routineEditTarget?.routineId === routine.id && routineEditTarget.field === "title";
                const editingGoal =
                  routineEditTarget?.routineId === routine.id && routineEditTarget.field === "goal";

                return (
                  <div key={routine.id}>
                    {editingTitle ? (
                      <input
                        value={routineEditValue}
                        onChange={(e) => setRoutineEditValue(e.target.value)}
                        onBlur={saveRoutineField}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEditingRoutineField();
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        autoFocus
                        className="text-lg font-medium mb-1 w-full bg-transparent outline-none border-b border-primary/40"
                      />
                    ) : (
                      <button
                        onClick={() => startEditingRoutineTitle(routine)}
                        className="block text-lg font-medium mb-1 text-left hover:text-primary transition-colors"
                      >
                        {routine.title}
                      </button>
                    )}

                    {editingGoal ? (
                      <textarea
                        value={routineEditValue}
                        onChange={(e) => setRoutineEditValue(e.target.value)}
                        onBlur={saveRoutineField}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEditingRoutineField();
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="Goal for this routine"
                        rows={2}
                        autoFocus
                        className="w-full text-sm text-muted-foreground leading-relaxed mb-3 bg-transparent outline-none border-b border-primary/40 resize-none"
                      />
                    ) : (
                      <button
                        onClick={() => startEditingRoutineGoal(routine)}
                        className="block w-full text-left mb-3"
                      >
                        {goal ? (
                          <p className="text-sm text-muted-foreground leading-relaxed hover:text-foreground transition-colors">
                            {goal}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground/50 italic">Add a goal…</p>
                        )}
                      </button>
                    )}

                    <div className="flex overflow-x-auto divide-x divide-border/60">
                      {ROUTINE_DAYS.map((day) => {
                        const entries = days[day] ?? [];
                        const editingDay =
                          routineEditTarget?.routineId === routine.id &&
                          routineEditTarget.field === "day" &&
                          routineEditTarget.day === day;
                        return (
                          <div key={day} className="flex-1 min-w-[150px] shrink-0 px-4 first:pl-0">
                            {editingDay ? (
                              <>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                  {day.slice(0, 3)}
                                </p>
                                <textarea
                                  value={routineEditValue}
                                  onChange={(e) => setRoutineEditValue(e.target.value)}
                                  onBlur={saveRoutineField}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") cancelEditingRoutineField();
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
                                  }}
                                  placeholder={"(AM): ...\n(PM): ..."}
                                  rows={6}
                                  autoFocus
                                  className="w-full text-sm leading-snug bg-transparent outline-none border border-primary/40 rounded-md px-2 py-1.5 resize-y -mx-2"
                                />
                              </>
                            ) : (
                              <button
                                onClick={() => startEditingRoutineDay(routine, day)}
                                className="block w-full text-left hover:opacity-70 transition-opacity"
                              >
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                  {day.slice(0, 3)}
                                </p>
                                <div className="space-y-2">
                                  {entries.length > 0 ? (
                                    entries.map((entry, i) => (
                                      <div key={i}>
                                        {entry.period && (
                                          <p className="text-xs font-medium text-primary mb-0.5">{entry.period}</p>
                                        )}
                                        <p className="text-sm leading-snug">{entry.text}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-muted-foreground/50 italic">—</p>
                                  )}
                                </div>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic leading-relaxed">
              No routines added yet.
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        {/* Daily behaviors mantra */}
        <p className="text-xs text-muted-foreground mb-10 leading-relaxed">
          Today that means: <span className="text-foreground">save</span> ·{" "}
          <span className="text-foreground">improve the service</span> ·{" "}
          <span className="text-foreground">go above and beyond</span> ·{" "}
          <span className="text-foreground">skip the AI noise</span>
        </p>

        {/* Sections */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Go to
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SECTIONS.map(({ tab, label, icon: Icon, hotkey }) => (
            <button key={tab} onClick={() => onNavigate(tab)} className="text-left">
              <Card
                className={cn(
                  "flex-row items-center gap-3 rounded-xl px-4 py-3 shadow-none",
                  "hover:border-primary/40 transition-colors",
                )}
              >
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1">{label}</span>
                {tab === "tasks" && openTasks !== null && openTasks > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{openTasks}</span>
                )}
                <kbd className="hidden sm:inline-flex items-center justify-center size-5 rounded border border-border text-[10px] font-medium text-muted-foreground shrink-0">
                  {hotkey}
                </kbd>
              </Card>
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
