// Heart rate across workouts: the minute-by-minute curve inside each Fitbit
// workout, for /training/heart-rate (Berto, 2026-11-01: "show my heart rate across
// workouts"). The workout list itself is the fitbit_exercises cache; the samples
// come from Google Health's `heart-rate` type and are cached per workout, since a
// finished workout's samples never change.

import { getDb } from "@/lib/db";
import { fetchHeartRate, HeartRateScopeError, isHealthConnected } from "@/lib/google-health";

/** Points kept per curve. Plenty for a phone-width chart; keeps the cache small. */
const MAX_POINTS = 240;
/** The watch can upload a workout's samples a while after it ends; don't cache an empty curve until then. */
const SETTLE_MS = 6 * 3600_000;

export interface WorkoutHeartRate {
  id: string;
  name: string;
  exercise_type: string;
  start_local: string;
  active_s: number;
  avg_hr: number | null;
  max_hr: number | null;
  /** Seconds in the light / moderate / vigorous / peak zones, from the watch. */
  zones: number[] | null;
  /** [seconds since the start, bpm], oldest first. Empty when the watch sent none. */
  samples: [number, number][];
}

export interface HeartRateResult {
  connected: boolean;
  /** The grant predates the heart-rate scope; /api/health/connect fixes it. */
  needsReconnect: boolean;
  workouts: WorkoutHeartRate[];
}

/** Average the samples into at most MAX_POINTS evenly spaced buckets. */
function downsample(samples: [number, number][]): [number, number][] {
  if (samples.length <= MAX_POINTS) return samples;
  const span = samples[samples.length - 1][0] - samples[0][0] || 1;
  const buckets = new Map<number, { t: number; bpm: number; n: number }>();
  for (const [t, bpm] of samples) {
    const k = Math.min(MAX_POINTS - 1, Math.floor(((t - samples[0][0]) / span) * MAX_POINTS));
    const b = buckets.get(k) ?? { t: 0, bpm: 0, n: 0 };
    b.t += t;
    b.bpm += bpm;
    b.n++;
    buckets.set(k, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => [Math.round(b.t / b.n), Math.round(b.bpm / b.n)]);
}

/**
 * The last `days` of workouts with their curves, newest first. Workouts with no
 * cached curve are fetched from Google (a few at a time) and cached once settled.
 */
export async function getWorkoutHeartRates(days = 30): Promise<HeartRateResult> {
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT e.id, e.name, e.exercise_type, to_char(e.start_local, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_local,
       e.active_s, e.avg_hr, e.zones, e.start_utc, e.end_utc, h.samples
     FROM fitbit_exercises e LEFT JOIN workout_heart_rate h ON h.exercise_id = e.id
     WHERE e.start_local >= (CURRENT_DATE - $1::int)
     ORDER BY e.start_local DESC`,
    [days],
  )) as Record<string, unknown>[];

  const connected = await isHealthConnected().catch(() => false);
  let needsReconnect = false;

  const missing = rows.filter((r) => !r.samples && r.start_utc && r.end_utc);
  if (connected && missing.length) {
    for (let i = 0; i < missing.length && !needsReconnect; i += 4) {
      await Promise.all(
        missing.slice(i, i + 4).map(async (r) => {
          const start = new Date(r.start_utc as string);
          const end = new Date(r.end_utc as string);
          try {
            const raw = await fetchHeartRate(start.toISOString(), end.toISOString());
            const curve = downsample(raw).map(([t, bpm]) => [Math.round((t - start.getTime()) / 1000), bpm] as [number, number]);
            r.samples = curve;
            if (curve.length || Date.now() - end.getTime() > SETTLE_MS) {
              await sql`
                INSERT INTO workout_heart_rate (exercise_id, samples) VALUES (${r.id as string}, ${JSON.stringify(curve)}::jsonb)
                ON CONFLICT (exercise_id) DO UPDATE SET samples = EXCLUDED.samples, fetched_at = NOW()
              `;
            }
          } catch (err) {
            if (err instanceof HeartRateScopeError) needsReconnect = true;
            else console.warn(`[workout-heart-rate] ${r.id}:`, err);
          }
        }),
      );
    }
  }

  const workouts = rows.map((r): WorkoutHeartRate => {
    const samples = (Array.isArray(r.samples) ? r.samples : []) as [number, number][];
    return {
      id: String(r.id),
      name: String(r.name),
      exercise_type: String(r.exercise_type),
      start_local: String(r.start_local),
      active_s: Number(r.active_s),
      avg_hr: r.avg_hr === null ? null : Number(r.avg_hr),
      max_hr: samples.length ? Math.max(...samples.map((s) => s[1])) : null,
      zones: Array.isArray(r.zones) ? (r.zones as number[]).map(Number) : null,
      samples,
    };
  });

  return { connected, needsReconnect, workouts };
}
