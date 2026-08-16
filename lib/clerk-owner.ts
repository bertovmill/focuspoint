import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { isOwnerEmail } from "@/lib/owner";

/**
 * Turning a Clerk session into "is this the owner?".
 *
 * The gate is by **email**, not by user id, so it survives Clerk being torn down
 * and rebuilt — but a session token doesn't reliably carry an email. Clerk's
 * default claims have varied across versions, and a custom session-token template
 * can drop it entirely, so this reads the claim when it's there and falls back to
 * a Clerk API lookup when it isn't.
 *
 * That lookup is a network round trip, and the gate runs on nearly every request,
 * so verdicts are cached per user id in module scope. The cache lives as long as
 * the serverless instance does, which is the point: a warm instance answers with
 * no network at all.
 */

export interface Viewer {
  userId: string | null;
  email: string | null;
  isOwner: boolean;
}

const ANONYMOUS: Viewer = { userId: null, email: null, isOwner: false };

// Short enough that revoking access takes effect in minutes, long enough that a
// burst of requests costs one lookup.
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { email: string | null; isOwner: boolean; at: number }>();

/** Session-token claim shapes seen across Clerk versions and custom templates. */
function emailFromClaims(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const c = claims as Record<string, unknown> & { user?: Record<string, unknown> };
  const candidates = [c.email, c.email_address, c.primary_email_address, c.primaryEmail, c.user?.email];
  for (const value of candidates) {
    if (typeof value === "string" && value.includes("@")) return value;
  }
  return null;
}

/**
 * Resolve the signed-in Clerk user to a viewer, with the owner verdict attached.
 * `userId` null (signed out) short-circuits to anonymous without touching Clerk.
 */
export async function resolveViewer(userId: string | null | undefined, claims?: unknown): Promise<Viewer> {
  if (!userId) return ANONYMOUS;

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { userId, email: hit.email, isOwner: hit.isOwner };
  }

  let email = emailFromClaims(claims);
  if (!email) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      // Clerk unreachable: fail closed. The password login is the way in when
      // this happens, which is exactly why it was kept.
      return { userId, email: null, isOwner: false };
    }
  }

  const isOwner = isOwnerEmail(email);
  cache.set(userId, { email, isOwner, at: Date.now() });
  return { userId, email, isOwner };
}
