"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BotIcon, CalendarClockIcon, CheckIcon, CornerUpRightIcon, CrosshairIcon, EyeOffIcon, MessageSquareIcon, PinOffIcon, PlayIcon, PlusIcon, RepeatIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { cyclePinCorner, isDesktopApp, setPinWindowRows } from "@/lib/desktop";
import { WORKING_LIMIT_MAX } from "@/lib/working-now";
import { estimateProgress, formatCountdown, FOLLOW_UP_OPTIONS, isFutureDated, remainingSeconds, type Todo } from "@/lib/todo";

/** How many tasks the pinned window tracks at once — each gets its own timer. This
 *  is Berto's focus dial: five on a normal day, 1 when one thing matters and
 *  everything else can wait. It's the same number the whole app caps "working on
 *  now" with (lib/working-now.ts), so narrowing the window narrows the board. */
const PINNED_LIMITS = [1, 2, 3, 4, 5] as const;

/** Quick adds from the pinned window skip the estimate picker — every task needs one,
 *  so they get the default half-hour and can be re-estimated on the canvas later. */
const QUICK_ADD_ESTIMATE = 30;

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
  // treat those as done for the day so the next thing takes their slot. A task dated
  // for a later day (a follow-up, most often) stays out of the window until its day.
  return !t.completed && !isToday(t.completed_at ?? null) && !isFutureDated(t);
}

function formatTracked(totalSeconds: number) {
  const m = Math.round(totalSeconds / 60);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Compact always-on-top view for pin mode: the tasks you're working on now (up to
 *  the focus limit, 1–5), each with its own timer — all of them can run at once. */
export function PinView({ onUnpin }: { onUnpin: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  // The last task added from here, kept for a few seconds so the window can say
  // something if it didn't make the cut — otherwise it looks like nothing happened.
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());
  // How many tasks to hold at once. Starts at the ceiling so the window renders a
  // full list on first paint, then settles to whatever's saved.
  const [limit, setLimit] = useState<number>(WORKING_LIMIT_MAX);
  // Only the desktop shell can move the window, and it isn't known during SSR.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktopApp()), []);

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

  const fetchLimit = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/working-limit");
      if (!res.ok) return;
      const { limit: saved } = await res.json();
      if (typeof saved === "number") setLimit(saved);
    } catch {
      // keep the ceiling
    }
  }, []);

  // Changing the limit is a one-liner, but it has to stick server-side: the board,
  // the API and the agent all read the same number, so a local-only change would
  // let something else start a sixth task behind Berto's back.
  const saveLimit = async (next: number) => {
    const previous = limit;
    setLimit(next);
    try {
      const res = await fetch("/api/settings/working-limit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: next }),
      });
      if (!res.ok) throw new Error("failed");
      const { limit: saved } = await res.json();
      if (typeof saved === "number") setLimit(saved);
    } catch {
      setLimit(previous);
      toast.error("Couldn't save that limit.");
    }
  };

  useEffect(() => {
    fetchTodos();
    fetchLimit();
    const poll = setInterval(fetchTodos, 60_000);
    window.addEventListener("focus", fetchTodos);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", fetchTodos);
    };
  }, [fetchTodos, fetchLimit]);

  const anyRunning = todos.some((t) => t.timer_started_at);
  useEffect(() => {
    if (!anyRunning) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [anyRunning]);

  const topTasks = useMemo(() => {
    return todos
      // Tasks Berto has taken off the window stay ordinary tasks on the board —
      // they just don't get featured here until he puts one back or starts it.
      .filter((t) => isOpen(t) && !t.pinned_hidden_at)
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
      .slice(0, limit);
  }, [todos, limit]);

  const allRunning = topTasks.length > 0 && topTasks.every((t) => t.timer_started_at);

  // Keep the native window the height of what it's actually showing: dropping the
  // limit to 1 shrinks the strip rather than leaving four empty rows below.
  useEffect(() => {
    if (!desktop) return;
    setPinWindowRows(limit);
  }, [desktop, limit]);

  // The window only shows as many as the limit allows, so a fresh task can land
  // behind today's work.
  const addedOffscreen = lastAddedId !== null && !topTasks.some((t) => t.id === lastAddedId);
  useEffect(() => {
    if (lastAddedId === null) return;
    const t = setTimeout(() => setLastAddedId(null), 4000);
    return () => clearTimeout(t);
  }, [lastAddedId]);

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
  // window is tracking the handful of things you're working on together.
  const handleToggleAll = async () => {
    const action = allRunning ? "stop" : "start";
    const targets = topTasks.filter((t) => Boolean(t.timer_started_at) === allRunning);
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

  // Adding a task without leaving the pinned window — the whole point of the window is
  // that you don't have to break focus, and unpinning to jot something down does.
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No canvas_x/canvas_y: it's never been placed, so the canvas will drop it into
        // its inbox column the next time the board is opened.
        body: JSON.stringify({ title, estimated_minutes: QUICK_ADD_ESTIMATE }),
      });
      if (!res.ok) throw new Error();
      const created: Todo = await res.json();
      setTodos((ts) => (ts.some((t) => t.id === created.id) ? ts : [...ts, created]));
      setLastAddedId(created.id);
      setNewTitle("");
      composerRef.current?.focus();
    } catch {
      toast.error("Couldn't add task.");
    } finally {
      setCreating(false);
    }
  };

  // repeat = cross it off *and* put the same task back on tomorrow's list.
  // followUpDays does the same thing further out — done for now, needs a second pass.
  const handleComplete = async (todo: Todo, opts: { repeat?: boolean; followUpDays?: number } = {}) => {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, completed: true, completed_at: new Date().toISOString() } : t)));
    try {
      await fetch(`/api/todos/${todo.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repeat: Boolean(opts.repeat), follow_up_days: opts.followUpDays ?? null }),
      });
    } catch {
      // fall through to refetch
    }
    fetchTodos();
  };

  // "Remove from pinned": the task stops being featured here, and the window holds
  // one *fewer* thing rather than pulling the next task up — taking something off
  // the list is a decision to carry less, not a request for a replacement. So the
  // focus dial comes down by one with it (never below 1, the window's floor), which
  // also shrinks the native window. Bump the dial back up to take on another.
  //
  // Nothing else about the task changes — same lane, same priority, still on the
  // board — beyond giving up its working-now slot and stopping its timer, which are
  // the two things this window is for. Starting it again brings it back.
  const handleRemoveFromPinned = async (todo: Todo) => {
    const prev = todos;
    setTodos((ts) =>
      ts.map((t) =>
        t.id === todo.id
          ? { ...t, pinned_hidden_at: new Date().toISOString(), in_progress: false, timer_started_at: null }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/todos/${todo.id}/pinned`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: false }),
      });
      if (!res.ok) throw new Error("failed");
      // One fewer row, so one fewer thing in flight. At 1 there's nothing to give
      // up — the window always holds at least one task.
      const narrowed = Math.max(1, limit - 1);
      if (narrowed !== limit) await saveLimit(narrowed);
      toast.success(`"${todo.title}" is off the pinned window.`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await fetch(`/api/todos/${todo.id}/pinned`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pinned: true }),
            }).catch(() => {});
            // Undo puts the row back, so the slot it took comes back too.
            if (narrowed !== limit) await saveLimit(limit);
            fetchTodos();
          },
        },
      });
    } catch {
      setTodos(prev);
      toast.error("Couldn't remove it from the pinned window.");
    }
    fetchTodos();
  };

  // The window's own title bar already says "Cael", so the header just carries the
  // date and the run-everything control.
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 shrink-0">
        <span className="text-xs text-muted-foreground truncate">{today}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* The focus dial. Most days it sits at 5; on a day where one thing
              matters, drop it to 1 and the window — and the whole board — holds
              exactly that one task. Lowering it never stops what's already
              running; it just refuses anything new until you're back under. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Working on ${limit} at a time — change`}
                title="How many things to work on at once"
              >
                <CrosshairIcon className="size-3" />
                {limit}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel className="text-xs">Work on at once</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(limit)} onValueChange={(v) => saveLimit(Number(v))}>
                {PINNED_LIMITS.map((n) => (
                  <DropdownMenuRadioItem key={n} value={String(n)} className="text-xs">
                    {n === 1 ? "1 — just this" : n === WORKING_LIMIT_MAX ? `${n} — full plate` : n}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {topTasks.length > 0 && (
            <button
              onClick={handleToggleAll}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={allRunning ? "Stop all timers" : "Start all timers"}
              title={allRunning ? "Stop all" : "Start all"}
            >
              {allRunning ? <SquareIcon className="size-3" /> : <PlayIcon className="size-3" />}
              {allRunning ? "Stop all" : "Start all"}
            </button>
          )}
          {desktop && (
            <button
              onClick={() => cyclePinCorner()}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Move to the next top corner"
              title="Move to the next top corner"
            >
              <CornerUpRightIcon className="size-3.5" />
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

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-1">
        {loaded && topTasks.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">All clear — nothing to focus on.</p>
        )}
        {topTasks.map((todo) => {
          const running = Boolean(todo.timer_started_at);
          const banked = todo.time_spent_seconds ?? 0;
          // Estimated tasks count down to zero, then keep counting past it as a
          // negative — the estimate is the point of reference, not the time burned.
          const remaining = remainingSeconds(todo, now);
          const overdue = remaining !== null && remaining < 0;
          const progress = estimateProgress(todo, now);
          const clock =
            remaining !== null
              ? `${overdue ? "-" : ""}${formatCountdown(Math.abs(remaining))}`
              : running
                ? formatCountdown(banked + Math.max(0, (now - new Date(todo.timer_started_at as string).getTime()) / 1000))
                : banked > 0
                  ? formatTracked(banked)
                  : null;
          return (
            // One line per task: done, title, clock, run/stop. Nothing wraps to a
            // second row, so the whole list fits in a window barely taller than a toolbar.
            // Right-clicking anywhere on the row (long-press on touch) offers the other
            // endings: done but repeat tomorrow, or done now with a follow-up queued for
            // a later day. A menu keeps the row one line wide — no extra buttons to fit in.
            <ContextMenu key={todo.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border px-2 py-1.5",
                    running && "border-l-2 border-l-primary bg-primary/5",
                  )}
                >
                  <button
                    onClick={() => handleComplete(todo)}
                    className={cn(
                      "relative flex size-6 shrink-0 items-center justify-center rounded-full text-transparent transition-colors hover:text-primary",
                      // Without an estimate there's nothing to fill, so keep the plain circle.
                      progress === null && "border border-border hover:border-primary",
                    )}
                    aria-label={`Complete ${todo.title}`}
                    title={
                      progress === null
                        ? "Complete — right-click for more"
                        : `Complete — ${Math.round(progress * 100)}% of the estimate used. Right-click for more`
                    }
                  >
                    {progress === null ? (
                      <CheckIcon className="size-3" />
                    ) : (
                      // Magic UI's gauge: the animated arc with its little end gap. It
                      // eases to each new value, so a 1s tick reads as motion, not a jump.
                      <AnimatedCircularProgressBar
                        className="size-6 text-xs"
                        value={Math.round(progress * 100)}
                        gaugePrimaryColor={overdue ? "var(--priority-urgent)" : "var(--primary)"}
                        gaugeSecondaryColor="var(--border)"
                      >
                        <CheckIcon className="size-2.5" />
                      </AnimatedCircularProgressBar>
                    )}
                  </button>
                  <p className={cn("min-w-0 flex-1 truncate text-sm leading-tight", priorityColor(todo.priority))}>
                    {todo.title}
                  </p>
                  {/* Rows here are one line and stay one line, so an update can't get
                      its own. A mark next to the title says there's a note waiting —
                      an agent's hand-off gets the bot mark and the primary tint — and
                      hovering reads it out. The full line shows on the board. */}
                  {todo.last_update && (
                    <span
                      title={`${todo.last_update_by === "agent" ? "Update from an agent" : "Your update"}: ${todo.last_update}`}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md",
                        todo.last_update_by === "agent"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {todo.last_update_by === "agent" ? (
                        <BotIcon className="size-3" />
                      ) : (
                        <MessageSquareIcon className="size-3" />
                      )}
                    </span>
                  )}
                  {clock && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm tabular-nums",
                        overdue ? "text-priority-urgent" : running ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {clock}
                    </span>
                  )}
                  <button
                    onClick={() => handleToggleTimer(todo)}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                      running
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border text-muted-foreground hover:border-primary hover:text-primary",
                    )}
                    aria-label={running ? `Stop the timer on ${todo.title}` : `Start the timer on ${todo.title}`}
                    title={running ? "Stop" : "Start"}
                  >
                    {running ? <SquareIcon className="size-3" /> : <PlayIcon className="size-3" />}
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                <ContextMenuItem onSelect={() => handleComplete(todo)}>
                  <CheckIcon className="size-3.5" />
                  Complete
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => handleComplete(todo, { repeat: true })}>
                  <RepeatIcon className="size-3.5" />
                  Done &amp; repeat tomorrow
                </ContextMenuItem>
                {/* Done for now, but it needs a second pass: cross this one off and
                    queue an identical task for the day the follow-up is due. */}
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <CalendarClockIcon className="size-3.5" />
                    Complete &amp; follow up
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {FOLLOW_UP_OPTIONS.map((o) => (
                      <ContextMenuItem key={o.days} onSelect={() => handleComplete(todo, { followUpDays: o.days })}>
                        {o.label}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                {/* Not finished, just not one of today's featured few. It stays on
                    the board exactly as it is; the next task moves up here. */}
                <ContextMenuItem onSelect={() => handleRemoveFromPinned(todo)}>
                  <EyeOffIcon className="size-3.5" />
                  Remove from pinned
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      {/* Jotting something down shouldn't cost you the pinned window. Title only —
          the estimate defaults, priority stays normal, and everything else can be
          sorted out on the board later. */}
      <form onSubmit={handleAdd} className="flex items-center gap-1.5 border-t border-border px-2 py-1.5 shrink-0">
        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={composerRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task…"
          disabled={creating}
          aria-label="Add a task"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </form>
      {addedOffscreen && (
        <p className="border-t border-border px-2 py-1 text-xs text-muted-foreground shrink-0">
          Added — it&apos;s waiting behind {limit === 1 ? "today\u2019s one thing" : `today\u2019s ${limit}`}.
        </p>
      )}
    </div>
  );
}
