import { type NextRequest, NextResponse } from "next/server";
import { fitbitAuthUrl, fitbitConfigured } from "@/lib/fitbit";

// One-time Fitbit consent. State goes in a short-lived cookie and is checked in
// the callback (CSRF), same as the Google flow.
export async function GET(request: NextRequest) {
  if (!fitbitConfigured()) {
    return NextResponse.redirect(`${request.nextUrl.origin}/?fitbit=error&reason=unconfigured`);
  }
  const redirectUri = `${request.nextUrl.origin}/api/fitbit/callback`;
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(fitbitAuthUrl(redirectUri, state));
  response.cookies.set("fitbit_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
