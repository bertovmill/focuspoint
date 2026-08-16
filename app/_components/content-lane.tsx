"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, FilmIcon, PlusIcon, TargetIcon, TrashIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isContentPiece, isDoneToday, type Todo } from "@/lib/todo";
import { cn } from "@/lib/utils";

// Child tasks are created from a one-line composer, so there's nowhere to pick an
// estimate — everything the canvas does with timers needs one, so give it a sane
// default. It's editable afterwards from the card's context menu on the canvas.
const CHILD_DEFAULT_ESTIMATE = 30;

export interface ContentLaneProps {
  /** Every visible task — the lane picks out its own pieces and their children. */
  todos: Todo[];
  /** Owned by the canvas, which also shifts its own toolbar out of the lane's way. */
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

export function ContentLane({
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
}: ContentLaneProps) {
  // Which pieces are open. Everything starts open — a content piece with a hidden
  // checklist is just a card, and the checklist is the whole point of the lane.
  const [closedIds, setClosedIds] = useState<Set<number>>(new Set());
  const [pieceComposerOpen, setPieceComposerOpen] = useState(false);
  const [newPiece, setNewPiece] = useState("");
  // Piece id whose "add a task" input is open, and its draft.
  const [taskComposerFor, setTaskComposerFor] = useState<number | null>(null);
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const { pieces, childrenOf } = useMemo(() => {
    const pieces = todos.filter(isContentPiece).sort((a, b) => a.id - b.id);
    const childrenOf = new Map<number, Todo[]>();
    for (const t of todos) {
      if (t.parent_id == null) continue;
      const list = childrenOf.get(t.parent_id);
      if (list) list.push(t);
      else childrenOf.set(t.parent_id, [t]);
    }
    for (const list of childrenOf.values()) list.sort((a, b) => a.id - b.id);
    return { pieces, childrenOf };
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
    async (e: React.FormEvent) => {
      e.preventDefault();
      const title = newPiece.trim();
      if (!title) return;
      const todo = await create({ title, category: "content" });
      if (!todo) return;
      setNewPiece("");
      // Straight into "what does this need?" — the piece is only useful once it
      // has steps under it.
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
        className={className}
      >
        {t.title}
      </span>
    );

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        title="Show the Content lane"
        className="pointer-events-auto absolute left-3 top-12 z-[6] flex items-center gap-1.5 rounded-xl border bg-card/95 px-2 py-2 shadow-lg backdrop-blur-sm hover:bg-muted"
        style={{ writingMode: "vertical-rl" }}
      >
        <FilmIcon className="size-3.5 rotate-90 text-amber-500" />
        <span className="text-[11px] font-medium tracking-wide">Content</span>
      </button>
    );
  }

  return (
    // Pinned, not drawn on the canvas: it keeps its place while the notebook pans and
    // zooms underneath. Sits below the canvas toolbar and above Excalidraw's zoom
    // controls so neither is covered.
    <div className="pointer-events-auto absolute bottom-14 left-3 top-12 z-[6] flex w-[248px] flex-col overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
        <FilmIcon className="size-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">Content</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{pieces.length}</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Hide the Content lane"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {pieces.length === 0 && (
          <p className="px-1.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            Nothing in the pipeline. Add a video, post or episode — then hang the steps
            to ship it underneath it.
          </p>
        )}

        {pieces.map((piece) => {
          const kids = childrenOf.get(piece.id) ?? [];
          const doneKids = kids.filter(isDone).length;
          const open = !closedIds.has(piece.id);
          const pieceDone = isDone(piece);
          return (
            <div key={piece.id} className="mb-1 rounded-lg border border-transparent hover:border-border/60">
              <div className="group flex items-center gap-1 px-1 py-1">
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
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  {titleField(
                    piece,
                    cn(
                      "block truncate text-[12px] font-medium leading-snug",
                      pieceDone && "text-muted-foreground line-through",
                    ),
                  )}
                </div>
                {kids.length > 0 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {doneKids}/{kids.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(piece.id)}
                  aria-label={`Delete ${piece.title} and its tasks`}
                  title="Delete this piece and everything under it"
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-priority-urgent focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon className="size-3" />
                </button>
              </div>

              {open && (
                <div className="ml-4 border-l pl-1.5">
                  {kids.map((kid) => {
                    const done = isDone(kid);
                    return (
                      <div key={kid.id} className="group flex items-start gap-1.5 py-0.5 pl-1 pr-0.5">
                        <Checkbox
                          checked={done}
                          className="mt-0.5 size-3.5"
                          aria-label={done ? `Uncheck ${kid.title}` : `Check off ${kid.title}`}
                          onCheckedChange={(checked) => (checked ? onComplete(kid.id) : onUncomplete(kid.id))}
                        />
                        <div className="min-w-0 flex-1">
                          {titleField(
                            kid,
                            cn(
                              "block text-[11.5px] leading-snug",
                              done && "text-muted-foreground line-through",
                            ),
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleInProgress(kid.id, !kid.in_progress)}
                          aria-label={kid.in_progress ? `Stop working on ${kid.title}` : `Work on ${kid.title} now`}
                          title="Working on now"
                          className={cn(
                            "shrink-0 rounded p-0.5 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100",
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
                          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-priority-urgent focus-visible:opacity-100 group-hover:opacity-100"
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
      </div>

      <div className="border-t p-1.5">
        {pieceComposerOpen ? (
          <form onSubmit={addPiece}>
            <Input
              autoFocus
              value={newPiece}
              onChange={(e) => setNewPiece(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setPieceComposerOpen(false);
                  setNewPiece("");
                }
              }}
              onBlur={() => {
                if (!newPiece.trim()) setPieceComposerOpen(false);
              }}
              placeholder="e.g. YouTube: building an eve agent"
              className="h-7 text-[11.5px]"
            />
          </form>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-full gap-1 text-[11px]"
            onClick={() => setPieceComposerOpen(true)}
          >
            <PlusIcon className="size-3" />
            Add content piece
          </Button>
        )}
      </div>
    </div>
  );
}
