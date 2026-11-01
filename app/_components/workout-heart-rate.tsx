"use client";

import { useEffect, useState } from "react";
import { WatchIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ZoneBar } from "@/app/_components/zone-bar";
import type { HeartRateResult, WorkoutHeartRate } from "@/lib/workout-heart-rate";

/** Walks are most of what the watch logs; hidden until asked for so the training shows. */
const WALKS = new Set(["WALKING"]);

function when(startLocal: string): string {
  const d = new Date(`${startLocal}`);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function minutes(s: number): string {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/** The curve: bpm over the workout, with the average as a faint line. */
function Curve({ w, needsReconnect }: { w: WorkoutHeartRate; needsReconnect: boolean }) {
  const W = 600;
  const H = 120;
  const pts = w.samples;
  if (pts.length < 2)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {needsReconnect ? "The curve shows once the watch is reconnected." : "No heart-rate samples from the watch for this one."}
      </p>
    );
  const tMax = pts[pts.length - 1][0] || 1;
  const lo = Math.max(40, Math.min(...pts.map((p) => p[1])) - 5);
  const hi = Math.max(...pts.map((p) => p[1])) + 5;
  const x = (t: number) => (t / tMax) * W;
  const y = (bpm: number) => H - ((bpm - lo) / (hi - lo)) * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const avg = w.avg_hr ?? Math.round(pts.reduce((a, p) => a + p[1], 0) / pts.length);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full overflow-visible" role="img" aria-label={`Heart rate from ${lo + 5} to ${hi - 5} bpm`}>
        <path d={`${line} L${W},${H} L0,${H} Z`} className="fill-rose-500/10" />
        <path d={line} className="fill-none stroke-rose-500" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <line x1={0} x2={W} y1={y(avg)} y2={y(avg)} className="stroke-muted-foreground/40" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>0</span>
        <span>{minutes(tMax)}</span>
      </div>
    </div>
  );
}

/**
 * /training/heart-rate — every recent Fitbit workout with its heart-rate curve
 * (Berto, 2026-11-01). Soft borderless cards, the same look as the week view.
 */
export function WorkoutHeartRates() {
  const [data, setData] = useState<HeartRateResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [showWalks, setShowWalks] = useState(false);

  useEffect(() => {
    fetch("/api/training/heart-rate?days=30")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-muted-foreground">Couldn&apos;t load heart rate.</p>;
  if (!data)
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );

  const walks = data.workouts.filter((w) => WALKS.has(w.exercise_type)).length;
  const shown = data.workouts.filter((w) => showWalks || !WALKS.has(w.exercise_type));

  return (
    <div className="space-y-4">
      {(!data.connected || data.needsReconnect) && (
        <a href="/api/health/connect" className="flex items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm font-medium text-primary hover:underline">
          <WatchIcon className="size-4" />
          {data.connected ? "Reconnect the watch to see heart rate inside workouts" : "Connect the watch"}
        </a>
      )}
      {shown.length === 0 && <p className="text-muted-foreground">No workouts from the watch in the last 30 days.</p>}
      {shown.map((w) => (
        <section key={w.id} className="rounded-xl bg-muted/40 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">{w.name}</h2>
            <span className="text-xs text-muted-foreground">{when(w.start_local)}</span>
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {minutes(w.active_s)}
            {w.avg_hr ? ` · ♥ ${w.avg_hr} avg` : ""}
            {w.max_hr ? ` · ${w.max_hr} max` : ""}
          </p>
          <div className="mt-3">
            <Curve w={w} needsReconnect={data.needsReconnect} />
          </div>
          {w.zones && <ZoneBar zones={w.zones} className="mt-3 h-1.5" />}
        </section>
      ))}
      {walks > 0 && (
        <button type="button" onClick={() => setShowWalks((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground">
          {showWalks ? "Hide walks" : `Show ${walks} walk${walks === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
