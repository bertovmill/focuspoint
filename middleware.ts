import { type NextRequest, NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";
import { resolveViewer } from "@/lib/clerk-owner";
import {
  CLERK_SERVER_ENABLED,
  NOT_AUTHORIZED_PATH,
  PASSWORD_SIGN_IN_PATH,
  SIGN_IN_PATH,
} from "@/lib/owner";
import {
  PUBLIC_HOST,
  SITE_PREFIX,
  isPublicHost,
  isPublicPassthrough,
  isPublicAsset,
  isPrivateOnlyPath,
} from "@/lib/public-site";

/**
 * What `clerkMiddleware` hands the handler. Typed loosely on purpose: the only
 * two things this gate needs are the user id and the raw claims, and the rest of
 * Clerk's auth object changes shape between majors.
 */
type AuthResolver = () => Promise<{ userId: string | null; sessionClaims?: unknown }>;

/** Paths on the private host that must answer before anyone is signed in. */
function isAlwaysAllowed(pathname: string): boolean {
  return (
    // The two ways in, and the page shown to people who can't come in.
    pathname.startsWith(SIGN_IN_PATH) ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith(PASSWORD_SIGN_IN_PATH) ||
    pathname.startsWith(NOT_AUTHORIZED_PATH) ||
    pathname.startsWith("/api/auth") ||
    // Clerk's own proxy path. The gate matches every route, so without this the
    // handshake that *establishes* a session gets redirected to the sign-in page
    // it is trying to complete — a loop with no way out.
    pathname.startsWith("/__clerk") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    // Files served straight from public/. next/image's optimizer refetches its
    // source over HTTP without a session cookie, so gating these would 307 it to
    // the sign-in page and it would report "the requested resource isn't a valid image".
    isPublicAsset(pathname) ||
    pathname === "/eve/v1/health" ||
    pathname.startsWith("/eve/v1/twilio/")
  );
}

const isApiPath = (pathname: string) => pathname.startsWith("/api") || pathname.startsWith("/eve");

async function handle(request: NextRequest, auth: AuthResolver | null): Promise<NextResponse> {
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

  // ── cael.bertomill.com: the private app. ──────────────────────────────────

  // The password form moved when Clerk became the front door.
  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = CLERK_SERVER_ENABLED ? SIGN_IN_PATH : PASSWORD_SIGN_IN_PATH;
    return NextResponse.redirect(url);
  }

  if (isAlwaysAllowed(pathname)) return NextResponse.next();

  // Allow Vercel cron invocations — they carry Authorization: Bearer <CRON_SECRET>
  // and never have a session cookie. The individual route handlers re-verify this header.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  // The MCP server, which Claude reaches with a bearer token instead of a session
  // cookie. Let the route through on a matching header and let it do the real
  // verification — this gate only decides whether the request is worth routing.
  const mcpToken = process.env.MCP_TOKEN;
  if (
    pathname.startsWith("/api/mcp") &&
    mcpToken &&
    request.headers.get("authorization") === `Bearer ${mcpToken}`
  ) {
    return NextResponse.next();
  }

  // 1. A Clerk session. Signing in is open to anyone, but only the owner gets in:
  //    everyone else holds an account and is shown the door, politely.
  if (auth) {
    const { userId } = await auth();
    if (userId) {
      const viewer = await resolveViewer(userId);
      if (viewer.isOwner) return NextResponse.next();
      if (isApiPath(pathname)) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      // Rewritten, not redirected, so the URL they tried is preserved.
      const url = request.nextUrl.clone();
      url.pathname = NOT_AUTHORIZED_PATH;
      return NextResponse.rewrite(url);
    }
  }

  // 2. The password cookie, kept as the way in when Clerk is down or unconfigured.
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // 3. Nobody. API / eve routes get a 401, not a redirect.
  if (isApiPath(pathname)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = CLERK_SERVER_ENABLED ? SIGN_IN_PATH : PASSWORD_SIGN_IN_PATH;
  return NextResponse.redirect(url);
}

/**
 * Clerk only wraps the request when it's actually configured.
 *
 * `clerkMiddleware()` throws without a publishable/secret key, which would take
 * the whole app down — including the password login that is supposed to be the
 * fallback. So until the keys land, this is the plain gate it always was.
 */
const middleware = CLERK_SERVER_ENABLED
  ? clerkMiddleware(async (auth, request) => handle(request as NextRequest, auth as AuthResolver))
  : (request: NextRequest) => handle(request, null);

export default middleware;

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
