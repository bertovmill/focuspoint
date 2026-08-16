/**
 * Newsletter signup for bertomill.com.
 *
 * Writes the address into a Resend Audience (provisioned through the Vercel
 * Marketplace), which is the subscriber list broadcasts are sent from. Plain
 * `fetch` against Resend's REST API — no SDK needed for two endpoints.
 *
 * Like /api/site/chat this is reachable unauthenticated, so it validates and
 * throttles hard and never reports back anything about who is already on the list.
 */

const RESEND_API = "https://api.resend.com";

/** Must stay on the verified sending domain, or Resend refuses the send. */
const FROM_ADDRESS = process.env.NEWSLETTER_FROM || "Berto Mill <berto@bertomill.com>";

// Plain text on purpose: it reads like a note from a person, lands in the primary
// tab more often than a styled template, and there's nothing here HTML would add.
const WELCOME_TEXT = `Thanks for subscribing.

I'm Berto. I build AI agents — including Cael, the one that runs my own life — and
I write down what I learn as I go. When I publish something, you'll get it here.
No schedule I don't keep, and no spam.

Two things worth a look while you wait:

  The numbers I track, live: https://bertomill.com/building
  What I've written so far:   https://bertomill.com/writing

If you ever want out, just hit unsubscribe — no hard feelings.

— Berto
https://bertomill.com`;

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
  try {
    email = (await request.json())?.email;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  // Checked after validation, not before: whether the input is well-formed doesn't
  // depend on our configuration, and rejecting junk shouldn't wait on a missing key.
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    console.error("[site/subscribe] RESEND_API_KEY or RESEND_AUDIENCE_ID is not set");
    return Response.json({ error: "Signups aren't switched on yet — try again shortly." }, { status: 503 });
  }

  const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), unsubscribed: false }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // A duplicate is a success from the visitor's point of view — and saying
    // "you're already subscribed" would leak list membership to anyone guessing.
    // No second welcome email either; they've had one.
    if (res.status === 409 || /already exists/i.test(detail)) {
      return Response.json({ ok: true });
    }
    console.error("[site/subscribe] Resend rejected the contact:", res.status, detail);
    return Response.json({ error: "Couldn't sign you up just now. Try again in a moment." }, { status: 502 });
  }

  await sendWelcome(apiKey, email.trim().toLowerCase());
  return Response.json({ ok: true });
}

/**
 * Confirms the signup landed. A subscription that produces no acknowledgement
 * reads as broken, and this doubles as a live deliverability check.
 *
 * Failures are logged and swallowed: they are already on the list, so turning a
 * successful signup into an error because the courtesy email bounced would be
 * the wrong trade.
 */
async function sendWelcome(apiKey: string, to: string) {
  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: "You're in",
        text: WELCOME_TEXT,
      }),
    });
    if (!res.ok) {
      console.error("[site/subscribe] welcome email failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[site/subscribe] welcome email threw:", err);
  }
}
