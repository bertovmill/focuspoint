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
