"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, PinOffIcon, PlayIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  in_progress: boolean;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  created_at: string;
  completed_at?: string | null;
  timer_started_at?: string | null;
  time_spent_seconds?: number;
}

const PRIORITY_RANK: Record<Todo["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function priorityColor(p: string) {
  if (p === "urgent") return "text-priority-urgent";
  if (p === "high") return "text-priority-high";
  if (p === "low") return "text-muted-foreground";
  return "text-foreground";
}

function isToday(iso: string | null | undefined) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isOpen(t: Todo) {
  // Recurring tasks completed today keep completed=false but get completed_at set —
  // treat those as done for the day so the next thing takes their slot.
  return !t.completed && !isToday(t.completed_at ?? null);
}

function formatElapsed(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatTracked(totalSeconds: number) {
  const m = Math.round(totalSeconds / 60);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Compact always-on-top view for pin mode: the (up to three) tasks you're working
 *  on now, each with its own timer — all three can run at once. */
export function PinView({ onUnpin }: { onUnpin: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch("/api/todos?limit=200");
      if (!res.ok) return;
      setTodos(await res.json());
      setLoaded(true);
    } catch {
      // keep whatever we have
    }
  }, []);

  useEffect(() => {
    fetchTodos();
    const poll = setInterval(fetchTodos, 60_000);
    window.addEventListener("focus", fetchTodos);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", fetchTodos);
    };
  }, [fetchTodos]);

  const anyRunning = todos.some((t) => t.timer_started_at);
  useEffect(() => {
    if (!anyRunning) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [anyRunning]);

  const top3 = useMemo(() => {
    return todos
      .filter(isOpen)
      .sort((a, b) => {
        const running = Number(Boolean(b.timer_started_at)) - Number(Boolean(a.timer_started_at));
        if (running) return running;
        const inProgress = Number(b.in_progress) - Number(a.in_progress);
        if (inProgress) return inProgress;
        const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (rank) return rank;
        if (a.due_date !== b.due_date) {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date < b.due_date ? -1 : 1;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 3);
  }, [todos]);

  const allRunning = top3.length > 0 && top3.every((t) => t.timer_started_at);

  const handleToggleTimer = async (todo: Todo) => {
    const action = todo.timer_started_at ? "stop" : "start";
    // Timers run concurrently, so only the toggled task changes.
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
    } catch {
      // fall through to refetch
    }
    fetchTodos();
  };

  // Run (or stop) every task in the list at once — the whole point of the pinned
  // window is tracking the three things you're working on together.
  const handleToggleAll = async () => {
    const action = allRunning ? "stop" : "start";
    const targets = top3.filter((t) => Boolean(t.timer_started_at) === allRunning);
    if (targets.length === 0) return;
    const startedAt = new Date().toISOString();
    const ids = new Set(targets.map((t) => t.id));
    setTodos((ts) =>
      ts.map((t) =>
        ids.has(t.id)
          ? {
              ...t,
              timer_started_at: action === "start" ? startedAt : null,
              in_progress: action === "start" ? true : t.in_progress,
            }
          : t,
      ),
    );
    await Promise.all(
      targets.map((t) =>
        fetch(`/api/todos/${t.id}/timer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }).catch(() => undefined),
      ),
    );
    fetchTodos();
  };

  const handleComplete = async (todo: Todo) => {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, completed: true, completed_at: new Date().toISOString() } : t)));
    try {
      await fetch(`/api/todos/${todo.id}/complete`, { method: "POST" });
    } catch {
      // fall through to refetch
    }
    fetchTodos();
  };

  // The window's own title bar already says "Cael", so the header just carries the
  // date and the run-everything control.
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 shrink-0">
        <span className="text-[11px] text-muted-foreground truncate">{today}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {top3.length > 0 && (
            <button
              onClick={handleToggleAll}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={allRunning ? "Stop all timers" : "Start all timers"}
              title={allRunning ? "Stop all" : "Start all"}
            >
              {allRunning ? <SquareIcon className="size-2.5" /> : <PlayIcon className="size-2.5" />}
              {allRunning ? "Stop all" : "Start all"}
            </button>
          )}
          <button
            onClick={onUnpin}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Unpin window"
            title="Unpin"
          >
            <PinOffIcon className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {loaded && top3.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">All clear — nothing to focus on.</p>
        )}
        {top3.map((todo) => {
          const running = Boolean(todo.timer_started_at);
          const banked = todo.time_spent_seconds ?? 0;
          const elapsed = running
            ? banked + Math.max(0, (now - new Date(todo.timer_started_at as string).getTime()) / 1000)
            : banked;
          return (
            <div
              key={todo.id}
              className={cn(
                "rounded-lg border border-border px-2.5 py-2",
                running && "border-l-2 border-l-primary bg-primary/5",
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => handleComplete(todo)}
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-transparent transition-colors hover:border-primary hover:text-primary"
                  aria-label={`Complete ${todo.title}`}
                >
                  <CheckIcon className="size-3" />
                </button>
                <p className={cn("min-w-0 flex-1 text-[13px] leading-snug", priorityColor(todo.priority))}>{todo.title}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-6">
                <button
                  onClick={() => handleToggleTimer(todo)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                    running
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  {running ? <SquareIcon className="size-2.5" /> : <PlayIcon className="size-2.5" />}
                  {running ? "Stop" : "Start"}
                </button>
                {running ? (
                  <span className="font-mono text-[11px] tabular-nums text-primary">{formatElapsed(elapsed)}</span>
                ) : banked > 0 ? (
                  <span className="text-[11px] text-muted-foreground">{formatTracked(banked)} tracked</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
