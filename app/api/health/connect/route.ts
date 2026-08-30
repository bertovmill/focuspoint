import { type NextRequest, NextResponse } from "next/server";
import { healthAuthUrl } from "@/lib/google-health";

/**
 * One-time consent for the watch data.
 *
 * Separate from /api/google/connect on purpose: the Health API rejects any token
 * that also carries calendar scopes (403 DISALLOWED_OAUTH_SCOPES), so this grant has
 * to be health-only and stored on its own.
 */
export async function GET(request: NextRequest) {
  const redirectUri = `${request.nextUrl.origin}/api/health/callback`;
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(healthAuthUrl(redirectUri, state));
  response.cookies.set("health_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
