import { type NextRequest, NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/google";

// Kicks off the one-time Google consent flow. A random state value is stored in
// a short-lived cookie and verified in the callback (CSRF protection).
export async function GET(request: NextRequest) {
  const redirectUri = `${request.nextUrl.origin}/api/google/callback`;
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(googleAuthUrl(redirectUri, state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
