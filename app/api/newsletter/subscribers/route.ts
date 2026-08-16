import { NextResponse } from "next/server";

/**
 * The newsletter list, for the owner's eyes.
 *
 * Lives under `/api/newsletter/` — deliberately **not** `/api/site/` — so it
 * inherits the private gate in middleware and 404s on bertomill.com. The public
 * signup form must never be able to read back who else is on the list.
 *
 * Read-only by design: this route can list subscribers and nothing else. There is
 * no path from the app to sending, removing, or editing anyone.
 */

const RESEND_API = "https://api.resend.com";

export interface PublicSubscriber {
  id: string;
  email: string;
  createdAt: string;
  unsubscribed: boolean;
}

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    return NextResponse.json({ error: "Newsletter isn't configured." }, { status: 503 });
  }

  const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    // Always live — a subscriber count that lags is worse than a slow page.
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("[newsletter/subscribers] Resend rejected the read:", res.status);
    return NextResponse.json({ error: "Couldn't reach Resend." }, { status: 502 });
  }

  const body = await res.json();
  const subscribers: PublicSubscriber[] = (body.data ?? [])
    .map((c: { id: string; email: string; created_at: string; unsubscribed?: boolean }) => ({
      id: c.id,
      email: c.email,
      createdAt: c.created_at,
      unsubscribed: Boolean(c.unsubscribed),
    }))
    .sort((a: PublicSubscriber, b: PublicSubscriber) => b.createdAt.localeCompare(a.createdAt));

  const active = subscribers.filter((s) => !s.unsubscribed).length;

  return NextResponse.json({
    subscribers,
    total: subscribers.length,
    active,
    unsubscribed: subscribers.length - active,
  });
}
