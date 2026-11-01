import { ensureSchema, getDb } from "./db";
import { normalizeHandle, PERSONAL_X_HANDLE } from "./x-shared";

/**
 * X accounts Cael can post as besides Berto's own (@robrt_mill, from env), e.g.
 * @makersloungeto. Each one approved the same X developer app through the PIN
 * flow on /writing?tab=tweets (lib/x-api.ts `startXConnect`/`finishXConnect`),
 * so they share its pay-per-use credit.
 */
export interface XAccount {
  handle: string;
  connectedAt: string | null;
}

/** Every account Cael can post as, Berto's own first. */
export async function listXAccounts(): Promise<XAccount[]> {
  await ensureSchema();
  const rows = await getDb()`SELECT handle, connected_at FROM x_accounts ORDER BY connected_at`;
  return [
    { handle: PERSONAL_X_HANDLE, connectedAt: null },
    ...rows
      .filter((r) => r.handle !== PERSONAL_X_HANDLE)
      .map((r) => ({
        handle: String(r.handle),
        connectedAt: r.connected_at instanceof Date ? r.connected_at.toISOString() : String(r.connected_at),
      })),
  ];
}

export async function getXAccountTokens(
  handle: string,
): Promise<{ accessToken: string; accessTokenSecret: string } | null> {
  await ensureSchema();
  const rows = await getDb()`
    SELECT access_token, access_token_secret FROM x_accounts WHERE handle = ${normalizeHandle(handle)}
  `;
  return rows[0] ? { accessToken: String(rows[0].access_token), accessTokenSecret: String(rows[0].access_token_secret) } : null;
}

/** Save (or refresh, on reconnecting) an account's tokens. */
export async function saveXAccount(a: {
  handle: string;
  userId: string;
  accessToken: string;
  accessTokenSecret: string;
}): Promise<void> {
  await ensureSchema();
  await getDb()`
    INSERT INTO x_accounts (handle, x_user_id, access_token, access_token_secret)
    VALUES (${normalizeHandle(a.handle)}, ${a.userId}, ${a.accessToken}, ${a.accessTokenSecret})
    ON CONFLICT (handle) DO UPDATE SET
      x_user_id = EXCLUDED.x_user_id,
      access_token = EXCLUDED.access_token,
      access_token_secret = EXCLUDED.access_token_secret,
      connected_at = NOW()
  `;
}
