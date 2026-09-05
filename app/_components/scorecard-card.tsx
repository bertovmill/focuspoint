"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  FlameIcon,
  Loader2Icon,
  RefreshCwIcon,
  TrophyIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecordConfetti } from "@/app/_components/record-confetti";
import { ScoreChart } from "@/app/_components/score-chart";
import { ActivityRings } from "@/app/_components/activity-rings";
import { HabitRow } from "@/app/_components/habit-row";
import {
  METRIC_WEIGHT,
  formatMetric,
  metricDef,
  nextTierAt,
  scoreTier,
  type MetricKey,
  type ScorecardSummary,
} from "@/lib/scorecard";
import { cn } from "@/lib/utils";

/**
 * "Winning day" — the daily scorecard from Berto's Aug 28 note, scored.
 *
 * Cut down to three keys on 2026-09-03 — his call: *"lets remove the reading
 * measure, lets remove the fasting measure, lets instead just make it the 3 -
 * keystrokes, steps, and sleep time."* Everything that needed a manual tap or a
 * timer (fasting, meditation, reading, journal) or rode below the line without
 * gating the day (portfolio, notes written) is gone — every remaining key comes
 * from an API or an always-on background agent, so the card never waits on him.
 *
 * Drawn as three Fitbit/Google-Fit-style progress rings (2026-09-03, his ask) rather
 * than the old stacked boxes, with a second unscored row of core habits — read,
 * meditate, journal — underneath (see ActivityRings and HabitRow).
 */

/** How each tier reads at a glance — cold is quiet, legendary is loud. */
const TIER_STYLES: Record<ReturnType<typeof scoreTier>["key"], string> = {
  legendary: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  elite: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  strong: "bg-emerald-600/15 text-emerald-600 dark:text-emerald-500",
  solid: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  warming: "bg-muted text-muted-foreground",
  cold: "bg-muted text-muted-foreground",
};

/** Records already celebrated, so a reload or a poll can't re-fire the confetti. */
const CELEBRATED_KEY = "scorecard:celebrated";

/**
 * Parse what a human types for a duration: "7h30", "7:30", "7.5". Returns minutes,
 * or null if it's not a number at all. A naked number under 24 reads as hours.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const hm = s.match(/^(\d+)\s*(?:h|:)\s*(\d+)?m?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);

  const mins = s.match(/^(\d+)\s*m(?:in)?$/);
  if (mins) return Number(mins[1]);

  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n < 24 ? Math.round(n * 60) : Math.round(n);
}

/** Parse a plain count, tolerating "18,240". */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** "2026-08-14" → "Aug 14". Parsed as UTC noon so the label can't slip a day. */
export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ScorecardCard() {
  const [summary, setSummary] = useState<ScorecardSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  // Records celebrated this session, so an in-flight PATCH response can't double-fire
  // before the localStorage write has been read back.
  const celebrated = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scorecard");
      if (res.ok) setSummary(await res.json());
    } catch {
      // A dead scorecard fetch shouldn't take the home screen with it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("scorecard:refresh", refresh);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("scorecard:refresh", refresh);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  /**
   * Fire the celebration for any record broken today that hasn't been celebrated
   * yet. Keyed by day so beating your steps record at noon and your score record
   * at 9pm are two separate moments — but reloading the page is neither.
   */
  useEffect(() => {
    if (!summary?.broken.length) return;

    let seen: string[] = [];
    try {
      const raw = localStorage.getItem(CELEBRATED_KEY);
      const parsed = raw ? (JSON.parse(raw) as { date?: string; keys?: string[] }) : null;
      if (parsed?.date === summary.today.date) seen = parsed.keys ?? [];
    } catch {
      // A corrupt or unavailable store just means we celebrate once more than needed.
    }

    const fresh = summary.broken.filter((k) => !seen.includes(k) && !celebrated.current.has(k));
    if (!fresh.length) return;

    for (const key of fresh) celebrated.current.add(key);
    try {
      localStorage.setItem(
        CELEBRATED_KEY,
        JSON.stringify({ date: summary.today.date, keys: [...seen, ...fresh] }),
      );
    } catch {
      // Non-fatal: private mode just means the confetti can repeat on reload.
    }

    for (const key of fresh) {
      if (key === "score") {
        const old = summary.records.score;
        toast.success(`New high score — ${summary.today.score} pts`, {
          description: old ? `Your best was ${old.value}, set ${shortDate(old.date)}.` : "The first one on the board.",
        });
      } else {
        const old = summary.records.metrics[key];
        const value = summary.today.metrics.find((m) => m.key === key)?.value ?? null;
        toast.success(`New ${metricDef(key).label.toLowerCase()} record — ${formatMetric(key, value)}`, {
          description: old ? `Old best ${formatMetric(key, old.value)}, ${shortDate(old.date)}.` : undefined,
        });
      }
    }

    setCelebrating(true);
  }, [summary]);

  // Coming back from the watch consent screen — say what happened and refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const watch = params.get("watch");
    if (!watch) return;
    if (watch === "connected") {
      toast.success("Watch connected — steps and sleep will sync automatically");
      void load();
    } else {
      toast.error("Couldn't connect the watch");
    }
    // Strip the params so a refresh doesn't re-toast.
    window.history.replaceState({}, "", window.location.pathname);
  }, [load]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/scorecard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setSummary(await res.json());
    } catch {
      toast.error("Couldn't save that");
    }
  }, []);

  const handleEdit = useCallback(
    (key: MetricKey, raw: string) => {
      const def = metricDef(key);
      const value = def.kind === "duration" ? parseDuration(raw) : parseAmount(raw);
      if (value === null) {
        toast.error("Didn't understand that number");
        return;
      }
      void patch({ [key]: value });
    },
    [patch],
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const health = await fetch("/api/health/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 3 }),
      }).then((r) => r.json());

      if (!health.connected) toast.error("The watch isn't connected");
      else toast.success(health.synced ? `Synced ${health.synced} day${health.synced === 1 ? "" : "s"}` : "Nothing new from the watch");
      await load();
    } catch {
      toast.error("Watch sync failed");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  if (!summary) return null;

  const { today, recent, streak, bestStreak, atRisk, googleConnected, records, broken, maxScore, recordsSince } = summary;
  const total = today.metrics.length;

  const tier = scoreTier(today.score);
  const nextTier = nextTierAt(today.score);
  const best = records.score;
  const beatingBest = best !== null && today.score > best.value;
  // The bar the headline fills toward: your own best, or the theoretical max on day
  // one when there's nothing to beat yet.
  const bar = best?.value ?? maxScore;
  const pctOfBar = Math.min(100, Math.round((today.score / Math.max(1, bar)) * 100));
  const toBeat = best ? best.value - today.score + 1 : 0;
  // Within striking distance of the record — the bar starts glowing before he gets there.
  const closingIn = !beatingBest && pctOfBar >= 75;

  // Days before keystroke tracking began were scored without a whole gating metric, so
  // they can't be compared to today and can't hold the peak — but they still happened,
  // so they're drawn, just dimmed. Without this the strip cheerfully crowns a day that
  // the high score above it says isn't the best.
  const comparable = recent.filter((d) => d.date >= recordsSince);
  const peak = comparable.length ? Math.max(...comparable.map((d) => d.score)) : 0;

  return (
    <div className="mb-6">
      {celebrating && <RecordConfetti onDone={() => setCelebrating(false)} />}

      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Winning day
        </p>
        {googleConnected ? (
          <Button variant="secondary" size="sm" onClick={sync} disabled={syncing} className="h-9 gap-1.5 rounded-full px-4 text-sm">
            {syncing ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
            Sync
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 rounded-full px-4 text-sm">
            <a href="/api/health/connect">
              <ActivityIcon className="size-3" />
              Connect watch
            </a>
          </Button>
        )}
      </div>

      <Card
        className={cn(
          "rounded-3xl px-5 py-5 shadow-none gap-0 transition-colors",
          beatingBest && "border-amber-500/50 bg-amber-500/[0.03]",
        )}
      >
        {/* Headline: today's score, and the number it's hunting. */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-[40px] font-bold tabular-nums leading-none tracking-tight",
                today.perfect
                  ? "text-emerald-600 dark:text-emerald-500"
                  : beatingBest
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-primary",
              )}
              title={`${today.score} out of ${maxScore} — a perfect day is every target hit`}
            >
              {Math.round(today.score)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/ {maxScore}</span>
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-xs font-semibold uppercase tracking-wide",
                  TIER_STYLES[tier.key],
                )}
                title={nextTier ? `${nextTier.points} pts to ${nextTier.tier.label}` : "Top tier — nothing above this"}
              >
                {tier.label}
              </span>
              {today.hitCount} of {total} targets hit
              {today.perfect && <span className="font-medium text-emerald-600 dark:text-emerald-500">· perfect day</span>}
            </p>
          </div>

          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <TrophyIcon className="size-3 text-amber-500" />
              High score
            </p>
            <p
              className="text-[15px] font-semibold tabular-nums leading-tight"
              title={`Best day since keystroke tracking began (${shortDate(recordsSince)})`}
            >
              {best ? best.value.toLocaleString("en-CA") : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{best ? shortDate(best.date) : "not set yet"}</p>
          </div>
        </div>

        {/* How close today is to toppling it. */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500",
              beatingBest
                ? "bg-amber-500"
                : closingIn
                  ? "bg-amber-500/70"
                  : today.perfect
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-500",
            )}
            style={{ width: `${beatingBest ? 100 : pctOfBar}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
          <p className={cn("font-medium", (beatingBest || closingIn) && "text-amber-600 dark:text-amber-400")}>
            {beatingBest
              ? `New high score — ${(today.score - best!.value).toLocaleString("en-CA")} clear of your best`
              : best
                ? `${toBeat.toLocaleString("en-CA")} pts to beat your best`
                : "Set the first high score"}
          </p>
          <span className="flex shrink-0 items-center gap-1.5">
            <FlameIcon
              className={cn(
                "size-3.5",
                streak > 0 ? "text-orange-500" : "text-muted-foreground/50",
                atRisk && "animate-pulse",
              )}
            />
            <span className="tabular-nums font-medium">{streak}</span>
            <span className="text-muted-foreground">
              {streak === 1 ? "perfect day" : "perfect days"}
              {bestStreak > streak && ` · best ${bestStreak}`}
            </span>
          </span>
        </div>

        {/* Three rings, left to right — Steps · Sleep · Keystrokes. */}
        <div className="mt-3 border-t pt-3">
          <ActivityRings metrics={today.metrics} broken={broken} onEdit={handleEdit} />
        </div>

        {/* Second row, unscored — the core habits. */}
        <HabitRow />

        {/* How the number above was built, in one line. */}
        <p className="mt-3 border-t border-dashed pt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/70">100 is a perfect day.</span>{" "}
          {total} keys, worth {METRIC_WEIGHT.toFixed(1)} each. Hit a target and you bank the whole
          slice; get halfway and you bank half. Going past a target earns nothing extra — the
          target is the target.
        </p>

        {/* Fourteen days of day-score, drawn as a trajectory rather than fourteen
            separate verdicts — his ask. See score-chart.tsx for the colour choice. */}
        <div className="mt-3 border-t pt-3">
          <ScoreChart recent={recent} record={best?.value ?? null} total={total} recordsSince={recordsSince} />
          <p className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Last {recent.length} days · today on the right</span>
            {peak > 0 && <span className="text-amber-600 dark:text-amber-400">peak {peak.toLocaleString("en-CA")}</span>}
          </p>
        </div>
      </Card>
    </div>
  );
}
