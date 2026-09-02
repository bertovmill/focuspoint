"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  CheckIcon,
  FlameIcon,
  BookOpenIcon,
  FootprintsIcon,
  Flower2Icon,
  KeyboardIcon,
  Loader2Icon,
  MoonIcon,
  PencilLineIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  TrophyIcon,
  UtensilsCrossedIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecordConfetti } from "@/app/_components/record-confetti";
import { ScoreChart } from "@/app/_components/score-chart";
import {
  GATING_METRICS,
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
 * The card used to answer one question — is today a win? — with `1 / 4`, which is
 * the same number whether you walked 400 steps or 19,900. Now it answers a second,
 * more useful one: **how good is today, and can it beat your best?** Every metric
 * pays points in proportion to how far it got (lib/scorecard.ts), so the headline
 * number moves daily and has an all-time high to chase. Break a record and it says
 * so, loudly, once.
 *
 * Portfolio still rides below the line — it's a level, not something you win by
 * trying harder today — but it keeps a personal best, because that one only goes up.
 *
 * Every row is still editable by clicking the number: a metric you can't correct
 * is a metric you stop trusting.
 */

const ICONS: Record<MetricKey, typeof FootprintsIcon> = {
  steps: FootprintsIcon,
  sleep_minutes: MoonIcon,
  fasting_held: UtensilsCrossedIcon,
  meditation_minutes: Flower2Icon,
  journalled: BookOpenIcon,
  readwise_notes: PencilLineIcon,
  keystrokes: KeyboardIcon,
  portfolio: TrendingUpIcon,
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
 * Parse what a human types for a duration: "7h30", "7:30", "7.5", "450m", "7h".
 * Returns minutes, or null if it's not a number at all.
 *
 * `bare` decides what a naked number means, and it genuinely differs by row: typing
 * "8" in the sleep row means eight hours, typing "20" in the meditation row means
 * twenty minutes. Reading both as hours would log a twenty-hour sit.
 */
export function parseDuration(input: string, bare: "hours" | "minutes" = "hours"): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const hm = s.match(/^(\d+)\s*(?:h|:)\s*(\d+)?m?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);

  const mins = s.match(/^(\d+)\s*m(?:in)?$/);
  if (mins) return Number(mins[1]);

  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (bare === "minutes") return Math.round(n);
  // A bare number under 24 is hours ("7.5"); anything larger is already minutes.
  return n < 24 ? Math.round(n * 60) : Math.round(n);
}

/** Parse a plain count or dollar amount, tolerating "18,240" and "$142k". */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const k = s.match(/^([\d.]+)k$/);
  if (k) return Math.round(Number(k[1]) * 1000);
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

function MetricRow({
  metric,
  best,
  isRecord,
  editable,
  onEdit,
  onToggle,
}: {
  metric: MetricValue;
  /** The bar to beat, as it stood before today. */
  best: PersonalBest | undefined;
  /** Today has already beaten it. */
  isRecord: boolean;
  editable: boolean;
  onEdit: (key: MetricKey, raw: string) => void;
  onToggle: (held: boolean) => void;
}) {
  const def = metricDef(metric.key);
  const Icon = ICONS[metric.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const pct =
    def.kind === "toggle" || def.kind === "money" || metric.value === null || metric.target <= 0
      ? null
      : Math.min(100, Math.round((metric.value / metric.target) * 100));

  const commit = () => {
    setEditing(false);
    if (draft.trim()) onEdit(metric.key, draft);
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          isRecord
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : metric.hit
              ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-500"
              : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium leading-tight">
          {def.label}
          {isRecord && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <ZapIcon className="size-2.5" />
              record
            </span>
          )}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground leading-tight">
          {def.hint}
          {/* The bar to beat, right where the eye already is. */}
          {best && (
            <span className={cn("ml-1", isRecord && "line-through opacity-60")}>
              · best {formatMetric(metric.key, best.value)}
            </span>
          )}
        </span>
      </span>

      {/* Progress toward the bar, for the metrics that have one. */}
      {pct !== null && (
        <span className="hidden sm:block h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full", metric.hit ? "bg-emerald-600" : "bg-foreground/40")}
            style={{ width: `${pct}%` }}
          />
        </span>
      )}

      {def.kind === "toggle" && def.source === "journal" ? (
        /* Derived from the journal page below, so there is nothing to tap here — it
           earns itself the moment there are words on the page. Reads as a state, not
           a control, so nobody hunts for a checkbox that was never going to exist. */
        <span
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
            metric.hit ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-600 dark:text-emerald-500" : "border-dashed border-border text-muted-foreground",
          )}
          title="Earned by writing today's journal page, below"
        >
          {metric.hit && <CheckIcon className="size-3" />}
          {metric.hit ? "written" : "not yet"}
        </span>
      ) : def.kind === "toggle" ? (
        <button
          type="button"
          onClick={() => onToggle(!metric.hit)}
          aria-pressed={metric.hit}
          aria-label={metric.hit ? "Mark the eating window broken" : "Mark the eating window held"}
          className={cn(
            "tap-target flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors",
            metric.hit
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {metric.hit && <CheckIcon className="size-3" />}
          {metric.value === null ? "not set" : formatMetric(metric.key, metric.value)}
        </button>
      ) : editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={def.kind === "duration" ? (metric.key === "meditation_minutes" ? "20m" : "7h30") : ""}
          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-[12px] tabular-nums outline-none focus:border-foreground/40"
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
            "shrink-0 rounded-md px-1.5 py-1 text-right text-[12.5px] tabular-nums",
            editable && "hover:bg-muted",
            metric.hit ? "font-semibold text-emerald-600 dark:text-emerald-500" : "text-foreground",
          )}
        >
          {formatMetric(metric.key, metric.value)}
          {def.kind !== "money" && (
            <span className="text-muted-foreground font-normal">
              {" / "}
              {formatTarget(metric.key, metric.target)}
            </span>
          )}
        </button>
      )}

      {/* What the row is worth, out of the slice it could have been worth. Showing
          the denominator on every row is the point: the score stops being a number
          you have to trust and becomes one you can add up by eye. */}
      {def.gates && (
        <span
          className={cn(
            "w-[52px] shrink-0 text-right text-[11px] font-medium tabular-nums",
            metric.hit
              ? "text-emerald-600 dark:text-emerald-500"
              : metric.points > 0
                ? "text-foreground/70"
                : "text-muted-foreground/50",
          )}
          title={`${metric.points} of a possible ${METRIC_WEIGHT.toFixed(1)} points`}
        >
          {metric.points.toFixed(1)}
          <span className="text-muted-foreground/60 font-normal">
            /{METRIC_WEIGHT.toFixed(1)}
          </span>
        </span>
      )}
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

  /**
   * Re-read when something else on the page moves a key: the meditation timer
   * finishing a sit, or coming back to the tab after writing the journal (which is
   * scored from its own autosave, with nothing to notify us). Deliberately not a
   * poll — a bare interval here is what burned 4.8M invocations in August.
   */
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
      const value =
        def.kind === "duration"
          ? parseDuration(raw, key === "meditation_minutes" ? "minutes" : "hours")
          : parseAmount(raw);
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
      // One button, both sources — the portfolio is a different provider but nobody
      // thinks of it that way; they just want the card to be current.
      const [health, portfolio] = await Promise.all([
        fetch("/api/health/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: 3 }),
        }).then((r) => r.json()),
        fetch("/api/portfolio/sync", { method: "POST" }).then((r) => r.json()),
      ]);

      if (!health.connected) toast.error("The watch isn't connected");
      else toast.success(health.synced ? `Synced ${health.synced} day${health.synced === 1 ? "" : "s"}` : "Nothing new from the watch");
      // The portfolio is below the line, so its failure is a quiet note, not an error
      // competing with the watch's own result.
      if (portfolio.connected && portfolio.amount === null) toast.message("Couldn't read the portfolio");
      await load();
    } catch {
      toast.error("Watch sync failed");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  if (!summary) return null;

  const { today, recent, streak, bestStreak, atRisk, googleConnected, records, broken, maxScore, recordsSince } = summary;
  const total = GATING_METRICS.length;
  const gating = today.metrics.filter((m) => metricDef(m.key).gates);
  const tracked = today.metrics.filter((m) => !metricDef(m.key).gates);

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
  // Bars are drawn as a fraction of the tallest thing on screen, not of the theoretical
  // 1,300 — against a ceiling nobody reaches, every day looks equally flat and the strip
  // says nothing. Every day counts toward the ceiling so no bar has to clamp.
  const stripCeiling = Math.max(...recent.map((d) => d.score), best?.value ?? 0, 1);

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

        <div className="mt-3 divide-y divide-border/60 border-t pt-1">
          {gating.map((m) => (
            <MetricRow
              key={m.key}
              metric={m}
              best={records.metrics[m.key]}
              isRecord={broken.includes(m.key)}
              // Keystrokes are the one number he can't type: the Mac agent owns that
              // row, and it only ever moves the count upward.
              editable={metricDef(m.key).source !== "agent"}
              onEdit={handleEdit}
              onToggle={(held) => void patch({ fasting_held: held })}
            />
          ))}
        </div>

        {/* How the number above was built, in one line. The old 1,600-point model
            needed the source open to interpret; this one shouldn't need anything. */}
        <p className="mt-1 border-t border-dashed pt-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/70">100 is a perfect day.</span>{" "}
          {total} keys, worth {METRIC_WEIGHT.toFixed(1)} each. Hit a target and you bank the whole
          slice; get halfway and you bank half. Going past a target earns nothing extra — the
          target is the target.
        </p>

        {/* Below the line: tracked, but it doesn't decide the day. It still keeps a
            personal best — a portfolio all-time high is worth seeing. */}
        {tracked.length > 0 && (
          <div className="mt-1 border-t border-dashed pt-1">
            {tracked.map((m) => (
              <MetricRow
                key={m.key}
                metric={m}
                best={records.metrics[m.key]}
                isRecord={broken.includes(m.key)}
                editable
                onEdit={handleEdit}
                onToggle={() => {}}
              />
            ))}
          </div>
        )}

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
