// Fitbit Web API — steps and sleep for the daily scorecard.
//
// Single-user app, same shape as lib/google.ts: one stored token blob from Berto's
// one-time consent, refreshed on demand. Fitbit differs from Google in one way that
// matters: **refresh tokens are single-use**. Every refresh returns a new one, and
// the old one dies immediately — so the write back to the DB is not optional
// bookkeeping, it's the difference between staying connected and having to re-auth.
//
// Setup (one time, by hand at dev.fitbit.com/apps):
//   1. Register a "Personal" app — Personal is what unlocks intraday/detailed data.
//   2. OAuth 2.0 Application Type: Client (Personal), Callback URL:
//      https://cael.bertomill.com/api/fitbit/callback (and the localhost one for dev)
//   3. Put the client id/secret in FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET.
//
// Docs: https://dev.fitbit.com/build/reference/web-api/

import { getDb } from "@/lib/db";

const AUTH_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const API = "https://api.fitbit.com";

/** Only what the scorecard needs. Asking for more would be a bigger consent screen for nothing. */
const SCOPES = ["activity", "sleep"];

const TOKEN_KEY = "fitbit_tokens";

/** Refresh this many seconds before the token actually expires, to dodge clock skew. */
const EXPIRY_MARGIN_SECONDS = 60;

type StoredTokens = {
  access_token: string;
  refresh_token: string;
  /** Epoch millis. */
  expires_at: number;
  user_id?: string;
};

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

function credentials() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET are not set");
  }
  return { clientId, clientSecret };
}

/** HTTP Basic header Fitbit wants on every token call. */
function basicAuth() {
  const { clientId, clientSecret } = credentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function fitbitConfigured(): boolean {
  return Boolean(process.env.FITBIT_CLIENT_ID && process.env.FITBIT_CLIENT_SECRET);
}

// ----------------------------------------------------------------- token store

async function readTokens(sql: Sql): Promise<StoredTokens | null> {
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${TOKEN_KEY}`;
  if (!rows.length) return null;
  try {
    return JSON.parse(String(rows[0].value)) as StoredTokens;
  } catch {
    return null;
  }
}

async function writeTokens(sql: Sql, tokens: StoredTokens): Promise<void> {
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${TOKEN_KEY}, ${JSON.stringify(tokens)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function isFitbitConnected(sql: Sql): Promise<boolean> {
  return (await readTokens(sql)) !== null;
}

export async function disconnectFitbit(sql: Sql): Promise<void> {
  await sql`DELETE FROM app_settings WHERE key = ${TOKEN_KEY}`;
}

// ------------------------------------------------------------------ oauth flow

export function fitbitAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
    // A year, which is Fitbit's maximum. The refresh token is what actually keeps
    // us alive, but a long-lived access token means fewer refresh round-trips.
    expires_in: "31536000",
  });
  return `${AUTH_URL}?${params}`;
}

function storedFrom(json: Record<string, unknown>): StoredTokens {
  return {
    access_token: String(json.access_token),
    refresh_token: String(json.refresh_token),
    expires_at: Date.now() + Number(json.expires_in ?? 28800) * 1000,
    user_id: json.user_id ? String(json.user_id) : undefined,
  };
}

export async function exchangeCodeAndStore(code: string, redirectUri: string): Promise<void> {
  const { clientId } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Fitbit token exchange failed: ${res.status} ${await res.text()}`);
  await writeTokens(getDb() as Sql, storedFrom(await res.json()));
}

/**
 * A valid access token, refreshing if it's close to expiry.
 *
 * The new refresh token is persisted *before* the caller gets a chance to fail —
 * Fitbit has already invalidated the old one by this point, so losing the new one
 * to a crash means a manual re-auth.
 */
async function accessToken(sql: Sql): Promise<string> {
  const tokens = await readTokens(sql);
  if (!tokens) throw new Error("Fitbit is not connected");
  if (Date.now() < tokens.expires_at - EXPIRY_MARGIN_SECONDS * 1000) return tokens.access_token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  if (!res.ok) {
    // A dead refresh token is unrecoverable: drop it so the UI shows "connect"
    // rather than silently failing every sync from here on.
    if (res.status === 400 || res.status === 401) await disconnectFitbit(sql);
    throw new Error(`Fitbit token refresh failed: ${res.status} ${await res.text()}`);
  }
  const next = storedFrom(await res.json());
  await writeTokens(sql, next);
  return next.access_token;
}

async function apiGet(sql: Sql, path: string): Promise<Record<string, unknown>> {
  const token = await accessToken(sql);
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Accept-Language": "en_CA" },
  });
  if (!res.ok) throw new Error(`Fitbit ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------- values

export type FitbitDay = {
  date: string;
  steps: number | null;
  sleepMinutes: number | null;
};

/**
 * Steps and minutes asleep for one YYYY-MM-DD.
 *
 * The two endpoints are fetched together but failed independently: a sleep record
 * that hasn't synced off the watch yet shouldn't cost us the step count.
 */
export async function fetchFitbitDay(sql: Sql, date: string): Promise<FitbitDay> {
  const [activity, sleep] = await Promise.allSettled([
    apiGet(sql, `/1/user/-/activities/date/${date}.json`),
    apiGet(sql, `/1.2/user/-/sleep/date/${date}.json`),
  ]);

  let steps: number | null = null;
  if (activity.status === "fulfilled") {
    const summary = activity.value.summary as Record<string, unknown> | undefined;
    const n = Number(summary?.steps);
    if (Number.isFinite(n)) steps = n;
  }

  let sleepMinutes: number | null = null;
  if (sleep.status === "fulfilled") {
    const summary = sleep.value.summary as Record<string, unknown> | undefined;
    const n = Number(summary?.totalMinutesAsleep);
    // 0 minutes means "no sleep record for this date", not "he was awake all night".
    if (Number.isFinite(n) && n > 0) sleepMinutes = n;
  }

  return { date, steps, sleepMinutes };
}
