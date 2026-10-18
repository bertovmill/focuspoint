/**
 * Who is allowed to actually *use* Cael.
 *
 * The app has two tiers of person:
 *
 *   - **the owner** — one email address, gets the whole private app.
 *   - **everyone else** — can sign up and hold an account, but Cael itself
 *     (tasks, notes, journal, calendar, the agent) is closed to them.
 *
 * This module is deliberately dependency-free so it can be imported from
 * middleware, server components, route handlers and the eve channel alike.
 */

import { PUBLIC_HOST } from "@/lib/public-site";

/** Where to send someone who has an account but no business being in Cael. */
export const PUBLIC_SITE_URL = `https://${PUBLIC_HOST}`;

/** The one address that gets the full app. Overridable so it isn't hardcoded in prod. */
export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "bertmill19@gmail.com").trim().toLowerCase();

/** Is this the owner's email? Case- and whitespace-insensitive; anything falsy is not. */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}

/** The part of a Clerk user this app's decision depends on. */
export interface ClerkUserish {
  primaryEmailAddressId?: string | null;
  emailAddresses: readonly { id: string; emailAddress: string; verification: { status: string } | null }[];
}

/** Only addresses Clerk has confirmed the person actually controls. */
export const verifiedAddresses = (user: ClerkUserish) =>
  user.emailAddresses.filter((e) => e.verification?.status === "verified");

/**
 * Is this the owner? — the one security decision in the app.
 *
 * It lives here, in the module with no dependencies, because both callers need
 * it and they run in different worlds: middleware and the pages go through
 * `@clerk/nextjs`, while the eve channel runs in a plain Node process that
 * cannot even import that package (its ESM build fails to resolve, and the
 * agent server exits on startup).
 *
 * Two rules, both load-bearing:
 *
 * 1. **Verified only.** A Clerk account can carry addresses that were added but
 *    never confirmed, so trusting `primaryEmailAddress ?? emailAddresses[0]`
 *    would let anyone who types the owner's address into their own profile walk
 *    into the full app and every tool the agent has.
 * 2. **Any verified address, not just the primary.** Verification *is* proof of
 *    control — nobody reaches it without the inbox — so requiring it also be
 *    primary buys no safety, and would lock the owner out for something as
 *    ordinary as having signed up with a different address first.
 */
export function isOwnerUser(user: ClerkUserish): boolean {
  return verifiedAddresses(user).some((e) => isOwnerEmail(e.emailAddress));
}

/**
 * Is Clerk configured?
 *
 * Everything Clerk-related is behind this flag so the app keeps working with the
 * password login alone until the keys are actually set — same idea as
 * `newsletterEnabled` in the public site layout. `NEXT_PUBLIC_*` is inlined at
 * build time, so adding the keys needs a rebuild (a redeploy), not just a restart.
 */
export const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Server-side Clerk needs the secret key too; without it, verification can't run. */
export const CLERK_SERVER_ENABLED = CLERK_ENABLED && Boolean(process.env.CLERK_SECRET_KEY);

/** Where a signed-out visitor is sent on the private host. */
export const SIGN_IN_PATH = "/sign-in";
/** The password login, kept as a fallback for when Clerk can't be reached. */
export const PASSWORD_SIGN_IN_PATH = "/login-password";
/** Shown to a signed-in person who isn't the owner. */
export const NOT_AUTHORIZED_PATH = "/not-authorized";
