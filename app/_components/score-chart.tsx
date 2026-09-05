"use client";

import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { ScorecardDay } from "@/lib/scorecard";

/**
 * The day score over the last fortnight, drawn like a stock chart.
 *
 * Berto's ask, replacing a row of bars. The bars encoded the same numbers, but a stock
 * chart reads as a *trajectory* — you see a run of good days climbing rather than
 * fourteen independent verdicts, which is the thing worth noticing about a daily score.
 *
 * One series, so no legend: the caption names it. The colour is `#d97706` — chosen
 * because it clears the contrast, lightness and chroma checks against **both** the light
 * and dark chart surfaces, unlike the amber-500 the rest of the card uses for accents,
 * which fails contrast on white (2.09:1). The record line is dashed and labelled, so the
 * comparison survives for anyone who can't separate the hues at all.
 */

const config = {
  score: { label: "Score", color: "#d97706" },
} satisfies ChartConfig;

/** Short axis label — "Aug 30". The full date lives in the tooltip. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ScoreChart({
  recent,
  record,
  total,
  recordsSince,
}: {
  recent: ScorecardDay[];
  /** All-time best score, drawn as the line to beat. Null before there is one. */
  record: number | null;
  /** How many gating metrics there are, for the tooltip's "n of m hit". */
  total: number;
  /** Days before this were scored without a metric that exists now — not comparable. */
  recordsSince: string;
}) {
  const data = recent.map((d) => ({
    date: d.date,
    label: shortDate(d.date),
    score: d.score,
    hitCount: d.hitCount,
    perfect: d.perfect,
    comparable: d.date >= recordsSince,
  }));

  // Headroom above whichever is higher — the record or the best day drawn — so the
  // line never touches the top edge and the record rule stays inside the plot.
  const ceiling = Math.max(...data.map((d) => d.score), record ?? 0, 1);

  return (
    <ChartContainer config={config} className="h-28 w-full">
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
        <defs>
          {/* The stock-chart wash: strongest at the line, gone by the baseline. */}
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          minTickGap={24}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
        />
        <YAxis hide domain={[0, Math.ceil(ceiling * 1.15)]} />

        {/* The number to beat, named rather than left as a bare rule — this is also the
            non-colour relief the contrast check asks for. */}
        {record !== null && record > 0 && (
          <ReferenceLine
            y={record}
            stroke="var(--color-score)"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
            label={{
              value: `best ${record.toLocaleString("en-CA")}`,
              // Left, not right: the newest days sit on the right and the record line
              // runs straight through the label there. The early days are the low ones.
              position: "insideTopLeft",
              fill: "var(--muted-foreground)",
              fontSize: 10,
            }}
          />
        )}

        <ChartTooltip
          cursor={{ stroke: "var(--color-score)", strokeOpacity: 0.4, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof data)[number];
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                <p className="font-medium">{shortDate(d.date)}</p>
                <p className="tabular-nums">
                  {d.score.toLocaleString("en-CA")} pts · {d.hitCount}/{total} hit
                </p>
                {!d.comparable && (
                  <p className="text-muted-foreground">scored before a metric was added</p>
                )}
              </div>
            );
          }}
        />

        <Area
          type="monotone"
          dataKey="score"
          stroke="var(--color-score)"
          strokeWidth={2}
          fill="url(#scoreFill)"
          // A dot per day would be fourteen labels of noise; the active dot on hover
          // is the one that matters, sized past the 8px minimum to be easy to hit.
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
