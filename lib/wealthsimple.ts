// Wealthsimple — the portfolio number on the daily scorecard.
//
// **There is no official Wealthsimple API.** Verified 2026-08-30: they publish no
// developer API, Wealthica's investment API is sales-gated, and SnapTrade doesn't
// publish pricing. What exists is the GraphQL API their own web app talks to, which
// well-maintained community libraries drive against your own account
// (github.com/gboudreau/ws-api-python is the reference this port follows).
//
// Two deliberate choices keep the blast radius small:
//
//  1. **Read-only scope.** `invest.read trade.read tax.read` — no `*.write`. The token
//     this stores cannot place a trade or move money, which is the whole reason the
//     unofficial route was acceptable at all. Never widen this.
//  2. **The password is never stored.** `scripts/wealthsimple-login.mjs` is run once,
//     locally, and only the resulting OAuth session (access + refresh token) is
//     persisted. The app itself only ever refreshes and reads.
//
// Being unsanctioned, this can break whenever Wealthsimple changes their web app, and
// it's their call whether automated access is acceptable. It's read-only against the
// owner's own account, and the scorecard treats a missing portfolio number as simply
// absent — nothing else depends on it.

import { getDb } from "@/lib/db";

const OAUTH_BASE_URL = "https://api.production.wealthsimple.com/v1/oauth/v2";
const GRAPHQL_URL = "https://my.wealthsimple.com/graphql";
const LOGIN_PAGE = "https://my.wealthsimple.com/app/login";
const GRAPHQL_VERSION = "12";

/** Read-only. Never add a `.write` scope here — see the note above. */
export const SCOPE_READ_ONLY = "invest.read trade.read tax.read";

const SESSION_KEY = "wealthsimple_session";

export type WSSession = {
  client_id: string;
  access_token: string;
  refresh_token: string;
  /** Device id, from the login page's `wssdi` cookie. */
  wssdi: string;
  session_id: string;
};

/**
 * Current net liquidation value for a set of accounts. Passing `accountIds` is what
 * makes this "the portfolio" rather than "everything" — see `investmentAccountIds`.
 *
 * Letting Wealthsimple do the summing (rather than adding up per-account values here)
 * also means their FX applies: a USD holding comes back converted to CAD, which a
 * naive client-side sum would get wrong.
 */
const FETCH_IDENTITY_CURRENT_FINANCIALS = `query FetchIdentityCurrentFinancials($identityId: ID!, $currency: Currency!, $startDate: Date, $accountIds: [ID!], $accountScope: AccountScope = OWN) {
  identity(id: $identityId) {
    id
    financials(filter: {accounts: $accountIds}, accountScope: $accountScope) {
      current(currency: $currency) {
        id
        netLiquidationValueV2 { ...Money __typename }
        netDeposits: netDepositsV2 { ...Money __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment Money on Money {
  amount
  cents
  currency
  __typename
}`;

/**
 * Account types that are NOT investments: spending and borrowing. Berto's portfolio
 * row means invested money, so the Cash account's float and the credit card's
 * balance would both be lies in it — one inflating the number, one denting it.
 *
 * Everything else counts: registered and non-registered, managed and self-directed,
 * crypto included. New account types therefore default to "investment", which is the
 * safer direction to be wrong in — a missing account is invisible, whereas a
 * chequing balance quietly padding the number is not.
 */
const NON_INVESTMENT_ACCOUNT_TYPES = new Set(["CASH", "CREDIT_CARD", "PORTFOLIO_LINE_OF_CREDIT"]);

/**
 * Just the ids and types — deliberately a fraction of the `AccountWithFinancials`
 * fragment the web app sends, since the values come from the financials query below.
 */
const FETCH_ACCOUNT_TYPES = `query FetchAllAccountFinancials($identityId: ID!, $pageSize: Int = 25, $cursor: String) {
  identity(id: $identityId) {
    id
    accounts(filter: {}, first: $pageSize, after: $cursor) {
      pageInfo { hasNextPage endCursor __typename }
      edges { node { id status unifiedAccountType __typename } __typename }
      __typename
    }
    __typename
  }
}`;

// ------------------------------------------------------------------ session io

export async function readSession(): Promise<WSSession | null> {
  const sql = getDb();
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = ${SESSION_KEY}`;
    return rows.length ? (JSON.parse(String(rows[0].value)) as WSSession) : null;
  } catch {
    return null;
  }
}

export async function writeSession(session: WSSession): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${SESSION_KEY}, ${JSON.stringify(session)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function isWealthsimpleConnected(): Promise<boolean> {
  return (await readSession()) !== null;
}

export async function disconnectWealthsimple(): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM app_settings WHERE key = ${SESSION_KEY}`;
}

// ------------------------------------------------------------------- bootstrap

/**
 * The device id and client id, scraped from the login page and its JS bundle.
 *
 * Neither is a secret — the web app hands both to every visitor — but they aren't
 * published anywhere stable either, so they're read the same way the browser gets
 * them. This is the part most likely to break when Wealthsimple ships a redesign.
 */
export async function bootstrap(): Promise<{ wssdi: string; clientId: string }> {
  const res = await fetch(LOGIN_PAGE, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wealthsimple login page failed: ${res.status}`);

  const setCookie = res.headers.getSetCookie?.() ?? [];
  let wssdi: string | undefined;
  for (const cookie of setCookie) {
    const m = /wssdi=([a-f0-9-]+)/i.exec(cookie);
    if (m) {
      wssdi = m[1];
      break;
    }
  }
  const html = await res.text();
  if (!wssdi) throw new Error("Couldn't find the wssdi device id on the login page.");

  const jsMatch = /<script[^>]*src="([^"]+\/app-[a-f0-9]+\.js)"/i.exec(html);
  if (!jsMatch) throw new Error("Couldn't find the app JS bundle on the login page.");

  const jsRes = await fetch(jsMatch[1], { headers: { "User-Agent": USER_AGENT } });
  if (!jsRes.ok) throw new Error(`Wealthsimple app bundle failed: ${jsRes.status}`);
  const idMatch = /"production"[^}]*clientId:"([a-f0-9]+)"/i.exec(await jsRes.text());
  if (!idMatch) throw new Error("Couldn't find the production clientId in the app JS.");

  return { wssdi, clientId: idMatch[1] };
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function oauthHeaders(session: Pick<WSSession, "wssdi" | "session_id">, profile: string) {
  return {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "x-wealthsimple-client": "@wealthsimple/wealthsimple",
    "x-ws-profile": profile,
    "x-ws-device-id": session.wssdi,
    "x-ws-session-id": session.session_id,
  };
}

// ----------------------------------------------------------------------- login

export class OTPRequiredError extends Error {}

/**
 * Exchange username/password (+ 2FA) for a read-only session.
 *
 * Only ever called from the one-time local login script — the deployed app has no
 * route that takes a password.
 */
export async function login(
  username: string,
  password: string,
  otp?: string,
): Promise<WSSession> {
  const { wssdi, clientId } = await bootstrap();
  const session_id = crypto.randomUUID();

  const headers: Record<string, string> = {
    ...oauthHeaders({ wssdi, session_id }, "undefined"),
  };
  if (otp) headers["x-wealthsimple-otp"] = `${otp};remember=true`;

  const res = await fetch(`${OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      grant_type: "password",
      username,
      password,
      skip_provision: "true",
      scope: SCOPE_READ_ONLY,
      client_id: clientId,
      otp_claim: null,
    }),
  });
  const json = (await res.json()) as Record<string, unknown>;

  // A missing/incorrect 2FA code comes back as a plain invalid_grant, which is also
  // what a wrong password looks like — so only treat it as "need the code" when we
  // didn't send one.
  if (json.error === "invalid_grant" && !otp) throw new OTPRequiredError("2FA code required");
  if (json.error) throw new Error(`Wealthsimple login failed: ${JSON.stringify(json)}`);

  return {
    client_id: clientId,
    wssdi,
    session_id,
    access_token: String(json.access_token),
    refresh_token: String(json.refresh_token),
  };
}

/** Swap the refresh token for a fresh access token, persisting the rotation. */
async function refresh(session: WSSession): Promise<WSSession> {
  const res = await fetch(`${OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: oauthHeaders(session, "invest"),
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: session.refresh_token,
      client_id: session.client_id,
    }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.access_token || !json.refresh_token) {
    throw new Error(`Wealthsimple session expired; log in again locally: ${JSON.stringify(json)}`);
  }
  const next: WSSession = {
    ...session,
    access_token: String(json.access_token),
    refresh_token: String(json.refresh_token),
  };
  await writeSession(next);
  return next;
}

// ------------------------------------------------------------------- api calls

async function tokenInfo(session: WSSession): Promise<Record<string, unknown>> {
  const res = await fetch(`${OAUTH_BASE_URL}/token/info`, {
    headers: { ...oauthHeaders(session, "invest"), Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Wealthsimple token info failed: ${res.status}`);
  return res.json();
}

async function graphql(
  session: WSSession,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      ...oauthHeaders(session, "trade"),
      Authorization: `Bearer ${session.access_token}`,
      "x-ws-api-version": GRAPHQL_VERSION,
      "x-ws-locale": "en-CA",
      "x-platform-os": "web",
    },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.data) throw new Error(`Wealthsimple ${operationName} failed: ${JSON.stringify(json).slice(0, 400)}`);
  return json.data as Record<string, unknown>;
}

export type PortfolioValue = { amount: number; currency: string };

/**
 * The ids of every open investment account — chequing and credit deliberately left out.
 *
 * Paged, because the accounts connection is a Relay connection and someone with a
 * TFSA, RRSP, FHSA, crypto and a couple of non-registered accounts is not far off
 * the default page size. The loop is bounded rather than `while (true)`: a paging
 * bug upstream shouldn't be able to spin a serverless function until it times out.
 */
async function investmentAccountIds(session: WSSession, identityId: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 10; page++) {
    const data = await graphql(session, "FetchAllAccountFinancials", FETCH_ACCOUNT_TYPES, {
      identityId,
      pageSize: 25,
      cursor,
    });

    const identity = data.identity as Record<string, unknown> | undefined;
    const accounts = identity?.accounts as Record<string, unknown> | undefined;
    const edges = (accounts?.edges ?? []) as { node?: Record<string, unknown> }[];

    for (const edge of edges) {
      const node = edge.node;
      if (!node || node.status !== "open") continue;
      if (NON_INVESTMENT_ACCOUNT_TYPES.has(String(node.unifiedAccountType))) continue;
      if (typeof node.id === "string") ids.push(node.id);
    }

    const pageInfo = accounts?.pageInfo as Record<string, unknown> | undefined;
    if (!pageInfo?.hasNextPage || typeof pageInfo.endCursor !== "string") break;
    cursor = pageInfo.endCursor;
  }

  return ids;
}

/**
 * Current portfolio value — net liquidation value across the investment accounts, in CAD.
 *
 * Always refreshes the access token first. Wealthsimple's access tokens are
 * short-lived and this runs once a day, so it would essentially always be expired;
 * refreshing unconditionally is simpler than tracking an expiry we aren't told.
 */
export async function fetchPortfolioValue(): Promise<PortfolioValue | null> {
  const stored = await readSession();
  if (!stored) return null;

  const session = await refresh(stored);
  const info = await tokenInfo(session);
  const identityId = info.identity_canonical_id;
  if (typeof identityId !== "string") throw new Error("No identity_canonical_id on the Wealthsimple token.");

  // No investment accounts at all is a real answer (nothing invested), not an error —
  // but it must not fall through to an unfiltered query, which would silently report
  // the Cash balance as the portfolio.
  const accountIds = await investmentAccountIds(session, identityId);
  if (!accountIds.length) return { amount: 0, currency: "CAD" };

  const data = await graphql(session, "FetchIdentityCurrentFinancials", FETCH_IDENTITY_CURRENT_FINANCIALS, {
    identityId,
    currency: "CAD",
    accountIds,
  });

  const identity = data.identity as Record<string, unknown> | undefined;
  const financials = identity?.financials as Record<string, unknown> | undefined;
  const current = financials?.current as Record<string, unknown> | undefined;
  const nlv = current?.netLiquidationValueV2 as Record<string, unknown> | undefined;
  if (!nlv) return null;

  const amount = Number(nlv.amount);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: String(nlv.currency ?? "CAD") };
}
