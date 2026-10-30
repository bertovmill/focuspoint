"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ESTIMATE_OPTIONS, formatEstimateLabel, type Todo } from "@/lib/todo";
import type { TaskUpdate } from "@/lib/task-updates";
import { cn } from "@/lib/utils";

type Patch = Partial<Pick<Todo, "title" | "due_date" | "priority" | "estimated_minutes">>;

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The right-hand drawer a Home task opens into (Berto, 2026-10-30): the title, the
 * same status / due / priority the row has plus the estimate, free-text details,
 * and the task's update thread (his notes and agents' hand-offs) with a box to add
 * one. Row-level fields go back through Home's own handlers so the list stays in
 * step; details and updates are the drawer's own and save straight to the API.
 */
export function TaskDrawer({
  todo,
  onClose,
  onUpdate,
  statusControl,
  priorityControl,
  dueControl,
  onComplete,
}: {
  todo: Todo | null;
  onClose: () => void;
  onUpdate: (todo: Todo, patch: Patch) => void;
  statusControl: (todo: Todo) => React.ReactNode;
  priorityControl: (todo: Todo) => React.ReactNode;
  dueControl: (todo: Todo) => React.ReactNode;
  onComplete: (todo: Todo) => void;
}) {
  return (
    <Sheet open={todo !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {todo && (
          <DrawerBody
            key={todo.id}
            todo={todo}
            onUpdate={onUpdate}
            statusControl={statusControl}
            priorityControl={priorityControl}
            dueControl={dueControl}
            onComplete={onComplete}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  todo,
  onUpdate,
  statusControl,
  priorityControl,
  dueControl,
  onComplete,
}: Omit<Parameters<typeof TaskDrawer>[0], "todo" | "onClose"> & { todo: Todo }) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState<string | null>(null);
  const savedNotes = useRef("");
  const [updates, setUpdates] = useState<TaskUpdate[] | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    fetch(`/api/todos/${todo.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((row: Todo | null) => {
        savedNotes.current = row?.notes ?? "";
        setNotes(row?.notes ?? "");
      })
      .catch(() => setNotes(""));
    fetch(`/api/todos/${todo.id}/updates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: TaskUpdate[]) => setUpdates(rows))
      .catch(() => setUpdates([]));
  }, [todo.id]);

  const saveNotes = async () => {
    if (notes === null || notes === savedNotes.current) return;
    const text = notes;
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text }),
      });
      if (!res.ok) throw new Error();
      savedNotes.current = text;
    } catch {
      toast.error("Couldn't save the details.");
    }
  };

  // Details save on blur, and also a moment after typing stops so closing the
  // drawer mid-thought doesn't lose anything.
  useEffect(() => {
    if (notes === null || notes === savedNotes.current) return;
    const timer = window.setTimeout(saveNotes, 800);
    return () => window.clearTimeout(timer);
  }, [notes]);

  const saveTitle = () => {
    const next = title.trim();
    if (!next) return setTitle(todo.title);
    if (next !== todo.title) onUpdate(todo, { title: next });
  };

  const postUpdate = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      const res = await fetch(`/api/todos/${todo.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author: "me" }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as TaskUpdate;
      setUpdates((us) => [row, ...(us ?? [])]);
    } catch {
      setDraft(body);
      toast.error("Couldn't post that update.");
    }
  };

  const estimate = todo.estimated_minutes ?? 0;

  return (
    <>
      <div className="px-6 pt-6 pb-4 pr-12">
        <SheetTitle className="sr-only">{todo.title}</SheetTitle>
        <SheetDescription className="sr-only">Details for this task</SheetDescription>
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          rows={1}
          aria-label="Task title"
          className="field-sizing-content w-full resize-none bg-transparent text-lg font-semibold leading-snug outline-none"
        />
      </div>

      <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2.5 px-6 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{statusControl(todo)}</dd>
        <dt className="text-muted-foreground">Due</dt>
        <dd>{dueControl(todo)}</dd>
        <dt className="text-muted-foreground">Priority</dt>
        <dd>{priorityControl(todo)}</dd>
        <dt className="text-muted-foreground">Estimate</dt>
        <dd>
          <DropdownMenu>
            <DropdownMenuTrigger className="-mx-1 rounded px-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {estimate ? formatEstimateLabel(estimate) : "—"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-24">
              {ESTIMATE_OPTIONS.map((m) => (
                <DropdownMenuItem key={m} className="text-xs" onSelect={() => onUpdate(todo, { estimated_minutes: m })}>
                  {formatEstimateLabel(m)}
                  {m === estimate && <CheckIcon className="ml-auto size-3" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </dd>
      </dl>

      <section className="px-6 pt-6">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">Details</h3>
        <textarea
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          disabled={notes === null}
          placeholder={notes === null ? "Loading…" : "Add details, links, context…"}
          aria-label="Task details"
          className="field-sizing-content min-h-28 w-full resize-none rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:bg-muted"
        />
      </section>

      <section className="flex-1 px-6 pt-6 pb-6">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">Updates</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            postUpdate();
          }}
          className="mb-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 focus-within:bg-muted"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Post an update"
            aria-label="Post an update"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="submit"
            aria-label="Post update"
            disabled={!draft.trim()}
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <SendIcon className="size-3.5" />
          </button>
        </form>
        {updates === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : updates.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">No updates yet.</p>
        ) : (
          <ol className="space-y-3">
            {updates.map((u) => (
              <li key={u.id} className="text-sm">
                <div className="mb-0.5 text-xs text-muted-foreground">
                  <span className={cn("font-medium", u.author === "agent" && "text-emerald-600 dark:text-emerald-400")}>
                    {u.author === "agent" ? "Agent" : "You"}
                  </span>
                  {" · "}
                  {ago(u.created_at)}
                </div>
                <p className="leading-snug whitespace-pre-wrap">{u.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="sticky bottom-0 flex items-center justify-between border-t bg-background px-6 py-3">
        <Link href="/tasks" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Open in Tasks
        </Link>
        <button
          type="button"
          onClick={() => onComplete(todo)}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          <CheckIcon className="size-3.5" />
          Mark done
        </button>
      </div>
    </>
  );
}
