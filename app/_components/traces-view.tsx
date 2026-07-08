"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  BrainIcon,
  CircleIcon,
  ClockIcon,
  CoinsIcon,
  MessageSquareIcon,
  SearchIcon,
  ServerIcon,
  TriangleAlertIcon,
  UserIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  buildToolCallMap,
  computeThreadStats,
  isNoisyEvent,
  summarizeEvent,
  type TraceEvent,
  type ThreadStats,
} from "@/lib/trace-utils";

interface ThreadRow {
  id: string;
  title: string;
  events: TraceEvent[] | null;
  created_at: string;
  updated_at: string;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "session.started": ServerIcon,
  "session.completed": ServerIcon,
  "session.waiting": ClockIcon,
  "session.failed": TriangleAlertIcon,
  "turn.failed": TriangleAlertIcon,
  "step.failed": TriangleAlertIcon,
  "message.received": UserIcon,
  "message.completed": MessageSquareIcon,
  "reasoning.completed": BrainIcon,
  "actions.requested": WrenchIcon,
  "action.result": WrenchIcon,
  "step.completed": ZapIcon,
};

function iconFor(type: string) {
  return EVENT_ICONS[type] ?? CircleIcon;
}

function statusColor(status: ThreadStats["status"]) {
  if (status === "failed") return "text-destructive";
  if (status === "waiting") return "text-amber-500";
  if (status === "completed") return "text-emerald-500";
  return "text-muted-foreground";
}

export function TracesView() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/threads")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: ThreadRow[]) => {
        setThreads(rows);
        if (rows.length > 0) setSelectedId(rows[0].id);
      })
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, []);

  const rowsWithStats = useMemo(
    () =>
      threads.map((t) => ({
        thread: t,
        events: Array.isArray(t.events) ? t.events : [],
        stats: computeThreadStats(Array.isArray(t.events) ? t.events : []),
      })),
    [threads],
  );

  const filtered = rowsWithStats.filter((r) =>
    r.thread.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const selected = rowsWithStats.find((r) => r.thread.id === selectedId) ?? null;
  const toolCalls = useMemo(
    () => (selected ? buildToolCallMap(selected.events) : new Map()),
    [selected],
  );

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Cael
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-semibold tracking-tight">Agent Traces</h1>
        <span className="text-xs text-muted-foreground">
          Raw event stream for every session — tool calls, reasoning, token usage.
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Thread list */}
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ServerIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No sessions found</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul>
                {filtered.map(({ thread, stats }) => {
                  const isActive = thread.id === selectedId;
                  return (
                    <li key={thread.id}>
                      <button
                        onClick={() => setSelectedId(thread.id)}
                        className={cn(
                          "w-full border-b border-border px-3 py-2.5 text-left transition-colors",
                          isActive ? "bg-accent" : "hover:bg-muted/50",
                        )}
                      >
                        <p className="truncate text-sm font-medium leading-snug">
                          {thread.title || "Untitled session"}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={statusColor(stats.status)}>●</span>
                          <span>{formatRelativeTime(thread.updated_at)}</span>
                          <span>·</span>
                          <span>{stats.turnCount} turn{stats.turnCount !== 1 ? "s" : ""}</span>
                          <span>·</span>
                          <span>{stats.toolCallCount} tool call{stats.toolCallCount !== 1 ? "s" : ""}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Detail view */}
        <main className="flex-1 overflow-y-auto">
          {!selected ? (
            <Empty className="py-24">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ServerIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>Select a session</EmptyTitle>
                <EmptyDescription>Pick one from the list to inspect its trace.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="p-5">
              {/* Summary card */}
              <Card className="mb-5 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold leading-snug">
                    {selected.thread.title || "Untitled session"}
                  </h2>
                  <Badge variant="outline" className={cn("shrink-0 capitalize", statusColor(selected.stats.status))}>
                    {selected.stats.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Model" value={selected.stats.model ?? "—"} />
                  <Stat label="Duration" value={formatDuration(selected.stats.durationMs)} />
                  <Stat label="Turns" value={String(selected.stats.turnCount)} />
                  <Stat label="Tool calls" value={String(selected.stats.toolCallCount)} />
                  <Stat
                    label="Input tokens"
                    value={selected.stats.totalInputTokens.toLocaleString()}
                    icon={CoinsIcon}
                  />
                  <Stat label="Output tokens" value={selected.stats.totalOutputTokens.toLocaleString()} />
                  <Stat label="Cache read" value={selected.stats.totalCacheReadTokens.toLocaleString()} />
                  <Stat label="eve" value={selected.stats.eveVersion ?? "—"} />
                </div>
                {selected.stats.gitSha && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Built from <code>{selected.stats.gitBranch}</code>@<code>{selected.stats.gitSha.slice(0, 7)}</code>
                  </p>
                )}
              </Card>

              {/* Event timeline */}
              <div className="space-y-1.5">
                {selected.events
                  .filter((e) => !isNoisyEvent(e))
                  .map((event, i) => {
                    const Icon = iconFor(event.type);
                    const isTurnBoundary = event.type === "turn.started";
                    return (
                      <details
                        key={i}
                        className={cn(
                          "group rounded-lg border border-border/60 bg-card/50 open:bg-card",
                          isTurnBoundary && "mt-4 border-primary/30",
                        )}
                      >
                        <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2 text-sm">
                          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 leading-snug">
                            {summarizeEvent(event, toolCalls)}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                            {event.meta?.at ? new Date(event.meta.at).toLocaleTimeString() : ""}
                          </span>
                        </summary>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-border/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                          {JSON.stringify(event, null, 2)}
                        </pre>
                      </details>
                    );
                  })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
