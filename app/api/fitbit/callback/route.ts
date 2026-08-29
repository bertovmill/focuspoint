import { type NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStore } from "@/lib/fitbit";
import { syncFitbitRange } from "@/lib/fitbit-sync";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("fitbit_oauth_state")?.value;

  const backHome = (params: string) => {
    const response = NextResponse.redirect(`${origin}/?${params}`);
    response.cookies.delete("fitbit_oauth_state");
    return response;
  };

  if (!code || !state || !expectedState || state !== expectedState) {
    return backHome("fitbit=error&reason=state");
  }

  try {
    await exchangeCodeAndStore(code, `${origin}/api/fitbit/callback`);
    // Backfill immediately so the card has history the moment he lands back on it —
    // an empty scorecard right after connecting reads as "it didn't work".
    await syncFitbitRange(14);
    return backHome("fitbit=connected");
  } catch (err) {
    console.error("Fitbit OAuth callback failed:", err);
    return backHome("fitbit=error&reason=exchange");
  }
}
