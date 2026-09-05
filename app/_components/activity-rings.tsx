"use client";

import { useState } from "react";
import { FootprintsIcon, KeyboardIcon, MoonIcon, ZapIcon } from "lucide-react";
import {
  METRIC_WEIGHT,
  formatMetric,
  formatTarget,
  metricDef,
  type MetricKey,
  type MetricValue,
} from "@/lib/scorecard";
import { cn } from "@/lib/utils";

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
const PALETTE: Record<MetricKey, { ring: string; track: string; text: string; tile: string; iconBg: string }> = {
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

const SIZE = 76;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({
  metric,
  isRecord,
  editable,
  onEdit,
}: {
  metric: MetricValue;
  isRecord: boolean;
  editable: boolean;
  onEdit: (key: MetricKey, raw: string) => void;
}) {
  const def = metricDef(metric.key);
  const Icon = ICONS[metric.key];
  const c = PALETTE[metric.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const pct = metric.value === null || metric.target <= 0 ? 0 : Math.min(1, metric.value / metric.target);
  const offset = CIRCUMFERENCE * (1 - pct);

  const commit = () => {
    setEditing(false);
    if (draft.trim()) onEdit(metric.key, draft);
  };

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-1 py-3", c.tile)}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
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
              "flex size-9 items-center justify-center rounded-full",
              isRecord ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : c.iconBg,
            )}
          >
            <Icon className="size-4.5" />
          </span>
        </span>
        {isRecord && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-white">
            <ZapIcon className="size-2.5" />
          </span>
        )}
      </div>

      <p className={cn("text-xs font-semibold leading-tight", c.text)}>{def.label}</p>

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
          className="w-20 rounded-md border border-border bg-background px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums outline-none focus:border-foreground/40"
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
            // Value on one line, target on the next: at phone width "16,314 / 30,000"
            // wrapped mid-string and knocked the three columns out of line.
            "flex flex-col items-center rounded-md px-1 py-0.5 text-center text-sm font-semibold leading-tight tabular-nums",
            editable && "hover:bg-background/60",
            "text-foreground",
          )}
        >
          {formatMetric(metric.key, metric.value)}
          <span className="text-xs font-normal text-muted-foreground">/ {formatTarget(metric.key, metric.target)}</span>
        </button>
      )}

      <span className={cn("text-xs font-medium tabular-nums", metric.hit ? c.text : "text-muted-foreground/70")}>
        {metric.points.toFixed(1)}/{METRIC_WEIGHT.toFixed(1)} pts
      </span>
    </div>
  );
}

export function ActivityRings({
  metrics,
  broken,
  onEdit,
}: {
  metrics: MetricValue[];
  broken: (MetricKey | "score")[];
  onEdit: (key: MetricKey, raw: string) => void;
}) {
  return (
    <div className="flex gap-2 sm:gap-4">
      {metrics.map((m) => (
        <Ring
          key={m.key}
          metric={m}
          isRecord={broken.includes(m.key)}
          editable={metricDef(m.key).source !== "agent"}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
