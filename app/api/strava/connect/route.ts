import { type NextRequest, NextResponse } from "next/server";
import { stravaAuthUrl, stravaConfigured } from "@/lib/strava";

const CANONICAL_HOST = "cael.bertomill.com";

// Kicks off the one-time Strava grant. Same shape as /api/health/connect.
export async function GET(request: NextRequest) {
  if (!stravaConfigured()) {
    return NextResponse.json({ error: "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not set" }, { status: 503 });
  }
  // Strava allows exactly one callback domain (cael.bertomill.com). Started from the
  // *.vercel.app alias, hop to the real domain first so the state cookie and the
  // callback land on the same host. localhost is always allowed by Strava.
  if (request.nextUrl.hostname.endsWith(".vercel.app")) {
    return NextResponse.redirect(`https://${CANONICAL_HOST}/api/strava/connect`);
  }
  const redirectUri = `${request.nextUrl.origin}/api/strava/callback`;
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(stravaAuthUrl(redirectUri, state));
  response.cookies.set("strava_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}
