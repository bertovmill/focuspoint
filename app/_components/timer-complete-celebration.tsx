"use client";

import { useEffect, useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const CONFETTI_COLORS = [
  "var(--chart-1, #f97316)",
  "var(--chart-2, #22c55e)",
  "var(--chart-3, #3b82f6)",
  "var(--chart-4, #eab308)",
  "var(--chart-5, #ec4899)",
];

/** Full-screen one-time celebration when a task's timer hits zero. */
export function TimerCompleteCelebration({ taskTitle, onClose }: { taskTitle: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 160,
      })),
    [],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div
        className={cn("chat-modal-backdrop absolute inset-0 bg-black/60", closing && "opacity-0 transition-opacity duration-150")}
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
        aria-label="Timer complete"
        className={cn(
          "chat-modal-panel relative w-full max-w-sm rounded-2xl border border-border bg-card px-7 py-8 text-center shadow-2xl",
          closing && "opacity-0 scale-95 transition-all duration-150",
        )}
      >
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <XIcon className="size-4" />
        </button>
        <p className="text-4xl mb-3">⏰</p>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1.5">
          Time&apos;s up
        </p>
        <p className="text-xl font-semibold leading-snug mb-2">{taskTitle}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Wrap it up, or keep going and check in on progress.
        </p>
        <button
          onClick={handleClose}
          className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
