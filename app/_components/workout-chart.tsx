"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface WorkoutLog {
  exercise: string;
  value: number;
  logged_date: string;
}

const EXERCISES = [
  { key: "squat", label: "Squat 5×5", unit: "lbs", color: "var(--chart-series-1)" },
  { key: "deadlift", label: "Deadlift 5×5", unit: "lbs", color: "var(--chart-series-2)" },
  { key: "bench", label: "Bench 5×5", unit: "lbs", color: "var(--chart-series-3)" },
  { key: "chinups", label: "Chin-ups 5×5", unit: "lbs", color: "var(--chart-series-4)" },
  { key: "10k_run", label: "10K Run", unit: "min", color: "var(--chart-series-5)" },
] as const;

const W = 640;
const H = 260;
const MARGIN = { top: 14, right: 14, bottom: 22, left: 40 };

function formatValue(value: number, unit: string) {
  return unit === "min" ? `${value.toFixed(0)} min` : `${value.toFixed(0)} lbs`;
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WorkoutChart({ logs }: { logs: WorkoutLog[] }) {
  const [active, setActive] = useState<Set<string>>(new Set());

  const series = useMemo(() => {
    return EXERCISES.map((ex) => {
      const points = logs
        .filter((l) => l.exercise === ex.key)
        .map((l) => ({ date: l.logged_date, t: new Date(l.logged_date).getTime(), value: Number(l.value) }))
        .sort((a, b) => a.t - b.t);
      const baseline = points[0]?.value ?? null;
      const pctPoints = points.map((p) => ({
        ...p,
        pct: baseline ? ((p.value - baseline) / baseline) * 100 : 0,
      }));
      return { ...ex, points: pctPoints, baseline, latest: points[points.length - 1] ?? null };
    });
  }, [logs]);

  const hasData = series.some((s) => s.points.length > 0);

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const allPoints = series.flatMap((s) => s.points);
    if (allPoints.length === 0) {
      return { xMin: 0, xMax: 1, yMin: -10, yMax: 10 };
    }
    const ts = allPoints.map((p) => p.t);
    const pcts = allPoints.map((p) => p.pct);
    let yLo = Math.min(0, ...pcts);
    let yHi = Math.max(0, ...pcts);
    const pad = Math.max(2, (yHi - yLo) * 0.15);
    yLo -= pad;
    yHi += pad;
    const xLo = Math.min(...ts);
    const xHi = Math.max(...ts);
    return { xMin: xLo, xMax: xHi === xLo ? xLo + 86400000 : xHi, yMin: yLo, yMax: yHi };
  }, [series]);

  const x = (t: number) => {
    const frac = (t - xMin) / (xMax - xMin);
    return MARGIN.left + frac * (W - MARGIN.left - MARGIN.right);
  };
  const y = (pct: number) => {
    const frac = (pct - yMin) / (yMax - yMin);
    return H - MARGIN.bottom - frac * (H - MARGIN.top - MARGIN.bottom);
  };

  const toggle = (key: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!hasData) {
    return (
      <p className="text-sm text-muted-foreground/60 italic leading-relaxed">
        No workouts logged yet — tell Cael a number (e.g. "squat was 235 today") to start the chart.
      </p>
    );
  }

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Workout progress, percent change from first logged value">
        {/* Gridlines + y-axis labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={MARGIN.left}
              x2={W - MARGIN.right}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? "var(--border)" : "var(--border)"}
              strokeOpacity={t === 0 ? 0.9 : 0.4}
              strokeWidth={1}
            />
            <text x={MARGIN.left - 8} y={y(t)} dy={3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {t === 0 ? "start" : `${t > 0 ? "+" : ""}${Math.round(t)}%`}
            </text>
          </g>
        ))}

        {/* Series lines + points */}
        {series.map((s) => {
          if (s.points.length === 0) return null;
          const dimmed = active.size > 0 && !active.has(s.key);
          const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.pct)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.key} opacity={dimmed ? 0.25 : 1} style={{ transition: "opacity 150ms" }}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => (
                <circle key={i} cx={x(p.t)} cy={y(p.pct)} r={3} fill={s.color}>
                  <title>
                    {formatShortDate(p.date)} — {s.label}: {formatValue(p.value, s.unit)} ({p.pct >= 0 ? "+" : ""}
                    {p.pct.toFixed(0)}% from start)
                  </title>
                </circle>
              ))}
              {/* End marker: larger dot with a surface ring so it pops as "current" */}
              <circle cx={x(last.t)} cy={y(last.pct)} r={5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
            </g>
          );
        })}

        {/* X-axis: first and last date */}
        <text x={MARGIN.left} y={H - 6} fontSize={10} fill="var(--muted-foreground)">
          {formatShortDate(new Date(xMin).toISOString())}
        </text>
        <text x={W - MARGIN.right} y={H - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
          {formatShortDate(new Date(xMax).toISOString())}
        </text>
      </svg>

      {/* Legend — click a series to see its absolute number instead of % from start */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
        {series.map((s) => {
          const isActive = active.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              disabled={!s.latest}
              className={cn(
                "flex items-center gap-1.5 text-xs rounded-md px-1.5 py-1 -mx-1.5 transition-colors disabled:opacity-40",
                isActive ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <span className="inline-block w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-medium text-foreground">{s.label}</span>
              {isActive && s.latest && (
                <span className="text-muted-foreground">{formatValue(s.latest.value, s.unit)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
