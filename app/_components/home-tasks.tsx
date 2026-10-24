"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useStreak } from "@/app/_components/streak-provider";
import { isLaneCategory } from "@/lib/task-categories";
import type { Todo } from "@/lib/todo";
import { cn } from "@/lib/utils";

// Home shows priority as P0/P1/P2 (Berto, 2026-10-24). The four stored levels stay;
// normal and low both read as P2, and picking P2 here sets normal.
const P_LEVELS = [
  { label: "P0", value: "urgent", dot: "bg-priority-urgent" },
  { label: "P1", value: "high", dot: "bg-priority-high" },
  { label: "P2", value: "normal", dot: "bg-muted-foreground/40" },
] as const satisfies readonly { label: string; value: Todo["priority"]; dot: string }[];

function pLevel(priority: Todo["priority"]) {
  return P_LEVELS.find((l) => l.value === priority) ?? P_LEVELS[2];
}

function dayKey(offset = 0) {
  const n = new Date();
  n.setDate(n.getDate() + offset);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function formatDue(due: string) {
  if (due === dayKey()) return "Today";
  if (due === dayKey(1)) return "Tomorrow";
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Check · Task · Status · Due · Priority
const ROW = "grid grid-cols-[1rem_minmax(0,1fr)_5.5rem_4.5rem_2.75rem] items-start gap-x-2.5";

type Status = "todo" | "in_progress" | "done";

const STATUS_LABEL: Record<Status, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

// Waiting is a fourth state agents can set (stop_task move_to: "waiting"); it shows
// on the pill but isn't offered in the menu, which keeps to the three Berto asked for.
function pill(t: Todo) {
  if (t.in_progress) return { label: "In progress", className: "text-emerald-600 dark:text-emerald-400" };
  if (t.waiting) return { label: "Waiting", className: "text-amber-600 dark:text-amber-400" };
  return { label: "To do", className: "text-muted-foreground" };
}

/**
 * Open to-dos on the home screen — the right-hand column on desktop, the top of
 * the page on a phone (Berto, 2026-10-22: "tasks are really important in cael").
 * Working-now first, then waiting, then by priority (the API's order). Tick to
 * finish, type to add, click Due or Priority to change them; everything else
 * lives on /tasks. Each row's status pill
 * (To do / In progress / Done) is the same state agents move over MCP
 * (start_task, stop_task, complete_task), so the list refetches on focus and
 * every 30s to pick their changes up.
 */
export function HomeTasks({ className }: { className?: string }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [draft, setDraft] = useState("");
  const { award } = useStreak();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/todos?limit=50");
      // Pipeline pieces (Content, Code…) are containers, not work to tick off.
      const rows = res.ok ? ((await res.json()) as Todo[]) : [];
      setTodos(rows.filter((t) => t.parent_id != null || !isLaneCategory(t.category ?? null)));
    } catch {
      setTodos([]);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [load]);

  const complete = async (todo: Todo) => {
    const prev = todos;
    setTodos((ts) => ts?.filter((t) => t.id !== todo.id) ?? ts);
    award(todo);
    try {
      const res = await fetch(`/api/todos/${todo.id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setTodos(prev);
      toast.error("Couldn't check that off.");
    }
  };

  const setStatus = async (todo: Todo, status: Status) => {
    if (status === "done") return complete(todo);
    const patch = { in_progress: status === "in_progress", waiting: false };
    const prev = todos;
    setTodos((ts) => ts?.map((t) => (t.id === todo.id ? { ...t, ...patch } : t)) ?? ts);
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // 409 = the working-now limit is full; the body says what the limit is.
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error);
    } catch (e) {
      setTodos(prev);
      toast.error(e instanceof Error && e.message ? e.message : "Couldn't change that.");
    }
  };

  const update = async (todo: Todo, patch: Partial<Pick<Todo, "due_date" | "priority">>) => {
    const prev = todos;
    setTodos((ts) => ts?.map((t) => (t.id === todo.id ? { ...t, ...patch } : t)) ?? ts);
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodos(prev);
      toast.error("Couldn't save that.");
    }
  };

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Every task needs an estimate; 30 min is the quick-add default, changeable on /tasks.
        body: JSON.stringify({ title, estimated_minutes: 30 }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as Todo;
      setTodos((ts) => [...(ts ?? []), row]);
    } catch {
      setDraft(title);
      toast.error("Couldn't add that.");
    }
  };

  return (
    <section id="home-tasks" className={cn("flex h-full flex-col", className)}>
      <Link
        href="/tasks"
        className="group mb-3 inline-flex items-center gap-1.5 self-start text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
      >
        Tasks{todos && todos.length > 0 ? ` · ${todos.length}` : ""}
        <ChevronRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <Card className="min-h-0 flex-1 gap-0 rounded-xl px-4 py-3 shadow-none">
        {todos === null ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : (
          <>
            <div className={cn(ROW, "px-1 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70")}>
              <span />
              <span>Task</span>
              <span>Status</span>
              <span>Due</span>
              <span>Priority</span>
            </div>
            {/* On the desktop grid the list fills the block; stacked on a phone it caps at 60vh. */}
            <ul className="-mx-1 max-h-[60vh] min-h-0 flex-1 overflow-y-auto [.react-grid-item_&]:max-h-none">
              {todos.length === 0 && <li className="px-1 py-2 text-sm text-muted-foreground">Nothing open.</li>}
              {todos.map((t) => {
                const due = t.due_date?.slice(0, 10) ?? "";
                const overdue = Boolean(due) && due < dayKey();
                const level = pLevel(t.priority);
                return (
                  <li key={t.id} className={cn(ROW, "group rounded-md px-1 py-1.5 hover:bg-muted/50")}>
                    <button
                      type="button"
                      onClick={() => complete(t)}
                      aria-label={`Complete ${t.title}`}
                      className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 transition-colors hover:border-foreground hover:bg-foreground hover:text-background"
                    >
                      <CheckIcon className="size-2.5 opacity-0 group-hover:opacity-100" />
                    </button>
                    <span className="min-w-0 text-sm leading-snug">{t.title}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Status of ${t.title}: ${pill(t).label}`}
                        className={cn(
                          "-mx-1 mt-0.5 justify-self-start rounded px-1 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap transition-colors hover:bg-muted",
                          pill(t).className,
                        )}
                      >
                        {pill(t).label}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                          <DropdownMenuItem key={s} onSelect={() => setStatus(t, s)}>
                            {STATUS_LABEL[s]}
                            {pill(t).label === STATUS_LABEL[s] && <CheckIcon className="ml-auto size-3.5" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <label className="relative -mx-1 inline-flex h-5 cursor-pointer items-center justify-self-start rounded px-1 text-xs hover:bg-muted">
                      <span className={cn("tabular-nums", overdue ? "text-priority-urgent" : due ? "text-muted-foreground" : "text-muted-foreground/40")}>
                        {due ? formatDue(due) : "—"}
                      </span>
                      <input
                        type="date"
                        aria-label={`Due date for ${t.title}`}
                        value={due}
                        onChange={(e) => update(t, { due_date: e.target.value || null })}
                        className="absolute inset-0 cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                    </label>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Priority for ${t.title}: ${level.label}`}
                        className="-mx-1 inline-flex h-5 items-center gap-1.5 justify-self-start rounded px-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <span className={cn("size-1.5 rounded-full", level.dot)} />
                        {level.label}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-24">
                        <DropdownMenuRadioGroup
                          value={level.value}
                          onValueChange={(v) => update(t, { priority: v as Todo["priority"] })}
                        >
                          {P_LEVELS.map((l) => (
                            <DropdownMenuRadioItem key={l.value} value={l.value} className="text-xs">
                              <span className={cn("mr-1 size-1.5 rounded-full", l.dot)} />
                              {l.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-1 flex items-center gap-2.5 border-t pt-2"
        >
          <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </form>
      </Card>
    </section>
  );
}
