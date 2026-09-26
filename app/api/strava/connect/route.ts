import { type NextRequest, NextResponse } from "next/server";
import { stravaAuthUrl, stravaConfigured } from "@/lib/strava";

// Kicks off the one-time Strava grant. Same shape as /api/health/connect.
export async function GET(request: NextRequest) {
  if (!stravaConfigured()) {
    return NextResponse.json({ error: "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not set" }, { status: 503 });
  }
  const redirectUri = `${request.nextUrl.origin}/api/strava/callback`;
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(stravaAuthUrl(redirectUri, state));
  response.cookies.set("strava_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}
