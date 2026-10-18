import { NextResponse } from "next/server";
import { listKitSubscribers, type KitSubscriber } from "@/lib/kit";

/**
 * The newsletter list, for the owner's eyes.
 *
 * Lives under `/api/newsletter/` — deliberately **not** `/api/site/` — so it
 * inherits the private gate in middleware and 404s on bertomill.com. The public
 * signup form must never be able to read back who else is on the list.
 *
 * Read-only by design: this route can list subscribers and nothing else. There is
 * no path from the app to sending, removing, or editing anyone; that happens in Kit.
 */

export type PublicSubscriber = KitSubscriber;

export async function GET() {
  if (!process.env.KIT_API_KEY) {
    return NextResponse.json({ error: "Newsletter isn't configured." }, { status: 503 });
  }

  const subscribers = await listKitSubscribers();
  if (!subscribers) return NextResponse.json({ error: "Couldn't reach Kit." }, { status: 502 });

  const active = subscribers.filter((s) => !s.unsubscribed).length;
  return NextResponse.json({
    subscribers,
    total: subscribers.length,
    active,
    unsubscribed: subscribers.length - active,
  });
}
