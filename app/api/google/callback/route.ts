import { type NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStore } from "@/lib/google";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;

  const backHome = (params: string) => {
    const response = NextResponse.redirect(`${origin}/?${params}`);
    response.cookies.delete("google_oauth_state");
    return response;
  };

  if (!code || !state || !expectedState || state !== expectedState) {
    return backHome("google=error&reason=state");
  }

  try {
    await exchangeCodeAndStore(code, `${origin}/api/google/callback`);
    return backHome("google=connected");
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return backHome("google=error&reason=exchange");
  }
}
