"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DAILY_GOAL_DEFAULT,
  RECENT_DAYS,
  clampDailyGoal,
  taskPoints,
  type ScorableTask,
  type StreakSummary,
} from "@/lib/streak";
import { StreakCelebration } from "@/app/_components/streak-celebration";

// Holds the score for whichever window is mounted (the main app, or the pinned
// window — each mounts its own provider) and owns the two bits of feedback that
// make finishing a task feel like something:
//
//   1. a "+18" burst that floats off every completion, and
//   2. the full-screen confetti the moment the day's goal is met and the streak
//      ticks up — which fires once per day, because a reward you get twice is
//      wallpaper.
//
// Awards are applied optimistically so the number moves under your thumb, then
// trued up against /api/streak (which is the only thing that actually decides).

const EMPTY: StreakSummary = {
  streak: 0,
  bestStreak: 0,
  doneToday: 0,
  goal: DAILY_GOAL_DEFAULT,
  todayHit: false,
  atRisk: false,
  pointsToday: 0,
  totalPoints: 0,
  recent: [],
};

type Burst = { id: number; points: number };

type StreakContextValue = {
  summary: StreakSummary;
  loaded: boolean;
  /** Re-read the score from the server. */
  refresh: () => Promise<void>;
  /** Score a task the moment it's checked off. */
  award: (task: ScorableTask) => void;
  /** Change how many tasks a day needs. */
  setGoal: (goal: number) => Promise<void>;
};

const StreakContext = createContext<StreakContextValue | null>(null);

/** The score, or a zeroed stand-in when no provider is mounted above. */
export function useStreak(): StreakContextValue {
  const ctx = useContext(StreakContext);
  return (
    ctx ?? {
      summary: EMPTY,
      loaded: false,
      refresh: async () => {},
      award: () => {},
      setGoal: async () => {},
    }
  );
}

export function StreakProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<StreakSummary>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [celebrating, setCelebrating] = useState<{ streak: number; best: boolean } | null>(null);
  const burstId = useRef(0);
  // The day we've already celebrated, so re-opening the app or finishing a sixth
  // task doesn't re-fire the confetti.
  const celebratedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/streak", { cache: "no-store" });
      if (!res.ok) return;
      const data: StreakSummary = await res.json();
      setSummary(data);
      // A goal already met when the app loads is history, not news.
      if (data.todayHit && celebratedFor.current === null) {
        celebratedFor.current = data.recent.at(-1)?.date ?? "loaded";
      }
    } catch {
      // Offline or the DB is down — leave the last known score up rather than zeroing it.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Two windows can be open on the same board (app + pinned), so re-read whenever
    // this one comes back to the front.
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const award = useCallback(
    (task: ScorableTask) => {
      const points = taskPoints(task);
      const id = ++burstId.current;
      setBursts((b) => [...b, { id, points }]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1500);

      setSummary((prev) => {
        const doneToday = prev.doneToday + 1;
        const hitNow = doneToday >= prev.goal;
        const justHit = hitNow && !prev.todayHit;
        const streak = justHit ? prev.streak + 1 : prev.streak;

        if (justHit) {
          const todayKey = prev.recent.at(-1)?.date ?? "today";
          if (celebratedFor.current !== todayKey) {
            celebratedFor.current = todayKey;
            // Out of the state updater — React may run this twice in dev.
            queueMicrotask(() => setCelebrating({ streak, best: streak >= prev.bestStreak }));
          }
        }

        return {
          ...prev,
          doneToday,
          pointsToday: prev.pointsToday + points,
          totalPoints: prev.totalPoints + points,
          todayHit: hitNow,
          atRisk: streak > 0 && !hitNow,
          streak,
          bestStreak: Math.max(prev.bestStreak, streak),
          recent: prev.recent.map((d, i) =>
            i === prev.recent.length - 1
              ? { ...d, tasks: d.tasks + 1, points: d.points + points, hit: hitNow }
              : d
          ),
        };
      });

      // True the optimistic guess up against the server once the write has landed.
      setTimeout(() => refresh(), 900);
    },
    [refresh]
  );

  const setGoal = useCallback(
    async (goal: number) => {
      const clamped = clampDailyGoal(goal);
      setSummary((prev) => ({ ...prev, goal: clamped, todayHit: prev.doneToday >= clamped }));
      try {
        await fetch("/api/settings/daily-goal", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: clamped }),
        });
      } finally {
        // Changing the bar re-scores every day in the window, so the streak has to
        // come back from the server rather than being patched locally.
        celebratedFor.current = null;
        await refresh();
      }
    },
    [refresh]
  );

  const value = useMemo<StreakContextValue>(
    () => ({ summary, loaded, refresh, award, setGoal }),
    [summary, loaded, refresh, award, setGoal]
  );

  return (
    <StreakContext.Provider value={value}>
      {children}

      {/* The "+18" that floats off a finished task. Bottom-right so it never lands
          on the card you just checked. */}
      <div className="pointer-events-none fixed right-6 bottom-20 z-[70] flex flex-col-reverse items-end gap-1" aria-hidden>
        {bursts.map((b) => (
          <span
            key={b.id}
            className="points-burst rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-primary shadow-sm backdrop-blur-sm"
          >
            +{b.points}
          </span>
        ))}
      </div>

      {celebrating && (
        <StreakCelebration
          streak={celebrating.streak}
          goal={summary.goal}
          isBest={celebrating.best}
          onClose={() => setCelebrating(null)}
        />
      )}
    </StreakContext.Provider>
  );
}

/** Re-exported so consumers don't have to reach into lib for the window length. */
export { RECENT_DAYS };
