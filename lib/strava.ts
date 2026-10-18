// Talking to Strava: the one-time OAuth grant, token refresh, and reading
// activities. Tokens live in app_settings like the Google Health grant does.
// Needs STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET (strava.com/settings/api).
import { getDb } from "./db";

const TOKEN_KEY = "strava_tokens";
const AUTH_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";
const EXPIRY_MARGIN_S = 60;

type StoredTokens = { access_token: string; refresh_token: string; expires_at: number; athlete?: string };

export function stravaConfigured() {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

function credentials() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not set");
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

async function writeTokens(t: StoredTokens) {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${TOKEN_KEY}, ${JSON.stringify(t)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function isStravaConnected() {
  return (await readTokens()) !== null;
}

export async function disconnectStrava() {
  const sql = getDb();
  await sql`DELETE FROM app_settings WHERE key = ${TOKEN_KEY}`;
}

export function stravaAuthUrl(redirectUri: string, state: string) {
  const { clientId } = credentials();
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read,activity:read_all",
    approval_prompt: "auto",
    state,
  })}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { firstname?: string; lastname?: string };
};

export async function exchangeStravaCode(code: string) {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
  const t = (await res.json()) as TokenResponse;
  await writeTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at,
    athlete: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ") || undefined,
  });
}

async function accessToken(): Promise<string> {
  const tokens = await readTokens();
  if (!tokens) throw new Error("Strava is not connected");
  if (tokens.expires_at - EXPIRY_MARGIN_S > Date.now() / 1000) return tokens.access_token;
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // A dead refresh token is unrecoverable: drop it so the UI says "connect".
    if (res.status === 400 || res.status === 401) await disconnectStrava();
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const t = (await res.json()) as TokenResponse;
  await writeTokens({ ...tokens, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at });
  return t.access_token;
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  /** Local wall-clock start, ISO without zone (what Strava calls start_date_local). */
  start_local: string;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  elevation_m: number | null;
  relative_effort: number | null;
  avg_speed: number | null;
}

type RawActivity = {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain?: number;
  suffer_score?: number | null;
  average_speed?: number;
};

/** Activities that started after `since` (a Date), newest first. Pages until done. */
export async function fetchStravaActivities(since: Date): Promise<StravaActivity[]> {
  const token = await accessToken();
  const out: StravaActivity[] = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${API}/athlete/activities?${new URLSearchParams({
      after: String(Math.floor(since.getTime() / 1000)),
      per_page: "100",
      page: String(page),
    })}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Strava activities failed: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as RawActivity[];
    for (const a of rows) {
      out.push({
        id: a.id,
        name: a.name,
        sport_type: a.sport_type ?? a.type ?? "Workout",
        start_local: a.start_date_local.replace(/Z$/, ""),
        distance_m: a.distance ?? 0,
        moving_time_s: a.moving_time ?? 0,
        elapsed_time_s: a.elapsed_time ?? 0,
        elevation_m: a.total_elevation_gain ?? null,
        relative_effort: a.suffer_score ?? null,
        avg_speed: a.average_speed ?? null,
      });
    }
    if (rows.length < 100) break;
  }
  return out.sort((a, b) => b.start_local.localeCompare(a.start_local));
}
