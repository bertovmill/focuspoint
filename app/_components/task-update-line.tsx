"use client";

import { useState } from "react";
import { BotIcon, UserIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { Todo } from "@/lib/todo";
import type { UpdateAuthor } from "@/lib/task-updates";
import { cn } from "@/lib/utils";

// The one line of an update thread a task card has room for: the newest note, and
// whether it came from Berto or from an agent. Agents post theirs over MCP when
// they finish an intermediary step and need him to take the next one, so an agent
// line is styled as a nudge — tinted, with the bot mark — and Berto's own notes
// stay quiet.

/** "just now" / "14m" / "3h" / "2d" — short enough to sit at the end of the line. */
export function formatUpdateAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function TaskUpdateLine({
  body,
  author,
  at,
  className,
}: {
  body: string;
  author?: UpdateAuthor | null;
  at?: string | null;
  className?: string;
}) {
  const fromAgent = author === "agent";
  const age = formatUpdateAge(at);
  return (
    <div
      title={`${fromAgent ? "Update from an agent" : "Your update"}${age ? ` · ${age === "just now" ? age : `${age} ago`}` : ""}\n${body}`}
      className={cn(
        "rounded-md border-l-2 px-1.5 py-1 text-[10px] leading-snug",
        fromAgent
          ? "border-l-primary bg-primary/10 text-foreground/90"
          : "border-l-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {/* Who and when on their own line, so the note itself gets the full width
          and can clamp cleanly instead of wrapping around a timestamp. */}
      <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide opacity-70">
        {fromAgent ? <BotIcon className="size-2.5 text-primary" /> : <UserIcon className="size-2.5" />}
        <span>{fromAgent ? "Agent" : "You"}</span>
        {age && <span className="tabular-nums normal-case">· {age}</span>}
      </div>
      <p className="mt-0.5 line-clamp-2">{body}</p>
    </div>
  );
}

/** The card's own update line, or nothing when the task has never had one. */
export function TaskLatestUpdate({ todo, className }: { todo: Todo; className?: string }) {
  if (!todo.last_update) return null;
  return (
    <TaskUpdateLine
      body={todo.last_update}
      author={todo.last_update_by}
      at={todo.last_update_at}
      className={className}
    />
  );
}

/**
 * A one-line box for posting Berto's own update. Kept deliberately dumb — it owns
 * the text and hands the saved row back, and the caller decides where it lives and
 * how the task row is patched.
 */
export function TaskUpdateComposer({
  taskId,
  onPosted,
  onClose,
  className,
}: {
  taskId: number;
  onPosted: (update: { body: string; author: UpdateAuthor; created_at: string }) => void;
  onClose: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function post() {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/todos/${taskId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, author: "me" }),
      });
      if (res.ok) {
        const row = await res.json();
        onPosted({ body: row.body ?? body, author: "me", created_at: row.created_at ?? new Date().toISOString() });
      }
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div data-no-drag className={className}>
      <Input
        autoFocus
        value={text}
        placeholder="What's the latest?"
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={post}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText("");
            onClose();
          }
        }}
        className="h-6 px-1 text-[11px]"
      />
    </div>
  );
}
