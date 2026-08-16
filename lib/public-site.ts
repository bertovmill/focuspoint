/**
 * bertomill.com — the public, front-facing site.
 *
 * One Next.js app serves two audiences, split by hostname:
 *
 *   bertomill.com        → the public site. No auth. Rewritten to /site/*.
 *   cael.bertomill.com   → Cael, the private life-agent. Password-gated, unchanged.
 *
 * The public routes live under `app/site/` rather than a `(public)` route group so
 * both trees can own their own "/" without colliding. The rewrite keeps the public
 * URLs clean — a visitor sees bertomill.com/writing, never /site/writing.
 */

/** The apex domain the public site is served from. */
export const PUBLIC_HOST = "bertomill.com";

/** The private host. Accounts live here, so it owns the whole sign-in flow. */
export const CAEL_HOST = "cael.bertomill.com";

/**
 * Where "Sign in" on the public site points.
 *
 * Deliberately a cross-origin link rather than a form on bertomill.com: keeping
 * Clerk on one origin avoids satellite-domain configuration, and leaves the
 * public site free of auth JS entirely.
 */
export const CAEL_SIGN_IN_URL = `https://${CAEL_HOST}/sign-in`;

/** Google Appointment Schedule — the one place visitors book time with Berto. */
export const BOOKING_URL = "https://calendar.app.google/ZuKPqRgQpYNPwjhB6";

/** Path prefix the public tree actually lives at on disk. Never appears in a public URL. */
export const SITE_PREFIX = "/site";

/**
 * Is this request for the public site?
 *
 * Matches the apex and www in production, and any `site.*` host locally
 * (`site.localhost:3000`) so the public build can be driven in dev without DNS.
 */
export function isPublicHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.split(":")[0].toLowerCase();
  return name === PUBLIC_HOST || name === `www.${PUBLIC_HOST}` || name.startsWith("site.");
}

/**
 * Paths the public host may reach outside the rewritten `/site` tree.
 *
 * Deliberately tiny: framework assets and the one API the public site calls.
 * Everything else — /api/todos, /eve/*, /traces — is Cael's, and 404s here.
 */
const PUBLIC_PASSTHROUGH = ["/_next", "/api/site", "/favicon.ico", "/icon.svg", "/robots.txt", "/sitemap.xml"];

/**
 * Static files served straight out of `public/` — images and fonts only, at the
 * top level or inside one of the asset folders below. Without this a request for
 * /berto-headshot.jpg gets rewritten to /site/berto-headshot.jpg and 404s, which
 * also breaks next/image, since the optimizer fetches its source through this
 * same host and carries no session cookie.
 *
 * Keep the folder list explicit: anything matched here answers without a session,
 * so a new entry is a deliberate decision to make that directory world-readable.
 */
const PUBLIC_ASSET_DIRS = ["site-art"];

const PUBLIC_ASSET_RE = new RegExp(
  `^/(?:(?:${PUBLIC_ASSET_DIRS.join("|")})/)?[\\w.-]+\\.(?:jpg|jpeg|png|webp|avif|gif|svg|ico|woff2?)$`,
  "i",
);

/** A file in `public/` — an image or font, never a page or an API route. */
export function isPublicAsset(pathname: string): boolean {
  return PUBLIC_ASSET_RE.test(pathname);
}

export function isPublicPassthrough(pathname: string): boolean {
  if (isPublicAsset(pathname)) return true;
  return PUBLIC_PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Private surfaces that must never answer on the public host, even by accident. */
export function isPrivateOnlyPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/eve") || pathname === "/traces" || pathname.startsWith("/traces/");
}
