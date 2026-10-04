import { type NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode } from "@/lib/strava";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = request.cookies.get("strava_oauth_state")?.value;

  const back = (params: string) => {
    const response = NextResponse.redirect(`${origin}/training?${params}`);
    response.cookies.delete("strava_oauth_state");
    return response;
  };

  if (searchParams.get("error")) return back("strava=error&reason=denied");
  if (!code || !state || !expected || state !== expected) return back("strava=error&reason=state");
  try {
    await exchangeStravaCode(code);
    // Not synced: Strava's API is subscriber-only, so /training reads Fitbit workouts.
    return back("strava=connected");
  } catch (err) {
    console.error("Strava OAuth callback failed:", err);
    return back("strava=error&reason=exchange");
  }
}
