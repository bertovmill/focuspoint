"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  UploadIcon,
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
import { Sparkline } from "@/app/_components/sparkline";
import { GoalCelebration } from "@/app/_components/goal-celebration";
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
  | "vision"
  | "family";

interface MeasureRow {
  category: string;
  recorded_date: string;
  data: Record<string, number | string | undefined>;
}

interface ReadingLog {
  book_title: string;
  pages: number;
  logged_date: string;
  is_estimate: boolean;
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
  { label: "Family", icon: UsersThreeIcon, target: "family" },
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

/** The fixed daily template — every day is broken into these 4 slots, in this order. */
const ROUTINE_PERIODS = ["Morning Routine", "AM Workout", "PM Workout", "Daytime"];

/** Replaces one day's one slot (e.g. Tuesday's "PM Workout") within a routine's raw content.
 *  Reflows that whole day's lines into canonical slot order; any entry whose period isn't
 *  one of the 4 canonical slots (legacy/unrecognized text) is preserved, appended after them. */
function rebuildDaySlot(content: string, day: string, period: string, editedText: string): string {
  const { days } = parseRoutine(content);
  const dayEntries = days[day] ?? [];
  const canonicalLower = ROUTINE_PERIODS.map((p) => p.toLowerCase());
  const otherEntries = dayEntries.filter((e) => !e.period || !canonicalLower.includes(e.period.toLowerCase()));

  const bySlot: Record<string, string[]> = {};
  for (const p of ROUTINE_PERIODS) {
    bySlot[p] =
      p.toLowerCase() === period.toLowerCase()
        ? editedText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        : dayEntries.filter((e) => e.period?.toLowerCase() === p.toLowerCase()).map((e) => e.text);
  }

  const newDayLines: string[] = [];
  for (const p of ROUTINE_PERIODS) {
    for (const t of bySlot[p]) newDayLines.push(`${day} (${p}): ${t}`);
  }
  for (const e of otherEntries) {
    newDayLines.push(e.period ? `${day} (${e.period}): ${e.text}` : `${day}: ${e.text}`);
  }

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
  kept.splice(insertAt === -1 ? kept.length : insertAt, 0, ...newDayLines);
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
  // Per-form numeric goals (vision_items kind="goal", title = form label, content = target number).
  const [formGoals, setFormGoals] = useState<Record<string, { id: number; target: number; achieved: boolean }>>({});
  // Queue of forms whose goal was just crossed this session — shown one at a time as a full-screen celebration.
  const [celebrationQueue, setCelebrationQueue] = useState<{ label: string; targetLabel: string }[]>([]);
  const [routines, setRoutines] = useState<{ id: number; title: string; content: string }[] | null>(null);
  // Which single field of which routine is being edited inline — the title, the goal line, or one day+slot box.
  const [routineEditTarget, setRoutineEditTarget] = useState<
    | { routineId: number; field: "title" | "goal" }
    | { routineId: number; field: "slot"; day: string; period: string }
    | null
  >(null);
  const [routineEditValue, setRoutineEditValue] = useState("");
  const [savings, setSavings] = useState<{ total: number; goal: number | null } | null>(null);
  const [todayMeal, setTodayMeal] = useState<Meal | null | undefined>(undefined);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([]);
  const [savingsHistory, setSavingsHistory] = useState<MeasureRow[]>([]);
  const [thoughts, setThoughts] = useState<{ tags: string[] | null; created_at: string }[]>([]);
  const [memories, setMemories] = useState<{ created_at: string }[]>([]);
  const [communityContacts, setCommunityContacts] = useState<{ created_at: string }[]>([]);
  const [artFailed, setArtFailed] = useState(false);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);
  const [wealthGranularity, setWealthGranularity] = useState<Granularity>("year");
  const [memoryTitle, setMemoryTitle] = useState("");
  const [uploadingMemory, setUploadingMemory] = useState(false);
  const memoryFileInputRef = useRef<HTMLInputElement>(null);
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

  const handleQuickAddMemory = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploadingMemory(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      const createRes = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url, title: memoryTitle.trim() || undefined }),
      });
      if (!createRes.ok) throw new Error();
      const row = await createRes.json();
      setMemories((prev) => [row, ...prev]);
      setMemoryTitle("");
      toast.success("Memory added.");
    } catch {
      toast.error("Couldn't add memory. Try again.");
    } finally {
      setUploadingMemory(false);
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

  const startEditingRoutineSlot = (routine: { id: number; content: string }, day: string, period: string) => {
    setRoutineEditTarget({ routineId: routine.id, field: "slot", day, period });
    const entries = parseRoutine(routine.content).days[day] ?? [];
    setRoutineEditValue(
      entries
        .filter((e) => e.period?.toLowerCase() === period.toLowerCase())
        .map((e) => e.text)
        .join("\n"),
    );
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
    } else if (target.field === "slot") {
      const content = rebuildDaySlot(routine.content, target.day, target.period, routineEditValue);
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
        const [visionRes, methodRes, routineRes, goalRes, measuresRes, mealsRes, workoutsRes, readingRes, thoughtsRes, memoriesRes, communityRes] =
          await Promise.all([
            fetch("/api/vision?kind=statement"),
            fetch("/api/vision?kind=method"),
            fetch("/api/vision?kind=routine"),
            fetch("/api/vision?kind=goal"),
            fetch("/api/measures?category=savings_snapshot&limit=400"),
            fetch("/api/meals?limit=1"),
            fetch("/api/workouts"),
            fetch("/api/reading"),
            fetch("/api/thoughts?limit=1000"),
            fetch("/api/memories?limit=500"),
            fetch("/api/community"),
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
        if (goalRes.ok) {
          const rows: { id: number; title: string | null; content: string | null; achieved: boolean }[] = await goalRes.json();
          const map: Record<string, { id: number; target: number; achieved: boolean }> = {};
          for (const row of rows) {
            const key = row.title?.trim().toLowerCase();
            const target = Number(row.content);
            // Rows are newest-first; keep the first (most recent/active) goal per form.
            if (key && Number.isFinite(target) && target > 0 && !(key in map)) {
              map[key] = { id: row.id, target, achieved: row.achieved };
            }
          }
          setFormGoals(map);
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
        if (memoriesRes.ok) setMemories(await memoriesRes.json());
        if (communityRes.ok) setCommunityContacts(await communityRes.json());
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
  // Growth/Wellness/Money/Family/Community reuse data already tracked elsewhere (pages, workouts,
  // savings, memories, Luma subscribers); the remaining 3 forms use a count of thoughts tagged
  // with that form's name as a proxy signal until they get dedicated tracking.
  const wealthSeries = useMemo(() => {
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
      family: {
        points: memories.map((m) => ({ t: new Date(m.created_at).getTime(), value: 1 })),
        mode: "sum",
        unit: "memories",
      },
      craft: { points: taggedCount("craft"), mode: "sum", unit: "notes" },
      community: {
        points: communityContacts.map((c) => ({ t: new Date(c.created_at).getTime(), value: 1 })),
        mode: "sum",
        unit: "subscribers",
      },
      adventure: { points: taggedCount("adventure"), mode: "sum", unit: "notes" },
      service: { points: taggedCount("service"), mode: "sum", unit: "notes" },
    };
    return series;
  }, [readingLogs, workoutLogs, savingsHistory, thoughts, memories, communityContacts]);

  const wealthSparklines = useMemo(() => {
    const out: Record<string, { buckets: ReturnType<typeof bucketAggregate>; unit: string; mode: "sum" | "last" }> = {};
    for (const [key, { points, mode, unit }] of Object.entries(wealthSeries)) {
      out[key] = { buckets: bucketAggregate(points, wealthGranularity, mode), unit, mode };
    }
    return out;
  }, [wealthSeries, wealthGranularity]);

  // All-time progress toward each form's goal — independent of the Month/Year/Decade toggle above.
  const wealthTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, { points, mode }] of Object.entries(wealthSeries)) {
      if (points.length === 0) continue;
      out[key] =
        mode === "sum" ? points.reduce((s, p) => s + p.value, 0) : points[points.length - 1].value;
    }
    return out;
  }, [wealthSeries]);

  // Fire a one-time full-screen celebration the moment a form's all-time total first crosses its goal.
  useEffect(() => {
    for (const [key, goal] of Object.entries(formGoals)) {
      if (goal.achieved) continue;
      const total = wealthTotals[key];
      if (total === undefined || total < goal.target) continue;
      const form = WEALTH_FORMS.find((f) => f.label.toLowerCase() === key);
      const unit = wealthSeries[key]?.unit ?? "";
      setFormGoals((prev) => ({ ...prev, [key]: { ...prev[key], achieved: true } }));
      setCelebrationQueue((prev) => [
        ...prev,
        { label: form?.label ?? key, targetLabel: `${goal.target.toLocaleString()} ${unit}`.trim() },
      ]);
      fetch(`/api/vision/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achieved: true }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formGoals, wealthTotals]);

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
    <>
      {celebrationQueue[0] && (
        <GoalCelebration
          formLabel={celebrationQueue[0].label}
          targetLabel={celebrationQueue[0].targetLabel}
          onClose={() => setCelebrationQueue((prev) => prev.slice(1))}
        />
      )}
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
              const goal = formGoals[label.toLowerCase()];
              const goalTarget = label === "Money" ? (savings?.goal ?? undefined) : goal?.target;
              const goalAchieved = label === "Money" ? Boolean(savings?.goal && savings.total >= savings.goal) : goal?.achieved;
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
                      {spark && (
                        <Sparkline
                          data={spark.buckets}
                          unit={spark.unit}
                          mode={spark.mode}
                          goal={goalTarget}
                          goalAchieved={goalAchieved}
                        />
                      )}
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
                      {label === "Family" && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                            Add a memory
                          </p>
                          <input
                            ref={memoryFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleQuickAddMemory(file);
                              e.target.value = "";
                            }}
                          />
                          <div className="flex gap-2">
                            <input
                              value={memoryTitle}
                              onChange={(e) => setMemoryTitle(e.target.value)}
                              placeholder="Title (optional)…"
                              className="flex-1 min-w-0 text-sm rounded-md border border-border bg-transparent px-2.5 py-1.5 outline-none focus:border-primary/50"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={uploadingMemory}
                              onClick={() => memoryFileInputRef.current?.click()}
                              className="shrink-0"
                            >
                              <UploadIcon className="size-3.5 mr-1.5" />
                              {uploadingMemory ? "Uploading…" : "Photo"}
                            </Button>
                          </div>
                        </div>
                      )}
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
                        onChange={(e) => {
                          setRoutineEditValue(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
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
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                        className="w-full text-sm text-muted-foreground leading-relaxed mb-3 bg-transparent outline-none border-b border-primary/40 resize-none overflow-hidden"
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
                        return (
                          <div key={day} className="flex-1 min-w-[150px] shrink-0 px-4 first:pl-0">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                              {day.slice(0, 3)}
                            </p>
                            <div className="space-y-3">
                              {ROUTINE_PERIODS.map((period) => {
                                const editingSlot =
                                  routineEditTarget?.routineId === routine.id &&
                                  routineEditTarget.field === "slot" &&
                                  routineEditTarget.day === day &&
                                  routineEditTarget.period === period;
                                const slotText = entries
                                  .filter((e) => e.period?.toLowerCase() === period.toLowerCase())
                                  .map((e) => e.text)
                                  .join("\n");
                                return (
                                  <div key={period}>
                                    <p className="text-xs font-medium text-primary mb-0.5">{period}</p>
                                    {editingSlot ? (
                                      <textarea
                                        value={routineEditValue}
                                        onChange={(e) => {
                                          setRoutineEditValue(e.target.value);
                                          e.target.style.height = "auto";
                                          e.target.style.height = `${e.target.scrollHeight}px`;
                                        }}
                                        onBlur={saveRoutineField}
                                        onKeyDown={(e) => {
                                          if (e.key === "Escape") cancelEditingRoutineField();
                                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
                                        }}
                                        placeholder="..."
                                        rows={2}
                                        autoFocus
                                        ref={(el) => {
                                          if (el) {
                                            el.style.height = "auto";
                                            el.style.height = `${el.scrollHeight}px`;
                                          }
                                        }}
                                        className="w-full text-sm leading-snug bg-transparent outline-none border border-primary/40 rounded-md px-2 py-1 resize-none -mx-2 overflow-hidden"
                                      />
                                    ) : (
                                      <button
                                        onClick={() => startEditingRoutineSlot(routine, day, period)}
                                        className="block w-full text-left hover:opacity-70 transition-opacity"
                                      >
                                        {slotText ? (
                                          <p className="text-sm leading-snug">{slotText}</p>
                                        ) : (
                                          <p className="text-sm text-muted-foreground/40 italic">+ Add</p>
                                        )}
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

      </div>
      </div>
    </div>
    </>
  );
}
