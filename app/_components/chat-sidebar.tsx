"use client";

import { useThreads, type ThreadRecord } from "@/app/_components/threads-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { useState, type FC } from "react";

const DAY_IN_MS = 86_400_000;

function groupLabel(updatedAt: number, startOfToday: number): string {
  if (updatedAt >= startOfToday) return "Today";
  if (updatedAt >= startOfToday - DAY_IN_MS) return "Yesterday";
  return "Earlier";
}

export const ChatSidebar: FC<{
  className?: string;
  onNavigate?: () => void;
}> = ({ className, onNavigate }) => {
  const { threads, activeId, newThread, switchTo } = useThreads();

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  // threads arrive newest-first; split into ordered date groups.
  const groups: { label: string; items: ThreadRecord[] }[] = [];
  for (const t of threads) {
    const label = groupLabel(t.updatedAt, startOfToday);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }

  return (
    <div className={cn("flex flex-col gap-0.5 p-2", className)}>
      <Button
        variant="ghost"
        onClick={() => {
          newThread();
          onNavigate?.();
        }}
        className="hover:bg-muted h-8 justify-start gap-2 rounded-md px-2.5 text-sm font-normal"
      >
        <PlusIcon className="size-4 shrink-0" />
        <span className="whitespace-nowrap">New chat</span>
      </Button>

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium">
            {group.label}
          </div>
          {group.items.map((t) => (
            <ChatSidebarItem
              key={t.id}
              thread={t}
              active={t.id === activeId}
              onSwitch={() => {
                switchTo(t.id);
                onNavigate?.();
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

const ChatSidebarItem: FC<{
  thread: ThreadRecord;
  active: boolean;
  onSwitch: () => void;
}> = ({ thread, active, onSwitch }) => {
  const { rename, remove } = useThreads();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);

  const label = thread.title || "New chat";

  if (editing) {
    const commit = () => {
      rename(thread.id, draft);
      setEditing(false);
    };
    return (
      <div className="flex h-8 items-center gap-1 rounded-md px-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="text-foreground min-w-0 flex-1 rounded bg-transparent px-1 text-sm outline-none ring-1 ring-border"
        />
        <button
          aria-label="Save title"
          onClick={commit}
          className="text-muted-foreground hover:text-foreground p-1"
        >
          <CheckIcon className="size-3.5" />
        </button>
        <button
          aria-label="Cancel rename"
          onClick={() => setEditing(false)}
          className="text-muted-foreground hover:text-foreground p-1"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group hover:bg-muted relative flex h-8 items-center rounded-md transition-colors",
        active && "bg-muted",
      )}
    >
      <button
        onClick={onSwitch}
        className="flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-16"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      <div className="absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          aria-label="Rename chat"
          onClick={() => {
            setDraft(thread.title);
            setEditing(true);
          }}
          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded p-1"
        >
          <PencilIcon className="size-3.5" />
        </button>
        <button
          aria-label="Delete chat"
          onClick={() => remove(thread.id)}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1"
        >
          <TrashIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
};
