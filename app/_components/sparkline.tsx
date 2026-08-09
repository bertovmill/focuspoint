"use client";

import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Bucket } from "@/lib/chart-buckets";

function fmtValue(value: number, unit: string) {
  if (unit === "$") return `$${Math.round(value).toLocaleString()}`;
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

const chartConfig = {
  value: { label: "Value", color: "var(--primary)" },
} satisfies ChartConfig;

export function Sparkline({
  data,
  unit,
  goal,
  goalAchieved,
}: {
  data: Bucket[];
  unit: string;
  mode: "sum" | "last";
  /** Optional target value — rendered as a dashed reference line across the chart. */
  goal?: number;
  goalAchieved?: boolean;
}) {
  const values = data.map((d) => d.value);
  const hasData = values.some((v) => v > 0);
  const last = data[data.length - 1];
  // Both modes are now cumulative-over-the-window series, so the final bucket is the total.
  const caption = last.value;
  // Pad the domain above the goal (or the data max) so the reference line/peak never touches the edge.
  const domainMax = Math.max(...values, goal ?? 0) * 1.15 || 1;

  if (!hasData) {
    return <p className="text-[11px] text-muted-foreground/50 italic h-32 flex items-center">No data yet</p>;
  }

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-32 w-full">
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
          {goal !== undefined && <YAxis hide domain={[0, domainMax]} />}
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel formatter={(value) => fmtValue(Number(value), unit)} />}
          />
          {goal !== undefined && (
            <ReferenceLine
              y={goal}
              stroke={goalAchieved ? "var(--chart-essential)" : "var(--muted-foreground)"}
              strokeDasharray="3 3"
              strokeWidth={1}
              strokeOpacity={0.7}
            />
          )}
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
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {goalAchieved && "🎉 "}
        {fmtValue(caption, unit)}
        {goal !== undefined && ` / ${fmtValue(goal, unit)}`}
      </p>
    </div>
  );
}
