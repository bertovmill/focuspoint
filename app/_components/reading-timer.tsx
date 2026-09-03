"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The reading timer — Kindle has no API for reading minutes, so this is the sensor,
 * same shape as the meditation timer (app/_components/meditation-timer.tsx) minus
 * the bells: a reading session doesn't need scheduled chimes, just a clock.
 */

const PRESETS = [15, 30, 45, 60] as const;

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Phase = "idle" | "running" | "paused" | "done";

export function ReadingTimer({ onLogged }: { onLogged?: () => void }) {
  const [minutes, setMinutes] = useState(30);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState<number | null>(null);

  const startedAt = useRef(0);
  const banked = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const total = minutes * 60;

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch("/api/reading-time");
      if (res.ok) setTodayMinutes(Number((await res.json()).minutes ?? 0));
    } catch {
      // The timer works fine without knowing today's total.
    }
  }, []);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const log = useCallback(
    async (seconds: number) => {
      if (seconds < 60) return;
      try {
        const res = await fetch("/api/reading-time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds }),
        });
        if (!res.ok) throw new Error();
        const day = await res.json();
        setTodayMinutes(Number(day.minutes ?? 0));
        window.dispatchEvent(new CustomEvent("scorecard:refresh"));
        onLogged?.();
      } catch {
        toast.error("Couldn't log that session");
      }
    },
    [onLogged],
  );

  const holdScreen = useCallback(async (hold: boolean) => {
    try {
      if (hold) {
        wakeLock.current = await navigator.wakeLock?.request("screen");
      } else {
        await wakeLock.current?.release();
        wakeLock.current = null;
      }
    } catch {
      // No wake lock is a dimmed screen, not a broken timer.
    }
  }, []);

  const start = useCallback(() => {
    banked.current = 0;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("running");
    void holdScreen(true);
  }, [holdScreen]);

  const pause = useCallback(() => {
    banked.current += (Date.now() - startedAt.current) / 1000;
    setPhase("paused");
    void holdScreen(false);
  }, [holdScreen]);

  const resume = useCallback(() => {
    startedAt.current = Date.now();
    setPhase("running");
    void holdScreen(true);
  }, [holdScreen]);

  const stop = useCallback(() => {
    const seconds =
      phase === "running" ? banked.current + (Date.now() - startedAt.current) / 1000 : banked.current;
    setPhase("idle");
    setElapsed(0);
    banked.current = 0;
    void holdScreen(false);
    if (seconds >= 60) {
      void log(seconds);
      toast.success(`${Math.round(seconds / 60)} min logged`, { description: "Stopped early — it still counts." });
    }
  }, [holdScreen, log, phase]);

  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const seconds = banked.current + (Date.now() - startedAt.current) / 1000;
      if (seconds >= total) {
        setElapsed(total);
        setPhase("done");
        void holdScreen(false);
        void log(total);
        return;
      }
      setElapsed(seconds);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [holdScreen, log, phase, total]);

  useEffect(() => {
    return () => {
      void wakeLock.current?.release();
    };
  }, []);

  const remaining = Math.max(0, total - elapsed);
  const pct = total > 0 ? Math.min(1, elapsed / total) : 0;
  const running = phase === "running" || phase === "paused";

  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Reading</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {todayMinutes === null ? "" : `${todayMinutes} min today`}
        </p>
      </div>

      <Card className="rounded-xl px-5 py-5 shadow-none gap-0">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <svg viewBox="0 0 120 120" className="size-[104px] -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="5" className="stroke-muted" />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - pct)}
                className={cn(
                  "transition-[stroke-dashoffset] duration-300 ease-linear",
                  phase === "done" ? "stroke-emerald-600" : "stroke-foreground/70",
                )}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tight">
                {running || phase === "done" ? clock(remaining) : `${minutes}:00`}
              </span>
              <span className="mt-1 text-[9.5px] uppercase tracking-widest text-muted-foreground">
                {phase === "paused" ? "paused" : phase === "done" ? "complete" : "remaining"}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className={cn("space-y-2.5", running && "pointer-events-none opacity-40")}>
              <div>
                <p className="mb-1.5 text-[10.5px] text-muted-foreground">Length</p>
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinutes(m)}
                      className={cn(
                        "tap-target rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors",
                        minutes === m
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2">
              {phase === "idle" || phase === "done" ? (
                <button
                  type="button"
                  onClick={start}
                  className="tap-target flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
                >
                  <PlayIcon className="size-3.5" />
                  {phase === "done" ? "Read again" : "Begin"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={phase === "running" ? pause : resume}
                    className="tap-target flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-muted"
                  >
                    {phase === "running" ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                    {phase === "running" ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={stop}
                    aria-label="End the session"
                    className="tap-target flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <SquareIcon className="size-3.5" />
                    End
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3.5 border-t pt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Finished sessions log themselves to the scorecard.
        </p>
      </Card>
    </div>
  );
}
