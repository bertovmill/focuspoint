"use client";

import { useEffect, useState } from "react";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { dayPossessive } from "@/app/_components/today-snapshot";
import type { DayStrategy } from "@/lib/day-strategy";
import { todayISO } from "@/lib/nutrition";

/** "13:30" → "1:30 PM". */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** The browser's view of the day: local-midnight bounds and time zone, for the server's calendar read. */
function planWindow(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return {
    day,
    timeMin: new Date(y, m - 1, d).toISOString(),
    timeMax: new Date(y, m - 1, d + 1).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Cael's suggested plan for the day (his ask, 2026-10-25): a theme, then a few
 * time blocks in the calendar's free gaps, tied to his Vision and Principles.
 * Today's is written on first view; it stays a suggestion until he says yes, and
 * "No" takes an optional note on what to change and writes a new one.
 */
export function DayStrategyToday({ today }: { today: string }) {
  // undefined while loading, null when the day has none yet.
  const [strategy, setStrategy] = useState<DayStrategy | null | undefined>(undefined);
  const [writing, setWriting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const isToday = today === todayISO();
  const isPast = today < todayISO();

  const write = async (feedback?: string) => {
    setWriting(true);
    try {
      const res = await fetch("/api/day-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...planWindow(today), feedback }),
      });
      if (!res.ok) throw new Error();
      setStrategy((await res.json()) as DayStrategy);
      setChanging(false);
      setNote("");
    } catch {
      toast.error("Couldn't write a strategy.");
    } finally {
      setWriting(false);
    }
  };

  useEffect(() => {
    let stale = false;
    setStrategy(undefined);
    setChanging(false);
    fetch(`/api/day-strategy?day=${today}`)
      .then(async (res) => {
        if (stale) return;
        const data = res.ok ? ((await res.json()) as DayStrategy | null) : null;
        setStrategy(data);
        // Today's plan writes itself the first time Home opens that day.
        if (!data && res.ok && today === todayISO()) void write();
      })
      .catch(() => !stale && setStrategy(null));
    return () => {
      stale = true;
    };
    // write only reads `today`, which this effect already keys on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const setStatus = async (status: DayStrategy["status"]) => {
    if (!strategy) return;
    const prev = strategy;
    setStrategy({ ...strategy, status });
    const res = await fetch("/api/day-strategy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: today, status }),
    }).catch(() => null);
    if (!res?.ok) {
      setStrategy(prev);
      toast.error("Couldn't save that.");
    }
  };

  return (
    <div id="day-strategy">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {`${dayPossessive(today)} strategy`}
      </h2>
      <Card className="gap-0 rounded-xl px-5 py-4 shadow-none">
        {strategy === undefined || writing ? (
          <div className="space-y-3">
            {writing && <p className="text-xs text-muted-foreground">Cael is planning your day…</p>}
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : strategy === null ? (
          isPast ? (
            <p className="text-sm text-muted-foreground">No strategy that day.</p>
          ) : (
            <Button size="sm" variant="outline" onClick={() => write()}>
              Plan this day
            </Button>
          )
        ) : (
          <div className="space-y-4">
            <p className="text-base font-medium leading-snug">{strategy.theme}</p>
            <ul className="space-y-3">
              {strategy.blocks.map((b, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                    {clock(b.start)}–{clock(b.end)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.why}</p>
                  </div>
                </li>
              ))}
            </ul>

            {changing ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void write(note.trim() || "Try a different plan.");
                }}
              >
                <Textarea
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What should change? (optional)"
                  className="min-h-16 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                  }}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    <RefreshCwIcon />
                    Rewrite
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : strategy.status === "accepted" ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckIcon className="size-3.5" />
                  Locked in
                </span>
                <button
                  type="button"
                  onClick={() => setChanging(true)}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-muted-foreground">{isToday ? "Does this work?" : "Suggested"}</span>
                <Button size="sm" onClick={() => setStatus("accepted")}>
                  <CheckIcon />
                  Yes
                </Button>
                <Button size="sm" variant="outline" onClick={() => setChanging(true)}>
                  <XIcon />
                  No, change it
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
