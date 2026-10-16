/**
 * Newsletter signup for bertomill.com.
 *
 * Adds the address to the Kit signup form (lib/kit.ts). Kit takes it from there:
 * the double opt-in confirmation, the welcome email, unsubscribes and sending.
 *
 * Like /api/site/chat this is reachable unauthenticated, so it validates and
 * throttles hard and never reports back anything about who is already on the list.
 */

import { kitConfigured, kitSubscribe } from "@/lib/kit";

// Deliberately loose: the only reliable test of an address is sending to it.
// This rejects obvious junk without bouncing valid-but-unusual addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const RATE_LIMIT = { windowMs: 60_000, max: 5 };
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many attempts — give it a minute." }, { status: 429 });
  }

  let email: unknown;
  let source: unknown;
  let honeypot: unknown;
  try {
    ({ email, source, website: honeypot } = (await request.json()) ?? {});
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  // A field people can't see, so only bots fill it. Answer as if it worked.
  if (typeof honeypot === "string" && honeypot) return Response.json({ ok: true });

  // Checked after validation, not before: whether the input is well-formed doesn't
  // depend on our configuration, and rejecting junk shouldn't wait on a missing key.
  if (!kitConfigured()) {
    console.error("[site/subscribe] KIT_API_KEY or KIT_FORM_ID is not set");
    return Response.json({ error: "Signups aren't switched on yet — try again shortly." }, { status: 503 });
  }

  // `source` is which surface they signed up from (popup, footer, post…), kept
  // as the form referrer in Kit so it's visible which ones actually work.
  const referrer = typeof source === "string" ? `https://bertomill.com/#${source.slice(0, 40)}` : undefined;
  const result = await kitSubscribe(email.trim().toLowerCase(), referrer);
  if (!result.ok) {
    console.error("[site/subscribe] Kit rejected the signup:", result.status, result.detail);
    return Response.json({ error: "Couldn't sign you up just now. Try again in a moment." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
