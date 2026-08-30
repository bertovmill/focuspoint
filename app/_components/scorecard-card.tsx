"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIcon,
  CheckIcon,
  FlameIcon,
  FootprintsIcon,
  GitPullRequestIcon,
  Loader2Icon,
  MoonIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  GATING_METRICS,
  formatMetric,
  formatTarget,
  metricDef,
  type MetricKey,
  type MetricValue,
  type ScorecardSummary,
} from "@/lib/scorecard";
import { cn } from "@/lib/utils";

/**
 * "Winning day" — the daily scorecard from Berto's Aug 28 note.
 *
 * The card answers one question at a glance: is today a win? Four gating metrics,
 * a perfect-day streak, and fourteen days of history. Portfolio rides along below
 * the line because it's a level, not something you win by trying harder today.
 *
 * Every row is editable by clicking the number — the watch sync is the happy path,
 * but a metric you can't correct is a metric you stop trusting.
 */

const ICONS: Record<MetricKey, typeof FootprintsIcon> = {
  steps: FootprintsIcon,
  sleep_minutes: MoonIcon,
  fasting_held: UtensilsCrossedIcon,
  prs: GitPullRequestIcon,
  portfolio: TrendingUpIcon,
};

/**
 * Parse what a human types for a duration: "7h30", "7:30", "7.5", "450m", "7h".
 * Returns minutes, or null if it's not a number at all.
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

function MetricRow({
  metric,
  editable,
  onEdit,
  onToggle,
}: {
  metric: MetricValue;
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
          metric.hit ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-500" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium leading-tight">{def.label}</span>
        <span className="block truncate text-[10.5px] text-muted-foreground leading-tight">{def.hint}</span>
      </span>

      {/* Progress toward the bar, for the metrics that have one. */}
      {pct !== null && (
        <span className="hidden sm:block h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full", metric.hit ? "bg-emerald-600" : "bg-foreground/40")}
            style={{ width: `${pct}%` }}
          />
        </span>
      )}

      {def.kind === "toggle" ? (
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
          placeholder={def.kind === "duration" ? "7h30" : ""}
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
          title={editable ? "Click to edit" : "Synced automatically from GitHub"}
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
    </div>
  );
}

export function ScorecardCard() {
  const [summary, setSummary] = useState<ScorecardSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

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
      const value = metricDef(key).kind === "duration" ? parseDuration(raw) : parseAmount(raw);
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
      const res = await fetch("/api/health/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 3 }),
      });
      const result = await res.json();
      if (!result.connected) toast.error("The watch isn't connected");
      else toast.success(result.synced ? `Synced ${result.synced} day${result.synced === 1 ? "" : "s"}` : "Nothing new from the watch");
      await load();
    } catch {
      toast.error("Watch sync failed");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  if (!summary) return null;

  const { today, recent, streak, bestStreak, atRisk, googleConnected } = summary;
  const total = GATING_METRICS.length;
  const gating = today.metrics.filter((m) => metricDef(m.key).gates);
  const tracked = today.metrics.filter((m) => !metricDef(m.key).gates);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
          Winning day
        </p>
        {googleConnected ? (
          <Button variant="ghost" size="sm" onClick={sync} disabled={syncing} className="h-7 gap-1.5 text-[11px]">
            {syncing ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
            Sync watch
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

      <Card className="rounded-xl px-5 py-4 shadow-none gap-0">
        {/* Headline: how many of the four, and the streak riding on it. */}
        <div className="flex items-baseline justify-between gap-3 pb-1">
          <p className="text-2xl font-semibold tabular-nums leading-none">
            {today.hitCount}
            <span className="text-base text-muted-foreground font-normal"> / {total}</span>
          </p>
          <div className="flex items-center gap-1.5 text-[11px]">
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
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {gating.map((m) => (
            <MetricRow
              key={m.key}
              metric={m}
              // PRs are the one number he can't type — GitHub is the record.
              editable={metricDef(m.key).source !== "github"}
              onEdit={handleEdit}
              onToggle={(held) => void patch({ fasting_held: held })}
            />
          ))}
        </div>

        {/* Below the line: tracked, but it doesn't decide the day. */}
        {tracked.length > 0 && (
          <div className="mt-1 border-t border-dashed pt-1">
            {tracked.map((m) => (
              <MetricRow key={m.key} metric={m} editable onEdit={handleEdit} onToggle={() => {}} />
            ))}
          </div>
        )}

        {/* Fourteen days, newest right. A row of near-misses reads very differently
            from a row of blanks, so partial days show partial fill — with a floor of
            8% so "1 of 4" is still a visible sliver rather than a hairline. */}
        <div className="mt-3 border-t pt-3">
          <div className="flex items-end gap-1">
            {recent.map((day, i) => (
              <span
                key={day.date}
                title={`${day.date} — ${day.hitCount}/${total} hit`}
                className={cn(
                  "relative h-10 flex-1 overflow-hidden rounded bg-muted",
                  i === recent.length - 1 && "ring-1 ring-foreground/20",
                )}
              >
                {day.hitCount > 0 && (
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 rounded",
                      day.perfect ? "bg-emerald-600" : "bg-foreground/35",
                    )}
                    style={{ height: `${Math.max(8, (day.hitCount / total) * 100)}%` }}
                  />
                )}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Last {recent.length} days · today on the right
          </p>
        </div>
      </Card>
    </div>
  );
}
