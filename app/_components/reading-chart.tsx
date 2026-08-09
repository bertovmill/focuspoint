"use client";

import { useMemo } from "react";

export interface ReadingLog {
  book_title: string;
  pages: number;
  logged_date: string;
  is_estimate: boolean;
}

const W = 640;
const H = 260;
const MARGIN = { top: 14, right: 14, bottom: 22, left: 44 };
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLOR = "var(--chart-series-1)";

function fmtPages(n: number) {
  return `${Math.round(n).toLocaleString()} pages`;
}

export function ReadingChart({ logs }: { logs: ReadingLog[] }) {
  const chart = useMemo(() => {
    if (logs.length === 0) return null;

    const year = new Date(logs[0].logged_date).getFullYear();
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const today = Date.now();
    const todayClamped = Math.min(Math.max(today, yearStart), yearEnd);

    const sorted = [...logs].sort(
      (a, b) => new Date(a.logged_date).getTime() - new Date(b.logged_date).getTime(),
    );
    let cumulative = 0;
    const actual = [{ t: yearStart, pages: 0 }];
    for (const log of sorted) {
      cumulative += Number(log.pages);
      actual.push({ t: new Date(log.logged_date).getTime(), pages: cumulative });
    }
    // Carry the running total flat to "today" so the line reaches the current date.
    actual.push({ t: todayClamped, pages: cumulative });

    const daysElapsed = Math.max(1, (todayClamped - yearStart) / 86400000);
    const daysInYear = (yearEnd - yearStart) / 86400000;
    const dailyPace = cumulative / daysElapsed;
    const projectedTotal = dailyPace * daysInYear;
    const projection = [
      { t: todayClamped, pages: cumulative },
      { t: yearEnd, pages: projectedTotal },
    ];

    const yMax = Math.max(projectedTotal, cumulative) * 1.08;

    const x = (t: number) => MARGIN.left + ((t - yearStart) / (yearEnd - yearStart)) * (W - MARGIN.left - MARGIN.right);
    const y = (pages: number) => H - MARGIN.bottom - (pages / yMax) * (H - MARGIN.top - MARGIN.bottom);

    return { actual, projection, x, y, yMax, cumulative, projectedTotal, year, todayClamped };
  }, [logs]);

  if (!chart) {
    return (
      <p className="text-sm text-muted-foreground/60 italic leading-relaxed">
        No books logged yet — tell Cael when you finish one and it'll log the page count and start the chart.
      </p>
    );
  }

  const { actual, projection, x, y, yMax, cumulative, projectedTotal, year, todayClamped } = chart;
  const yTicks = [0, yMax / 2, yMax];
  const actualPath = actual.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.pages)}`).join(" ");
  const projectionPath = projection.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.pages)}`).join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Cumulative pages read in ${year}, with a projected year-end total`}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={MARGIN.left}
              x2={W - MARGIN.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeOpacity={t === 0 ? 0.9 : 0.4}
              strokeWidth={1}
            />
            <text x={MARGIN.left - 8} y={y(t)} dy={3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {Math.round(t).toLocaleString()}
            </text>
          </g>
        ))}

        {MONTH_LABELS.map((label, i) => {
          const t = Date.UTC(year, i, 1);
          return (
            <text key={label} x={x(t)} y={H - 6} fontSize={10} fill="var(--muted-foreground)">
              {label}
            </text>
          );
        })}

        <path d={actualPath} fill="none" stroke={COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path
          d={projectionPath}
          fill="none"
          stroke={COLOR}
          strokeOpacity={0.5}
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <circle cx={x(todayClamped)} cy={y(cumulative)} r={5} fill={COLOR} stroke="var(--card)" strokeWidth={2}>
          <title>
            Today — {fmtPages(cumulative)} read this year
          </title>
        </circle>
        <circle cx={x(Date.UTC(year + 1, 0, 1))} cy={y(projectedTotal)} r={4} fill="var(--card)" stroke={COLOR} strokeWidth={2}>
          <title>Projected Dec 31 total — {fmtPages(projectedTotal)}</title>
        </circle>
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: COLOR }} />
          <span className="font-medium text-foreground">Read so far</span>
          <span className="text-muted-foreground">{fmtPages(cumulative)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 rounded-full shrink-0"
            style={{ backgroundColor: COLOR, opacity: 0.5 }}
          />
          <span className="font-medium text-foreground">Projected by Dec 31</span>
          <span className="text-muted-foreground">{fmtPages(projectedTotal)}</span>
        </span>
      </div>
    </div>
  );
}
