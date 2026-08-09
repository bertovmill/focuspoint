"use client";

import { Line, LineChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Bucket } from "@/lib/chart-buckets";

function fmtValue(value: number, unit: string) {
  if (unit === "$") return `$${Math.round(value).toLocaleString()}`;
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

const chartConfig = {
  value: { label: "Value", color: "var(--primary)" },
} satisfies ChartConfig;

export function Sparkline({ data, unit, mode }: { data: Bucket[]; unit: string; mode: "sum" | "last" }) {
  const values = data.map((d) => d.value);
  const hasData = values.some((v) => v > 0);
  const last = data[data.length - 1];
  // "last" (a running balance) reads as its current value; "sum" (counts/pages per bucket) reads
  // as a period total — the final bucket alone is often a not-yet-populated future one.
  const caption = mode === "last" ? last.value : values.reduce((s, v) => s + v, 0);

  if (!hasData) {
    return <p className="text-[11px] text-muted-foreground/50 italic h-11 flex items-center">No data yet</p>;
  }

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-11 w-full">
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            interval="preserveStartEnd"
            minTickGap={20}
            tick={{ fontSize: 9 }}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel formatter={(value) => fmtValue(Number(value), unit)} />}
          />
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <p className="text-[11px] text-muted-foreground mt-0.5">{fmtValue(caption, unit)}</p>
    </div>
  );
}
