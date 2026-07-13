"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { CheckIcon, PlusIcon, CircleIcon, BrainIcon, ClockIcon, PanelLeftCloseIcon, PencilIcon, TrashIcon, SparklesIcon, XIcon, ImageIcon, UploadIcon, CopyIcon, CheckCheck, RepeatIcon, ListTodoIcon, FileTextIcon, MoonIcon, CalendarClockIcon, ActivityIcon, ListChecksIcon, BookOpenIcon, MessageCircleIcon, GaugeIcon, PiggyBankIcon, WalletIcon, HourglassIcon, TelescopeIcon, HomeIcon } from "lucide-react";
import { ScheduledTasksPanel } from "@/app/_components/scheduled-tasks-panel";
import { VisionPanel } from "@/app/_components/vision-panel";
import { MeasuresOverview } from "@/app/_components/measures-overview";
import { JournalTemplatesPanel } from "@/app/_components/journal-templates-panel";
import { ListsPanel } from "@/app/_components/lists-panel";
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
import { ModeToggle } from "@/app/_components/mode-toggle";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

const NAV_ITEMS = [
  { id: "home" as const, label: "Home", icon: HomeIcon },
  { id: "todos" as const, label: "Tasks", icon: ListTodoIcon },
  { id: "notes" as const, label: "Notes", icon: FileTextIcon },
  { id: "lists" as const, label: "Lists", icon: ListChecksIcon },
  { id: "journal-templates" as const, label: "Journal Templates", icon: BookOpenIcon },
  { id: "dreams" as const, label: "Dreams", icon: MoonIcon },
  { id: "schedule" as const, label: "Scheduled Tasks", icon: CalendarClockIcon },
  { id: "media" as const, label: "Media", icon: ImageIcon },
  { id: "measures" as const, label: "Measures", icon: GaugeIcon },
  { id: "vision" as const, label: "Vision", icon: TelescopeIcon },
];

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

const TODO_SECTIONS = [
  { key: "none" as const, label: "Once" },
  { key: "daily" as const, label: "Daily" },
  { key: "weekly" as const, label: "Weekly" },
  { key: "monthly" as const, label: "Monthly" },
];

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  created_at: string;
  completed_at?: string | null;
}

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

type DashboardTab = "home" | "todos" | "notes" | "lists" | "journal-templates" | "dreams" | "media" | "schedule" | "measures" | "vision";

export function Dashboard({ activeTab: controlledTab, onCollapse, onRunJobWithChat, onTabChange, isExpanded, onBackToChat, focusNewTaskSignal }: { activeTab?: DashboardTab; onCollapse?: () => void; onRunJobWithChat?: (message: string) => void; onTabChange?: (tab: DashboardTab) => void; isExpanded?: boolean; onBackToChat?: () => void; focusNewTaskSignal?: number }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [measureCategory, setMeasureCategory] = useState<Measure["category"]>("daily_checkin");
  const [measureForm, setMeasureForm] = useState<Record<string, string>>({});
  const [measureDate, setMeasureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [measureNotes, setMeasureNotes] = useState("");
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [dream, setDream] = useState<DreamReport | null | undefined>(undefined);
  const [newTodo, setNewTodo] = useState("");
  const [newTodoRecurrence, setNewTodoRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
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
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState("");
  const [editTodoPriority, setEditTodoPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [editTodoDueDate, setEditTodoDueDate] = useState("");
  const [editTodoRecurrence, setEditTodoRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const editTodoRef = useRef<HTMLInputElement>(null);
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

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTodo.trim();
    if (!title) return;
    const recurrence = newTodoRecurrence;
    setNewTodo("");
    setNewTodoRecurrence("none");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, recurrence }),
      });
      if (!res.ok) throw new Error();
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
    } catch {
      setNewTodo(title);
      toast.error("Couldn't add task. Try again.");
    }
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

  const startEditTodo = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditTodoTitle(todo.title);
    setEditTodoPriority(todo.priority);
    setEditTodoDueDate(todo.due_date ? todo.due_date.slice(0, 10) : "");
    setEditTodoRecurrence(todo.recurrence ?? "none");
    setTimeout(() => {
      editTodoRef.current?.focus();
      editTodoRef.current?.select();
    }, 0);
  };

  const cancelEditTodo = () => {
    setEditingTodoId(null);
    setEditTodoTitle("");
  };

  const saveEditTodo = async (id: number) => {
    const title = editTodoTitle.trim();
    if (!title) return;
    const prev = todos;
    const patch = {
      title,
      priority: editTodoPriority,
      due_date: editTodoDueDate || null,
      recurrence: editTodoRecurrence,
    };
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setEditingTodoId(null);
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodos(prev);
      toast.error("Couldn't save task.");
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

  const handleComplete = async (id: number) => {
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
      const res = await fetch(`/api/todos/${id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTimeout(() => {
        if (data.recurring && data.next_due) {
          setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: data.next_due } : t)));
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

  const activeTodos = todos.filter((t) => !t.completed);
  const highPriority = activeTodos.filter((t) => t.priority === "high" || t.priority === "urgent");
  // Active todos, plus anything (of any recurrence) crossed off today — so today's
  // completions stay visible (struck through) instead of vanishing immediately.
  const visibleTodos = todos.filter((t) => {
    const doneToday = Boolean(t.completed_at) && isToday(t.completed_at);
    if (t.completed && !doneToday) return false;
    if ((t.recurrence ?? "none") === "daily") return isToday(t.due_date) || doneToday;
    return true;
  });

  const allTags = Array.from(
    new Set(thoughts.flatMap((t) => t.tags ?? [])),
  ).sort();
  const searchActive = query.trim().length > 0;
  const displayedThoughts = searchActive
    ? semanticResults ?? []
    : tagFilter
      ? thoughts.filter((t) => t.tags?.includes(tagFilter))
      : thoughts;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CaelAvatar size={36} />
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-tight">Cael</h1>
              {!loading && (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {activeTodos.length === 0
                    ? "All clear"
                    : `${activeTodos.length} task${activeTodos.length !== 1 ? "s" : ""}${highPriority.length > 0 ? `, ${highPriority.length} urgent` : ""}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isExpanded && onBackToChat && (
              <button
                onClick={onBackToChat}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Back to chat"
                title="Back to chat"
              >
                <MessageCircleIcon className="size-3.5" />
              </button>
            )}
            <Link
              href="/traces"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="View agent traces"
              title="Agent traces"
            >
              <ActivityIcon className="size-3.5" />
            </Link>
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Collapse panel"
              >
                <PanelLeftCloseIcon className="size-3.5" />
              </button>
            )}
            <ModeToggle />
          </div>
        </div>
      </div>

      <div className={cn("flex flex-1 min-h-0 flex-col", isExpanded && "lg:flex-row")}>
        {/* Vertical nav — ElevenLabs style. On mobile, hidden when expanded since the bottom nav already covers navigation. */}
        <nav
          className={cn(
            "shrink-0 space-y-0.5",
            isExpanded
              ? "hidden lg:block lg:w-[220px] lg:border-r lg:border-border lg:px-3 lg:py-3 lg:overflow-y-auto"
              : "px-3 py-3 border-b border-border",
          )}
        >
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setActiveTab(id);
                  onTabChange?.(id);
                }}
                className={cn(
                  "flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-colors text-left",
                  isActive
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{label}</span>
                {id === "todos" && !loading && activeTodos.length > 0 && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {activeTodos.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Tasks */}
        {activeTab === "todos" && (
          <div className="px-5 py-4 pb-16 lg:pb-0">
            <form onSubmit={handleAddTodo} className="flex flex-col gap-2 mb-5">
              <div className="flex gap-2">
                <Input
                  ref={newTodoRef}
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  placeholder="Add a task…"
                  className="flex-1"
                />
                <Button type="submit" size="icon" aria-label="Add task">
                  <PlusIcon className="size-4" />
                </Button>
              </div>
              {newTodo.trim() && (
                <div className="flex items-center gap-1.5">
                  <RepeatIcon className="size-3 text-muted-foreground shrink-0" />
                  {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                    <Badge
                      key={r}
                      asChild
                      variant={newTodoRecurrence === r ? "default" : "outline"}
                      className="cursor-pointer"
                    >
                      <button type="button" onClick={() => setNewTodoRecurrence(r)}>
                        {r === "none" ? "Once" : r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </form>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : visibleTodos.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CheckIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>All done</EmptyTitle>
                  <EmptyDescription>Nothing on your list right now.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-5">
                {TODO_SECTIONS.map(({ key, label }) => {
                  const sectionTodos = visibleTodos.filter((t) => (t.recurrence ?? "none") === key);
                  if (sectionTodos.length === 0) return null;
                  return (
                    <div key={key}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        {label}
                      </p>
                      <ul className="space-y-1.5">
                        {sectionTodos.map((todo) => {
                          const isCompleting = completingIds.has(todo.id);
                          const isDoneToday =
                            !isCompleting && Boolean(todo.completed_at) && isToday(todo.completed_at);
                          const isDone = isCompleting || isDoneToday;
                          return editingTodoId === todo.id ? (
                            <li key={todo.id} className="rounded-lg px-2 py-2.5 bg-muted/40">
                              <Input
                                ref={editTodoRef}
                                value={editTodoTitle}
                                onChange={(e) => setEditTodoTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEditTodo(todo.id);
                                  if (e.key === "Escape") cancelEditTodo();
                                }}
                                className="mb-2"
                              />
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                                  <Badge
                                    key={p}
                                    asChild
                                    variant={editTodoPriority === p ? "default" : "outline"}
                                    className={cn(
                                      "cursor-pointer capitalize",
                                      p === "urgent" && editTodoPriority !== p && "border-priority-urgent/40 text-priority-urgent",
                                    )}
                                  >
                                    <button type="button" onClick={() => setEditTodoPriority(p)}>{p}</button>
                                  </Badge>
                                ))}
                                <Input
                                  type="date"
                                  value={editTodoDueDate}
                                  onChange={(e) => setEditTodoDueDate(e.target.value)}
                                  className="h-7 w-auto text-xs"
                                />
                                {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                                  <Badge
                                    key={r}
                                    asChild
                                    variant={editTodoRecurrence === r ? "default" : "outline"}
                                    className="cursor-pointer"
                                  >
                                    <button type="button" onClick={() => setEditTodoRecurrence(r)}>
                                      {r === "none" ? "Once" : r.charAt(0).toUpperCase() + r.slice(1)}
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <Button size="xs" onClick={() => saveEditTodo(todo.id)}>Save</Button>
                                <Button size="xs" variant="outline" onClick={cancelEditTodo}>Cancel</Button>
                              </div>
                            </li>
                          ) : (
                            <li
                              key={todo.id}
                              className={cn(
                                "flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-colors group",
                                isCompleting && "opacity-50",
                                isDoneToday && "opacity-60",
                              )}
                            >
                              <button
                                onClick={() => (isDoneToday ? handleUncomplete(todo.id) : handleComplete(todo.id))}
                                disabled={isCompleting}
                                title={isDoneToday ? "Undo" : undefined}
                                className={cn(
                                  "mt-0.5 shrink-0 size-4 rounded-full border transition-colors flex items-center justify-center",
                                  isDone
                                    ? "bg-primary border-primary"
                                    : "border-border group-hover:border-primary/60",
                                )}
                              >
                                {isDone ? (
                                  <CheckIcon className="size-2.5 text-primary-foreground" />
                                ) : (
                                  <CircleIcon className="size-2.5 text-primary opacity-0 group-hover:opacity-40 transition-opacity" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-sm leading-snug", priorityColor(todo.priority), isDone && "line-through text-muted-foreground")}>
                                  {todo.title}
                                </p>
                                {isDoneToday ? (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <CheckIcon className="size-3" />
                                    Done today
                                  </p>
                                ) : todo.due_date && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <ClockIcon className="size-3" />
                                    {formatDate(todo.due_date)}
                                  </p>
                                )}
                              </div>
                              {todo.priority === "urgent" && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-priority-urgent/40 text-priority-urgent"
                                >
                                  Urgent
                                </Badge>
                              )}
                              {todo.priority === "high" && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-priority-high/40 text-priority-high"
                                >
                                  High
                                </Badge>
                              )}
                              <button
                                onClick={() => startEditTodo(todo)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                aria-label="Edit task"
                              >
                                <PencilIcon className="size-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTodo(todo.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                aria-label="Delete task"
                              >
                                <TrashIcon className="size-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {activeTab === "notes" && (
          <div className="px-5 py-4 pb-16 lg:pb-0 overflow-x-hidden">
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
              <div className="flex flex-wrap gap-1.5 mb-4">
                <Badge
                  asChild
                  variant={tagFilter === null ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  <button onClick={() => setTagFilter(null)}>All</button>
                </Badge>
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    asChild
                    variant={tagFilter === tag ? "default" : "outline"}
                    className="cursor-pointer"
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
                          <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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

        {/* Lists */}
        {activeTab === "lists" && (
          <div className="px-5 py-4 pb-16 lg:pb-0">
            <ListsPanel />
          </div>
        )}

        {/* Dreams */}
        {activeTab === "dreams" && (
          <div className="px-5 py-4 pb-16 lg:pb-0">
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
          <div className="px-5 py-4 pb-16 lg:pb-0">
            <JournalTemplatesPanel />
          </div>
        )}

        {/* Scheduled Tasks */}
        {activeTab === "schedule" && (
          <div className="px-5 py-4 pb-16 lg:pb-0 space-y-6">

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
          <div className="px-5 py-4 pb-16 lg:pb-0">
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
                  <Card key={img.url} className="flex items-center gap-3 p-3">
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
          <div className="px-5 py-4 pb-16 lg:pb-0">
            <VisionPanel />
          </div>
        )}

        {/* Measures */}
        {activeTab === "measures" && (
          <div className="px-5 py-4 pb-16 lg:pb-0">
            <MeasuresOverview measures={measures} />

            <div className="flex flex-wrap gap-1.5 mb-4">
              {MEASURE_CATEGORIES.map(({ key, label, icon: Icon }) => (
                <Badge
                  key={key}
                  asChild
                  variant={measureCategory === key ? "default" : "outline"}
                  className="cursor-pointer gap-1"
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
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
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
    </div>
  );
}
