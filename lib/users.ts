import "server-only";

import { getDb } from "@/lib/db";
import type { Viewer } from "@/lib/clerk-owner";

/**
 * The account ledger.
 *
 * Clerk owns identity — this table just records that a person exists, so a
 * subscriber area has something to be built on later and so signups are visible
 * without opening the Clerk dashboard. It is *not* the authorisation source:
 * whether someone gets into Cael is decided by their email in `lib/owner.ts`,
 * never by a column here (a row is easy to write, an email is the actual claim).
 *
 * Rows are written lazily on a signed-in request rather than through a Clerk
 * webhook — no endpoint to keep alive, no signing secret to rotate, and the only
 * cost is that someone who signs up and never comes back is never recorded.
 */

// One write per user per instance per interval; renders are far more frequent
// than anything this table needs to know.
const WRITE_TTL_MS = 10 * 60 * 1000;
const lastWrite = new Map<string, number>();

export async function ensureUserRow(viewer: Viewer): Promise<void> {
  if (!viewer.userId) return;

  const seen = lastWrite.get(viewer.userId);
  if (seen && Date.now() - seen < WRITE_TTL_MS) return;
  lastWrite.set(viewer.userId, Date.now());

  const sql = getDb();
  await sql`
    INSERT INTO users (clerk_user_id, email, is_owner, created_at, last_seen_at)
    VALUES (${viewer.userId}, ${viewer.email}, ${viewer.isOwner}, NOW(), NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, users.email),
          is_owner = EXCLUDED.is_owner,
          last_seen_at = NOW()
  `;
}
