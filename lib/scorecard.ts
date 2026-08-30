// The daily scorecard — "did I win today?".
//
// Berto's note (thought #181, 2026-08-28): "Measures of success — the metrics that
// make the magic happen." The list he landed on after cutting the noisy ones:
//
//   Steps · Sleep · Fasting window 12–8pm · PRs merged · Portfolio
//
// The rule he gave for what earns a slot: **highly trackable, high signal**. That's
// why Readwise highlights are gone ("high noise, less signal") and why every metric
// here either comes from an API or is a single tap. A metric that needs a paragraph
// of typing each night is a metric that stops getting logged in a week.
//
// Where the numbers come from:
//   - steps, sleep    → the watch, via the Google Health API (lib/google-health.ts),
//                       cached into `daily_metrics`. Not the Fitbit Web API: that is
//                       turned down in September 2026 and its successor rides on the
//                       Google OAuth this app already holds.
//   - fasting         → the `fasted` rule on `nutrition_days`. Deliberately NOT a
//                       second column: the Nutrition screen already owns that
//                       checkbox, and two places recording "did I hold the window"
//                       would drift apart within a week.
//   - prs             → derived live from `github_prs`, nothing to store
//   - portfolio       → typed in for now. The unofficial Wealthsimple client that
//                       filled this was removed (4d8ce55): handing a password and a
//                       2FA code to a reverse-engineered endpoint wasn't worth a
//                       number that gates nothing. SnapTrade's free tier is the
//                       sanctioned replacement. Deliberately NOT part of "did I win
//                       today" (see `gates` below): a balance is a level, not an action.
//
// No db import at module scope — `sql` comes from the caller, same shape as
// lib/streak.ts and lib/working-now.ts, so client components can import the pure bits.

import { dayKey, STREAK_TIME_ZONE } from "@/lib/streak";
import { normalizeRules } from "@/lib/nutrition";
import { isHealthConnected } from "@/lib/google-health";

export { dayKey, STREAK_TIME_ZONE };

/** How many days the history strip draws. */
export const SCORECARD_DAYS = 14;

/** How far back the streak query looks. */
const HISTORY_DAYS = 365;

const TARGETS_SETTING_KEY = "scorecard_targets";

// --------------------------------------------------------------------- metrics

export type MetricKey = "steps" | "sleep_minutes" | "fasting_held" | "prs" | "portfolio";

export type MetricSource = "health" | "github" | "manual";

export type MetricDef = {
  key: MetricKey;
  label: string;
  /** Short line under the label — what the number actually means. */
  hint: string;
  source: MetricSource;
  /** How the value renders and how a target is compared. */
  kind: "count" | "duration" | "toggle" | "money";
  /** Default target. Overridable per-metric via app_settings — see `getTargets`. */
  target: number;
  /**
   * Whether missing this metric costs him the day. Portfolio is tracked but not
   * gated: a balance is a level you don't move by trying harder today.
   */
  gates: boolean;
};

export const METRICS: MetricDef[] = [
  {
    key: "steps",
    label: "Steps",
    hint: "Watch · daily movement",
    source: "health",
    kind: "count",
    target: 20_000,
    gates: true,
  },
  {
    key: "sleep_minutes",
    label: "Sleep",
    hint: "Watch · time asleep",
    source: "health",
    kind: "duration",
    target: 450, // 7h30m
    gates: true,
  },
  {
    key: "fasting_held",
    label: "Eating window",
    hint: "12pm–8pm · shared with the nutrition protocol",
    source: "manual",
    kind: "toggle",
    target: 1,
    gates: true,
  },
  {
    key: "prs",
    label: "PRs merged",
    hint: "GitHub · build the thing",
    source: "github",
    kind: "count",
    target: 1,
    gates: true,
  },
  {
    key: "portfolio",
    label: "Portfolio",
    hint: "Wealthsimple · invested, not gated",
    source: "manual",
    kind: "money",
    target: 0,
    gates: false,
  },
];

/** The metrics a day is actually judged on. */
export const GATING_METRICS = METRICS.filter((m) => m.gates);

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
    if (m.kind === "toggle" || m.kind === "money") continue; // not a dial
    const n = Math.trunc(Number(input[m.key]));
    if (Number.isFinite(n) && n > 0) base[m.key] = n;
  }
  return base;
}

// ------------------------------------------------------------------- day shape

/** One metric on one day, resolved against its target. */
export type MetricValue = {
  key: MetricKey;
  /** null = never logged. Distinct from 0, which is a real (bad) number. */
  value: number | null;
  target: number;
  hit: boolean;
};

export type ScorecardDay = {
  /** YYYY-MM-DD in STREAK_TIME_ZONE. */
  date: string;
  metrics: MetricValue[];
  /** Gating metrics hit, out of GATING_METRICS.length. */
  hitCount: number;
  /** Every gating metric hit — a won day. */
  perfect: boolean;
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
};

/** Did this value clear its bar? A null (never logged) is never a hit. */
export function isHit(key: MetricKey, value: number | null, target: number): boolean {
  if (value === null) return false;
  if (metricDef(key).kind === "toggle") return value > 0;
  return value >= target;
}

/** Build a day from raw per-metric numbers. */
export function buildDay(date: string, values: Partial<Record<MetricKey, number | null>>, targets: Targets): ScorecardDay {
  const metrics = METRICS.map<MetricValue>((m) => {
    const value = values[m.key] ?? null;
    const target = targets[m.key] ?? m.target;
    return { key: m.key, value, target, hit: isHit(m.key, value, target) };
  });
  const gating = metrics.filter((v) => metricDef(v.key).gates);
  const hitCount = gating.filter((v) => v.hit).length;
  return { date, metrics, hitCount, perfect: hitCount === gating.length };
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
  switch (metricDef(key).kind) {
    case "duration": {
      const h = Math.floor(value / 60);
      const m = value % 60;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    case "toggle":
      return value > 0 ? "held" : "broken";
    case "money":
      return `$${Math.round(value).toLocaleString("en-CA")}`;
    default:
      return value.toLocaleString("en-CA");
  }
}

/** The target as it reads next to the value. Toggles have no meaningful target text. */
export function formatTarget(key: MetricKey, target: number): string {
  const def = metricDef(key);
  if (def.kind === "toggle") return "";
  if (def.kind === "money") return "";
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

  const [targets, logged, fastRows, prRows, healthConnected] = await Promise.all([
    getTargets(sql),
    sql`
      SELECT to_char(recorded_date, 'YYYY-MM-DD') AS date, steps, sleep_minutes, portfolio
      FROM daily_metrics
      WHERE recorded_date >= ${since}::date
    `,
    // The eating window lives on the nutrition protocol, not here. A day with no
    // row has never been answered (null); a row without 'fasted' is a logged miss.
    sql`
      SELECT to_char(logged_date, 'YYYY-MM-DD') AS date, ('fasted' = ANY(rules)) AS held
      FROM nutrition_days
      WHERE logged_date >= ${since}::date
    `,
    // PRs bucketed in Berto's timezone, not UTC — a PR merged at 9pm Toronto belongs
    // to that day. Same reasoning as lib/streak.ts.
    sql`
      SELECT to_char(merged_at AT TIME ZONE ${STREAK_TIME_ZONE}, 'YYYY-MM-DD') AS date, COUNT(*)::int AS prs
      FROM github_prs
      WHERE merged_at >= ${since}::date
      GROUP BY 1
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
    v.portfolio = r.portfolio === null ? null : Number(r.portfolio);
  }
  for (const r of fastRows as Record<string, unknown>[]) {
    slot(String(r.date)).fasting_held = r.held ? 1 : 0;
  }
  for (const r of prRows as Record<string, unknown>[]) {
    slot(String(r.date)).prs = Number(r.prs);
  }
  // Zero PRs on a day with any other activity is a real zero, not "unlogged" — the
  // github table is complete, so an absent day genuinely means none were merged.
  for (const [, v] of values) if (v.prs === undefined) v.prs = 0;

  const byDate = new Map<string, ScorecardDay>();
  for (const [date, v] of values) byDate.set(date, buildDay(date, v, targets));

  const { streak, bestStreak, atRisk } = computePerfectStreak(byDate, todayKey);

  const today = byDate.get(todayKey) ?? buildDay(todayKey, { prs: 0 }, targets);
  const recent: ScorecardDay[] = [];
  for (let i = SCORECARD_DAYS - 1; i >= 0; i--) {
    const key = shiftDay(todayKey, i);
    recent.push(byDate.get(key) ?? buildDay(key, {}, targets));
  }

  return {
    today,
    targets,
    streak,
    bestStreak,
    atRisk,
    recent,
    googleConnected: healthConnected,
  };
}

/** What a caller may write for a day. Undefined fields are left untouched. */
export type MetricPatch = {
  steps?: number | null;
  sleep_minutes?: number | null;
  portfolio?: number | null;
};

/**
 * Upsert one day's manual/synced numbers. Only the fields present in `patch` move,
 * so a health sync writing steps can't blow away a fasting tap made an hour earlier.
 */
export async function recordMetrics(sql: Sql, date: string, patch: MetricPatch): Promise<void> {
  await sql`
    INSERT INTO daily_metrics (recorded_date, steps, sleep_minutes, portfolio)
    VALUES (
      ${date}::date,
      ${patch.steps ?? null},
      ${patch.sleep_minutes ?? null},
      ${patch.portfolio ?? null}
    )
    ON CONFLICT (recorded_date) DO UPDATE SET
      steps         = CASE WHEN ${patch.steps === undefined} THEN daily_metrics.steps ELSE EXCLUDED.steps END,
      sleep_minutes = CASE WHEN ${patch.sleep_minutes === undefined} THEN daily_metrics.sleep_minutes ELSE EXCLUDED.sleep_minutes END,
      portfolio     = CASE WHEN ${patch.portfolio === undefined} THEN daily_metrics.portfolio ELSE EXCLUDED.portfolio END,
      updated_at    = NOW()
  `;
}

/**
 * The eating-window tap. Adds or removes the `fasted` rule on the nutrition day,
 * leaving the other three protocol rules exactly as they were — the scorecard is a
 * second door onto the same checkbox, not a competing record.
 */
export async function setFastingHeld(sql: Sql, date: string, held: boolean): Promise<void> {
  const rows = await sql`SELECT rules FROM nutrition_days WHERE logged_date = ${date}::date`;
  const current = (rows[0]?.rules as string[] | undefined) ?? [];
  const next = normalizeRules(held ? [...current, "fasted"] : current.filter((r) => r !== "fasted"));
  await sql`
    INSERT INTO nutrition_days (logged_date, rules, updated_at)
    VALUES (${date}::date, ${next}, NOW())
    ON CONFLICT (logged_date) DO UPDATE SET rules = EXCLUDED.rules, updated_at = NOW()
  `;
}
