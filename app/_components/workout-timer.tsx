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
  /** While waiting before this segment, count this rest down (seconds). */
  restSec?: number;
}

export function timedSegments(t: WorkoutTemplate): Segment[] {
  const out: Segment[] = [];
  for (const b of t.blocks) {
    for (const ex of b.exercises) {
      if (ex.measure !== "time" || ex.selfTimed) continue;
      for (let i = 0; i < ex.sets; i++) {
        out.push({
          exKey: ex.key,
          set: i,
          label: `${ex.name}${ex.sets > 1 ? ` ${i + 1}` : ""}${t.blocks.length > 1 ? ` · ${b.label.replace(/ ·.*$/, "")}` : ""}`,
          waitFirst: !!ex.waitBetweenSets && i > 0,
          restSec: ex.waitBetweenSets && i > 0 ? ex.restBetweenSets : undefined,
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
  /** When the rest before a waiting rep began (epoch ms), for its countdown. */
  restStart?: number | null;
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

/** Rest left before the waiting rep, in seconds (negative once it's over); null when there's no countdown. */
function restLeft(s: TimerState, seg: Segment | null, now: number) {
  if (s.segStart !== null || !seg?.restSec || !s.restStart) return null;
  return seg.restSec - (now - s.restStart) / 1000;
}

// One AudioContext, unlocked by a tap (iOS only plays sound started from a gesture's context).
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  } catch {
    // no Web Audio — the buzz and the screen still say it
  }
}

/** Rest's over: three short beeps, and a buzz where the phone allows it. */
function restDoneAlert() {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {}
  if (!audio) return;
  try {
    for (let i = 0; i < 3; i++) {
      const at = audio.currentTime + i * 0.3;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  } catch {}
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

  // Beep once when the rest runs out (not on reopening the page long after).
  const rest = state ? restLeft(state, current, now) : null;
  const alerted = useRef<string | null>(null);
  useEffect(() => {
    if (rest === null || !state) return;
    const id = `${state.idx}:${state.restStart}`;
    if (rest <= 0 && rest > -5 && alerted.current !== id) {
      alerted.current = id;
      restDoneAlert();
    }
  }, [rest, state]);

  if (segments.length === 0) return null;

  const start = () => {
    unlockAudio();
    save({ idx: 0, segStart: Date.now(), pausedMs: 0, pausedAt: null });
  };
  const lap = () => {
    unlockAudio();
    const s = stateRef.current;
    if (!s) return;
    const t = Date.now();
    if (s.segStart === null) {
      // Waiting between interval reps: this tap starts the rep.
      save({ ...s, segStart: t, pausedMs: 0, pausedAt: null, restStart: null });
      return;
    }
    const seg = segments[s.idx];
    onSplit(seg, Math.round(elapsed(s, t) / 1000));
    const following = segments[s.idx + 1];
    if (!following) {
      save(null);
      return;
    }
    save({ idx: s.idx + 1, segStart: following.waitFirst ? null : t, pausedMs: 0, pausedAt: null, restStart: following.waitFirst ? t : null });
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
  const restOver = rest !== null && rest <= 0;

  return (
    <div className="sticky bottom-20 z-20 space-y-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {state.idx + 1}/{segments.length} · {waiting ? (restOver ? "Rest's up — go" : "Resting — up next") : paused ? "Paused" : "Now"}
          </p>
          <p className="truncate text-base font-semibold">{current?.label}</p>
        </div>
        <span
          className={cn(
            "shrink-0 text-4xl font-semibold tabular-nums",
            paused && "animate-pulse text-muted-foreground",
            waiting && !restOver && "text-muted-foreground",
            restOver && "animate-pulse text-primary",
          )}
        >
          {rest !== null ? (restOver ? "Go" : formatTime(Math.ceil(rest))) : waiting ? "—" : formatTime(secs)}
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

/** The rest countdown for a machine-timed exercise, from its template; null when there isn't one. */
export function selfTimedRest(t: WorkoutTemplate | null): { label: string; sec: number } | null {
  const ex = t?.blocks.flatMap((b) => b.exercises).find((e) => e.selfTimed && e.restBetweenSets);
  return ex?.restBetweenSets ? { label: ex.name, sec: ex.restBetweenSets } : null;
}

/**
 * Rest-only timer for reps the treadmill times (Berto, 2026-10-15): he types each
 * rep's time from the machine, does his Rockies, then taps to start the rest.
 * It counts down, beeps and buzzes at zero, and runs off a stored start time like
 * the lap timer, so the phone sleeping doesn't lose it.
 */
export function RestTimer({ slug, date, sec }: { slug: string; date: string; sec: number }) {
  const key = `cael.rest-timer.${slug}.${date}`;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setStartedAt(raw ? Number(raw) : null);
    } catch {
      setStartedAt(null);
    }
  }, [key]);

  const save = (t: number | null) => {
    setStartedAt(t);
    try {
      if (t) localStorage.setItem(key, String(t));
      else localStorage.removeItem(key);
    } catch {
      // private mode — still works for this page view
    }
  };

  useWakeLock(startedAt !== null);
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [startedAt]);

  const left = startedAt !== null ? sec - (now - startedAt) / 1000 : null;
  const alerted = useRef<number | null>(null);
  useEffect(() => {
    if (left === null || startedAt === null) return;
    if (left <= 0 && left > -5 && alerted.current !== startedAt) {
      alerted.current = startedAt;
      restDoneAlert();
    }
  }, [left, startedAt]);

  const start = () => {
    unlockAudio();
    save(Date.now());
  };

  if (left === null) {
    return (
      <div className="sticky bottom-20 z-20 lg:bottom-4">
        <Button className="h-14 w-full gap-2 text-lg shadow-lg" onClick={start}>
          <TimerIcon className="size-5" /> Start {formatTime(sec)} rest
        </Button>
      </div>
    );
  }

  const over = left <= 0;
  return (
    <div className="sticky bottom-20 z-20 space-y-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold">{over ? "Rest's up — go" : "Resting"}</p>
        <span className={cn("shrink-0 text-4xl font-semibold tabular-nums", over ? "animate-pulse text-primary" : "text-muted-foreground")}>
          {over ? "Go" : formatTime(Math.ceil(left))}
        </span>
      </div>
      <div className="flex gap-2">
        <Button className="h-16 flex-1 text-lg" onClick={() => save(null)}>
          {over ? "Dismiss" : "Skip rest"}
        </Button>
        <Button variant="outline" className="h-16 shrink-0 px-4" onClick={start}>
          Restart
        </Button>
      </div>
    </div>
  );
}

/** For the log page: memoised segment list. */
export function useSegments(t: WorkoutTemplate | null) {
  return useMemo(() => (t ? timedSegments(t) : []), [t]);
}
