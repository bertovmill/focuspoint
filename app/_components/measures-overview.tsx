"use client";

import { GaugeIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MeasureRow {
  id: number;
  category: "savings_snapshot" | "spend_report" | "free_time_audit" | "daily_checkin";
  recorded_date: string;
  data: Record<string, number | string | undefined>;
  notes: string | null;
  created_at: string;
}

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(n)}`;
}

function moneyExact(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short" });
}

function byDateAsc(a: MeasureRow, b: MeasureRow) {
  return new Date(a.recorded_date).getTime() - new Date(b.recorded_date).getTime();
}

/** 12-point sparkline: de-emphasis gray line, current point in the chart accent with a surface ring. */
function Sparkline({ values, min, max }: { values: number[]; min: number; max: number }) {
  const pts = values.slice(-12);
  if (pts.length < 2) return null;
  const w = 64;
  const h = 20;
  const pad = 3;
  const range = max - min || 1;
  const coords = pts.map((v, i) => ({
    x: pad + (i * (w - pad * 2)) / (pts.length - 1),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        stroke="var(--chart-spark)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill="var(--card)" />
      <circle cx={last.x} cy={last.y} r="2.5" fill="var(--chart-essential)" />
    </svg>
  );
}

function StatTile({
  label,
  value,
  suffix,
  spark,
  sparkMin = 0,
  sparkMax = 10,
}: {
  label: string;
  value: string;
  suffix?: string;
  spark?: number[];
  sparkMin?: number;
  sparkMax?: number;
}) {
  return (
    <Card className="gap-1 rounded-lg px-3 py-2.5 shadow-none">
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-semibold leading-none">
          {value}
          {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
        </p>
        {spark && spark.length >= 2 && <Sparkline values={spark} min={sparkMin} max={sparkMax} />}
      </div>
    </Card>
  );
}

const SPEND_SEGMENTS = [
  { key: "essential_spend", label: "Essential", color: "var(--chart-essential)" },
  { key: "discretionary_spend", label: "Discretionary", color: "var(--chart-discretionary)" },
] as const;

export function MeasuresOverview({ measures }: { measures: MeasureRow[] }) {
  const spends = measures.filter((m) => m.category === "spend_report").sort(byDateAsc).slice(-12);
  const snapshots = measures.filter((m) => m.category === "savings_snapshot").sort(byDateAsc);
  const checkins = measures.filter((m) => m.category === "daily_checkin").sort(byDateAsc);
  const audits = measures.filter((m) => m.category === "free_time_audit").sort(byDateAsc);

  if (measures.length === 0) return null;

  const latestSnapshot = snapshots[snapshots.length - 1];
  const savingsTotal = latestSnapshot ? num(latestSnapshot.data.total_savings) : null;
  const savingsGoal = latestSnapshot ? num(latestSnapshot.data.goal) : null;
  const savingsHistory = snapshots
    .map((s) => num(s.data.total_savings))
    .filter((v): v is number => v !== null);

  const spendRows = spends
    .map((m) => {
      const total = num(m.data.total_spend) ?? 0;
      const essential = num(m.data.essential_spend) ?? 0;
      const discretionary = num(m.data.discretionary_spend) ?? 0;
      const unallocated = Math.max(0, total - essential - discretionary);
      return { month: monthLabel(m.recorded_date), total, essential, discretionary, unallocated };
    })
    .filter((r) => r.total > 0);
  const maxSpend = Math.max(...spendRows.map((r) => r.total), 1);
  const hasUnallocated = spendRows.some((r) => r.unallocated > 0.01);

  const latestCheckin = checkins[checkins.length - 1];
  const checkinSeries = (key: string) =>
    checkins.map((c) => num(c.data[key])).filter((v): v is number => v !== null);

  const latestAudit = audits[audits.length - 1];
  const auditSeries = (key: string) =>
    audits.map((a) => num(a.data[key])).filter((v): v is number => v !== null);
  const auditMax = Math.max(
    ...audits.flatMap((a) => [num(a.data.free_hours) ?? 0, num(a.data.screen_time_hours) ?? 0]),
    1,
  );

  return (
    <div className="space-y-5 mb-6 max-w-xl">
      {/* Savings — hero + meter toward goal */}
      {latestSnapshot && savingsTotal !== null && (
        <div>
          <div className="flex items-end justify-between gap-2 mb-1.5">
            <div>
              <p className="text-xs text-muted-foreground">Total investments</p>
              <p className="text-2xl font-semibold leading-tight">{moneyExact(savingsTotal)}</p>
            </div>
            {savingsHistory.length >= 2 && (
              <Sparkline
                values={savingsHistory}
                min={Math.min(...savingsHistory)}
                max={Math.max(...savingsHistory, savingsGoal ?? 0)}
              />
            )}
          </div>
          {savingsGoal !== null && savingsGoal > 0 && (
            <div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--chart-track)" }}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={savingsGoal}
                aria-valuenow={savingsTotal}
                aria-label="Progress toward savings goal"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (savingsTotal / savingsGoal) * 100)}%`,
                    background: "var(--chart-essential)",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((savingsTotal / savingsGoal) * 100)}% of {money(savingsGoal)} goal
                {savingsTotal < savingsGoal && <> · {money(savingsGoal - savingsTotal)} to go</>}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Monthly spend — stacked horizontal bars */}
      {spendRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Monthly spend
          </p>
          <div className="space-y-2">
            {spendRows.map((r) => {
              const segments = [
                { label: "Essential", value: r.essential, color: "var(--chart-essential)" },
                { label: "Discretionary", value: r.discretionary, color: "var(--chart-discretionary)" },
                { label: "Unallocated", value: r.unallocated, color: "var(--chart-neutral)" },
              ].filter((s) => s.value > 0.01);
              return (
                <div key={r.month} className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-xs text-muted-foreground">{r.month}</span>
                  <div className="flex-1 flex items-center gap-0.5 min-w-0">
                    {segments.map((s, i) => (
                      <div
                        key={s.label}
                        title={`${s.label}: ${moneyExact(s.value)}`}
                        className={cn("h-5", i === segments.length - 1 && "rounded-r")}
                        style={{ width: `${(s.value / maxSpend) * 100}%`, background: s.color }}
                      />
                    ))}
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-foreground">
                    {money(r.total)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            {SPEND_SEGMENTS.map(({ key, label, color }) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </span>
            ))}
            {hasUnallocated && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: "var(--chart-neutral)" }}
                />
                Unallocated
              </span>
            )}
          </div>
        </div>
      )}

      {/* Daily check-in — latest values + trend */}
      {latestCheckin && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            How you&rsquo;re doing
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "energy", label: "Energy" },
                { key: "sleep_quality", label: "Sleep" },
                { key: "body_feel", label: "Body" },
                { key: "mood", label: "Mood" },
              ] as const
            ).map(({ key, label }) => {
              const v = num(latestCheckin.data[key]);
              if (v === null) return null;
              return (
                <StatTile
                  key={key}
                  label={label}
                  value={String(v)}
                  suffix="/10"
                  spark={checkinSeries(key)}
                  sparkMin={1}
                  sparkMax={10}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Free time audit — latest values + trend */}
      {latestAudit && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Free time
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "free_hours", label: "Free hours" },
                { key: "screen_time_hours", label: "Screen time" },
              ] as const
            ).map(({ key, label }) => {
              const v = num(latestAudit.data[key]);
              if (v === null) return null;
              return (
                <StatTile
                  key={key}
                  label={label}
                  value={String(v)}
                  suffix=" hrs"
                  spark={auditSeries(key)}
                  sparkMin={0}
                  sparkMax={auditMax}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Nudge toward the first check-in */}
      {!latestCheckin && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GaugeIcon className="size-3 shrink-0" />
          Log a daily check-in below to start tracking energy, sleep, body and mood trends.
        </p>
      )}
    </div>
  );
}
