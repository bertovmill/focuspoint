"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { closingBell, getAudioContext, strikeBowl } from "@/lib/bells";
import { MEDITATION_PRESETS } from "@/lib/meditation";
import { cn } from "@/lib/utils";

/**
 * The meditation timer — a sit, and the sensor that logs it.
 *
 * Berto's shape (2026-09-02): *"we should have a time, and set interval bells,
 * usually i do 20 mins with one bell after 10 mins - and make them nice soothing
 * meditation bells."* So: 20 minutes by default, a bell at the halfway point, three
 * fading strikes to close. The bells are synthesised, not sampled — see lib/bells.ts
 * for why.
 *
 * **Bells are scheduled, not ticked.** Every strike for the whole session is placed
 * on the AudioContext timeline the moment you press start, at an absolute time. That
 * matters because a browser throttles `setInterval` in a background tab to once a
 * second or worse — and the entire point of sitting is that you are not looking at
 * the screen. The Web Audio clock doesn't care whether the tab is visible, so the
 * ten-minute bell lands at ten minutes regardless. Pausing stops the scheduled nodes
 * and resuming re-schedules what's left.
 *
 * The countdown display is derived from `Date.now()` for the same reason: counting
 * ticks would drift by however long the tab was throttled, and a meditation timer
 * that quietly runs long is worse than no timer.
 */

/** How the elapsed clock reads. Always mm:ss — a sit is never hours. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Phase = "idle" | "running" | "paused" | "done";

export function MeditationTimer({ onLogged }: { onLogged?: () => void }) {
  const [minutes, setMinutes] = useState(20);
  /** Bell every N minutes. 0 = none. */
  const [interval, setIntervalMinutes] = useState(10);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState<number | null>(null);

  /** Wall-clock ms at which the *currently running* stretch began. */
  const startedAt = useRef(0);
  /** Seconds banked by earlier stretches of this session, before the last pause. */
  const banked = useRef(0);
  /** Every scheduled bell node, so a pause or a stop can silence what hasn't rung. */
  const scheduled = useRef<AudioScheduledSourceNode[]>([]);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const total = minutes * 60;

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch("/api/meditation");
      if (res.ok) setTodayMinutes(Number((await res.json()).minutes ?? 0));
    } catch {
      // The timer works fine without knowing today's total.
    }
  }, []);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  /** Silence every bell that hasn't sounded yet. */
  const clearBells = useCallback(() => {
    for (const node of scheduled.current) {
      try {
        node.stop();
      } catch {
        // Already stopped, or never started. Either way there's nothing to silence.
      }
    }
    scheduled.current = [];
  }, []);

  /**
   * Place every remaining bell on the audio clock, given how far in we already are.
   * Called on start and again on each resume.
   */
  const scheduleBells = useCallback(
    (fromSeconds: number) => {
      const ctx = getAudioContext();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const nodes: AudioScheduledSourceNode[] = [];

      // Interval bells — a lighter, higher bowl than the ones that open and close,
      // so a halfway marker is never mistaken for the end of the sit.
      if (interval > 0) {
        for (let at = interval * 60; at < total; at += interval * 60) {
          if (at <= fromSeconds) continue;
          nodes.push(...strikeBowl(ctx, t0 + (at - fromSeconds), { fundamental: 288, gain: 0.34, decay: 7 }));
        }
      }

      nodes.push(...closingBell(ctx, t0 + (total - fromSeconds), { fundamental: 174, gain: 0.5, decay: 12 }));
      scheduled.current = nodes;
    },
    [interval, total],
  );

  /** Log a finished (or abandoned) sit. Under a minute is not a sit and isn't sent. */
  const log = useCallback(
    async (seconds: number) => {
      if (seconds < 60) return;
      try {
        const res = await fetch("/api/meditation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds }),
        });
        if (!res.ok) throw new Error();
        const day = await res.json();
        setTodayMinutes(Number(day.minutes ?? 0));
        // The scorecard is a sibling, not a parent — a sit has to reach it somehow,
        // and an event beats threading state up through the whole home screen for
        // the one number this component produces.
        window.dispatchEvent(new CustomEvent("scorecard:refresh"));
        onLogged?.();
      } catch {
        toast.error("Couldn't log that sit");
      }
    },
    [onLogged],
  );

  /** Keep the screen on while sitting — best effort, unsupported everywhere else. */
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
    const ctx = getAudioContext();
    // The opening strike, and the gesture that unlocks audio for every bell after it.
    if (ctx) strikeBowl(ctx, ctx.currentTime + 0.05, { fundamental: 210, gain: 0.45, decay: 10 });
    banked.current = 0;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("running");
    scheduleBells(0);
    void holdScreen(true);
  }, [holdScreen, scheduleBells]);

  const pause = useCallback(() => {
    banked.current += (Date.now() - startedAt.current) / 1000;
    clearBells();
    setPhase("paused");
    void holdScreen(false);
  }, [clearBells, holdScreen]);

  const resume = useCallback(() => {
    startedAt.current = Date.now();
    setPhase("running");
    scheduleBells(banked.current);
    void holdScreen(true);
  }, [holdScreen, scheduleBells]);

  /** Stop early. The time already sat still counts — it happened. */
  const stop = useCallback(() => {
    const seconds =
      phase === "running" ? banked.current + (Date.now() - startedAt.current) / 1000 : banked.current;
    clearBells();
    setPhase("idle");
    setElapsed(0);
    banked.current = 0;
    void holdScreen(false);
    if (seconds >= 60) {
      void log(seconds);
      toast.success(`${Math.round(seconds / 60)} min logged`, { description: "Stopped early — it still counts." });
    }
  }, [clearBells, holdScreen, log, phase]);

  // The display clock. Reads the wall clock rather than counting its own ticks, so a
  // throttled background tab catches up instead of running slow.
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

  // Never leave a bell scheduled behind a closed screen or a released wake lock.
  useEffect(() => {
    return () => {
      clearBells();
      void wakeLock.current?.release();
    };
  }, [clearBells]);

  const remaining = Math.max(0, total - elapsed);
  const pct = total > 0 ? Math.min(1, elapsed / total) : 0;
  const running = phase === "running" || phase === "paused";

  // A ring drawn as one SVG circle with a dash offset — the whole progress display.
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Meditation</p>
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
            {/* Length and bell spacing are only adjustable between sits — changing the
                length mid-session would move a bell that's already been scheduled. */}
            <div className={cn("space-y-2.5", running && "pointer-events-none opacity-40")}>
              <div>
                <p className="mb-1.5 text-[10.5px] text-muted-foreground">Length</p>
                <div className="flex flex-wrap gap-1">
                  {MEDITATION_PRESETS.map((m) => (
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

              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  <BellIcon className="size-3" />
                  Interval bell
                </p>
                <div className="flex flex-wrap gap-1">
                  {[0, 5, 10, 15].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setIntervalMinutes(m)}
                      disabled={m >= minutes && m !== 0}
                      className={cn(
                        "tap-target rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors disabled:opacity-30",
                        interval === m
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m === 0 ? "none" : `${m}m`}
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
                  {phase === "done" ? "Sit again" : "Begin"}
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
                    aria-label="End the sit"
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
          {interval > 0
            ? `A bell every ${interval} minutes, three to close.`
            : "One bell to open, three to close."}{" "}
          Finished sits log themselves to the scorecard.
        </p>
      </Card>
    </div>
  );
}
