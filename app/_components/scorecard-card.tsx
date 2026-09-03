"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  FlameIcon,
  FootprintsIcon,
  KeyboardIcon,
  Loader2Icon,
  MoonIcon,
  RefreshCwIcon,
  TrophyIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecordConfetti } from "@/app/_components/record-confetti";
import { ScoreChart } from "@/app/_components/score-chart";
import {
  METRIC_WEIGHT,
  formatMetric,
  formatTarget,
  metricDef,
  nextTierAt,
  scoreTier,
  type MetricKey,
  type MetricValue,
  type PersonalBest,
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
 * The three boxes read left to right rather than the old stacked rows — three
 * things fit as a glance, not a list.
 */

const ICONS: Record<MetricKey, typeof FootprintsIcon> = {
  steps: FootprintsIcon,
  sleep_minutes: MoonIcon,
  keystrokes: KeyboardIcon,
};

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

function MetricBox({
  metric,
  best,
  isRecord,
  editable,
  onEdit,
}: {
  metric: MetricValue;
  /** The bar to beat, as it stood before today. */
  best: PersonalBest | undefined;
  /** Today has already beaten it. */
  isRecord: boolean;
  editable: boolean;
  onEdit: (key: MetricKey, raw: string) => void;
}) {
  const def = metricDef(metric.key);
  const Icon = ICONS[metric.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const pct = metric.value === null || metric.target <= 0 ? null : Math.min(100, Math.round((metric.value / metric.target) * 100));

  const commit = () => {
    setEditing(false);
    if (draft.trim()) onEdit(metric.key, draft);
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2 rounded-lg border px-3 py-3",
        isRecord ? "border-amber-500/40 bg-amber-500/[0.04]" : metric.hit ? "border-emerald-600/30 bg-emerald-600/[0.04]" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            isRecord
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : metric.hit
                ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-500"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </span>
        {isRecord && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <ZapIcon className="size-2.5" />
            record
          </span>
        )}
      </div>

      <p className="truncate text-[11px] font-medium leading-tight">{def.label}</p>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={def.kind === "duration" ? "7h30" : ""}
          className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[15px] font-semibold tabular-nums outline-none focus:border-foreground/40"
        />
      ) : (
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            setDraft(metric.value === null ? "" : String(metric.value));
            setEditing(true);
          }}
          title={editable ? "Click to edit" : "Counted automatically by the Mac agent"}
          className={cn(
            "-mx-1 rounded-md px-1 py-0.5 text-left text-[15px] font-semibold tabular-nums leading-none",
            editable && "hover:bg-muted",
            metric.hit ? "text-emerald-600 dark:text-emerald-500" : "text-foreground",
          )}
        >
          {formatMetric(metric.key, metric.value)}
          <span className="text-[10.5px] font-normal text-muted-foreground"> / {formatTarget(metric.key, metric.target)}</span>
        </button>
      )}

      {pct !== null && (
        <span className="block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full", metric.hit ? "bg-emerald-600" : "bg-foreground/40")}
            style={{ width: `${pct}%` }}
          />
        </span>
      )}

      <div className="flex items-center justify-between text-[10px] leading-tight">
        <span className="text-muted-foreground">
          {best ? (
            <span className={isRecord ? "line-through opacity-60" : undefined}>best {formatMetric(metric.key, best.value)}</span>
          ) : (
            def.hint
          )}
        </span>
        <span className={cn("font-medium tabular-nums", metric.hit ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground/60")}>
          {metric.points.toFixed(1)}/{METRIC_WEIGHT.toFixed(1)}
        </span>
      </div>
    </div>
  );
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
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
          Winning day
        </p>
        {googleConnected ? (
          <Button variant="ghost" size="sm" onClick={sync} disabled={syncing} className="h-7 gap-1.5 text-[11px]">
            {syncing ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
            Sync
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild className="h-7 gap-1.5 text-[11px]">
            <a href="/api/health/connect">
              <ActivityIcon className="size-3" />
              Connect watch
            </a>
          </Button>
        )}
      </div>

      <Card
        className={cn(
          "rounded-xl px-5 py-4 shadow-none gap-0 transition-colors",
          beatingBest && "border-amber-500/50 bg-amber-500/[0.03]",
        )}
      >
        {/* Headline: today's score, and the number it's hunting. */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-[34px] font-semibold tabular-nums leading-none tracking-tight",
                today.perfect
                  ? "text-emerald-600 dark:text-emerald-500"
                  : beatingBest && "text-amber-600 dark:text-amber-400",
              )}
              title={`${today.score} out of ${maxScore} — a perfect day is every target hit`}
            >
              {Math.round(today.score)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/ {maxScore}</span>
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide",
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
            <p className="flex items-center justify-end gap-1 text-[9.5px] font-medium uppercase tracking-widest text-muted-foreground">
              <TrophyIcon className="size-3 text-amber-500" />
              High score
            </p>
            <p
              className="text-[15px] font-semibold tabular-nums leading-tight"
              title={`Best day since keystroke tracking began (${shortDate(recordsSince)})`}
            >
              {best ? best.value.toLocaleString("en-CA") : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">{best ? shortDate(best.date) : "not set yet"}</p>
          </div>
        </div>

        {/* How close today is to toppling it. */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500",
              beatingBest
                ? "bg-amber-500"
                : closingIn
                  ? "bg-amber-500/70"
                  : today.perfect
                    ? "bg-emerald-600"
                    : "bg-foreground/45",
            )}
            style={{ width: `${beatingBest ? 100 : pctOfBar}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
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

        {/* Three boxes, left to right — Steps · Sleep · Keystrokes. */}
        <div className="mt-3 flex gap-2 border-t pt-3 sm:gap-3">
          {today.metrics.map((m) => (
            <MetricBox
              key={m.key}
              metric={m}
              best={records.metrics[m.key]}
              isRecord={broken.includes(m.key)}
              // Keystrokes are the one number he can't type: the Mac agent owns that
              // box, and it only ever moves the count upward.
              editable={metricDef(m.key).source !== "agent"}
              onEdit={handleEdit}
            />
          ))}
        </div>

        {/* How the number above was built, in one line. */}
        <p className="mt-3 border-t border-dashed pt-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/70">100 is a perfect day.</span>{" "}
          {total} keys, worth {METRIC_WEIGHT.toFixed(1)} each. Hit a target and you bank the whole
          slice; get halfway and you bank half. Going past a target earns nothing extra — the
          target is the target.
        </p>

        {/* Fourteen days of day-score, drawn as a trajectory rather than fourteen
            separate verdicts — his ask. See score-chart.tsx for the colour choice. */}
        <div className="mt-3 border-t pt-3">
          <ScoreChart recent={recent} record={best?.value ?? null} total={total} recordsSince={recordsSince} />
          <p className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Last {recent.length} days · today on the right</span>
            {peak > 0 && <span className="text-amber-600 dark:text-amber-400">peak {peak.toLocaleString("en-CA")}</span>}
          </p>
        </div>
      </Card>
    </div>
  );
}
