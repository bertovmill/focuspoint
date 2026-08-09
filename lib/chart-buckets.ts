export type Granularity = "month" | "year" | "decade";

export interface Bucket {
  label: string;
  value: number;
}

function bucketDefs(granularity: Granularity): { start: number; end: number; label: string }[] {
  const now = new Date();
  if (granularity === "month") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => ({
      start: new Date(y, m, i + 1).getTime(),
      end: new Date(y, m, i + 2).getTime(),
      label: String(i + 1),
    }));
  }
  if (granularity === "year") {
    const y = now.getFullYear();
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Array.from({ length: 12 }, (_, i) => ({
      start: new Date(y, i, 1).getTime(),
      end: new Date(y, i + 1, 1).getTime(),
      label: labels[i],
    }));
  }
  const y = now.getFullYear();
  return Array.from({ length: 10 }, (_, i) => {
    const yr = y - 9 + i;
    return { start: new Date(yr, 0, 1).getTime(), end: new Date(yr + 1, 0, 1).getTime(), label: String(yr) };
  });
}

/**
 * Aggregates timestamped points into fixed buckets for a granularity.
 * "sum" adds up point values that fall inside each bucket (counts of events, pages, etc).
 * "last" carries forward the most recent point at-or-before each bucket's end (a running balance).
 */
export function bucketAggregate(
  points: { t: number; value: number }[],
  granularity: Granularity,
  mode: "sum" | "last",
): Bucket[] {
  const buckets = bucketDefs(granularity);
  const sorted = [...points].sort((a, b) => a.t - b.t);
  return buckets.map((b) => {
    if (mode === "sum") {
      const value = sorted.filter((p) => p.t >= b.start && p.t < b.end).reduce((s, p) => s + p.value, 0);
      return { label: b.label, value };
    }
    let value = 0;
    for (const p of sorted) {
      if (p.t < b.end) value = p.value;
      else break;
    }
    return { label: b.label, value };
  });
}
