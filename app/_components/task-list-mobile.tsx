"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CalendarClockIcon, CheckIcon, ClockIcon, PauseIcon, PlayIcon, PlusIcon, RepeatIcon, TargetIcon, XIcon } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";

import { PipelineLanes } from "@/app/_components/pipeline-lanes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_BADGE_CLASS, TASK_CATEGORY_LABELS } from "@/lib/task-categories";
import { CARD_COLOR_CLASSES } from "@/lib/task-colors";
import {
  ESTIMATE_OPTIONS,
  FOLLOW_UP_OPTIONS,
  PRIORITIES,
  formatCountdown,
  formatEstimateLabel,
  isDoneToday,
  isInLane,
  remainingSeconds,
  type Todo,
} from "@/lib/todo";
import { TaskLatestUpdate } from "@/app/_components/task-update-line";
import { cn } from "@/lib/utils";

/**
 * The Tasks screen on a phone.
 *
 * The desktop Tasks screen is an infinite Excalidraw notebook with cards pinned at
 * scene coordinates — which is exactly what a 390px-wide screen can't show: the
 * cards sit wherever they were dropped on a board several times wider than the
 * viewport, and every one of Excalidraw's own toolbars wants the same top strip our
 * controls do. So below `lg` the same tasks render as a plain vertical list instead.
 * Nothing here is positioned; the page scrolls, thumbs tap, and the freeform canvas
 * stays a desktop affordance.
 *
 * It reads from the same `todos` array and calls the same handlers as <TaskCanvas>,
 * so the two views are always looking at one set of data.
 */

const PRIORITY_DOT: Record<Todo["priority"], string> = {
  urgent: "bg-priority-urgent",
  high: "bg-priority-high",
  normal: "bg-muted-foreground/60",
  low: "bg-muted-foreground/30",
};

const PRIORITY_RANK: Record<Todo["priority"], number> = { urgent: 3, high: 2, normal: 1, low: 0 };

export interface TaskListMobileProps {
  todos: Todo[];
  loading: boolean;
  /** Ticks once a second so running countdowns re-render. */
  nowTick: number;
  completingIds: Set<number>;
  onComplete: (id: number, opts?: { repeat?: boolean; followUpDays?: number }) => void;
  onUncomplete: (id: number) => void;
  onToggleTimer: (todo: Todo) => void;
  onToggleInProgress: (id: number, in_progress: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Todo>) => void;
  onCreated: (todo: Todo) => void;
}

export function TaskListMobile({
  todos,
  loading,
  nowTick,
  completingIds,
  onComplete,
  onUncomplete,
  onToggleTimer,
  onToggleInProgress,
  onDelete,
  onUpdate,
  onCreated,
}: TaskListMobileProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newEstimate, setNewEstimate] = useState<number>(30);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const composerRef = useRef<HTMLInputElement>(null);

  // The same set the canvas draws as cards: everything that isn't a pipeline piece or
  // one of its children, minus what's already been checked off today (a task that's
  // mid-tick stays until its animation finishes, so you see it leave).
  const listTodos = useMemo(() => {
    const live = todos.filter(
      (t) => !isInLane(t) && (!(t.completed || isDoneToday(t)) || completingIds.has(t.id)),
    );
    // Working-on-now floats to the top; below that it's the manual queue number, then
    // priority, then oldest first — the same ordering the dashboard's list uses.
    return live.sort((a, b) => {
      const liveA = a.in_progress ? 1 : 0;
      const liveB = b.in_progress ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;
      const qa = typeof a.task_number === "number" ? a.task_number : Infinity;
      const qb = typeof b.task_number === "number" ? b.task_number : Infinity;
      if (qa !== qb) return qa - qb;
      const pa = PRIORITY_RANK[a.priority] ?? 1;
      const pb = PRIORITY_RANK[b.priority] ?? 1;
      if (pa !== pb) return pb - pa;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [todos, completingIds]);

  const doneToday = useMemo(() => todos.filter(isDoneToday).length, [todos]);

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
          // No canvas_x/canvas_y: a task added from the phone has never been placed, so
          // the canvas drops it into its inbox column next time it's opened on desktop.
          body: JSON.stringify({ title, estimated_minutes: newEstimate }),
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
    [creating, newEstimate, newTitle, onCreated],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Sticky so "add a task" and today's count stay reachable however far down the
          list you've scrolled. */}
      <div className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 px-3"
            onClick={() => setComposerOpen((v) => !v)}
            aria-expanded={composerOpen}
          >
            {composerOpen ? <XIcon className="size-4" /> : <PlusIcon className="size-4" />}
            Task
          </Button>
          {!loading && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <CheckIcon className="size-3.5" />
              {doneToday}/{todos.length} today
            </span>
          )}
        </div>

        {composerOpen && (
          <form onSubmit={createTask} className="mt-2.5">
            <Input
              ref={composerRef}
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setComposerOpen(false);
              }}
              placeholder="Add a task…"
              className="h-10 text-base"
            />
            <div className="mt-2 flex items-center gap-1.5">
              {ESTIMATE_OPTIONS.map((m) => (
                <Badge
                  key={m}
                  asChild
                  variant={newEstimate === m ? "default" : "outline"}
                  className="h-7 cursor-pointer px-2.5 text-xs"
                >
                  <button type="button" onClick={() => setNewEstimate(m)}>
                    {formatEstimateLabel(m)}
                  </button>
                </Badge>
              ))}
              <Button type="submit" size="sm" className="ml-auto h-7 px-3" disabled={creating}>
                Add
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : listTodos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing left for today.
            </p>
          ) : (
            <ul className="space-y-2">
              {listTodos.map((todo) => {
                const done = isDoneToday(todo) || completingIds.has(todo.id);
                const running = Boolean(todo.timer_started_at);
                const remaining = remainingSeconds(todo, nowTick);
                const overdue = remaining !== null && remaining < 0;
                return (
                  <li
                    key={todo.id}
                    className={cn(
                      "rounded-xl border bg-card px-3 py-2.5 transition-[opacity,transform] duration-500",
                      todo.color && !done && CARD_COLOR_CLASSES[todo.color],
                      todo.in_progress && !done && "ring-1 ring-primary/25",
                      todo.in_progress && !done && !todo.color && "border-primary/60",
                      todo.waiting && !todo.in_progress && !done && !todo.color && "border-slate-400/70 dark:border-slate-400/50",
                      done && "scale-95 opacity-0",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* A generous tap target around a small box: the checkbox is the
                          one control you reach for most on a phone. */}
                      {/* Long-pressing the box offers the other ending: done for
                          today, back on the list tomorrow. */}
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <label className="tap-target -m-1.5 shrink-0 cursor-pointer p-1.5 pt-2">
                            <Checkbox
                              checked={done}
                              className="size-5"
                              aria-label={done ? `Uncheck ${todo.title}` : `Check off ${todo.title}`}
                              onCheckedChange={(checked) =>
                                checked ? onComplete(todo.id) : onUncomplete(todo.id)
                              }
                            />
                          </label>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          <ContextMenuItem onSelect={() => onComplete(todo.id)} disabled={done}>
                            <CheckIcon className="size-3.5" />
                            Complete
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => onComplete(todo.id, { repeat: true })} disabled={done}>
                            <RepeatIcon className="size-3.5" />
                            Done &amp; repeat tomorrow
                          </ContextMenuItem>
                          {/* Done for now, but it needs a second pass: cross it off and queue an
                              identical task for the day the follow-up is due. */}
                          <ContextMenuSub>
                            <ContextMenuSubTrigger disabled={done}>
                              <CalendarClockIcon className="size-3.5" />
                              Complete &amp; follow up
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                              {FOLLOW_UP_OPTIONS.map((o) => (
                                <ContextMenuItem key={o.days} onSelect={() => onComplete(todo.id, { followUpDays: o.days })} disabled={done}>
                                  {o.label}
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                        </ContextMenuContent>
                      </ContextMenu>

                      <div className="min-w-0 flex-1">
                        {editingId === todo.id ? (
                          <Input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => {
                              const title = editTitle.trim();
                              if (title && title !== todo.title) onUpdate(todo.id, { title });
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-9 text-base"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(todo.id);
                              setEditTitle(todo.title);
                            }}
                            className={cn(
                              "block w-full break-words text-left text-[15px] font-medium leading-snug",
                              done && "text-muted-foreground line-through",
                            )}
                          >
                            {todo.title}
                          </button>
                        )}

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            title={`Priority: ${todo.priority} — tap to change`}
                            aria-label={`Priority ${todo.priority}, tap to change`}
                            onClick={() =>
                              onUpdate(todo.id, {
                                priority:
                                  PRIORITIES[(PRIORITIES.indexOf(todo.priority) + 1) % PRIORITIES.length],
                              })
                            }
                            className={cn("tap-target size-2.5 rounded-full", PRIORITY_DOT[todo.priority])}
                          />
                          {todo.recurrence && todo.recurrence !== "none" && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <RepeatIcon className="size-3" />
                              {todo.recurrence}
                            </span>
                          )}
                          {todo.category && (
                            <Badge
                              variant="outline"
                              className={cn("h-5 px-1.5 text-xs", CATEGORY_BADGE_CLASS[todo.category])}
                            >
                              {TASK_CATEGORY_LABELS[todo.category]}
                            </Badge>
                          )}
                          {todo.estimated_minutes ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 text-xs tabular-nums",
                                running
                                  ? overdue
                                    ? "text-priority-urgent"
                                    : "text-primary"
                                  : "text-muted-foreground",
                              )}
                            >
                              <ClockIcon className="size-3" />
                              {remaining !== null && (running || (todo.time_spent_seconds ?? 0) > 0)
                                ? `${overdue ? "-" : ""}${formatCountdown(Math.abs(remaining))}`
                                : formatEstimateLabel(todo.estimated_minutes)}
                            </span>
                          ) : null}
                        </div>

                        {/* The newest note on this task — an agent's hand-off over MCP,
                            or one Berto posted from the board. */}
                        <TaskLatestUpdate todo={todo} className="mt-1.5 text-xs" />
                      </div>

                      {/* Two controls only. The canvas card's right-click menu (colour,
                          category, recurrence, duplicate, delete) has no touch
                          equivalent and isn't what a phone is for — this view is for
                          checking things off and starting the clock. */}
                      {!done && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onToggleInProgress(todo.id, !todo.in_progress)}
                            aria-label={
                              todo.in_progress
                                ? `Stop working on ${todo.title}`
                                : `Work on ${todo.title} now`
                            }
                            title="Working on now"
                            className={cn(
                              "rounded-lg p-2",
                              todo.in_progress ? "text-primary" : "text-muted-foreground",
                            )}
                          >
                            <TargetIcon className="size-4" />
                          </button>
                          {todo.estimated_minutes ? (
                            <button
                              type="button"
                              onClick={() => onToggleTimer(todo)}
                              aria-label={running ? `Pause the timer on ${todo.title}` : `Start a timer on ${todo.title}`}
                              title={running ? "Pause the timer" : "Start the timer"}
                              className={cn(
                                "rounded-lg p-2",
                                running ? "text-primary" : "text-muted-foreground",
                              )}
                            >
                              {running ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* The pipelines sit below the list rather than floating over it: on a phone
              there's no canvas for them to float over, and they're the second thing you
              look at, not the first. */}
          <div className="mt-5">
            <PipelineLanes
              inline
              todos={todos}
              collapsed={false}
              onToggleCollapsed={() => {}}
              completingIds={completingIds}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onToggleInProgress={onToggleInProgress}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onCreated={onCreated}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
