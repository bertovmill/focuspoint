#!/usr/bin/env node
//
// One-time Wealthsimple login. Run it locally:
//
//     node --env-file=.env.local scripts/wealthsimple-login.mjs
//
// It asks for your Wealthsimple email, password and 2FA code, exchanges them for a
// **read-only** OAuth session (`invest.read trade.read tax.read` — the token it stores
// cannot trade or move money), and saves only that session to `app_settings`.
//
// Your password and 2FA code are used for this one request and never written anywhere:
// not to disk, not to the database, not to Vercel. The deployed app has no route that
// accepts a password — it only ever refreshes the stored session and reads a balance.
//
// Re-run this if the session is ever invalidated (password change, revoked sessions).
//
// This talks to the GraphQL API behind Wealthsimple's own web app, since they publish
// no developer API. See lib/wealthsimple.ts for the reasoning and the caveats.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { neon } from "@neondatabase/serverless";

const OAUTH_BASE_URL = "https://api.production.wealthsimple.com/v1/oauth/v2";
const LOGIN_PAGE = "https://my.wealthsimple.com/app/login";
const SCOPE_READ_ONLY = "invest.read trade.read tax.read";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function bootstrap() {
  const res = await fetch(LOGIN_PAGE, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`login page ${res.status}`);
  let wssdi;
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const m = /wssdi=([a-f0-9-]+)/i.exec(cookie);
    if (m) { wssdi = m[1]; break; }
  }
  const html = await res.text();
  if (!wssdi) throw new Error("no wssdi cookie on the login page");
  const js = /<script[^>]*src="([^"]+\/app-[a-f0-9]+\.js)"/i.exec(html);
  if (!js) throw new Error("no app JS bundle found");
  const jsRes = await fetch(js[1], { headers: { "User-Agent": USER_AGENT } });
  const id = /"production"[^}]*clientId:"([a-f0-9]+)"/i.exec(await jsRes.text());
  if (!id) throw new Error("no production clientId in app JS");
  return { wssdi, clientId: id[1] };
}

async function requestToken({ wssdi, clientId, sessionId, username, password, otp }) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "x-wealthsimple-client": "@wealthsimple/wealthsimple",
    "x-ws-profile": "undefined",
    "x-ws-device-id": wssdi,
    "x-ws-session-id": sessionId,
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
  return res.json();
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set — run with --env-file=.env.local");

  console.log("Read-only Wealthsimple login. Your password is used once and never stored.\n");
  const username = (await rl.question("Wealthsimple email: ")).trim();
  const password = await rl.question("Password (typing is visible): ");

  const { wssdi, clientId } = await bootstrap();
  const sessionId = crypto.randomUUID();

  let json = await requestToken({ wssdi, clientId, sessionId, username, password });

  if (json.error === "invalid_grant") {
    // Same error shape as a wrong password, but on a first attempt with no code it is
    // almost always the 2FA challenge.
    const otp = (await rl.question("2FA code: ")).trim();
    json = await requestToken({ wssdi, clientId, sessionId, username, password, otp });
  }

  if (json.error || !json.access_token) {
    throw new Error(`login failed: ${JSON.stringify(json)}`);
  }

  const session = {
    client_id: clientId,
    wssdi,
    session_id: sessionId,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
  };

  const sql = neon(process.env.DATABASE_URL);
  await sql`
    INSERT INTO app_settings (key, value) VALUES ('wealthsimple_session', ${JSON.stringify(session)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  console.log(`\nConnected. Scope: ${json.scope ?? SCOPE_READ_ONLY}`);
  console.log("Session saved. Your password was not stored.");
} catch (err) {
  console.error("\n" + String(err));
  process.exitCode = 1;
} finally {
  rl.close();
}
