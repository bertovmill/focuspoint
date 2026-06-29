import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow: login page, auth API, static assets, eve health check
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/eve/v1/health" ||
    pathname.startsWith("/eve/v1/twilio/")
  ) {
    return NextResponse.next();
  }

  const valid = isValidSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!valid) {
    // API / eve routes get a 401, not a redirect
    if (pathname.startsWith("/api") || pathname.startsWith("/eve")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
