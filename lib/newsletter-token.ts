import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links.
 *
 * The link has to work from an email client with no session and no cookies, so
 * the address travels in the URL. Signing it stops anyone from unsubscribing a
 * third party by editing the query string.
 *
 * The key is derived from RESEND_API_KEY rather than a dedicated secret: it's
 * server-only, already required for the newsletter to work at all, and avoids a
 * second variable to provision. Trade-off worth knowing — rotating the Resend key
 * invalidates every unsubscribe link already sitting in someone's inbox. If that
 * ever matters, set NEWSLETTER_SECRET and this uses it instead.
 */
function signingKey(): string {
  const secret = process.env.NEWSLETTER_SECRET || process.env.RESEND_API_KEY;
  if (!secret) throw new Error("No NEWSLETTER_SECRET or RESEND_API_KEY to sign unsubscribe links with");
  return secret;
}

export function signEmail(email: string): string {
  return createHmac("sha256", signingKey()).update(email.trim().toLowerCase()).digest("hex");
}

/** Constant-time compare, so the token can't be recovered by timing the response. */
export function verifyEmailToken(email: string, token: string): boolean {
  try {
    const expected = Buffer.from(signEmail(email));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/** The absolute URL that unsubscribes this address in one click. */
export function unsubscribeUrl(email: string, origin: string): string {
  const address = email.trim().toLowerCase();
  return `${origin}/api/site/unsubscribe?e=${encodeURIComponent(address)}&t=${signEmail(address)}`;
}
