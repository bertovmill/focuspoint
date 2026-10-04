"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, SquareIcon, TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime, type WorkoutTemplate } from "@/lib/workout-templates";

/** One timed thing to do, in order: a set of a timed exercise. */
export interface Segment {
  exKey: string;
  set: number;
  label: string;
  /** Before this segment, wait for a tap instead of timing straight on (the jog between interval reps). */
  waitFirst: boolean;
}

export function timedSegments(t: WorkoutTemplate): Segment[] {
  const out: Segment[] = [];
  for (const b of t.blocks) {
    for (const ex of b.exercises) {
      if (ex.measure !== "time") continue;
      for (let i = 0; i < ex.sets; i++) {
        out.push({
          exKey: ex.key,
          set: i,
          label: `${ex.name}${ex.sets > 1 ? ` ${i + 1}` : ""}${t.blocks.length > 1 ? ` · ${b.label.replace(/ ·.*$/, "")}` : ""}`,
          waitFirst: !!ex.waitBetweenSets && i > 0,
        });
      }
    }
  }
  return out;
}

/**
 * The timer's whole state is timestamps, never a ticking count: the elapsed time
 * is always now − start − paused, worked out fresh. So the phone sleeping, the tab
 * being frozen or even killed doesn't lose or distort a split — it's in
 * localStorage and correct the moment the page is back.
 */
interface TimerState {
  idx: number;
  /** When the current segment started (epoch ms); null while waiting to start a rep. */
  segStart: number | null;
  pausedMs: number;
  pausedAt: number | null;
}

function storageKey(slug: string, date: string) {
  return `cael.workout-timer.${slug}.${date}`;
}

function load(key: string): TimerState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

function persist(key: string, s: TimerState | null) {
  try {
    if (s) localStorage.setItem(key, JSON.stringify(s));
    else localStorage.removeItem(key);
  } catch {
    // private mode etc. — the timer still works for this page view
  }
}

function elapsed(s: TimerState, now: number) {
  if (s.segStart === null) return 0;
  const pausing = s.pausedAt !== null ? now - s.pausedAt : 0;
  return Math.max(0, now - s.segStart - s.pausedMs - pausing);
}

/** Keep the screen on while the timer runs (Screen Wake Lock, where the browser has it). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const take = async () => {
      try {
        const l = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      } catch {
        // denied or unsupported — timing is still right, the screen may just sleep
      }
    };
    take();
    // The lock drops whenever the page is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

/**
 * The lap timer pinned above the tab bar on a timed workout: Start once, then one
 * big button per segment ("Done: Run 1 km → Wall balls"). Each tap writes the
 * split into its time box. Pause stops the clock (talking to someone, loading the
 * sled); paused time never counts.
 */
export function WorkoutTimer({
  slug,
  date,
  segments,
  onSplit,
  onActive,
}: {
  slug: string;
  date: string;
  segments: Segment[];
  onSplit: (seg: Segment, seconds: number) => void;
  onActive: (seg: Segment | null) => void;
}) {
  const key = storageKey(slug, date);
  const [state, setState] = useState<TimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => setState(load(key)), [key]);

  const save = useCallback(
    (s: TimerState | null) => {
      setState(s);
      persist(key, s);
    },
    [key],
  );

  const running = !!state && state.segStart !== null && state.pausedAt === null;
  useWakeLock(!!state);

  // Redraw the clock; the value itself comes from timestamps, not this interval.
  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state]);

  const current = state ? segments[state.idx] ?? null : null;
  const next = state ? segments[state.idx + 1] ?? null : segments[0] ?? null;
  useEffect(() => onActive(current), [current, onActive]);

  if (segments.length === 0) return null;

  const start = () => save({ idx: 0, segStart: Date.now(), pausedMs: 0, pausedAt: null });
  const lap = () => {
    const s = stateRef.current;
    if (!s) return;
    const t = Date.now();
    if (s.segStart === null) {
      // Waiting between interval reps: this tap starts the rep.
      save({ ...s, segStart: t, pausedMs: 0, pausedAt: null });
      return;
    }
    const seg = segments[s.idx];
    onSplit(seg, Math.round(elapsed(s, t) / 1000));
    const following = segments[s.idx + 1];
    if (!following) {
      save(null);
      return;
    }
    save({ idx: s.idx + 1, segStart: following.waitFirst ? null : t, pausedMs: 0, pausedAt: null });
  };
  const pause = () => state && save({ ...state, pausedAt: Date.now() });
  const resume = () => state && state.pausedAt !== null && save({ ...state, pausedMs: state.pausedMs + (Date.now() - state.pausedAt), pausedAt: null });
  const stop = () => {
    if (window.confirm("Stop the timer? Splits already recorded stay; the one in progress is dropped.")) save(null);
  };

  if (!state) {
    return (
      <div className="sticky bottom-20 z-20 lg:bottom-4">
        <Button className="h-14 w-full gap-2 text-lg shadow-lg" onClick={start}>
          <TimerIcon className="size-5" /> Start timer
          <span className="font-normal opacity-80">· {segments[0].label}</span>
        </Button>
      </div>
    );
  }

  const waiting = state.segStart === null;
  const paused = state.pausedAt !== null;
  const secs = elapsed(state, now) / 1000;

  return (
    <div className="sticky bottom-20 z-20 space-y-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {state.idx + 1}/{segments.length} · {waiting ? "Resting — up next" : paused ? "Paused" : "Now"}
          </p>
          <p className="truncate text-base font-semibold">{current?.label}</p>
        </div>
        <span className={cn("shrink-0 text-4xl font-semibold tabular-nums", paused && "animate-pulse text-muted-foreground", waiting && "text-muted-foreground")}>
          {waiting ? "—" : formatTime(secs)}
        </span>
      </div>
      <div className="flex gap-2">
        <Button className="h-16 flex-1 text-lg" onClick={paused ? resume : lap}>
          {waiting ? `Start ${current?.label}` : paused ? "Resume" : next ? `Done → ${next.label}` : "Done · finish"}
        </Button>
        {!waiting && (
          <Button variant="outline" className="h-16 w-16 shrink-0" onClick={paused ? resume : pause} aria-label={paused ? "Resume" : "Pause"}>
            {paused ? <PlayIcon className="size-6" /> : <PauseIcon className="size-6" />}
          </Button>
        )}
        <Button variant="ghost" className="h-16 w-12 shrink-0 text-muted-foreground" onClick={stop} aria-label="Stop timer">
          <SquareIcon className="size-5" />
        </Button>
      </div>
      {running && <span className="sr-only">Timing {current?.label}</span>}
    </div>
  );
}

/** For the log page: memoised segment list. */
export function useSegments(t: WorkoutTemplate | null) {
  return useMemo(() => (t ? timedSegments(t) : []), [t]);
}
