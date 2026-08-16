import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";
import {
  PUBLIC_HOST,
  SITE_PREFIX,
  isPublicHost,
  isPublicPassthrough,
  isPrivateOnlyPath,
} from "@/lib/public-site";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── bertomill.com: the public site. No session, no Cael. ──────────────────
  // Served from the `app/site` tree via rewrite, so visitors see clean URLs.
  if (isPublicHost(request.headers.get("host"))) {
    // Consolidate www onto the apex so there's one canonical origin.
    const host = (request.headers.get("host") ?? "").toLowerCase();
    if (host.startsWith(`www.${PUBLIC_HOST}`)) {
      const url = request.nextUrl.clone();
      url.host = PUBLIC_HOST;
      return NextResponse.redirect(url, 308);
    }
    if (isPublicPassthrough(pathname)) return NextResponse.next();
    // Cael's API, agent transport and traces are not reachable from the public host.
    if (isPrivateOnlyPath(pathname) || pathname.startsWith(SITE_PREFIX) || pathname.startsWith("/login")) {
      return new NextResponse("Not found", { status: 404 });
    }
    const url = request.nextUrl.clone();
    url.pathname = `${SITE_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // ── cael.bertomill.com: the private app. Everything below is unchanged. ───

  // Always allow: login page, auth API, static assets, eve health check, Twilio webhook
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

  // Allow Vercel cron invocations — they carry Authorization: Bearer <CRON_SECRET>
  // and never have a session cookie. The individual route handlers re-verify this header.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
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
