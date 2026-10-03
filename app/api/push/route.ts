import { NextResponse } from "next/server";
import { removeSubscription, saveSubscription } from "@/lib/push";

/**
 * The bell in the chat header subscribes this device to "answer ready"
 * notifications (POST) or turns them off (DELETE). Behind the private-host
 * middleware like every other /api route. See lib/push.ts.
 */
export async function POST(req: Request) {
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  await saveSubscription({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (typeof endpoint !== "string") return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
