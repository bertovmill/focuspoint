"use client";

import type { Bucket } from "@/lib/chart-buckets";

const W = 100;
const H = 28;

function fmtValue(value: number, unit: string) {
  if (unit === "$") return `$${Math.round(value).toLocaleString()}`;
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

export function Sparkline({ data, unit }: { data: Bucket[]; unit: string }) {
  const values = data.map((d) => d.value);
  const hasData = values.some((v) => v > 0);
  const last = data[data.length - 1];

  if (!hasData) {
    return <p className="text-[11px] text-muted-foreground/50 italic h-7 flex items-center">No data yet</p>;
  }

  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const x = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * W : W / 2);
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-7" preserveAspectRatio="none" role="img" aria-label={`${label(data)} trend`}>
        <path
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(data.length - 1)} cy={y(last.value)} r={2.5} fill="var(--primary)">
          <title>
            {last.label}: {fmtValue(last.value, unit)}
          </title>
        </circle>
      </svg>
      <p className="text-[11px] text-muted-foreground mt-0.5">{fmtValue(last.value, unit)}</p>
    </div>
  );
}

function label(data: Bucket[]) {
  return `${data[0]?.label ?? ""}–${data[data.length - 1]?.label ?? ""}`;
}
