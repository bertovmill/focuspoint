import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { type ClerkUserish, isOwnerUser, verifiedAddresses } from "@/lib/owner";

/**
 * Turning a Clerk session into "is this the owner?".
 *
 * The gate is by **email**, not by user id, so it survives Clerk being torn down
 * and rebuilt. The rule itself lives in `lib/owner.ts`; this module is just the
 * Next-side plumbing that fetches the user and remembers the answer.
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

/** The address to show and record. Display only — never the access decision. */
function displayEmail(user: ClerkUserish): string | null {
  const verified = verifiedAddresses(user);
  const primary = verified.find((e) => e.id === user.primaryEmailAddressId);
  return (primary ?? verified[0])?.emailAddress ?? null;
}

/**
 * Resolve the signed-in Clerk user to a viewer, with the owner verdict attached.
 * `userId` null (signed out) short-circuits to anonymous without touching Clerk.
 */
export async function resolveViewer(userId: string | null | undefined): Promise<Viewer> {
  if (!userId) return ANONYMOUS;

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { userId, email: hit.email, isOwner: hit.isOwner };
  }

  // Deliberately *not* read from the session token. A claim carries an address
  // but no proof it was ever verified, and this decision hands over every tool
  // the agent has — so it's always resolved against Clerk, and the cache above
  // is what keeps that off the hot path.
  let email: string | null;
  let isOwner: boolean;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    email = displayEmail(user);
    isOwner = isOwnerUser(user);
  } catch {
    // Clerk unreachable: fail closed. The password login is the way in when
    // this happens, which is exactly why it was kept.
    return { userId, email: null, isOwner: false };
  }

  cache.set(userId, { email, isOwner, at: Date.now() });
  return { userId, email, isOwner };
}
