"use client";

import { useState } from "react";
import {
  FootprintsIcon,
  KeyboardIcon,
  MoonIcon,
  TrophyIcon,
} from "lucide-react";
import {
  METRIC_WEIGHT,
  formatMetric,
  formatTarget,
  metricDef,
  type MetricKey,
  type MetricValue,
  type PersonalBest,
} from "@/lib/scorecard";
import { cn } from "@/lib/utils";
import { shortDate } from "@/app/_components/scorecard-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Three Fitbit/Google-Fit-style progress rings — Steps · Sleep · Keystrokes — in
 * place of the old stacked boxes. Berto's ask (2026-09-03): "make the three metrics
 * similar to the google fitbit app - with the three rings."
 */

const ICONS: Record<MetricKey, typeof FootprintsIcon> = {
  steps: FootprintsIcon,
  sleep_minutes: MoonIcon,
  keystrokes: KeyboardIcon,
};

/**
 * One colour per metric, Google Fit style — his call (2026-09-05): "one color per
 * metric ... on soft pastel card backgrounds". The ring always wears its colour
 * now (it used to go grey until the target was hit); hitting the target is shown
 * by the ring closing, and a record by the amber glow.
 */
const PALETTE: Record<
  MetricKey,
  { ring: string; track: string; text: string; tile: string; iconBg: string }
> = {
  steps: {
    ring: "stroke-sky-500",
    track: "stroke-sky-500/15",
    text: "text-sky-600 dark:text-sky-400",
    tile: "bg-sky-500/[0.07]",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  sleep_minutes: {
    ring: "stroke-violet-500",
    track: "stroke-violet-500/15",
    text: "text-violet-600 dark:text-violet-400",
    tile: "bg-violet-500/[0.07]",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  keystrokes: {
    ring: "stroke-emerald-500",
    track: "stroke-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
    tile: "bg-emerald-500/[0.07]",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
};

const SIZE = 88;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({
  metric,
  isRecord,
  best,
  leaderboard,
  today,
  isToday,
  editable,
  onEdit,
}: {
  metric: MetricValue;
  isRecord: boolean;
  /** The all-time best standing before today, if there is one. */
  best: PersonalBest | undefined;
  /** Top days for this metric, best first. */
  leaderboard: PersonalBest[];
  /** The shown day's key, so its row on the leaderboard can be flagged. */
  today: string;
  /** False when the card is showing a past day — its row then reads as a date. */
  isToday: boolean;
  editable: boolean;
  onEdit: (key: MetricKey, raw: string) => void;
}) {
  const def = metricDef(metric.key);
  const Icon = ICONS[metric.key];
  const c = PALETTE[metric.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const pct =
    metric.value === null || metric.target <= 0
      ? 0
      : Math.min(1, metric.value / metric.target);
  const offset = CIRCUMFERENCE * (1 - pct);

  const commit = () => {
    setEditing(false);
    if (draft.trim()) onEdit(metric.key, draft);
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-3xl px-1 py-4",
        c.tile,
      )}
    >
      {/* Berto (2026-09-29): "when we click on each of the main things — show a top 5
          high score for each". The ring opens it; the value below stays the editor. */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`Top ${def.label.toLowerCase()} days`}
            className="relative rounded-full outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring"
            style={{ width: SIZE, height: SIZE }}
          >
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                strokeWidth={STROKE}
                className={cn("fill-none", c.track)}
              />
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={offset}
                className={cn(
                  "fill-none transition-[stroke-dashoffset] duration-500",
                  isRecord ? "stroke-amber-500" : c.ring,
                )}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center">
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-full",
                  isRecord
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : c.iconBg,
                )}
              >
                <Icon className="size-5.5" />
              </span>
            </span>
            {isRecord && (
              <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-background">
                <TrophyIcon className="size-3.5" />
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <TrophyIcon className="size-3 text-amber-500" />
            Top {def.label.toLowerCase()}
          </p>
          {leaderboard.length ? (
            <ol className="space-y-1">
              {leaderboard.map((row, i) => (
                <li
                  key={row.date}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm tabular-nums",
                    row.date === today && "bg-amber-500/10",
                  )}
                >
                  <span
                    className={cn(
                      "w-4 text-xs font-semibold",
                      i === 0 ? "text-amber-500" : "text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 font-semibold">
                    {formatMetric(metric.key, row.value)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.date === today && isToday ? "today" : shortDate(row.date)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No days logged yet.</p>
          )}
        </PopoverContent>
      </Popover>

      <p className={cn("text-xs font-semibold leading-tight", c.text)}>
        {def.label}
      </p>

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
          className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-center text-base font-semibold tabular-nums outline-none focus:border-foreground/40"
        />
      ) : (
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            setDraft(metric.value === null ? "" : String(metric.value));
            setEditing(true);
          }}
          title={
            editable
              ? "Click to edit"
              : "Counted automatically by the Mac agent"
          }
          className={cn(
            // Value on one line, target on the next: at phone width "16,314 / 30,000"
            // wrapped mid-string and knocked the three columns out of line.
            "flex flex-col items-center rounded-lg px-2 py-1 text-center text-base font-semibold leading-tight tabular-nums",
            editable && "hover:bg-background/60",
            "text-foreground",
          )}
        >
          {formatMetric(metric.key, metric.value)}
          <span className="text-xs font-normal text-muted-foreground">
            / {formatTarget(metric.key, metric.target)}
          </span>
        </button>
      )}

      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          metric.hit ? c.text : "text-muted-foreground/70",
        )}
      >
        {metric.points.toFixed(1)}/{METRIC_WEIGHT.toFixed(1)} pts
      </span>

      {/* Berto (2026-09-29): a visible marker on the day a key sets a new high score,
          and otherwise how far off the record today still is. */}
      {isRecord ? (
        <span
          className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
          title={
            best
              ? `Old best ${formatMetric(metric.key, best.value)}, ${shortDate(best.date)}`
              : undefined
          }
        >
          <TrophyIcon className="size-3" />
          High score
        </span>
      ) : best && metric.value !== null ? (
        <span
          className="text-xs tabular-nums text-muted-foreground/70"
          title={`Best ${formatMetric(metric.key, best.value)}, ${shortDate(best.date)}`}
        >
          {best.value === metric.value
            ? "ties your best"
            : `${formatMetric(metric.key, best.value - metric.value)} to best`}
        </span>
      ) : null}
    </div>
  );
}

export function ActivityRings({
  metrics,
  broken,
  bests,
  leaderboards,
  today,
  isToday = true,
  onEdit,
}: {
  metrics: MetricValue[];
  broken: (MetricKey | "score")[];
  bests: Partial<Record<MetricKey, PersonalBest>>;
  leaderboards: Record<MetricKey, PersonalBest[]>;
  today: string;
  isToday?: boolean;
  onEdit: (key: MetricKey, raw: string) => void;
}) {
  return (
    <div className="flex gap-2 sm:gap-4">
      {metrics.map((m) => (
        <Ring
          key={m.key}
          metric={m}
          isRecord={broken.includes(m.key)}
          best={bests[m.key]}
          leaderboard={leaderboards[m.key] ?? []}
          today={today}
          isToday={isToday}
          editable={metricDef(m.key).source !== "agent"}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
