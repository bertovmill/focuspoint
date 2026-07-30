import { NextResponse } from "next/server";
import { disconnectGoogle, getGoogleConnection } from "@/lib/google";

export async function GET() {
  const connection = await getGoogleConnection();
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return NextResponse.json({
    configured,
    connected: Boolean(connection),
    email: connection?.email ?? null,
  });
}

export async function DELETE() {
  await disconnectGoogle();
  return NextResponse.json({ ok: true });
}
