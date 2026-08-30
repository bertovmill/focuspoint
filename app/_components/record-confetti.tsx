"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * The celebration for breaking a personal best on the scorecard.
 *
 * Deliberately not the full-screen `GoalCelebration` modal: hitting an all-time
 * high happens often enough that a dialog you have to dismiss would become a
 * chore by the second week. This is confetti over the page and nothing else —
 * pointer-events-none, self-removing, no state to close. The toast alongside it
 * (fired by the caller) says what actually fell.
 */

const CONFETTI_COLORS = [
  "var(--chart-1, #f97316)",
  "var(--chart-2, #22c55e)",
  "var(--chart-3, #3b82f6)",
  "var(--chart-4, #eab308)",
  "var(--chart-5, #ec4899)",
];

/** How long the longest piece takes to fall, plus a beat. */
const LIFETIME_MS = 4600;

export function RecordConfetti({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.4 + Math.random() * 1.6,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 180,
      })),
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setGone(true);
      onDone();
    }, LIFETIME_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  if (gone) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
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
  );
}
