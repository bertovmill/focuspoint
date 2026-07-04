import { NextRequest, NextResponse } from "next/server";

// GET — Vercel cron (requires CRON_SECRET)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The actual schedule runs via eve (agent/schedules/morning-digest.ts) and sends via Twilio.
  // This route exists for the cron webhook signature check; eve handles the real run.
  return NextResponse.json({ ok: true, message: "Morning digest schedule is managed by eve — see agent/schedules/morning-digest.ts." });
}

// POST — manual trigger from the UI
export async function POST(req: NextRequest) {
  const phoneNumber = process.env.MY_PHONE_NUMBER;
  if (!phoneNumber) {
    return NextResponse.json(
      { message: "MY_PHONE_NUMBER is not set — configure it to receive the digest." },
      { status: 200 },
    );
  }

  // In dev, proxy to eve's one-shot dispatch route
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const dispatchUrl = `${protocol}://${host}/eve/v1/dev/schedules/morning-digest`;

  try {
    const res = await fetch(dispatchUrl, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ ok: true, message: `Digest triggered — SMS on its way to ${phoneNumber}.`, ...data });
    }
  } catch {
    // dispatch route not available (production) — fall through
  }

  return NextResponse.json({
    message: `Morning digest runs automatically at 8 AM ET and texts ${phoneNumber}.`,
  });
}
