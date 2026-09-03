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

const RING_COLOR: Record<MetricKey, string> = {
  steps: "stroke-sky-500",
  sleep_minutes: "stroke-violet-500",
  keystrokes: "stroke-emerald-500",
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const pct = metric.value === null || metric.target <= 0 ? 0 : Math.min(1, metric.value / metric.target);
  const offset = CIRCUMFERENCE * (1 - pct);

  const commit = () => {
    setEditing(false);
    if (draft.trim()) onEdit(metric.key, draft);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            className="fill-none stroke-muted"
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
              isRecord ? "stroke-amber-500" : metric.hit ? RING_COLOR[metric.key] : "stroke-foreground/30",
            )}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            isRecord ? "text-amber-600 dark:text-amber-400" : metric.hit ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
        {isRecord && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-white">
            <ZapIcon className="size-2.5" />
          </span>
        )}
      </div>

      <p className="text-[10.5px] font-medium leading-tight text-muted-foreground">{def.label}</p>

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
          className="w-20 rounded-md border border-border bg-background px-1.5 py-0.5 text-center text-[13px] font-semibold tabular-nums outline-none focus:border-foreground/40"
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
            "rounded-md px-1 py-0.5 text-center text-[13px] font-semibold leading-none tabular-nums",
            editable && "hover:bg-muted",
            metric.hit ? "text-emerald-600 dark:text-emerald-500" : "text-foreground",
          )}
        >
          {formatMetric(metric.key, metric.value)}
          <span className="text-[10px] font-normal text-muted-foreground"> / {formatTarget(metric.key, metric.target)}</span>
        </button>
      )}

      <span className={cn("text-[9.5px] font-medium tabular-nums", metric.hit ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground/60")}>
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
