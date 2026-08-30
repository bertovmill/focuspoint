// Google Health API — steps and sleep for the daily scorecard.
//
// This replaced a Fitbit Web API client written earlier the same day. **The legacy
// Fitbit Web API is turned down in September 2026** (Fitbit's own authorization docs
// carry the notice), tokens don't transfer, and every user has to re-consent. Building
// on it would have meant tearing it out weeks later.
//
// The successor returns the same watch data and authenticates with **Google OAuth** —
// which this app already has for Calendar. So there is no second provider, no second
// client secret, and no second token store: `lib/google.ts` owns the tokens and this
// module just spends them. Adding the scopes there is the whole integration.
//
// The one thing to know about access: all googlehealth scopes are "Restricted", which
// normally means a third-party security review. That does not apply here — unverified
// OAuth clients get 100 users for testing *and* production, and this is one person
// reading his own data on his own project.
//
// Docs: https://developers.google.com/health/reference/rest/v4

import { getAccessToken } from "@/lib/google";

const API = "https://health.googleapis.com/v4";

/**
 * A wall-clock date with no zone attached.
 *
 * The date is **nested under `date`**, not flat. Sending `{year, month, day}` at the
 * top level gets a 400 "Unknown name \"year\" at 'range.start': Cannot find field" —
 * which is how this was found, via `?debug=`. `time` is optional and defaults to
 * midnight, which is exactly what a day boundary wants.
 */
type CivilDateTime = { date: { year: number; month: number; day: number } };

function civil(date: string): CivilDateTime {
  const [year, month, day] = date.split("-").map(Number);
  return { date: { year, month, day } };
}

/** The day after `date`, since dailyRollUp's range is closed-open. */
function nextDay(date: string): CivilDateTime {
  const [y, m, d] = date.split("-").map(Number);
  // Noon UTC so a DST rollover can't land us on the wrong calendar day.
  const next = new Date(Date.UTC(y, m - 1, d, 12) + 86_400_000);
  return { date: { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() } };
}

type RollupPoint = Record<string, unknown>;

/**
 * One day of one data type, aggregated by Google into a single bucket.
 *
 * Returns the raw rollup points rather than a number: the per-type field names
 * (`steps.count_sum`, and whatever sleep calls its total) are the part of this API
 * most likely to differ from the docs, so the extraction is done by the caller where
 * it can be permissive.
 */
async function dailyRollUp(dataType: string, date: string): Promise<RollupPoint[]> {
  const token = await getAccessToken();
  if (!token) throw new Error("Google is not connected");
  const res = await fetch(`${API}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      range: { start: civil(date), end: nextDay(date) },
      windowSizeDays: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Health ${dataType} ${date} failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { rollupDataPoints?: RollupPoint[] };
  return json.rollupDataPoints ?? [];
}

/**
 * Pull the first finite number out of a rollup point, trying the documented field
 * name first and then any `*_sum` / `*_total` sibling.
 *
 * Deliberately permissive. The alternative — hard-coding one path and returning null
 * when it doesn't match — fails silently and looks identical to "no data synced yet",
 * which is the worst possible failure for a metric you're supposed to trust.
 */
function extractNumber(point: RollupPoint, dataType: string, preferred: string[]): number | null {
  const bucket = point[dataType];
  const candidates: unknown[] = [];

  if (bucket && typeof bucket === "object") {
    const fields = bucket as Record<string, unknown>;
    for (const key of preferred) if (key in fields) candidates.push(fields[key]);
    for (const [key, value] of Object.entries(fields)) {
      if (/_(sum|total)$/.test(key)) candidates.push(value);
    }
  }

  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export type HealthDay = {
  date: string;
  steps: number | null;
  sleepMinutes: number | null;
};

/**
 * Steps and minutes asleep for one YYYY-MM-DD.
 *
 * Fetched together but failed independently: a sleep record that hasn't synced off
 * the watch yet shouldn't cost us the step count.
 */
export async function fetchHealthDay(date: string): Promise<HealthDay> {
  const [stepsRes, sleepRes] = await Promise.allSettled([
    dailyRollUp("steps", date),
    dailyRollUp("sleep", date),
  ]);

  let steps: number | null = null;
  if (stepsRes.status === "fulfilled") {
    for (const point of stepsRes.value) {
      const n = extractNumber(point, "steps", ["count_sum", "countSum"]);
      if (n !== null) steps = (steps ?? 0) + n;
    }
  } else {
    console.warn(`[google-health] steps ${date}:`, stepsRes.reason);
  }

  let sleepMinutes: number | null = null;
  if (sleepRes.status === "fulfilled") {
    for (const point of sleepRes.value) {
      // Sleep totals come back in minutes or in seconds depending on the field;
      // anything implausibly large for a night is treated as seconds.
      const n = extractNumber(point, "sleep", [
        "duration_sum",
        "durationSum",
        "asleep_duration_sum",
        "totalMinutesAsleep",
      ]);
      if (n === null) continue;
      const minutes = n > 1440 ? Math.round(n / 60) : n;
      sleepMinutes = (sleepMinutes ?? 0) + minutes;
    }
    // 0 means "no sleep record for this date", not "he was awake all night".
    if (sleepMinutes === 0) sleepMinutes = null;
  } else {
    console.warn(`[google-health] sleep ${date}:`, sleepRes.reason);
  }

  return { date, steps, sleepMinutes };
}

/**
 * Raw rollup for one day, for debugging the field names against real data. Used by
 * GET /api/health/sync?debug=<date> — worth keeping, because the response shape is
 * the part of this integration that documentation alone couldn't settle.
 */
export async function debugHealthDay(date: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { date };
  for (const dataType of ["steps", "sleep"]) {
    try {
      out[dataType] = await dailyRollUp(dataType, date);
    } catch (err) {
      out[dataType] = { error: String(err) };
    }
  }
  return out;
}
