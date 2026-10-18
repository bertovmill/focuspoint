"use client";

import { useEffect, useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { playCelebrationSound } from "@/lib/celebration-sound";

// Fires once a day: the moment the day's task goal is met and the streak ticks up.
// Same confetti as the timer celebration (app/_components/timer-complete-celebration.tsx)
// — this is the bigger sibling, and the reason to finish the fifth task instead of
// stopping at four.

const CONFETTI_COLORS = [
  "var(--chart-1, #f97316)",
  "var(--chart-2, #22c55e)",
  "var(--chart-3, #3b82f6)",
  "var(--chart-4, #eab308)",
  "var(--chart-5, #ec4899)",
];

/** A line that means something different at 1 day than at 40. */
function streakLine(streak: number, isBest: boolean) {
  if (isBest && streak > 1) return "That's your longest run yet. Don't be the one who ends it.";
  if (streak === 1) return "Day one. The only day that's ever hard to repeat.";
  if (streak < 7) return "It's starting to cost something to break. Good.";
  if (streak < 30) return "Weeks deep. This is what not stalling looks like.";
  return "This isn't a streak any more, it's how you work.";
}

export function StreakCelebration({
  streak,
  goal,
  isBest,
  onClose,
}: {
  streak: number;
  goal: number;
  isBest: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 180,
      })),
    []
  );

  useEffect(() => {
    playCelebrationSound();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    // Nothing to decide here — it closes itself so it never blocks the next task.
    const timer = setTimeout(handleClose, 6000);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
      <div
        className={cn(
          "chat-modal-backdrop absolute inset-0 bg-black/60",
          closing && "opacity-0 transition-opacity duration-150"
        )}
        onClick={handleClose}
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.4,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              // @ts-expect-error custom property consumed by the confetti-piece keyframes
              "--confetti-drift": `${p.drift}px`,
              "--confetti-rotate": `${p.rotate}deg`,
            }}
          />
        ))}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Daily goal hit"
        className={cn(
          "chat-modal-panel relative w-full max-w-sm rounded-2xl border border-border bg-card px-7 py-8 text-center shadow-2xl",
          closing && "scale-95 opacity-0 transition-all duration-150"
        )}
      >
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
        <p className="mb-3 text-5xl">🔥</p>
        <p className="mb-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {goal} done — day banked
        </p>
        <p className="mb-2 text-3xl font-semibold tabular-nums">
          {streak} day{streak === 1 ? "" : "s"}
        </p>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{streakLine(streak, isBest)}</p>
        <button
          onClick={handleClose}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Keep going
        </button>
      </div>
    </div>
  );
}
