"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PlusIcon, BrainIcon, ClockIcon, PencilIcon, TrashIcon, SparklesIcon, XIcon, UploadIcon, CopyIcon, CheckCheck, RepeatIcon, GaugeIcon, PiggyBankIcon, WalletIcon, HourglassIcon } from "lucide-react";
import { StrategyBoard } from "@/app/_components/strategy-board";
import { TaskCanvas } from "@/app/_components/task-canvas";
import { TaskListMobile } from "@/app/_components/task-list-mobile";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { ScheduledTasksPanel } from "@/app/_components/scheduled-tasks-panel";
import { VisionPanel } from "@/app/_components/vision-panel";
import { FamilyPanel } from "@/app/_components/family-panel";
import { NutritionPanel } from "@/app/_components/nutrition-panel";
import { ManualPanel } from "@/app/_components/manual-panel";
import { MeasuresOverview } from "@/app/_components/measures-overview";
import { JournalTemplatesPanel } from "@/app/_components/journal-templates-panel";
import { ListsPanel } from "@/app/_components/lists-panel";
import { SketchesPanel } from "@/app/_components/sketches-panel";
import { CalendarPanel } from "@/app/_components/calendar-panel";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TimerCompleteCelebration } from "@/app/_components/timer-complete-celebration";
import { playCelebrationSound } from "@/lib/celebration-sound";
import { focusAppWindow } from "@/lib/desktop";
// Human limit: only a handful of things can genuinely be worked on at once, and how
// many is Berto's to set from the pinned window (1–5, see lib/working-now.ts). Tasks
// in the "Working on now" section are the live ones; everything else stays dimmed.
import { WORKING_LIMIT_MAX, workingLimitMessage } from "@/lib/working-now";
import { FOLLOW_UP_OPTIONS, type Todo } from "@/lib/todo";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

const MEASURE_CATEGORIES = [
  { key: "savings_snapshot" as const, label: "Savings Snapshot", icon: PiggyBankIcon },
  { key: "spend_report" as const, label: "Spend Report", icon: WalletIcon },
  { key: "free_time_audit" as const, label: "Free Time Audit", icon: HourglassIcon },
  { key: "daily_checkin" as const, label: "Daily Check-in", icon: GaugeIcon },
];

const MEASURE_FIELDS: Record<Measure["category"], { key: string; label: string; suffix?: string; max?: number }[]> = {
  savings_snapshot: [
    { key: "total_savings", label: "Total savings", suffix: "$" },
    { key: "monthly_contribution", label: "Contributed this month", suffix: "$" },
  ],
  spend_report: [
    { key: "total_spend", label: "Total spend", suffix: "$" },
    { key: "essential_spend", label: "Essential spend", suffix: "$" },
    { key: "discretionary_spend", label: "Discretionary spend", suffix: "$" },
  ],
  free_time_audit: [
    { key: "free_hours", label: "Free hours", suffix: "hrs" },
    { key: "screen_time_hours", label: "Screen time", suffix: "hrs" },
  ],
  daily_checkin: [
    { key: "energy", label: "Energy level", max: 10 },
    { key: "sleep_quality", label: "Sleep quality", max: 10 },
    { key: "body_feel", label: "How my body feels", max: 10 },
    { key: "mood", label: "Mood level", max: 10 },
  ],
};


interface Thought {
  id: number;
  content: string;
  tags: string[];
  created_at: string;
  score?: number;
}

interface Measure {
  id: number;
  category: "savings_snapshot" | "spend_report" | "free_time_audit" | "daily_checkin";
  recorded_date: string;
  data: Record<string, number | string | undefined>;
  notes: string | null;
  created_at: string;
}

interface DreamReport {
  dream_date: string;
  summary: string;
  patterns: Array<{ theme: string; evidence: string; frequency: number }>;
  insights: string[];
  thoughts_analyzed: number;
  todos_analyzed: number;
  created_at: string;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isToday(iso: string | null | undefined) {
  if (!iso) return true;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}



// 0 = no estimate. Presets only — matches the priority/recurrence chip pattern.
// Estimated time is mandatory when creating a task, so "None" isn't offered here.



const PRIORITY_RANK: Record<Todo["priority"], number> = { urgent: 3, high: 2, normal: 1, low: 0 };

function priorityRank(t: Todo) {
  return PRIORITY_RANK[t.priority] ?? 1;
}

// Manually numbered tasks are the "do this next" queue: they sort ahead of
// everything else, in ascending order. Unnumbered tasks sort as they always did.
function queueRank(t: Todo) {
  return typeof t.task_number === "number" ? t.task_number : Infinity;
}

// Guarded against Infinity - Infinity (NaN) when neither task is numbered.
function compareQueue(a: Todo, b: Todo) {
  const ra = queueRank(a);
  const rb = queueRank(b);
  return ra === rb ? 0 : ra - rb;
}

// Missing/unparseable created_at sinks to the bottom of an oldest-first list.
function createdAtMs(t: Todo) {
  const ms = t.created_at ? new Date(t.created_at).getTime() : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
}


function isInProgressActive(t: Todo) {
  return t.in_progress && !t.completed && !(Boolean(t.completed_at) && isToday(t.completed_at));
}


function priorityColor(p: string) {
  if (p === "urgent") return "text-priority-urgent";
  if (p === "high") return "text-priority-high";
  if (p === "low") return "text-muted-foreground";
  return "text-foreground";
}

interface UploadedImage {
  url: string;
  name: string;
  uploadedAt: number;
}

type DashboardTab = "home" | "todos" | "notes" | "lists" | "calendar" | "journal-templates" | "dreams" | "media" | "sketches" | "schedule" | "measures" | "vision" | "family" | "manual" | "nutrition";

export function Dashboard({ activeTab: controlledTab, onRunJobWithChat, onTabChange, focusNewTaskSignal }: { activeTab?: DashboardTab; onRunJobWithChat?: (message: string) => void; onTabChange?: (tab: DashboardTab) => void; focusNewTaskSignal?: number }) {
  // Gates the Tasks screen between the canvas and the mobile list — see the
  // `activeTab === "todos"` branch below for why it's a mount, not a `lg:hidden`.
  const isDesktop = useIsDesktop();
  const [todos, setTodos] = useState<Todo[]>([]);
  // How many tasks can be in flight at once. Berto sets it from the pinned window;
  // the board just follows, and the server enforces it either way. Starts at the
  // ceiling so nothing is wrongly blocked before the setting has loaded.
  const [workingLimit, setWorkingLimit] = useState(WORKING_LIMIT_MAX);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [measureCategory, setMeasureCategory] = useState<Measure["category"]>("daily_checkin");
  const [measureForm, setMeasureForm] = useState<Record<string, string>>({});
  const [measureDate, setMeasureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [measureNotes, setMeasureNotes] = useState("");
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [dream, setDream] = useState<DreamReport | null | undefined>(undefined);
  // Null = show every task; otherwise only tasks with that category.
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>(controlledTab ?? "todos");
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [runningDream, setRunningDream] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [completingIds, setCompletingIds] = useState<Set<number>>(new Set());
  // Ticks once a second while any task's timer is running, to drive the live countdown badge.
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Task whose timer just hit zero — shows the celebration modal until dismissed.
  const [timerCompleteTodo, setTimerCompleteTodo] = useState<Todo | null>(null);
  // Remembers each task's last-seen "seconds remaining" so we can detect the exact
  // tick a countdown crosses zero, instead of re-firing the celebration every tick.
  const prevRemainingRef = useRef<Map<number, number>>(new Map());
  // Which task's queue-number badge is currently an open input.
  // Set by Escape so the blur it triggers discards instead of saving.
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<Thought[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const newTodoRef = useRef<HTMLInputElement>(null);
  const handledFocusSignal = useRef(0);

  useEffect(() => {
    if (controlledTab) setActiveTab(controlledTab);
  }, [controlledTab]);

  // Only run the clock while something is actually timing — no point ticking otherwise.
  useEffect(() => {
    if (!todos.some((t) => t.timer_started_at)) return;
    const id = setInterval(() => {
      // A card mid-drag sets this. Re-rendering every card and lane under the cursor
      // costs a frame, and a countdown that resumes a second late costs nothing.
      if (document.body.dataset.draggingCard) return;
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [todos]);

  // Detects the moment a running timer crosses zero, then celebrates: sound + confetti
  // modal + pulling the window to the front so it isn't missed while looking elsewhere.
  useEffect(() => {
    const prevRemaining = prevRemainingRef.current;
    const liveIds = new Set<number>();
    for (const todo of todos) {
      if (!todo.timer_started_at || !todo.estimated_minutes) continue;
      liveIds.add(todo.id);
      const elapsed = (todo.time_spent_seconds ?? 0) + Math.max(0, (nowTick - new Date(todo.timer_started_at).getTime()) / 1000);
      const remaining = todo.estimated_minutes * 60 - elapsed;
      const prev = prevRemaining.get(todo.id);
      if (prev !== undefined && prev > 0 && remaining <= 0) {
        playCelebrationSound();
        focusAppWindow();
        setTimerCompleteTodo(todo);
      }
      prevRemaining.set(todo.id, remaining);
    }
    // Drop bookkeeping for timers that stopped/reset so a restarted timer can re-fire.
    for (const id of prevRemaining.keys()) {
      if (!liveIds.has(id)) prevRemaining.delete(id);
    }
  }, [nowTick, todos]);

  // The focus limit is set in the pinned window (a separate window in the desktop
  // app), so re-read it whenever this one comes back to the front.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/settings/working-limit");
        if (!res.ok) return;
        const { limit } = await res.json();
        if (typeof limit === "number") setWorkingLimit(limit);
      } catch {
        // keep whatever we have
      }
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  // "N" shortcut: focus the new-task input once the Tasks tab is showing.
  useEffect(() => {
    if (focusNewTaskSignal && focusNewTaskSignal !== handledFocusSignal.current && activeTab === "todos") {
      handledFocusSignal.current = focusNewTaskSignal;
      newTodoRef.current?.focus();
    }
  }, [focusNewTaskSignal, activeTab]);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      const { url, name } = await res.json();
      setUploadedImages((prev) => [{ url, name, uploadedAt: Date.now() }, ...prev]);
      toast.success("Image uploaded — copy the URL to share with Cael");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  const fetchData = useCallback(async () => {
    try {
      const [todosRes, thoughtsRes, dreamRes, measuresRes] = await Promise.all([
        fetch("/api/todos?include_completed=today&limit=200"),
        fetch("/api/thoughts"),
        fetch("/api/dreams"),
        fetch("/api/measures"),
      ]);
      if (todosRes.ok) setTodos(await todosRes.json());
      if (thoughtsRes.ok) setThoughts(await thoughtsRes.json());
      if (dreamRes.ok) setDream(await dreamRes.json());
      if (measuresRes.ok) setMeasures(await measuresRes.json());
    } catch {
      // silently fail — agent can still be used
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSemanticResults(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (tagFilter) params.set("tag", tagFilter);
        const res = await fetch(`/api/thoughts/semantic-search?${params}`);
        if (!res.ok) throw new Error("search failed");
        setSemanticResults(await res.json());
      } catch {
        setSearchError(true);
        setSemanticResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, tagFilter]);

  const clearSearch = () => {
    setQuery("");
    setSemanticResults(null);
    setSearchError(false);
  };



  const handleAddMeasure = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields = MEASURE_FIELDS[measureCategory];
    const data: Record<string, number> = {};
    for (const f of fields) {
      const raw = measureForm[f.key];
      if (raw !== undefined && raw !== "") data[f.key] = Number(raw);
    }
    setSavingMeasure(true);
    try {
      const res = await fetch("/api/measures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: measureCategory,
          recorded_date: measureDate,
          data,
          notes: measureNotes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const row = await res.json();
      setMeasures((prev) => [row, ...prev]);
      setMeasureForm({});
      setMeasureNotes("");
      toast.success("Measure logged.");
    } catch {
      toast.error("Couldn't save measure. Try again.");
    } finally {
      setSavingMeasure(false);
    }
  };

  const handleDeleteMeasure = async (id: number) => {
    const prev = measures;
    setMeasures((m) => m.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/measures/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Entry deleted.");
    } catch {
      setMeasures(prev);
      toast.error("Couldn't delete entry.");
    }
  };

  const startEdit = (thought: Thought) => {
    setEditingId(thought.id);
    setEditContent(thought.content);
    setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (id: number) => {
    const content = editContent.trim();
    if (!content) return;
    const prevThoughts = thoughts;
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, content } : t)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/thoughts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setThoughts(prevThoughts);
      toast.error("Couldn't save note.");
    }
  };

  const handleDeleteThought = async (id: number) => {
    const prevThoughts = thoughts;
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/thoughts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Note deleted.");
    } catch {
      setThoughts(prevThoughts);
      toast.error("Couldn't delete note.");
    }
  };

  const handleRunDream = async () => {
    setRunningDream(true);
    try {
      const res = await fetch("/api/dream", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.message) {
        toast.info(data.message);
      } else {
        toast.success(`Dream complete — ${data.patterns_found} patterns, ${data.insights_written} insights`);
        await fetchData();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dream failed. Check console.");
    } finally {
      setRunningDream(false);
    }
  };







  const handleToggleInProgress = async (id: number, in_progress: boolean) => {
    const prev = todos;
    if (in_progress && !isRoomToWorkOn(id)) {
      toast.error(workingLimitMessage(workingLimit));
      return;
    }
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, in_progress, waiting: in_progress ? false : t.waiting } : t)));
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ in_progress }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodos(prev);
      toast.error("Couldn't update task.");
    }
  };

  const handleToggleWaiting = async (id: number, waiting: boolean) => {
    const prev = todos;
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, waiting, in_progress: waiting ? false : t.in_progress } : t)));
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiting }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodos(prev);
      toast.error("Couldn't update task.");
    }
  };

  const handleToggleTimer = async (todo: Todo) => {
    const action = todo.timer_started_at ? "stop" : "start";
    // Starting a timer also marks the task in progress, so it has to respect the limit.
    if (action === "start" && !isRoomToWorkOn(todo.id)) {
      toast.error(workingLimitMessage(workingLimit));
      return;
    }
    const prev = todos;
    // Timers run concurrently — only the toggled task changes.
    setTodos((ts) =>
      ts.map((t) =>
        t.id === todo.id
          ? { ...t, timer_started_at: action === "start" ? new Date().toISOString() : null, in_progress: action === "start" ? true : t.in_progress }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/todos/${todo.id}/timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      const row: Todo = await res.json();
      setTodos((ts) => ts.map((t) => (t.id === row.id ? { ...t, ...row } : t)));
    } catch {
      setTodos(prev);
      toast.error("Couldn't update timer.");
    }
  };

  const handleDeleteTodo = async (id: number) => {
    const prev = todos;
    setTodos((t) => t.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Task deleted.");
    } catch {
      setTodos(prev);
      toast.error("Couldn't delete task.");
    }
  };

  // repeat = cross it off *and* stand the same task back up, dated tomorrow. The
  // API returns the fresh copy so it can slot straight into the list.
  // opts.repeat = cross it off and put the same task back on tomorrow's list;
  // opts.followUpDays does the same thing further out (done for now, needs a second pass).
  const handleComplete = async (id: number, opts: { repeat?: boolean; followUpDays?: number } = {}) => {
    const repeat = Boolean(opts.repeat);
    const followUpDays = opts.followUpDays ?? null;
    const todo = todos.find((t) => t.id === id);
    if (todo?.completed_at && isToday(todo.completed_at)) {
      return; // already crossed off today
    }
    const isRecurring = Boolean(todo?.recurrence && todo.recurrence !== "none");
    const nowIso = new Date().toISOString();
    // Recurring todos never flip `completed` — doing so would drop them out of
    // `activeTodos` for the animation window and make them vanish mid-check-off.
    // Once/weekly/monthly todos do flip `completed`, but we keep them in state
    // (rather than removing them) so they can still render crossed-out today —
    // `visibleTodos` is what hides them once `completed_at` is no longer today.
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: isRecurring ? t.completed : true, completed_at: nowIso } : t))
    );
    setCompletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/todos/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repeat, follow_up_days: followUpDays }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (followUpDays) {
        const label = FOLLOW_UP_OPTIONS.find((o) => o.days === followUpDays)?.label.toLowerCase() ?? `in ${followUpDays} days`;
        toast.success(`Done — back on the list ${label}.`);
      } else if (repeat) {
        toast.success("Done — back on the list tomorrow.");
      }
      setTimeout(() => {
        if (data.recurring && data.next_due) {
          setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: data.next_due } : t)));
        }
        // The repeat lands as its own row, so it survives the completed one fading out.
        if (data.repeated) {
          setTodos((prev) => (prev.some((t) => t.id === data.repeated.id) ? prev : [...prev, data.repeated]));
        }
        setCompletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 600);
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: false, completed_at: todo?.completed_at ?? null } : t))
      );
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error("Couldn't complete task.");
    }
  };

  // Generic field edit from the canvas cards (title, priority, …). The canvas owns
  // no task state of its own, so the round trip lands back here.
  const handleUpdateTodo = async (id: number, patch: Partial<Todo>) => {
    const prev = todos;
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const row: Todo = await res.json();
      setTodos((ts) => ts.map((t) => (t.id === row.id ? { ...t, ...row } : t)));
    } catch {
      setTodos(prev);
      toast.error("Couldn't update task.");
    }
  };

  const handleTodoCreated = (todo: Todo) => setTodos((prev) => [todo, ...prev]);

  // State-only — the canvas has already persisted it (card positions), or is mid-drag
  // and will persist on pointer-up.
  const handleLocalTodoPatch = useCallback((id: number, patch: Partial<Todo>) => {
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const handleUncomplete = async (id: number) => {
    const prev = todos;
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, completed: false, completed_at: null } : t)));
    try {
      const res = await fetch(`/api/todos/${id}/uncomplete`, { method: "POST" });
      if (!res.ok) throw new Error();
      const row = await res.json();
      setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...row } : t)));
    } catch {
      setTodos(prev);
      toast.error("Couldn't undo task.");
    }
  };

  // Active todos, plus anything (of any recurrence) crossed off today — so today's
  // completions stay visible (struck through) instead of vanishing immediately.
  // Daily todos are never gated on due_date: an unfinished one carries over and
  // stays on the list every day until it's checked off (completing it rolls
  // due_date to tomorrow server-side).
  const visibleTodos = todos.filter((t) => {
    const doneToday = Boolean(t.completed_at) && isToday(t.completed_at);
    if (t.completed && !doneToday) return false;
    return true;
  });

  // The 1–3 tasks currently being worked on. They're pulled out of the main list
  // into their own section at the top; everything else renders dimmed behind them.
  const workingNowTodos = visibleTodos
    .filter(isInProgressActive)
    .sort((a, b) => compareQueue(a, b) || priorityRank(b) - priorityRank(a) || createdAtMs(a) - createdAtMs(b));
  const workingNowIds = new Set(workingNowTodos.map((t) => t.id));
  // A task already in the section can always be re-toggled; new ones need a free slot.
  function isRoomToWorkOn(id: number) {
    return workingNowIds.has(id) || workingNowTodos.length < workingLimit;
  }

  // The category filter only hides rows — the working-now slot count above stays
  // honest about what's actually in progress.
  // Which categories are worth offering as filters: the ones actually in use.

  // Most-used tags first, alphabetical to break ties. Sixty tags don't fit on a
  // phone at once, so on mobile this strip becomes one sideways-scrolling line —
  // and in a line, order decides what you can reach without swiping. Frequency
  // puts the handful of tags actually worth filtering by up front; strict
  // alphabetical buried "work" past forty others.
  const tagCounts = new Map<string, number>();
  for (const t of thoughts) {
    for (const tag of t.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const allTags = Array.from(tagCounts.keys()).sort((a, b) => {
    const byCount = (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0);
    return byCount !== 0 ? byCount : a.localeCompare(b);
  });
  // Whichever tag is filtering leads the strip, so it stays on screen as the
  // thing you can tap to undo rather than scrolling away with the rest.
  const orderedTags = tagFilter
    ? [tagFilter, ...allTags.filter((t) => t !== tagFilter)]
    : allTags;
  const searchActive = query.trim().length > 0;
  const displayedThoughts = searchActive
    ? semanticResults ?? []
    : tagFilter
      ? thoughts.filter((t) => t.tags?.includes(tagFilter))
      : thoughts;


  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* No header bar here — the identity line and its icon buttons moved to the
          desktop nav rail (app/(app)/layout.tsx) so the panel is all content. */}
      <div className="flex flex-1 min-h-0 flex-col">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Tasks */}
        {activeTab === "todos" && (
          // On a phone the same tasks are a plain vertical list. The canvas puts its
          // cards at scene coordinates on a board several times wider than a 390px
          // screen, and Excalidraw's own toolbars want the top strip our controls
          // need — neither survives the narrow view. This is a real branch rather than
          // `lg:hidden` because the desktop side boots two Excalidraw scenes, and a
          // hidden one still mounts. See <TaskListMobile> and useIsDesktop().
          !isDesktop ? (
          <div className="h-full">
            <TaskListMobile
              todos={visibleTodos}
              loading={loading}
              nowTick={nowTick}
              completingIds={completingIds}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onToggleTimer={handleToggleTimer}
              onToggleInProgress={handleToggleInProgress}
              onDelete={handleDeleteTodo}
              onUpdate={handleUpdateTodo}
              onCreated={handleTodoCreated}
            />
          </div>
          ) : (
          // The Tasks screen is an infinite Excalidraw notebook: today's tasks ride on
          // it as real checkbox cards (positioned by canvas_x/canvas_y), and everything
          // around them — arrows, headings, scribbles — is freeform drawing. h-full so
          // the canvas claims the whole panel instead of a fixed box.
          <div className="flex h-full flex-col">
            {/* The strategy sits above everything else: every task should ladder up
                to it. Its own Excalidraw scene, separate from the notebook below. */}
            <StrategyBoard />
            <div className="min-h-0 flex-1">
              <TaskCanvas
                todos={visibleTodos}
                loading={loading}
                nowTick={nowTick}
                completingIds={completingIds}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onToggleTimer={handleToggleTimer}
                onToggleInProgress={handleToggleInProgress}
                onToggleWaiting={handleToggleWaiting}
                onDelete={handleDeleteTodo}
                onUpdate={handleUpdateTodo}
                onCreated={handleTodoCreated}
                onLocalPatch={handleLocalTodoPatch}
              />
            </div>
          </div>
          )
        )}

        {/* Notes */}
        {activeTab === "notes" && (
          <div className="px-5 py-4 overflow-x-hidden">
            {!loading && thoughts.length > 0 && (
              <InputGroup className="mb-3">
                {searching ? (
                  <InputGroupAddon>
                    <Spinner />
                  </InputGroupAddon>
                ) : (
                  <InputGroupAddon>
                    <SparklesIcon />
                  </InputGroupAddon>
                )}
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes by meaning…"
                />
                {searchActive && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            )}

            {!loading && allTags.length > 0 && (
              // One line that scrolls sideways on a phone, the full wrapped cloud
              // from `lg` up. Sixty tags wrapped to nineteen rows at 390px and
              // pushed every note below the fold; as a single row it costs one.
              <div className="scroll-row-x -mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:overflow-x-visible lg:px-0">
                <Badge
                  asChild
                  variant={tagFilter === null ? "default" : "outline"}
                  className="tap-target shrink-0 cursor-pointer"
                >
                  <button onClick={() => setTagFilter(null)}>All</button>
                </Badge>
                {orderedTags.map((tag) => (
                  <Badge
                    key={tag}
                    asChild
                    variant={tagFilter === tag ? "default" : "outline"}
                    className="tap-target shrink-0 cursor-pointer"
                  >
                    <button onClick={() => setTagFilter(tag)}>{tag}</button>
                  </Badge>
                ))}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : thoughts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No notes yet</EmptyTitle>
                  <EmptyDescription>Share a thought with your agent to capture it.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : searchActive && searchError ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SparklesIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>Semantic search is unavailable</EmptyTitle>
                  <EmptyDescription>Try again, or filter by tag instead.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : searchActive && searching && displayedThoughts.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : displayedThoughts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {searchActive
                      ? `No notes match "${query.trim()}"`
                      : `No notes tagged "${tagFilter}"`}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-3">
                {displayedThoughts.map((thought) => (
                  <Card key={thought.id} className="gap-0 rounded-lg px-3 py-2.5 shadow-none group overflow-hidden">
                    {editingId === thought.id ? (
                      <div>
                        <Textarea
                          ref={editRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(thought.id); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          rows={3}
                          className="text-sm leading-relaxed border-0 shadow-none px-0 py-0 min-h-0 focus-visible:ring-0 dark:bg-transparent"
                        />
                        <div className="flex gap-2 mt-2">
                          <Button size="xs" onClick={() => saveEdit(thought.id)}>
                            Save
                          </Button>
                          <Button size="xs" variant="outline" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed break-words">{thought.content}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatRelativeTime(thought.created_at)}
                          </span>
                          {thought.tags?.map((tag) => (
                            <Badge
                              key={tag}
                              asChild
                              variant={tagFilter === tag ? "default" : "secondary"}
                              className="cursor-pointer"
                            >
                              <button onClick={() => setTagFilter(tag)}>{tag}</button>
                            </Badge>
                          ))}
                          <div className="ml-auto flex gap-0.5 touch:gap-2 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => startEdit(thought)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Edit note"
                            >
                              <PencilIcon className="size-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground hover:text-destructive"
                                  aria-label="Delete note"
                                >
                                  <TrashIcon className="size-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This can&rsquo;t be undone. The note will be permanently removed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteThought(thought.id)}
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Calendar */}
        {activeTab === "calendar" && (
          <div className="px-5 py-4">
            <CalendarPanel />
          </div>
        )}

        {/* Sketches */}
        {activeTab === "sketches" && (
          // h-full so the canvas can claim the full panel height instead of a fixed aspect box.
          <div className="h-full">
            <SketchesPanel />
          </div>
        )}

        {/* Lists */}
        {activeTab === "lists" && (
          <div className="px-5 py-4">
            <ListsPanel />
          </div>
        )}

        {/* Dreams */}
        {activeTab === "dreams" && (
          <div className="px-5 py-4">
            {loading || dream === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : dream === null ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No dreams yet</EmptyTitle>
                  <EmptyDescription>
                    Cael consolidates your notes and surfaces patterns nightly. Run one now to start.
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  onClick={handleRunDream}
                  disabled={runningDream}
                  className="mt-4"
                  size="sm"
                >
                  {runningDream ? <Spinner className="size-3.5 mr-2" /> : <BrainIcon className="size-3.5 mr-2" />}
                  {runningDream ? "Dreaming…" : "Run dream now"}
                </Button>
              </Empty>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {new Date(dream.dream_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {dream.thoughts_analyzed} notes · {dream.todos_analyzed} tasks
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={handleRunDream}
                      disabled={runningDream}
                      title="Re-run dream"
                    >
                      {runningDream ? <Spinner className="size-3" /> : <RepeatIcon className="size-3" />}
                    </Button>
                  </div>
                </div>

                <Card className="p-4">
                  <p className="text-sm leading-relaxed text-foreground">{dream.summary}</p>
                </Card>

                {dream.patterns.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Patterns</h3>
                    <div className="space-y-2">
                      {dream.patterns.map((p, i) => (
                        <Card key={i} className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-medium">{p.theme}</p>
                            <Badge variant="secondary" className="shrink-0 text-xs">{p.frequency}×</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{p.evidence}</p>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {dream.insights.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Insights</h3>
                    <Card className="p-3">
                      <ul className="space-y-2">
                        {dream.insights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-primary mt-0.5 shrink-0">·</span>
                            <span className="leading-relaxed">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Journal Templates */}
        {activeTab === "journal-templates" && (
          <div className="px-5 py-4">
            <JournalTemplatesPanel />
          </div>
        )}

        {/* Scheduled Tasks */}
        {activeTab === "schedule" && (
          <div className="px-5 py-4 space-y-6">

            {/* Scheduled tasks — all editable at runtime, including the built-in ones */}
            <div>
              <ScheduledTasksPanel onRunNow={onRunJobWithChat} />
            </div>

            {/* Recurring todos */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Recurring Tasks</p>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : todos.filter((t) => t.recurrence && t.recurrence !== "none").length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <RepeatIcon className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>No recurring tasks</EmptyTitle>
                    <EmptyDescription>Add a task with a recurrence (daily, weekly, monthly) to see it here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="space-y-1.5">
                  {todos
                    .filter((t) => t.recurrence && t.recurrence !== "none")
                    .map((todo) => (
                      <li
                        key={todo.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-muted/30"
                      >
                        <RepeatIcon className="size-3.5 text-primary/70 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm leading-snug truncate", priorityColor(todo.priority))}>
                            {todo.title}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 gap-0.5 border-primary/30 text-primary/70 py-0 capitalize">
                          {todo.recurrence}
                        </Badge>
                        {todo.due_date && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <ClockIcon className="size-3" />
                            {formatDate(todo.due_date)}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </div>

          </div>
        )}

        {/* Media */}
        {activeTab === "media" && (
          <div className="px-5 py-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleUpload(file);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? (
                <Spinner className="size-6 text-primary" />
              ) : (
                <UploadIcon className="size-6 text-muted-foreground" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium">{uploading ? "Uploading…" : "Click or drag an image here"}</p>
                <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP · max 5 MB</p>
              </div>
            </div>

            {uploadedImages.length > 0 && (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Uploaded this session</p>
                {uploadedImages.map((img) => (
                  <Card key={img.url} className="flex flex-row items-center gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.name} className="size-12 shrink-0 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{img.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{img.url}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => copyUrl(img.url)}
                      title="Copy URL"
                    >
                      {copiedUrl === img.url ? (
                        <CheckCheck className="size-4 text-green-500" />
                      ) : (
                        <CopyIcon className="size-4" />
                      )}
                    </Button>
                  </Card>
                ))}
              </div>
            )}

            {uploadedImages.length === 0 && !uploading && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Upload an image, copy its URL, then tell Cael to post it to LinkedIn.
              </p>
            )}
          </div>
        )}

        {/* Vision */}
        {activeTab === "vision" && (
          <div className="px-5 py-4">
            <VisionPanel />
          </div>
        )}

        {/* Family */}
        {activeTab === "family" && (
          <div className="px-5 py-4">
            <FamilyPanel />
          </div>
        )}

        {/* Nutrition */}
        {activeTab === "nutrition" && (
          <div className="px-5 py-4">
            <NutritionPanel />
          </div>
        )}

        {/* Manual */}
        {activeTab === "manual" && (
          <div className="px-5 py-4">
            <ManualPanel />
          </div>
        )}

        {/* Measures */}
        {activeTab === "measures" && (
          <div className="px-5 py-4">
            <MeasuresOverview measures={measures} />

            <div className="flex flex-wrap gap-1.5 mb-4">
              {MEASURE_CATEGORIES.map(({ key, label, icon: Icon }) => (
                <Badge
                  key={key}
                  asChild
                  variant={measureCategory === key ? "default" : "outline"}
                  className="tap-target cursor-pointer gap-1"
                >
                  <button type="button" onClick={() => { setMeasureCategory(key); setMeasureForm({}); }}>
                    <Icon className="size-3" />
                    {label}
                  </button>
                </Badge>
              ))}
            </div>

            <form onSubmit={handleAddMeasure} className="flex flex-col gap-3 mb-6">
              <Input
                type="date"
                value={measureDate}
                onChange={(e) => setMeasureDate(e.target.value)}
                className="w-fit"
              />
              <div className="grid grid-cols-2 gap-2">
                {MEASURE_FIELDS[measureCategory].map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      {f.label}
                      {f.suffix ? ` (${f.suffix})` : f.max ? ` (1–${f.max})` : ""}
                    </label>
                    <Input
                      type="number"
                      min={f.max ? 1 : undefined}
                      max={f.max}
                      value={measureForm[f.key] ?? ""}
                      onChange={(e) => setMeasureForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <Textarea
                value={measureNotes}
                onChange={(e) => setMeasureNotes(e.target.value)}
                placeholder="Notes (optional)…"
                rows={2}
              />
              <Button type="submit" disabled={savingMeasure} className="self-start">
                {savingMeasure ? <Spinner className="size-3.5 mr-2" /> : <PlusIcon className="size-3.5 mr-2" />}
                Log entry
              </Button>
            </form>

            {(() => {
              const entries = measures.filter((m) => m.category === measureCategory);
              if (loading) {
                return (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                  </div>
                );
              }
              if (entries.length === 0) {
                return (
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <GaugeIcon className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>No entries yet</EmptyTitle>
                      <EmptyDescription>Log your first entry above.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                );
              }
              return (
                <ul className="space-y-2">
                  {entries.map((m) => (
                    <li key={m.id} className="rounded-lg px-3 py-2.5 bg-muted/30 group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatDate(m.recorded_date)}
                        </span>
                        <button
                          onClick={() => handleDeleteMeasure(m.id)}
                          className="tap-target shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          aria-label="Delete entry"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {MEASURE_FIELDS[m.category].map((f) =>
                          m.data?.[f.key] !== undefined ? (
                            <span key={f.key} className="text-sm">
                              <span className="text-muted-foreground">{f.label}: </span>
                              <span className="font-medium">
                                {f.suffix === "$" ? "$" : ""}
                                {m.data[f.key]}
                                {f.suffix && f.suffix !== "$" ? ` ${f.suffix}` : ""}
                                {f.max ? `/${f.max}` : ""}
                              </span>
                            </span>
                          ) : null
                        )}
                      </div>
                      {m.notes && <p className="text-xs text-muted-foreground mt-1.5">{m.notes}</p>}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

      </div>
      </div>

      {timerCompleteTodo && (
        <TimerCompleteCelebration
          taskTitle={timerCompleteTodo.title}
          onClose={() => setTimerCompleteTodo(null)}
        />
      )}
    </div>
  );
}
