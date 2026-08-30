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

import { getDb } from "@/lib/db";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * The watch grant is **health-only, on purpose**.
 *
 * The Health API rejects any access token that also carries calendar scopes:
 * `403 PERMISSION_DENIED / DISALLOWED_OAUTH_SCOPES`, with
 * `disallowed_scopes: "cl_events,cl_readonly"`. So this cannot ride on the Calendar
 * consent in lib/google.ts, and the two grants are stored separately. Never add a
 * non-googlehealth scope to this list, and never use `include_granted_scopes` here —
 * either would silently poison the token and every request would 403.
 */
export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

const TOKEN_KEY = "google_health_tokens";
/** Refresh this early to dodge clock skew. */
const EXPIRY_MARGIN_MS = 60_000;

type StoredTokens = { access_token: string; refresh_token: string; expires_at: number };

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  return { clientId, clientSecret };
}

async function readTokens(): Promise<StoredTokens | null> {
  const sql = getDb();
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = ${TOKEN_KEY}`;
    return rows.length ? (JSON.parse(String(rows[0].value)) as StoredTokens) : null;
  } catch {
    return null;
  }
}

async function writeTokens(t: StoredTokens): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${TOKEN_KEY}, ${JSON.stringify(t)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

/** Whether the watch is connected — i.e. a health-only grant exists. */
export async function isHealthConnected(): Promise<boolean> {
  return (await readTokens()) !== null;
}

export async function disconnectHealth(): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM app_settings WHERE key = ${TOKEN_KEY}`;
}

export function healthAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = credentials();
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: HEALTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  })}`;
}

export async function exchangeHealthCode(code: string, redirectUri: string): Promise<void> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Health token exchange failed: ${res.status} ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  if (!t.refresh_token) throw new Error("Google did not return a refresh token for the health grant");
  await writeTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + t.expires_in * 1000,
  });
}

/** A valid health access token, refreshing when close to expiry. */
async function getAccessToken(): Promise<string | null> {
  const tokens = await readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - EXPIRY_MARGIN_MS) return tokens.access_token;

  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // A dead refresh token is unrecoverable: drop it so the UI says "connect" rather
    // than failing every sync from here on.
    if (res.status === 400 || res.status === 401) await disconnectHealth();
    throw new Error(`Health token refresh failed: ${res.status} ${await res.text()}`);
  }
  const t = (await res.json()) as { access_token: string; expires_in: number };
  const next = { ...tokens, access_token: t.access_token, expires_at: Date.now() + t.expires_in * 1000 };
  await writeTokens(next);
  return next.access_token;
}

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
  if (!token) throw new Error("The watch is not connected");
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
