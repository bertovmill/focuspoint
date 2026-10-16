"use client";

import { requestNewChat } from "@/app/_components/new-chat-event";
import { useThreads, type ThreadRecord } from "@/app/_components/threads-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FC, type ReactNode } from "react";

const DAY_IN_MS = 86_400_000;

function groupLabel(updatedAt: number, startOfToday: number): string {
  if (updatedAt >= startOfToday) return "Today";
  if (updatedAt >= startOfToday - DAY_IN_MS) return "Yesterday";
  return "Earlier";
}

/**
 * What this browser can match in a thread on its own: the title, plus what was
 * said if the transcript is loaded (the list itself is titles only). Everything
 * else comes from /api/threads/search. Saved events carry each user message whole on `message.received` and each of
 * Cael's replies whole on `message.completed`, so the streaming deltas and tool
 * traffic never need reading.
 */
function searchText(thread: ThreadRecord): string {
  const said: string[] = [thread.title];
  for (const event of thread.events ?? []) {
    if (event.type !== "message.received" && event.type !== "message.completed") continue;
    const message = (event.data as { message?: unknown }).message;
    if (typeof message === "string") said.push(message);
  }
  return said.join("\n").toLowerCase();
}

export const ChatSidebar: FC<{
  className?: string;
  onNavigate?: () => void;
  /** Controls beside the search bar, e.g. the rail's hide button. */
  searchTrailing?: ReactNode;
}> = ({ className, onNavigate, searchTrailing }) => {
  const { threads, activeId, switchTo } = useThreads();
  const [query, setQuery] = useState("");

  // Built once per change to the thread list, not per keystroke.
  const haystacks = useMemo(
    () => new Map(threads.map((t) => [t.id, searchText(t)])),
    [threads],
  );
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const trimmed = query.trim();

  // Content matches from the server, for the query they answer. Titles filter
  // instantly below; these merge in a beat later.
  const [contentHits, setContentHits] = useState<{ q: string; ids: ReadonlySet<string> }>();
  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/threads/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { ids: [] }))
        .then(({ ids }: { ids: string[] }) => setContentHits({ q: trimmed, ids: new Set(ids) }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);
  const serverIds = contentHits?.q === trimmed ? contentHits.ids : undefined;
  const searching = terms.length > 0 && !serverIds;

  // Every word has to appear somewhere in the chat, in any order.
  const visible = terms.length === 0
    ? threads
    : threads.filter((t) => {
        if (serverIds?.has(t.id)) return true;
        const hay = haystacks.get(t.id) ?? "";
        return terms.every((term) => hay.includes(term));
      });

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  // threads arrive newest-first; split into ordered date groups.
  const groups: { label: string; items: ThreadRecord[] }[] = [];
  for (const t of visible) {
    const label = groupLabel(t.updatedAt, startOfToday);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }

  const handleNew = () => {
    requestNewChat();
    onNavigate?.();
  };

  return (
    <div className={cn("relative flex flex-col h-full", className)}>
      {/* Search: titles and everything said in each chat. */}
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </label>
        {searchTrailing}
      </div>

      {/* Scrollable thread list */}
      <div className="flex-1 overflow-y-auto pb-32 lg:pb-20">
        <div className="flex flex-col gap-0.5 p-2">
          {terms.length > 0 && visible.length === 0 && !searching && (
            <p className="px-2.5 pt-3 text-sm text-muted-foreground">No chats match “{query.trim()}”.</p>
          )}
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
      </div>

      {/* Pinned "New chat" pill */}
      <div className="absolute bottom-0 inset-x-0 flex justify-center pb-[max(1rem,var(--safe-bottom))] lg:pb-4 pointer-events-none">
        <Button
          onClick={handleNew}
          className="pointer-events-auto rounded-full px-5 h-10 gap-2 shadow-md text-sm font-medium"
        >
          <PlusIcon className="size-4 shrink-0" />
          New chat
        </Button>
      </div>
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
        className="flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-16 touch:pe-16"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      <div className="absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 touch:gap-2 opacity-0 group-hover:opacity-100 touch:opacity-100">
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
