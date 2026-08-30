import { getDb } from "@/lib/db";

// Google Calendar OAuth + API helpers. Single-user app: one token row (id = 1)
// holding the refresh token from Berto's one-time consent, plus a cached access
// token. Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars.

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  }
  return { clientId, clientSecret };
}

export async function ensureGoogleAuthTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS google_auth (
      id INTEGER PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      email TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // What the stored grant actually covers. A token minted before the googlehealth
  // scopes existed still works for Calendar, so "is Google connected" is not the same
  // question as "can we read the watch" — without this the scorecard would show a
  // Sync button that 403s on every press.
  await sql`ALTER TABLE google_auth ADD COLUMN IF NOT EXISTS scope TEXT`;
}

/** The Health API scopes, so callers can ask whether the grant covers the watch. */

export function googleAuthUrl(redirectUri: string, state: string) {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent guarantees a refresh_token comes back even on re-auth
    access_type: "offline",
    prompt: "consent",
    // Deliberately NOT include_granted_scopes. The Google Health API rejects any
    // token that also carries calendar scopes — 403 DISALLOWED_OAUTH_SCOPES,
    // "disallowed_scopes: cl_events,cl_readonly" — so the watch grant in
    // lib/google-health.ts has to stay a separate, health-only token. Folding grants
    // together here would contaminate it.
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeAndStore(code: string, redirectUri: string) {
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
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const tokens: { access_token: string; refresh_token?: string; expires_in: number; scope?: string } =
    await res.json();
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");

  // Grab the account email so the UI can show which Google account is connected.
  let email: string | null = null;
  try {
    const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (info.ok) email = (await info.json()).email ?? null;
  } catch {
    // email is cosmetic — never fail the connect flow over it
  }

  await ensureGoogleAuthTable();
  const sql = getDb();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await sql`
    INSERT INTO google_auth (id, refresh_token, access_token, access_token_expires_at, email, scope, updated_at)
    VALUES (1, ${tokens.refresh_token}, ${tokens.access_token}, ${expiresAt}, ${email}, ${tokens.scope ?? null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      refresh_token = EXCLUDED.refresh_token,
      access_token = EXCLUDED.access_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      email = EXCLUDED.email,
      scope = EXCLUDED.scope,
      updated_at = NOW()
  `;
  return email;
}

export async function getGoogleConnection(): Promise<{ email: string | null } | null> {
  const sql = getDb();
  try {
    const rows = await sql`SELECT email FROM google_auth WHERE id = 1`;
    if (rows.length) return { email: rows[0].email };
  } catch {
    // table doesn't exist yet — fall through to the env seed
  }
  // Pre-existing refresh token from .env.local — treated as connected; it's
  // validated (and dropped in favor of a reconnect) on first API use.
  return process.env.GOOGLE_REFRESH_TOKEN ? { email: null } : null;
}

export async function disconnectGoogle() {
  const sql = getDb();
  try {
    const rows = await sql`SELECT refresh_token FROM google_auth WHERE id = 1`;
    if (rows.length) {
      // Best-effort revoke so the grant doesn't linger in the Google account
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rows[0].refresh_token)}`, {
        method: "POST",
      }).catch(() => {});
    }
    await sql`DELETE FROM google_auth WHERE id = 1`;
  } catch {
    // table missing → already disconnected
  }
}

/** Returns a valid access token, refreshing via the stored refresh token when expired. */
export async function getAccessToken(): Promise<string | null> {
  const sql = getDb();
  let rows: Record<string, string | null>[] = [];
  try {
    rows = await sql`SELECT refresh_token, access_token, access_token_expires_at FROM google_auth WHERE id = 1`;
  } catch {
    // table doesn't exist yet
  }
  // No stored connection: seed from GOOGLE_REFRESH_TOKEN in the env if present.
  const row = rows[0] ?? (process.env.GOOGLE_REFRESH_TOKEN ? { refresh_token: process.env.GOOGLE_REFRESH_TOKEN, access_token: null, access_token_expires_at: null } : null);
  if (!row?.refresh_token) return null;
  const seededFromEnv = !rows.length;

  // 60s of slack so a token can't expire mid-request
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (row.access_token && expiresAt - 60_000 > Date.now()) return row.access_token;

  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // invalid_grant = the refresh token was revoked/expired — force a reconnect
    if (res.status === 400 || res.status === 401) {
      if (!seededFromEnv) await sql`DELETE FROM google_auth WHERE id = 1`;
      return null;
    }
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const tokens: { access_token: string; expires_in: number } = await res.json();
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await ensureGoogleAuthTable();
  await sql`
    INSERT INTO google_auth (id, refresh_token, access_token, access_token_expires_at, updated_at)
    VALUES (1, ${row.refresh_token}, ${tokens.access_token}, ${newExpiry}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      updated_at = NOW()
  `;
  return tokens.access_token;
}

/** Authenticated fetch against the Google Calendar v3 API. Throws if not connected. */
export async function gcalFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  if (!token) throw new GoogleNotConnectedError();
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return res;
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google Calendar is not connected");
  }
}
