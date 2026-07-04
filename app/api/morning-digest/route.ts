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
export async function POST() {
  const phoneNumber = process.env.MY_PHONE_NUMBER;
  if (!phoneNumber) {
    return NextResponse.json(
      { message: "MY_PHONE_NUMBER is not set — configure it to receive the digest." },
      { status: 200 },
    );
  }
  return NextResponse.json({
    message: `Morning digest is an SMS schedule. It runs automatically at 8 AM ET and texts ${phoneNumber}. To trigger it manually in dev, use: POST /eve/v1/dev/schedules/morning-digest`,
  });
}
