"use client";

import { useMemo } from "react";
import { dateKey, isOnProtocol } from "@/lib/nutrition";

export interface NutritionDay {
  logged_date: string;
  rules: string[];
  note: string | null;
}

const W = 640;
const H = 200;
const MARGIN = { top: 14, right: 14, bottom: 22, left: 34 };

/** Every calendar day from `days` ago through today, oldest first. */
function dayRange(days: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0); // midday, so DST never rolls a day
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    out.push(
      `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The headline metric: the share of days that kept the whole protocol, drawn as
 * a 7-day rolling percentage so one bad day dents the line instead of dropping
 * it to zero. Days with no row at all count as off-protocol — not logging is
 * itself an answer.
 */
export function ProtocolChart({ days, window = 30 }: { days: NutritionDay[]; window?: number }) {
  const { points, rate, kept, total, hasData, logged } = useMemo(() => {
    const byDate = new Map(days.map((d) => [dateKey(d.logged_date), d]));
    const firstLogged = [...byDate.keys()].sort()[0];
    const range = dayRange(window);
    // The line only starts once there is a first logged day — otherwise the
    // chart opens with a flat 0% for days Berto was never asked about.
    const live = firstLogged ? range.filter((d) => d >= firstLogged) : [];
    const on = (d: string) => (isOnProtocol(byDate.get(d)?.rules) ? 1 : 0);

    const pts = live.map((d, i) => {
      const from = Math.max(0, i - 6);
      const slice = live.slice(from, i + 1);
      const pct = (slice.reduce((s, x) => s + on(x), 0) / slice.length) * 100;
      return { date: d, pct, on: on(d) === 1 };
    });
    const keptCount = live.reduce((s, d) => s + on(d), 0);
    return {
      points: pts,
      rate: live.length ? Math.round((keptCount / live.length) * 100) : 0,
      kept: keptCount,
      total: live.length,
      // Under three days a plot is more empty box than information — the tile
      // shows the number alone until the line has something to say.
      hasData: pts.length >= 3,
      logged: live.length,
    };
  }, [days, window]);

  const innerW = W - MARGIN.left - MARGIN.right;
  const innerH = H - MARGIN.top - MARGIN.bottom;
  const x = (i: number) => MARGIN.left + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (pct: number) => MARGIN.top + innerH - (pct / 100) * innerH;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Days on protocol</p>
          <p className="text-3xl font-semibold leading-none mt-1">
            {rate}
            <span className="text-base font-normal text-muted-foreground">%</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {total > 0 ? `${kept} of ${total} days, all four rules kept` : "No days logged yet"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground text-right max-w-[46%] leading-snug">
          7-day rolling share of days where every rule held
        </p>
      </div>

      {hasData ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Days on protocol over time">
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={W - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text x={MARGIN.left - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
                {tick}%
              </text>
            </g>
          ))}

          <polyline
            points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")}
            fill="none"
            stroke="var(--chart-series-3)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* One dot per day: filled when that day itself was fully on protocol. */}
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(i)}
              cy={y(p.pct)}
              r={i === points.length - 1 ? 4 : 3}
              fill={p.on ? "var(--chart-series-3)" : "var(--card)"}
              stroke="var(--chart-series-3)"
              strokeWidth="1.5"
            >
              <title>{`${shortDate(p.date)} — ${p.on ? "on protocol" : "off protocol"} (${Math.round(p.pct)}% rolling)`}</title>
            </circle>
          ))}

          <text x={MARGIN.left} y={H - 5} fontSize="10" fill="var(--muted-foreground)">
            {shortDate(points[0].date)}
          </text>
          <text x={W - MARGIN.right} y={H - 5} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
            {shortDate(points[points.length - 1].date)}
          </text>
        </svg>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {logged === 0
            ? "Check off today's rules below and the line starts here."
            : `${logged} day${logged === 1 ? "" : "s"} logged — the line draws once there are three.`}
        </p>
      )}
    </div>
  );
}
