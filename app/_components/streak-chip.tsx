"use client";

import { useEffect, useRef, useState } from "react";
import { FlameIcon, ZapIcon, TrophyIcon, CheckIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "@/lib/streak";
import { useStreak } from "@/app/_components/streak-provider";
import { cn } from "@/lib/utils";

// The number Berto looks at. Lives on the Tasks toolbar (where the plain
// "0/27 today" counter used to sit) and, in `compact` form, in the pinned window's
// header so it's on top of everything all day.
//
// Flame + streak, then today's progress toward the goal, then points. Click it for
// the last two weeks, the record to beat, and the dial that sets the goal.

/** The goals worth offering. Anything is settable via the API; these are the sane ones. */
const GOAL_CHOICES = [1, 3, 5, 8, 10, 15, 20].filter((n) => n >= DAILY_GOAL_MIN && n <= DAILY_GOAL_MAX);

function dayLabel(date: string) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  // Noon UTC so the label can't slip a day either way.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function StreakChip({ compact = false }: { compact?: boolean }) {
  const { summary, loaded, setGoal } = useStreak();
  const { streak, bestStreak, doneToday, goal, todayHit, atRisk, pointsToday, totalPoints, recent } = summary;

  // Pop the flame whenever the streak actually moves, so the number isn't the only
  // thing that says something happened.
  const [popping, setPopping] = useState(false);
  const prevStreak = useRef(streak);
  useEffect(() => {
    if (streak > prevStreak.current) {
      setPopping(true);
      const t = setTimeout(() => setPopping(false), 640);
      prevStreak.current = streak;
      return () => clearTimeout(t);
    }
    prevStreak.current = streak;
  }, [streak]);

  if (!loaded) return null;

  const progress = goal > 0 ? Math.min(1, doneToday / goal) : 0;
  const remaining = Math.max(0, goal - doneToday);

  const trigger = (
    <button
      className={cn(
        "flex items-center gap-1.5 rounded-md text-[11px] font-medium tabular-nums transition-colors",
        compact
          ? "px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          : "border bg-background/80 px-2 py-1 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground"
      )}
      title={
        todayHit
          ? `${streak}-day streak — today's ${goal} are done`
          : `${remaining} more to keep the ${streak}-day streak alive`
      }
      aria-label={`Streak ${streak} days, ${doneToday} of ${goal} done today`}
    >
      <span className={cn("flex items-center gap-0.5", streak > 0 ? "text-orange-500" : "opacity-60")}>
        <FlameIcon className={cn("size-3.5", popping && "streak-flame-pop")} />
        {streak}
      </span>

      {/* Today's progress: the bar is the thing that says "one more". */}
      <span className="flex items-center gap-1">
        <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
              todayHit ? "bg-emerald-500" : atRisk ? "bg-orange-500" : "bg-primary"
            )}
            style={{ width: `${progress * 100}%` }}
          />
        </span>
        <span className={cn(todayHit && "text-emerald-600 dark:text-emerald-400")}>
          {doneToday}/{goal}
        </span>
      </span>

      {!compact && (
        <span className="flex items-center gap-0.5 border-l pl-1.5 text-muted-foreground">
          <ZapIcon className="size-3" />
          {totalPoints.toLocaleString()}
        </span>
      )}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-2">
          <div className="flex items-baseline justify-between">
            <span className="flex items-baseline gap-1.5 text-lg font-semibold tabular-nums">
              <FlameIcon className={cn("size-4 translate-y-0.5", streak > 0 ? "text-orange-500" : "opacity-40")} />
              {streak} day{streak === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrophyIcon className="size-3" />
              best {bestStreak}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {todayHit ? (
              <>
                Today&apos;s banked — {doneToday} done, {pointsToday} pts.
              </>
            ) : atRisk ? (
              <>
                <span className="font-medium text-orange-500">{remaining} more today</span> or the streak resets.
              </>
            ) : (
              <>{remaining} more to start a streak.</>
            )}
          </p>
        </div>

        <DropdownMenuSeparator />

        {/* The last two weeks. A filled square is a day that counted. */}
        <div className="px-2 py-2">
          <div className="flex items-end gap-1">
            {recent.map((d) => (
              <div
                key={d.date}
                title={`${dayLabel(d.date)} — ${d.tasks} done, ${d.points} pts`}
                className={cn(
                  "h-6 flex-1 rounded-sm border text-[9px] leading-6 text-center tabular-nums",
                  d.hit
                    ? "border-emerald-500/40 bg-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                    : d.tasks > 0
                      ? "border-border bg-muted text-muted-foreground"
                      : "border-dashed border-border/60 text-transparent"
                )}
              >
                {d.tasks || 0}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{recent.length} days ago</span>
            <span>today</span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <div className="flex items-center justify-between px-2 py-1.5 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ZapIcon className="size-3" /> points
          </span>
          <span className="tabular-nums">
            {pointsToday.toLocaleString()} today · {totalPoints.toLocaleString()} all time
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs">Tasks a day to keep the streak</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(goal)} onValueChange={(v) => setGoal(Number(v))}>
          {GOAL_CHOICES.map((n) => (
            <DropdownMenuRadioItem key={n} value={String(n)} className="text-xs">
              {n === 1 ? "1 — one thing a day" : n === 20 ? "20 — machine" : `${n} a day`}
              {n === goal && doneToday >= n && <CheckIcon className="ml-auto size-3 text-emerald-500" />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
