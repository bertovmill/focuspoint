// The daily scorecard — "did I win today?".
//
// Berto's call (2026-09-03): three keys, full stop — **Steps · Sleep · Keystrokes**.
// Everything else that used to live here (fasting, meditation, reading, journal,
// portfolio, notes written) was cut: *"lets remove the reading measure, lets remove
// the fasting measure, lets instead just make it the 3."* His earlier rule still
// holds for why these three stayed — **highly trackable, high signal** — but the
// bar for "worth a slot" got higher: every remaining key comes from an API or an
// always-on background agent, nothing needs a manual tap or a timer anymore.
//
// Where the numbers come from:
//   - steps, sleep  → the watch, via the Google Health API (lib/google-health.ts),
//                     cached into `daily_metrics`. Not the Fitbit Web API: that is
//                     turned down in September 2026 and its successor rides on the
//                     Google OAuth this app already holds.
//   - keystrokes    → `keystroke_days`, posted every minute by the launchd agent on
//                     Berto's Mac (keystroke-agent/). Replaced "PRs merged" on
//                     2026-08-30 — his call: "keystrokes matter more than PRs". A
//                     merged PR is a lumpy, gameable unit (a one-line typo fix and a
//                     week of work both count 1); keys pressed is the honest volume
//                     of the work. The count is only ever a count — never which keys.
//
// No db import at module scope — `sql` comes from the caller, same shape as
// lib/streak.ts and lib/working-now.ts, so client components can import the pure bits.

import { dayKey, STREAK_TIME_ZONE } from "@/lib/streak";
import { isHealthConnected } from "@/lib/google-health";

export { dayKey, STREAK_TIME_ZONE };

/** How many days the history strip draws. */
export const SCORECARD_DAYS = 14;

/** How far back the streak query looks. */
const HISTORY_DAYS = 365;

const TARGETS_SETTING_KEY = "scorecard_targets";

// --------------------------------------------------------------------- metrics

export type MetricKey = "steps" | "sleep_minutes" | "keystrokes";

/** Where a number comes from — and so whether a human is allowed to type over it. */
export type MetricSource = "health" | "agent";

export type MetricDef = {
  key: MetricKey;
  label: string;
  /** Short line under the label — what the number actually means. */
  hint: string;
  source: MetricSource;
  /** How the value renders and how a target is compared. */
  kind: "count" | "duration";
  /** Default target. Overridable per-metric via app_settings — see `getTargets`. */
  target: number;
};

export const METRICS: MetricDef[] = [
  {
    key: "steps",
    label: "Steps",
    hint: "Watch · daily movement",
    source: "health",
    kind: "count",
    target: 30_000,
  },
  {
    key: "sleep_minutes",
    label: "Sleep",
    hint: "Watch · time asleep",
    source: "health",
    kind: "duration",
    target: 480, // 8h
  },
  {
    key: "keystrokes",
    label: "Keystrokes",
    hint: "Mac · build the thing",
    source: "agent",
    kind: "count",
    target: 100_000,
  },
];

/** Every metric gates the day now — there's nothing left that's tracked-but-not-scored. */
export const GATING_METRICS = METRICS;

export function metricDef(key: MetricKey): MetricDef {
  const def = METRICS.find((m) => m.key === key);
  if (!def) throw new Error(`unknown metric: ${key}`);
  return def;
}

export type Targets = Record<MetricKey, number>;

export function defaultTargets(): Targets {
  return Object.fromEntries(METRICS.map((m) => [m.key, m.target])) as Targets;
}

/** Targets are user-tunable but never nonsensical — a 0 target would auto-win the day. */
export function clampTargets(raw: unknown): Targets {
  const base = defaultTargets();
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Record<string, unknown>;
  for (const m of METRICS) {
    const n = Math.trunc(Number(input[m.key]));
    if (Number.isFinite(n) && n > 0) base[m.key] = n;
  }
  return base;
}

// ------------------------------------------------------------------- day shape

// -------------------------------------------------------------------- scoring
//
// The score is a **percentage of a perfect day**: 0 when nothing was logged, 100
// when every key hit its target. Berto's rule (2026-09-02): *"perfect means we hit
// our target, so really it should be between 0 and 100."*
//
// The consequences, on purpose:
//   - **Overshooting pays nothing.** 60,000 steps scores exactly what 30,000 does.
//     The target is the target; the surplus is its own reward.
//   - **The ceiling is reachable**, so 100 can be hit repeatedly. The high score
//     stops being the thing to chase and the *streak* takes over that job.
//   - Partial credit is still real: 15,000 of 30,000 steps pays half its slice, so
//     a hard day and a lazy one never read the same.

/** A perfect day. Every score is a fraction of this. */
export const MAX_DAY_SCORE = 100;

/** What one key is worth. Equal across all three — every key costs the same to skip. */
export const METRIC_WEIGHT = MAX_DAY_SCORE / GATING_METRICS.length;

/**
 * The unrounded share one metric earned, 0…METRIC_WEIGHT.
 *
 * A null value scores 0 but is *not* the same as a zero: see `buildDay`, which
 * keeps the distinction so an unlogged day never looks like a failed one.
 */
export function rawMetricPoints(key: MetricKey, value: number | null, target: number): number {
  if (value === null) return 0;
  if (target <= 0 || value <= 0) return 0;
  // Capped at 1: past the target there is nothing more to earn.
  return Math.min(1, value / target) * METRIC_WEIGHT;
}

/**
 * Round the per-metric shares to one decimal so that **they add up to the total
 * exactly**, using largest-remainder apportionment.
 *
 * Worth the twenty lines: 100 does not divide three ways cleanly, so the naive
 * rounding shows rows that visibly don't sum to the headline. This way a perfect
 * day reads 33.4 · 33.3 · 33.3 = 100.0, which is true.
 */
export function apportion(raw: number[]): { points: number[]; total: number } {
  const totalTenths = Math.round(raw.reduce((a, b) => a + b, 0) * 10);
  const floors = raw.map((r) => Math.floor(r * 10));
  let left = totalTenths - floors.reduce((a, b) => a + b, 0);

  // Hand the leftover tenths to whichever metrics were rounded down hardest.
  const order = raw
    .map((r, i) => ({ i, frac: r * 10 - Math.floor(r * 10) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }

  return { points: floors.map((t) => t / 10), total: totalTenths / 10 };
}

/**
 * What one metric is worth today, rounded on its own. Kept for callers that want a
 * single metric's value without building the whole day (Cael's spoken replies, the
 * agent tools); `buildDay` uses `apportion` instead so the rows add up.
 */
export function metricPoints(key: MetricKey, value: number | null, target: number): number {
  return Math.round(rawMetricPoints(key, value, target) * 10) / 10;
}

/** One metric on one day, resolved against its target. */
export type MetricValue = {
  key: MetricKey;
  /** null = never logged. Distinct from 0, which is a real (bad) number. */
  value: number | null;
  target: number;
  hit: boolean;
  /** What this metric contributed to the day's score. */
  points: number;
};

export type ScorecardDay = {
  /** YYYY-MM-DD in STREAK_TIME_ZONE. */
  date: string;
  metrics: MetricValue[];
  /** Metrics hit, out of GATING_METRICS.length. */
  hitCount: number;
  /** Every metric hit — a won day. */
  perfect: boolean;
  /** Percentage of a perfect day, 0…100, to one decimal. */
  score: number;
};

/**
 * A name for how good the day is, so there's something to chase on a day when the
 * all-time record is out of reach. Graded against the theoretical ceiling, not
 * against his own history — a tier that drifts as the record moves would mean
 * "Elite" quietly getting harder every time he has a good week.
 */
export type ScoreTier = { key: "legendary" | "elite" | "strong" | "solid" | "warming" | "cold"; label: string };

export function scoreTier(score: number): ScoreTier {
  const pct = score / MAX_DAY_SCORE;
  if (pct >= 0.92) return { key: "legendary", label: "Legendary" };
  if (pct >= 0.75) return { key: "elite", label: "Elite" };
  if (pct >= 0.6) return { key: "strong", label: "Strong" };
  if (pct >= 0.4) return { key: "solid", label: "Solid" };
  if (pct >= 0.2) return { key: "warming", label: "Warming up" };
  return { key: "cold", label: "Cold start" };
}

/** The score that would earn the next tier up, or null at the top. */
export function nextTierAt(score: number): { tier: ScoreTier; points: number } | null {
  for (const cut of [0.2, 0.4, 0.6, 0.75, 0.92]) {
    const threshold = Math.ceil(cut * MAX_DAY_SCORE);
    if (score < threshold) {
      return { tier: scoreTier(threshold), points: Math.round((threshold - score) * 10) / 10 };
    }
  }
  return null;
}

/** An all-time high for one metric (or for the day score, key `"score"`). */
export type PersonalBest = {
  value: number;
  /** The day it was set. */
  date: string;
};

/** Every high score the card can wave at him. */
export type Records = {
  /** Best single-day score. */
  score: PersonalBest | null;
  /** Best value per metric. */
  metrics: Partial<Record<MetricKey, PersonalBest>>;
};

export type ScorecardSummary = {
  today: ScorecardDay;
  targets: Targets;
  /** Consecutive perfect days ending today (or yesterday, if today isn't won yet). */
  streak: number;
  /** Longest perfect run in the last year. */
  bestStreak: number;
  /** True when a live streak has not yet been extended today. */
  atRisk: boolean;
  /** Newest last: the last SCORECARD_DAYS days for the history strip. */
  recent: ScorecardDay[];
  /** Whether Google (and so the watch data) is connected — the card nudges when not. */
  googleConnected: boolean;
  /** The bars to beat, as they stood before today. */
  records: Records;
  /**
   * Records today has already broken — `"score"` plus any metric keys. The card
   * celebrates these; it's computed server-side so the client never has to guess
   * what counts as "beaten".
   */
  broken: (MetricKey | "score")[];
  /** MAX_DAY_SCORE, sent along so the client doesn't re-derive the ceiling. */
  maxScore: number;
  /** The first day records are counted from — when keystroke tracking began. */
  recordsSince: string;
};

/** Did this value clear its bar? A null (never logged) is never a hit. */
export function isHit(value: number | null, target: number): boolean {
  if (value === null) return false;
  return value >= target;
}

/** Build a day from raw per-metric numbers. */
export function buildDay(date: string, values: Partial<Record<MetricKey, number | null>>, targets: Targets): ScorecardDay {
  const resolved = METRICS.map((m) => {
    const value = values[m.key] ?? null;
    const target = targets[m.key] ?? m.target;
    return { def: m, value, target, raw: rawMetricPoints(m.key, value, target) };
  });

  const { points, total } = apportion(resolved.map((r) => r.raw));

  const metrics = resolved.map<MetricValue>((r, i) => ({
    key: r.def.key,
    value: r.value,
    target: r.target,
    hit: isHit(r.value, r.target),
    points: points[i],
  }));

  const hitCount = metrics.filter((v) => v.hit).length;
  const perfect = hitCount === metrics.length;
  // Perfect is exactly 100 by construction — every share is capped at its weight and
  // the weights sum to MAX_DAY_SCORE — but clamp anyway so a hand-edited target can
  // never print 101.
  const score = Math.min(MAX_DAY_SCORE, total);
  return { date, metrics, hitCount, perfect, score };
}

/**
 * The high scores standing *before* `excludeDate`, so today can be measured against
 * them, optionally floored at `since`. A record needs a real logged number — an unlogged day is not a zero, and a
 * literal zero never becomes a personal best.
 */
export function computeRecords(
  byDate: Map<string, ScorecardDay>,
  excludeDate: string,
  /** Ignore days before this one — see `trackingSince` in getScorecardSummary. */
  since?: string,
): Records {
  const records: Records = { score: null, metrics: {} };

  for (const [date, day] of byDate) {
    if (date === excludeDate) continue;
    if (since && date < since) continue;

    if (day.score > 0 && (!records.score || day.score > records.score.value)) {
      records.score = { value: day.score, date };
    }
    for (const m of day.metrics) {
      if (m.value === null || m.value <= 0) continue;
      const current = records.metrics[m.key];
      if (!current || m.value > current.value) records.metrics[m.key] = { value: m.value, date };
    }
  }

  return records;
}

/** Which of yesterday's records today has already knocked over. */
export function brokenRecords(today: ScorecardDay, records: Records): (MetricKey | "score")[] {
  const broken: (MetricKey | "score")[] = [];
  if (records.score && today.score > records.score.value) broken.push("score");
  for (const m of today.metrics) {
    const pb = records.metrics[m.key];
    if (pb && m.value !== null && m.value > pb.value) broken.push(m.key);
  }
  return broken;
}

/** The key `back` days before `key`. Walks in UTC noon so DST can't skip a day. */
export function shiftDay(key: string, back: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 12);
  return dayKey(new Date(base - back * 86_400_000), "UTC");
}

/**
 * Perfect-day streak. Same rule as lib/streak.ts: today not being won yet does not
 * break it — it's in play until midnight — so the count starts at today when today
 * is perfect and at yesterday otherwise.
 */
export function computePerfectStreak(byDate: Map<string, ScorecardDay>, todayKey: string) {
  const perfect = (key: string) => byDate.get(key)?.perfect ?? false;
  const todayPerfect = perfect(todayKey);

  let streak = 0;
  let cursor = todayPerfect ? todayKey : shiftDay(todayKey, 1);
  while (perfect(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, 1);
  }

  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...byDate.keys()].sort()) {
    if (!byDate.get(key)!.perfect) {
      run = 0;
      prev = key;
      continue;
    }
    run = prev !== null && shiftDay(key, 1) === prev ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = key;
  }

  return { streak, bestStreak, todayPerfect, atRisk: streak > 0 && !todayPerfect };
}

// ------------------------------------------------------------------ formatting

/** Human-readable value for a metric — used by the card and by Cael's spoken replies. */
export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null) return "—";
  if (metricDef(key).kind === "duration") {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return value.toLocaleString("en-CA");
}

/** The target as it reads next to the value. */
export function formatTarget(key: MetricKey, target: number): string {
  return formatMetric(key, target);
}

// -------------------------------------------------------------------- database

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export async function getTargets(sql: Sql): Promise<Targets> {
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${TARGETS_SETTING_KEY}`;
  if (!rows.length) return defaultTargets();
  const raw = rows[0].value;
  try {
    return clampTargets(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return defaultTargets();
  }
}

export async function setTargets(sql: Sql, raw: unknown): Promise<Targets> {
  const targets = clampTargets(raw);
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${TARGETS_SETTING_KEY}, ${JSON.stringify(targets)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return targets;
}

/**
 * The whole card in one query pass: logged metrics, PRs derived from `github_prs`,
 * and the perfect-day streak over the last year.
 */
export async function getScorecardSummary(sql: Sql): Promise<ScorecardSummary> {
  const todayKey = dayKey(new Date());
  const since = shiftDay(todayKey, HISTORY_DAYS);

  const [targets, logged, keyRows, healthConnected] = await Promise.all([
    getTargets(sql),
    sql`
      SELECT to_char(recorded_date, 'YYYY-MM-DD') AS date, steps, sleep_minutes
      FROM daily_metrics
      WHERE recorded_date >= ${since}::date
    `,
    // Keystrokes are already bucketed by day, in Berto's timezone, by the agent that
    // posts them — there is nothing to re-bucket here.
    sql`
      SELECT to_char(logged_date, 'YYYY-MM-DD') AS date, count
      FROM keystroke_days
      WHERE logged_date >= ${since}::date
    `,
    // The watch has its OWN health-only grant, separate from the Calendar one —
    // the Health API 403s on any token carrying calendar scopes. See lib/google-health.ts.
    isHealthConnected(),
  ]);

  const values = new Map<string, Partial<Record<MetricKey, number | null>>>();
  const slot = (date: string) => {
    let v = values.get(date);
    if (!v) values.set(date, (v = {}));
    return v;
  };

  for (const r of logged as Record<string, unknown>[]) {
    const v = slot(String(r.date));
    v.steps = r.steps === null ? null : Number(r.steps);
    v.sleep_minutes = r.sleep_minutes === null ? null : Number(r.sleep_minutes);
  }
  for (const r of keyRows as Record<string, unknown>[]) {
    slot(String(r.date)).keystrokes = Number(r.count);
  }
  // A day with no keystroke row is *unlogged*, not a zero: it means the Mac agent
  // wasn't running. Unlike the github table, this one is only as complete as the
  // agent's uptime, so an absent day must not be scored as "typed nothing".

  const byDate = new Map<string, ScorecardDay>();
  for (const [date, v] of values) byDate.set(date, buildDay(date, v, targets));

  const { streak, bestStreak, atRisk } = computePerfectStreak(byDate, todayKey);

  const today = byDate.get(todayKey) ?? buildDay(todayKey, {}, targets);
  const recent: ScorecardDay[] = [];
  for (let i = SCORECARD_DAYS - 1; i >= 0; i--) {
    const key = shiftDay(todayKey, i);
    recent.push(byDate.get(key) ?? buildDay(key, {}, targets));
  }

  // Records only count days that could actually score on all three metrics. Keystroke
  // tracking started 2026-08-29; every day before it is missing a whole gating metric,
  // so letting those days hold the high score would set a bar the new scorecard can
  // never fairly beat. Berto's call (2026-08-30) when the metric was swapped in.
  const trackingSince = [...values.entries()]
    .filter(([, v]) => (v.keystrokes ?? 0) > 0)
    .map(([date]) => date)
    .sort()[0] ?? todayKey;

  const records = computeRecords(byDate, todayKey, trackingSince);

  return {
    today,
    targets,
    streak,
    bestStreak,
    atRisk,
    recent,
    googleConnected: healthConnected,
    records,
    broken: brokenRecords(today, records),
    maxScore: MAX_DAY_SCORE,
    recordsSince: trackingSince,
  };
}

/** What a caller may write for a day. Undefined fields are left untouched. */
export type MetricPatch = {
  steps?: number | null;
  sleep_minutes?: number | null;
};

/**
 * Upsert one day's manual/synced numbers. Only the fields present in `patch` move,
 * so a health sync writing steps can't blow away a correction made an hour earlier.
 */
export async function recordMetrics(sql: Sql, date: string, patch: MetricPatch): Promise<void> {
  await sql`
    INSERT INTO daily_metrics (recorded_date, steps, sleep_minutes)
    VALUES (${date}::date, ${patch.steps ?? null}, ${patch.sleep_minutes ?? null})
    ON CONFLICT (recorded_date) DO UPDATE SET
      steps          = CASE WHEN ${patch.steps === undefined} THEN daily_metrics.steps ELSE EXCLUDED.steps END,
      sleep_minutes  = CASE WHEN ${patch.sleep_minutes === undefined} THEN daily_metrics.sleep_minutes ELSE EXCLUDED.sleep_minutes END,
      updated_at     = NOW()
  `;
}
