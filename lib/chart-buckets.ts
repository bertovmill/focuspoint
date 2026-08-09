export type Granularity = "month" | "year" | "decade";

export interface Bucket {
  label: string;
  value: number;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketDefs(granularity: Granularity): { start: number; end: number; label: string }[] {
  const now = new Date();
  if (granularity === "month") {
    // Trailing 12 months, one bucket per month (month-to-month trend).
    const y = now.getFullYear();
    const m = now.getMonth();
    return Array.from({ length: 12 }, (_, i) => {
      const offset = m - 11 + i;
      const start = new Date(y, offset, 1);
      const end = new Date(y, offset + 1, 1);
      return { start: start.getTime(), end: end.getTime(), label: MONTH_LABELS[start.getMonth()] };
    });
  }
  if (granularity === "year") {
    // Trailing 10 years, one bucket per year (year-over-year trend).
    const y = now.getFullYear();
    return Array.from({ length: 10 }, (_, i) => {
      const yr = y - 9 + i;
      return { start: new Date(yr, 0, 1).getTime(), end: new Date(yr + 1, 0, 1).getTime(), label: String(yr) };
    });
  }
  // Trailing 6 decades, one bucket per decade (decade-over-decade trend).
  const decadeStart = Math.floor(now.getFullYear() / 10) * 10;
  return Array.from({ length: 6 }, (_, i) => {
    const start = decadeStart - (5 - i) * 10;
    return { start: new Date(start, 0, 1).getTime(), end: new Date(start + 10, 0, 1).getTime(), label: `${start}s` };
  });
}

/**
 * Aggregates timestamped points into fixed buckets for a granularity.
 * "sum" accumulates a running total across buckets (counts of events, pages, etc build up over the window).
 * "last" carries forward the most recent point at-or-before each bucket's end (a running balance).
 */
export function bucketAggregate(
  points: { t: number; value: number }[],
  granularity: Granularity,
  mode: "sum" | "last",
): Bucket[] {
  const buckets = bucketDefs(granularity);
  const sorted = [...points].sort((a, b) => a.t - b.t);
  if (mode === "sum") {
    let running = 0;
    return buckets.map((b) => {
      running += sorted.filter((p) => p.t >= b.start && p.t < b.end).reduce((s, p) => s + p.value, 0);
      return { label: b.label, value: running };
    });
  }
  return buckets.map((b) => {
    let value = 0;
    for (const p of sorted) {
      if (p.t < b.end) value = p.value;
      else break;
    }
    return { label: b.label, value };
  });
}
