"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  Columns3Icon,
  CopyIcon,
  HourglassIcon,
  ListPlusIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  TargetIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StreakChip } from "@/app/_components/streak-chip";
import { TaskLatestUpdate, TaskUpdateComposer } from "@/app/_components/task-update-line";
import {
  CATEGORY_BADGE_CLASS,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  type TaskCategory,
} from "@/lib/task-categories";
import {
  ESTIMATE_OPTIONS,
  FOLLOW_UP_OPTIONS,
  PRIORITIES,
  formatCountdown,
  formatEstimateLabel,
  isDoneToday,
  isLanePiece,
  remainingSeconds,
  type Todo,
} from "@/lib/todo";
import { cn } from "@/lib/utils";

/**
 * The Tasks screen on desktop: a plain shadcn + TanStack data table.
 *
 * It replaced the Excalidraw notebook (task-canvas.tsx) and the strategy board on
 * 2026-10-19 — Berto wanted a traditional table. Pipeline pieces (Content, Code,
 * Community, Sales) are ordinary rows here; their steps hang under them as
 * expandable sub-rows instead of living in a separate side panel.
 *
 * Same props contract as <TaskCanvas> / <TaskListMobile>, so the dashboard's handlers
 * stay the single source of truth for every write.
 */

export interface TaskTableProps {
  todos: Todo[];
  loading: boolean;
  /** Ticks once a second in the parent so every countdown runs off one clock. */
  nowTick: number;
  completingIds: Set<number>;
  onComplete: (id: number, opts?: { repeat?: boolean; followUpDays?: number }) => void;
  onUncomplete: (id: number) => void;
  onToggleTimer: (todo: Todo) => void;
  onToggleInProgress: (id: number, in_progress: boolean) => void;
  onToggleWaiting: (id: number, waiting: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Todo>) => void;
  onCreated: (todo: Todo) => void;
  onLocalPatch: (id: number, patch: Partial<Todo>) => void;
  onSetPinned: (id: number, pinned: boolean) => void;
}

type Row = Todo & { subRows?: Row[] };

// Filter values double as URL query values (?status=waiting&category=sales), so a
// filtered view can be linked to or named directly.
const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "working", label: "Working now" },
  { value: "waiting", label: "Waiting" },
  { value: "todo", label: "Not started" },
  { value: "done", label: "Done today" },
  { value: "all", label: "All" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

const PRIORITY_RANK: Record<Todo["priority"], number> = { urgent: 3, high: 2, normal: 1, low: 0 };

const PRIORITY_DOT: Record<Todo["priority"], string> = {
  urgent: "bg-priority-urgent",
  high: "bg-priority-high",
  normal: "bg-muted-foreground/60",
  low: "bg-muted-foreground/30",
};

type Status = "working" | "waiting" | "todo";
function statusOf(t: Todo): Status {
  if (t.in_progress) return "working";
  if (t.waiting) return "waiting";
  return "todo";
}
const STATUS_RANK: Record<Status, number> = { working: 2, waiting: 1, todo: 0 };

function isDone(t: Todo, completingIds: Set<number>) {
  return t.completed || isDoneToday(t) || completingIds.has(t.id);
}

function matchesStatus(t: Todo, filter: StatusFilter, completingIds: Set<number>) {
  const done = isDone(t, completingIds);
  // A task mid-tick stays visible in the open views so you see it leave.
  const leaving = completingIds.has(t.id);
  switch (filter) {
    case "all":
      return true;
    case "done":
      return done;
    case "open":
      return !done || leaving;
    case "working":
      return (!done || leaving) && t.in_progress;
    case "waiting":
      return (!done || leaving) && t.waiting && !t.in_progress;
    case "todo":
      return (!done || leaving) && !t.in_progress && !t.waiting;
  }
}

// The default order when no column is sorted: working now first, then the manual
// queue number, priority, and oldest first — same as the mobile list.
function defaultOrder(a: Todo, b: Todo) {
  const sa = STATUS_RANK[statusOf(a)];
  const sb = STATUS_RANK[statusOf(b)];
  if (sa !== sb) return sb - sa;
  const qa = typeof a.task_number === "number" ? a.task_number : Infinity;
  const qb = typeof b.task_number === "number" ? b.task_number : Infinity;
  if (qa !== qb) return qa - qb;
  const pa = PRIORITY_RANK[a.priority] ?? 1;
  const pb = PRIORITY_RANK[b.priority] ?? 1;
  if (pa !== pb) return pb - pa;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function formatDue(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function readParam(key: string) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

function writeParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(window.history.state, "", url);
}

function SortHeader({
  label,
  sorted,
  onToggle,
  className,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onToggle: (e: unknown) => void;
  className?: string;
}) {
  return (
    <Button variant="ghost" size="sm" className={cn("-ml-2 h-8 gap-1 px-2 text-xs", className)} onClick={onToggle}>
      {label}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3" />
      ) : (
        <ArrowUpDownIcon className="size-3 opacity-40" />
      )}
    </Button>
  );
}

function TitleCell({
  todo,
  done,
  depth,
  canExpand,
  expanded,
  onToggleExpanded,
  childCount,
  composing,
  onCloseComposer,
  addingStep,
  onCloseStep,
  onCreated,
  onUpdate,
  onLocalPatch,
}: {
  todo: Todo;
  done: boolean;
  depth: number;
  canExpand: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  childCount: { done: number; total: number } | null;
  composing: boolean;
  onCloseComposer: () => void;
  addingStep: boolean;
  onCloseStep: () => void;
  onCreated: (todo: Todo) => void;
  onUpdate: (id: number, patch: Partial<Todo>) => void;
  onLocalPatch: (id: number, patch: Partial<Todo>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [step, setStep] = useState("");
  const [savingStep, setSavingStep] = useState(false);
  const stepRef = useRef<HTMLInputElement>(null);
  // Opened from the row's ⋯ menu, which still holds focus while this mounts — so
  // focus on the next tick, after the menu has gone.
  useEffect(() => {
    if (!addingStep) return;
    const id = window.setTimeout(() => stepRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [addingStep]);

  // A pipeline piece's steps are real tasks, so they need an estimate like any other.
  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    const title = step.trim();
    if (!title || savingStep) return;
    setSavingStep(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, parent_id: todo.id, estimated_minutes: 30 }),
      });
      if (!res.ok) throw new Error();
      onCreated(await res.json());
      setStep("");
    } catch {
      toast.error("Couldn't add step.");
    } finally {
      setSavingStep(false);
    }
  }

  return (
    <div className="flex min-w-0 items-start gap-1" style={{ paddingLeft: depth * 20 }}>
      {canExpand ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? `Collapse ${todo.title}` : `Expand ${todo.title}`}
          className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRightIcon className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : (
        <span className="w-[18px] shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const title = draft.trim();
              if (title && title !== todo.title) onUpdate(todo.id, { title });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(todo.title);
                setEditing(false);
              }
            }}
            className="h-7 text-sm"
          />
        ) : (
          <button
            type="button"
            title="Click to rename"
            onClick={() => {
              setDraft(todo.title);
              setEditing(true);
            }}
            className={cn(
              "block w-full whitespace-normal break-words text-left text-sm leading-snug",
              depth === 0 && childCount ? "font-medium" : "",
              done && "text-muted-foreground line-through",
            )}
          >
            {todo.title}
            {childCount && (
              <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                {childCount.done}/{childCount.total}
              </span>
            )}
          </button>
        )}
        <TaskLatestUpdate todo={todo} className="mt-1 max-w-xl whitespace-normal text-xs" />
        {addingStep && (
          <form onSubmit={addStep} className="mt-1 flex max-w-md items-center gap-1.5">
            <Input
              ref={stepRef}
              value={step}
              onChange={(e) => setStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCloseStep();
              }}
              placeholder="Add a step…"
              className="h-7 text-sm"
            />
            <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={savingStep || !step.trim()}>
              Add
            </Button>
          </form>
        )}
        {composing && (
          <TaskUpdateComposer
            taskId={todo.id}
            className="mt-1 max-w-xl"
            onClose={onCloseComposer}
            onPosted={(u) =>
              onLocalPatch(todo.id, {
                last_update: u.body,
                last_update_by: u.author,
                last_update_at: u.created_at,
              })
            }
          />
        )}
      </div>
    </div>
  );
}

export function TaskTable({
  todos,
  loading,
  nowTick,
  completingIds,
  onComplete,
  onUncomplete,
  onToggleTimer,
  onToggleInProgress,
  onToggleWaiting,
  onDelete,
  onUpdate,
  onCreated,
  onLocalPatch,
  onSetPinned,
}: TaskTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | "none" | "all">("all");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ created_at: false, recurrence: false });
  const [composingId, setComposingId] = useState<number | null>(null);
  const [stepFor, setStepFor] = useState<number | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newEstimate, setNewEstimate] = useState<number>(30);
  const [newCategory, setNewCategory] = useState<TaskCategory | "none">("none");
  const [creating, setCreating] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filters live in the URL so a view is linkable: /tasks?status=waiting&category=sales.
  useEffect(() => {
    const s = readParam("status");
    if (s && STATUS_FILTERS.some((f) => f.value === s)) setStatusFilter(s as StatusFilter);
    const c = readParam("category");
    if (c && (c === "none" || (TASK_CATEGORIES as readonly string[]).includes(c))) {
      setCategoryFilter(c as TaskCategory | "none");
    }
    const q = readParam("q");
    if (q) setSearch(q);
  }, []);
  useEffect(() => {
    writeParams({
      status: statusFilter === "open" ? null : statusFilter,
      category: categoryFilter === "all" ? null : categoryFilter,
      q: search.trim() || null,
    });
  }, [statusFilter, categoryFilter, search]);

  // "N" opens the composer and "/" jumps to search, unless you're already typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setComposerOpen(true);
        requestAnimationFrame(() => composerRef.current?.focus());
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Build the tree: top-level tasks, with pipeline steps (parent_id) as sub-rows.
  // Status filtering happens here rather than in TanStack so a piece stays visible
  // while any of its steps match, and steps follow the same filter as their piece.
  const data = useMemo<Row[]>(() => {
    const children = new Map<number, Todo[]>();
    for (const t of todos) {
      if (t.parent_id != null) {
        const list = children.get(t.parent_id) ?? [];
        list.push(t);
        children.set(t.parent_id, list);
      }
    }
    const ids = new Set(todos.map((t) => t.id));
    const roots = todos.filter((t) => t.parent_id == null || !ids.has(t.parent_id));
    const rows: Row[] = [];
    for (const t of roots) {
      if (categoryFilter !== "all") {
        if (categoryFilter === "none" ? t.category != null : t.category !== categoryFilter) continue;
      }
      const kids = (children.get(t.id) ?? [])
        .filter((c) => matchesStatus(c, statusFilter, completingIds))
        .sort(defaultOrder)
        .map((c) => ({ ...c }));
      const selfMatch = matchesStatus(t, statusFilter, completingIds);
      if (!selfMatch && kids.length === 0) continue;
      rows.push(kids.length ? { ...t, subRows: kids } : { ...t });
    }
    return rows.sort(defaultOrder);
  }, [todos, statusFilter, categoryFilter, completingIds]);

  const childCounts = useMemo(() => {
    const m = new Map<number, { done: number; total: number }>();
    for (const t of todos) {
      if (t.parent_id == null) continue;
      const c = m.get(t.parent_id) ?? { done: 0, total: 0 };
      c.total += 1;
      if (t.completed || isDoneToday(t)) c.done += 1;
      m.set(t.parent_id, c);
    }
    return m;
  }, [todos]);

  const duplicateTask = useCallback(
    async (todo: Todo) => {
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: todo.title,
            priority: todo.priority,
            recurrence: todo.recurrence ?? "none",
            estimated_minutes: todo.estimated_minutes,
            category: todo.category,
            color: todo.color,
            parent_id: todo.parent_id ?? undefined,
          }),
        });
        if (!res.ok) throw new Error();
        onCreated(await res.json());
      } catch {
        toast.error("Couldn't duplicate task.");
      }
    },
    [onCreated],
  );

  const createTask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const title = newTitle.trim();
      if (!title || creating) return;
      setCreating(true);
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            estimated_minutes: newEstimate,
            ...(newCategory !== "none" ? { category: newCategory } : {}),
          }),
        });
        if (!res.ok) throw new Error();
        onCreated(await res.json());
        setNewTitle("");
        composerRef.current?.focus();
      } catch {
        toast.error("Couldn't add task.");
      } finally {
        setCreating(false);
      }
    },
    [creating, newCategory, newEstimate, newTitle, onCreated],
  );

  const live = useRef({
    childCounts,
    completingIds,
    composingId,
    stepFor,
    duplicateTask,
    onCreated,
    nowTick,
    onComplete,
    onDelete,
    onLocalPatch,
    onSetPinned,
    onToggleInProgress,
    onToggleTimer,
    onToggleWaiting,
    onUncomplete,
    onUpdate,
  });
  live.current = {
    childCounts,
    completingIds,
    composingId,
    stepFor,
    duplicateTask,
    onCreated,
    nowTick,
    onComplete,
    onDelete,
    onLocalPatch,
    onSetPinned,
    onToggleInProgress,
    onToggleTimer,
    onToggleWaiting,
    onUncomplete,
    onUpdate,
  };

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "done",
        header: () => <span className="sr-only">Done</span>,
        enableHiding: false,
        size: 36,
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          const done = isDone(t, completingIds);
          return (
            <Checkbox
              checked={done}
              aria-label={done ? `Uncheck ${t.title}` : `Check off ${t.title}`}
              onCheckedChange={(checked) => (checked ? onComplete(t.id) : onUncomplete(t.id))}
            />
          );
        },
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <SortHeader label="Task" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        enableHiding: false,
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          return (
          <TitleCell
            todo={row.original}
            done={isDone(row.original, completingIds)}
            depth={row.depth}
            canExpand={row.getCanExpand()}
            expanded={row.getIsExpanded()}
            onToggleExpanded={row.getToggleExpandedHandler()}
            childCount={childCounts.get(row.original.id) ?? null}
            composing={composingId === row.original.id}
            onCloseComposer={() => setComposingId(null)}
            addingStep={stepFor === row.original.id}
            onCloseStep={() => setStepFor(null)}
            onCreated={onCreated}
            onUpdate={onUpdate}
            onLocalPatch={onLocalPatch}
          />
          );
        },
      },
      {
        id: "status",
        accessorFn: (t) => STATUS_RANK[statusOf(t)],
        header: ({ column }) => (
          <SortHeader label="Status" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          if (isDone(t, completingIds)) {
            return <span className="text-xs text-muted-foreground">Done</span>;
          }
          const s = statusOf(t);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs",
                    s === "working" && "border-primary/50 bg-primary/10 text-primary",
                    s === "waiting" && "border-slate-400/60 bg-slate-500/10 text-slate-600 dark:text-slate-300",
                    s === "todo" && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "working" ? (
                    <TargetIcon className="size-3" />
                  ) : s === "waiting" ? (
                    <HourglassIcon className="size-3" />
                  ) : null}
                  {s === "working" ? "Working now" : s === "waiting" ? "Waiting" : "Not started"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuRadioGroup
                  value={s}
                  onValueChange={(v) => {
                    if (v === s) return;
                    if (v === "working") onToggleInProgress(t.id, true);
                    else if (v === "waiting") {
                      if (t.in_progress) onToggleInProgress(t.id, false);
                      onToggleWaiting(t.id, true);
                    } else {
                      if (t.in_progress) onToggleInProgress(t.id, false);
                      if (t.waiting) onToggleWaiting(t.id, false);
                    }
                  }}
                >
                  <DropdownMenuRadioItem value="todo" className="text-xs">Not started</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="working" className="text-xs">Working now</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="waiting" className="text-xs">Waiting</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "priority",
        accessorFn: (t) => PRIORITY_RANK[t.priority] ?? 1,
        header: ({ column }) => (
          <SortHeader label="Priority" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs capitalize text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <span className={cn("size-2 rounded-full", PRIORITY_DOT[t.priority])} />
                  {t.priority}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32">
                <DropdownMenuRadioGroup
                  value={t.priority}
                  onValueChange={(v) => onUpdate(t.id, { priority: v as Todo["priority"] })}
                >
                  {[...PRIORITIES].reverse().map((p) => (
                    <DropdownMenuRadioItem key={p} value={p} className="text-xs capitalize">
                      <span className={cn("mr-1 size-2 rounded-full", PRIORITY_DOT[p])} />
                      {p}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "category",
        accessorFn: (t) => (t.category ? TASK_CATEGORY_LABELS[t.category] : ""),
        header: ({ column }) => (
          <SortHeader label="Category" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-6 items-center rounded-md text-xs">
                  {t.category ? (
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-xs", CATEGORY_BADGE_CLASS[t.category])}>
                      {TASK_CATEGORY_LABELS[t.category]}
                    </Badge>
                  ) : (
                    <span className="px-1.5 text-muted-foreground/60 hover:text-foreground">—</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuRadioGroup
                  value={t.category ?? "none"}
                  onValueChange={(v) => onUpdate(t.id, { category: v === "none" ? null : (v as TaskCategory) })}
                >
                  <DropdownMenuRadioItem value="none" className="text-xs">None</DropdownMenuRadioItem>
                  {TASK_CATEGORIES.map((c) => (
                    <DropdownMenuRadioItem key={c} value={c} className="text-xs">
                      {TASK_CATEGORY_LABELS[c]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "estimate",
        accessorFn: (t) => t.estimated_minutes ?? 0,
        header: ({ column }) => (
          <SortHeader label="Time" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          if (isLanePiece(t)) return <span className="px-1.5 text-xs text-muted-foreground/60">—</span>;
          const done = isDone(t, completingIds);
          const running = Boolean(t.timer_started_at);
          const remaining = remainingSeconds(t, nowTick);
          const overdue = remaining !== null && remaining < 0;
          const label =
            t.estimated_minutes && remaining !== null && (running || (t.time_spent_seconds ?? 0) > 0)
              ? `${overdue ? "-" : ""}${formatCountdown(Math.abs(remaining))}`
              : t.estimated_minutes
                ? formatEstimateLabel(t.estimated_minutes)
                : "—";
          return (
            <div className="flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-6 min-w-12 items-center rounded-md px-1.5 text-xs tabular-nums hover:bg-muted",
                      running ? (overdue ? "text-priority-urgent" : "text-primary") : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-32">
                  <DropdownMenuLabel className="text-xs">Estimate</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={String(t.estimated_minutes ?? "")}
                    onValueChange={(v) => onUpdate(t.id, { estimated_minutes: Number(v) })}
                  >
                    {ESTIMATE_OPTIONS.map((m) => (
                      <DropdownMenuRadioItem key={m} value={String(m)} className="text-xs">
                        {formatEstimateLabel(m)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {!done && t.estimated_minutes ? (
                <button
                  type="button"
                  onClick={() => onToggleTimer(t)}
                  aria-label={running ? `Pause timer for ${t.title}` : `Start timer for ${t.title}`}
                  className={cn(
                    "rounded p-1 hover:bg-muted",
                    running ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {running ? <PauseIcon className="size-3" /> : <PlayIcon className="size-3" />}
                </button>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "due_date",
        accessorFn: (t) => t.due_date ?? "",
        header: ({ column }) => (
          <SortHeader label="Due" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        sortUndefined: "last",
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          const due = t.due_date?.slice(0, 10) ?? "";
          const overdue = Boolean(due) && due < todayKey() && !isDone(t, completingIds);
          return (
            <label className="relative inline-flex h-6 cursor-pointer items-center rounded-md px-1.5 text-xs hover:bg-muted">
              <span className={cn("tabular-nums", overdue ? "text-priority-urgent" : due ? "" : "text-muted-foreground/60")}>
                {due ? formatDue(due) : "—"}
              </span>
              <input
                type="date"
                aria-label={`Due date for ${t.title}`}
                value={due}
                onChange={(e) => onUpdate(t.id, { due_date: e.target.value || null })}
                className="absolute inset-0 cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </label>
          );
        },
      },
      {
        id: "recurrence",
        accessorFn: (t) => t.recurrence ?? "none",
        header: "Repeats",
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          return (
            <Select
              value={t.recurrence ?? "none"}
              onValueChange={(v) => onUpdate(t.id, { recurrence: v as Todo["recurrence"] })}
            >
              <SelectTrigger size="sm" className="h-6 border-0 px-1.5 text-xs capitalize shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                  <SelectItem key={r} value={r} className="text-xs capitalize">
                    {r === "none" ? "One-off" : r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        id: "created_at",
        accessorFn: (t) => new Date(t.created_at).getTime(),
        header: ({ column }) => (
          <SortHeader label="Created" sorted={column.getIsSorted()} onToggle={column.getToggleSortingHandler()!} />
        ),
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {new Date(row.original.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const { childCounts, completingIds, composingId, stepFor, duplicateTask, onCreated, nowTick, onComplete, onDelete, onLocalPatch, onSetPinned, onToggleInProgress, onToggleTimer, onToggleWaiting, onUncomplete, onUpdate } = live.current;
          const t = row.original;
          const done = isDone(t, completingIds);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`More actions for ${t.title}`}>
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52"
                // "Add a step" / "Add an update" open an input that autofocuses; without
                // this Radix hands focus back to the ⋯ button and steals it.
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuItem className="text-xs" disabled={done} onSelect={() => onComplete(t.id, { repeat: true })}>
                  <RepeatIcon className="size-3.5" />
                  Done &amp; repeat tomorrow
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs" disabled={done}>
                    <CalendarClockIcon className="size-3.5" />
                    Complete &amp; follow up
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {FOLLOW_UP_OPTIONS.map((o) => (
                      <DropdownMenuItem
                        key={o.days}
                        className="text-xs"
                        onSelect={() => onComplete(t.id, { followUpDays: o.days })}
                      >
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                {isLanePiece(t) && (
                  <DropdownMenuItem
                    className="text-xs"
                    onSelect={() => {
                      setStepFor(t.id);
                      setExpanded((e) => (e === true ? e : { ...e, [String(t.id)]: true }));
                    }}
                  >
                    <ListPlusIcon className="size-3.5" />
                    Add a step
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-xs" onSelect={() => window.setTimeout(() => setComposingId(t.id), 0)}>
                  <MessageSquarePlusIcon className="size-3.5" />
                  {t.last_update ? "Post an update" : "Add an update"}
                </DropdownMenuItem>
                {t.pinned_hidden_at && (
                  <DropdownMenuItem className="text-xs" onSelect={() => onSetPinned(t.id, true)}>
                    <PinIcon className="size-3.5" />
                    Show in pinned window
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-xs" onSelect={() => duplicateTask(t)}>
                  <CopyIcon className="size-3.5" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="text-xs" onSelect={() => onDelete(t.id)}>
                  <TrashIcon className="size-3.5" />
                  Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // Stable on purpose: if the column defs changed every second (nowTick), TanStack
    // would remount every cell and any open dropdown would snap shut. Cells read the
    // live values from `live` instead.
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded, columnVisibility, globalFilter: search },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setSearch,
    getSubRows: (r) => r.subRows,
    getRowId: (r) => String(r.id),
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Search matches the title and the latest update; a step matching keeps its piece.
    globalFilterFn: (row, _columnId, value: string) => {
      const q = value.trim().toLowerCase();
      if (!q) return true;
      const t = row.original;
      return t.title.toLowerCase().includes(q) || (t.last_update ?? "").toLowerCase().includes(q);
    },
    getColumnCanGlobalFilter: (col) => col.id === "title",
    filterFromLeafRows: true,
    autoResetExpanded: false,
  });

  const rows = table.getRowModel().rows;
  const openCount = todos.filter((t) => !isDone(t, new Set())).length;
  const doneTodayCount = todos.filter(isDoneToday).length;
  const filtered = statusFilter !== "open" || categoryFilter !== "all" || search.trim() !== "";

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="shrink-0 border-b px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setComposerOpen((v) => !v);
              requestAnimationFrame(() => composerRef.current?.focus());
            }}
            aria-expanded={composerOpen}
            title="New task (N)"
          >
            {composerOpen ? <XIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
            Task
          </Button>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search tasks…  /"
              className="h-8 w-56 pl-8 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger size="sm" className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as TaskCategory | "none" | "all")}
          >
            <SelectTrigger size="sm" className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All categories</SelectItem>
              <SelectItem value="none" className="text-xs">No category</SelectItem>
              {TASK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {TASK_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setStatusFilter("open");
                setCategoryFilter("all");
                setSearch("");
              }}
            >
              Reset
              <XIcon className="size-3" />
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!loading && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {openCount} open · {doneTodayCount} done today
              </span>
            )}
            {!loading && <StreakChip />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Columns3Icon className="size-3.5" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {table
                  .getAllColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      className="text-xs"
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                    >
                      {{
                        status: "Status",
                        priority: "Priority",
                        category: "Category",
                        estimate: "Time",
                        due_date: "Due",
                        recurrence: "Repeats",
                        created_at: "Created",
                      }[c.id] ?? c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {composerOpen && (
          <form onSubmit={createTask} className="mt-3 flex items-center gap-2">
            <Input
              ref={composerRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setComposerOpen(false);
              }}
              placeholder="What needs doing?"
              className="h-8 max-w-md text-sm"
            />
            <Select value={String(newEstimate)} onValueChange={(v) => setNewEstimate(Number(v))}>
              <SelectTrigger size="sm" className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTIMATE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)} className="text-xs">
                    {formatEstimateLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as TaskCategory | "none")}>
              <SelectTrigger size="sm" className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">No category</SelectItem>
                {TASK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {TASK_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" className="h-8" disabled={creating || !newTitle.trim()}>
              Add
            </Button>
          </form>
        )}
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        <div className="rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "text-xs text-muted-foreground",
                        h.column.id === "done" && "w-9 pl-3",
                        h.column.id === "title" && "w-full",
                        h.column.id === "actions" && "w-10",
                      )}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={table.getVisibleLeafColumns().length}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={table.getVisibleLeafColumns().length}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    {filtered ? "No tasks match these filters." : "Nothing left for today."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const t = row.original;
                  const leaving = completingIds.has(t.id) && statusFilter !== "done" && statusFilter !== "all";
                  return (
                    <TableRow
                      key={row.id}
                      data-state={t.in_progress && !isDone(t, completingIds) ? "selected" : undefined}
                      className={cn(
                        "transition-opacity duration-500",
                        row.depth > 0 && "bg-muted/20",
                        leaving && "opacity-40",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "py-1.5 align-top",
                            cell.column.id === "done" && "pl-3 pt-2.5",
                            cell.column.id === "title" && "whitespace-normal",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Press <kbd className="rounded border px-1">N</kbd> for a new task, <kbd className="rounded border px-1">/</kbd> to search.
        </p>
      </div>
    </div>
  );
}
