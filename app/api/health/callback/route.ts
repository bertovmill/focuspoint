import { type NextRequest, NextResponse } from "next/server";
import { exchangeHealthCode } from "@/lib/google-health";
import { syncHealthRange } from "@/lib/health-sync";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = request.cookies.get("health_oauth_state")?.value;

  const backHome = (params: string) => {
    const response = NextResponse.redirect(`${origin}/?${params}`);
    response.cookies.delete("health_oauth_state");
    return response;
  };

  if (!code || !state || !expected || state !== expected) return backHome("watch=error&reason=state");

  try {
    await exchangeHealthCode(code, `${origin}/api/health/callback`);
    // Backfill straight away — an empty card right after connecting reads as failure.
    await syncHealthRange(14);
    return backHome("watch=connected");
  } catch (err) {
    console.error("Health OAuth callback failed:", err);
    return backHome("watch=error&reason=exchange");
  }
}
