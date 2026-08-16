"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Code2Icon,
  FilmIcon,
  HandshakeIcon,
  LayersIcon,
  PlusIcon,
  TargetIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LANE_CATEGORIES, TASK_CATEGORY_LABELS, type LaneCategory } from "@/lib/task-categories";
import { isDoneToday, isLanePiece, type Todo } from "@/lib/todo";
import { cn } from "@/lib/utils";

// Child tasks are created from a one-line composer, so there's nowhere to pick an
// estimate — everything the canvas does with timers needs one, so give it a sane
// default. It's editable afterwards from the card's context menu on the canvas.
const CHILD_DEFAULT_ESTIMATE = 30;

// Per-lane identity. The accent is only ever the header icon and the piece's left
// rule — enough to tell the lanes apart at a glance without four competing colours.
const LANE_META: Record<LaneCategory, { icon: LucideIcon; accent: string; rule: string; placeholder: string }> = {
  content: {
    icon: FilmIcon,
    accent: "text-amber-500",
    rule: "border-l-amber-500/50",
    placeholder: "e.g. YouTube: building an eve agent",
  },
  code: {
    icon: Code2Icon,
    accent: "text-indigo-500",
    rule: "border-l-indigo-500/50",
    placeholder: "e.g. Ship the pipeline lanes",
  },
  community: {
    icon: UsersIcon,
    accent: "text-rose-500",
    rule: "border-l-rose-500/50",
    placeholder: "e.g. Toronto AI meetup in October",
  },
  sales: {
    icon: HandshakeIcon,
    accent: "text-green-600 dark:text-green-500",
    rule: "border-l-green-600/50",
    placeholder: "e.g. GlassDollar pilot",
  },
};

export interface PipelineLanesProps {
  /** Every visible task — the panel picks out its own pieces and their children. */
  todos: Todo[];
  /** Owned by the canvas, which also shifts its own toolbar out of the panel's way. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  completingIds: Set<number>;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
  onToggleInProgress: (id: number, in_progress: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Todo>) => void;
  onCreated: (todo: Todo) => void;
}

export function PipelineLanes({
  todos,
  collapsed,
  onToggleCollapsed,
  completingIds,
  onComplete,
  onUncomplete,
  onToggleInProgress,
  onDelete,
  onUpdate,
  onCreated,
}: PipelineLanesProps) {
  // Lanes and pieces both start open — a collapsed everything is just a list of
  // headings, and the checklists are the whole point of the panel.
  const [closedLanes, setClosedLanes] = useState<Set<LaneCategory>>(new Set());
  const [closedIds, setClosedIds] = useState<Set<number>>(new Set());
  // Which lane's "add a piece" input is open, and which piece's "add a task" input is.
  const [pieceComposerFor, setPieceComposerFor] = useState<LaneCategory | null>(null);
  const [newPiece, setNewPiece] = useState("");
  const [taskComposerFor, setTaskComposerFor] = useState<number | null>(null);
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const { piecesByLane, childrenOf } = useMemo(() => {
    const piecesByLane = new Map<LaneCategory, Todo[]>();
    const childrenOf = new Map<number, Todo[]>();
    for (const t of todos) {
      if (t.parent_id != null) {
        const list = childrenOf.get(t.parent_id);
        if (list) list.push(t);
        else childrenOf.set(t.parent_id, [t]);
      } else if (isLanePiece(t)) {
        const lane = t.category as LaneCategory;
        const list = piecesByLane.get(lane);
        if (list) list.push(t);
        else piecesByLane.set(lane, [t]);
      }
    }
    for (const list of piecesByLane.values()) list.sort((a, b) => a.id - b.id);
    for (const list of childrenOf.values()) list.sort((a, b) => a.id - b.id);
    return { piecesByLane, childrenOf };
  }, [todos]);

  const isDone = useCallback(
    (t: Todo) => isDoneToday(t) || completingIds.has(t.id),
    [completingIds],
  );

  const create = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy) return null;
      setBusy(true);
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const todo: Todo = await res.json();
        onCreated(todo);
        return todo;
      } catch {
        toast.error("Couldn't add that.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, onCreated],
  );

  const addPiece = useCallback(
    async (e: React.FormEvent, lane: LaneCategory) => {
      e.preventDefault();
      const title = newPiece.trim();
      if (!title) return;
      const todo = await create({ title, category: lane });
      if (!todo) return;
      setNewPiece("");
      // Straight into "what does this need?" — a piece is only useful once it has
      // steps under it.
      setTaskComposerFor(todo.id);
    },
    [create, newPiece],
  );

  const addTask = useCallback(
    async (e: React.FormEvent, parentId: number) => {
      e.preventDefault();
      const title = newTask.trim();
      if (!title) return;
      const todo = await create({ title, parent_id: parentId, estimated_minutes: CHILD_DEFAULT_ESTIMATE });
      if (!todo) return;
      setNewTask("");
    },
    [create, newTask],
  );

  function startEditing(t: Todo) {
    setEditingId(t.id);
    setEditTitle(t.title);
  }

  function commitEdit(t: Todo) {
    const title = editTitle.trim();
    if (title && title !== t.title) onUpdate(t.id, { title });
    setEditingId(null);
  }

  // Titles wrap rather than truncate — a piece called "YouTube: how the goal hero
  // works" is unreadable clipped, and the panel has the vertical room.
  const titleField = (t: Todo, className: string) =>
    editingId === t.id ? (
      <Input
        autoFocus
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        onBlur={() => commitEdit(t)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditingId(null);
        }}
        className="h-6 px-1 text-[12px]"
      />
    ) : (
      <span
        role="button"
        tabIndex={0}
        title="Double-click to rename"
        onDoubleClick={() => startEditing(t)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            startEditing(t);
          }
        }}
        className={cn("block break-words hyphens-auto", className)}
      >
        {t.title}
      </span>
    );

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        title="Show the pipelines"
        className="pointer-events-auto absolute left-3 top-12 z-[6] flex items-center gap-1.5 rounded-xl border bg-card/95 px-2 py-2 shadow-lg backdrop-blur-sm hover:bg-muted"
        style={{ writingMode: "vertical-rl" }}
      >
        <LayersIcon className="size-3.5 rotate-90 text-muted-foreground" />
        <span className="text-[11px] font-medium tracking-wide">Pipelines</span>
      </button>
    );
  }

  return (
    // Pinned, not drawn on the canvas: it keeps its place while the notebook pans and
    // zooms underneath. Sits below the canvas toolbar and above Excalidraw's zoom
    // controls so neither is covered.
    <div className="pointer-events-auto absolute bottom-14 left-3 top-12 z-[6] flex w-[248px] flex-col overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
        <LayersIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">Pipelines</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Hide the pipelines"
          className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {LANE_CATEGORIES.map((lane) => {
          const meta = LANE_META[lane];
          const LaneIcon = meta.icon;
          const pieces = piecesByLane.get(lane) ?? [];
          const laneOpen = !closedLanes.has(lane);
          return (
            <section key={lane} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  setClosedLanes((prev) => {
                    const next = new Set(prev);
                    if (next.has(lane)) next.delete(lane);
                    else next.add(lane);
                    return next;
                  })
                }
                aria-expanded={laneOpen}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60"
              >
                {laneOpen ? (
                  <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
                )}
                <LaneIcon className={cn("size-3.5 shrink-0", meta.accent)} />
                <span className="text-[10.5px] font-semibold uppercase tracking-wide">
                  {TASK_CATEGORY_LABELS[lane]}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{pieces.length}</span>
              </button>

              {laneOpen && (
                <div className="px-1.5 pb-1.5">
                  {pieces.map((piece) => {
                    const kids = childrenOf.get(piece.id) ?? [];
                    const doneKids = kids.filter(isDone).length;
                    const open = !closedIds.has(piece.id);
                    const pieceDone = isDone(piece);
                    return (
                      <div key={piece.id} className="mb-0.5 rounded-lg border border-transparent hover:border-border/60">
                        <div className="group flex items-start gap-1 px-1 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              setClosedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(piece.id)) next.delete(piece.id);
                                else next.add(piece.id);
                                return next;
                              })
                            }
                            aria-label={open ? `Collapse ${piece.title}` : `Expand ${piece.title}`}
                            className="mt-px shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            {titleField(
                              piece,
                              cn(
                                "text-[12px] font-medium leading-snug",
                                pieceDone && "text-muted-foreground line-through",
                              ),
                            )}
                          </div>
                          {kids.length > 0 && (
                            <span className="mt-px shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {doneKids}/{kids.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onDelete(piece.id)}
                            aria-label={`Delete ${piece.title} and its tasks`}
                            title="Delete this piece and everything under it"
                            className="mt-px shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-priority-urgent focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <TrashIcon className="size-3" />
                          </button>
                        </div>

                        {open && (
                          <div className={cn("ml-4 border-l pl-1.5", meta.rule)}>
                            {kids.map((kid) => {
                              const done = isDone(kid);
                              return (
                                <div key={kid.id} className="group flex items-start gap-1.5 py-0.5 pl-1 pr-0.5">
                                  <Checkbox
                                    checked={done}
                                    className="mt-0.5 size-3.5 shrink-0"
                                    aria-label={done ? `Uncheck ${kid.title}` : `Check off ${kid.title}`}
                                    onCheckedChange={(checked) =>
                                      checked ? onComplete(kid.id) : onUncomplete(kid.id)
                                    }
                                  />
                                  <div className="min-w-0 flex-1">
                                    {titleField(
                                      kid,
                                      cn(
                                        "text-[11.5px] leading-snug",
                                        done && "text-muted-foreground line-through",
                                      ),
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onToggleInProgress(kid.id, !kid.in_progress)}
                                    aria-label={
                                      kid.in_progress ? `Stop working on ${kid.title}` : `Work on ${kid.title} now`
                                    }
                                    title="Working on now"
                                    className={cn(
                                      "mt-px shrink-0 rounded p-0.5 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100",
                                      kid.in_progress
                                        ? "text-primary opacity-100"
                                        : "text-muted-foreground opacity-0 hover:text-foreground",
                                    )}
                                  >
                                    <TargetIcon className="size-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDelete(kid.id)}
                                    aria-label={`Delete ${kid.title}`}
                                    className="mt-px shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-priority-urgent focus-visible:opacity-100 group-hover:opacity-100"
                                  >
                                    <TrashIcon className="size-3" />
                                  </button>
                                </div>
                              );
                            })}

                            {taskComposerFor === piece.id ? (
                              <form onSubmit={(e) => addTask(e, piece.id)} className="py-1 pl-1 pr-0.5">
                                <Input
                                  autoFocus
                                  value={newTask}
                                  onChange={(e) => setNewTask(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setTaskComposerFor(null);
                                      setNewTask("");
                                    }
                                  }}
                                  onBlur={() => {
                                    if (!newTask.trim()) setTaskComposerFor(null);
                                  }}
                                  placeholder="Add a task…"
                                  className="h-6 px-1.5 text-[11.5px]"
                                />
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewTask("");
                                  setTaskComposerFor(piece.id);
                                }}
                                className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <PlusIcon className="size-3" />
                                Add task
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {pieceComposerFor === lane ? (
                    <form onSubmit={(e) => addPiece(e, lane)} className="px-1 pt-0.5">
                      <Input
                        autoFocus
                        value={newPiece}
                        onChange={(e) => setNewPiece(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setPieceComposerFor(null);
                            setNewPiece("");
                          }
                        }}
                        onBlur={() => {
                          if (!newPiece.trim()) setPieceComposerFor(null);
                        }}
                        placeholder={meta.placeholder}
                        className="h-6 px-1.5 text-[11.5px]"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNewPiece("");
                        setPieceComposerFor(lane);
                      }}
                      className="flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <PlusIcon className="size-3" />
                      {pieces.length === 0
                        ? `Add your first ${TASK_CATEGORY_LABELS[lane].toLowerCase()} piece`
                        : "Add piece"}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
