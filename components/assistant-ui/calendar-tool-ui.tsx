"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { CalendarIcon, CalendarX2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
};

type CalendarArgs = {
  start_date?: string;
  end_date?: string;
  max_results?: number;
};

type CalendarResult =
  | { success: true; range?: { start: string; end: string }; count: number; events: CalendarEvent[] }
  | { success: false; message: string };

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateHeader(range?: { start: string; end: string }, firstStart?: string): string {
  const base = range?.start ?? firstStart;
  if (!base) return "Schedule";
  // Anchor a date-only string at noon to avoid TZ rollover when formatting.
  const d = new Date(base.length <= 10 ? `${base}T12:00:00` : base);
  if (Number.isNaN(d.getTime())) return "Schedule";
  const label = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  if (range && range.end && range.end !== range.start) {
    const e = new Date(`${range.end}T12:00:00`);
    if (!Number.isNaN(e.getTime())) {
      return `${label} – ${e.toLocaleDateString([], { month: "long", day: "numeric" })}`;
    }
  }
  return label;
}

function CalendarCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-1 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      {children}
    </div>
  );
}

function CalendarHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3.5 py-2.5">
      <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
    </div>
  );
}

export const CalendarToolUI = makeAssistantToolUI<CalendarArgs, CalendarResult>({
  toolName: "list_calendar_events",
  render: ({ result, status }) => {
    // Loading / no result yet.
    if (status.type === "running" || result === undefined) {
      return (
        <CalendarCard>
          <CalendarHeader title="Checking your calendar…" />
          <div className="space-y-2 p-3.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CalendarCard>
      );
    }

    if (!result.success) {
      return (
        <CalendarCard>
          <div className="flex items-center gap-2 px-3.5 py-3 text-sm text-muted-foreground">
            <CalendarX2Icon className="size-4 shrink-0" />
            <span>{result.message}</span>
          </div>
        </CalendarCard>
      );
    }

    const events = result.events ?? [];
    const header = formatDateHeader(result.range, events[0]?.start);

    if (events.length === 0) {
      return (
        <CalendarCard>
          <CalendarHeader title={header} />
          <div className="px-3.5 py-4 text-center text-sm text-muted-foreground">
            Nothing scheduled — a clear day.
          </div>
        </CalendarCard>
      );
    }

    return (
      <CalendarCard>
        <CalendarHeader title={header} />
        <ul className="divide-y divide-border/60">
          {events.map((e, i) => (
            <li key={i} className="flex items-start gap-3 px-3.5 py-2.5">
              <div className="w-16 shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
                {e.allDay ? "all day" : formatTime(e.start)}
              </div>
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  e.allDay ? "bg-muted-foreground/40" : "bg-emerald-500",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.title}</div>
                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {!e.allDay && e.end ? (
                    <span className="tabular-nums">
                      {formatTime(e.start)} – {formatTime(e.end)}
                    </span>
                  ) : null}
                  {e.location ? <span className="truncate">· {e.location}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CalendarCard>
    );
  },
});
