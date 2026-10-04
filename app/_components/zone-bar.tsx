import { cn } from "@/lib/utils";

export const ZONES = [
  { label: "Light", color: "bg-sky-400" },
  { label: "Fat burn", color: "bg-amber-400" },
  { label: "Cardio", color: "bg-orange-500" },
  { label: "Peak", color: "bg-rose-600" },
];

/** Time in each heart-rate zone (seconds: light, fat burn, cardio, peak) as one stacked bar. */
export function ZoneBar({ zones, className }: { zones: number[]; className?: string }) {
  const total = zones.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const title = zones.map((z, i) => `${ZONES[i]?.label}: ${Math.round(z / 60)} min`).join(" · ");
  return (
    <span className={cn("flex w-full overflow-hidden rounded-full bg-muted", className)} title={title} aria-label={title}>
      {zones.map((z, i) => (z > 0 ? <span key={i} className={ZONES[i]?.color} style={{ width: `${(z / total) * 100}%` }} /> : null))}
    </span>
  );
}
