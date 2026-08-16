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

export function isPublicPassthrough(pathname: string): boolean {
  return PUBLIC_PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Private surfaces that must never answer on the public host, even by accident. */
export function isPrivateOnlyPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/eve") || pathname === "/traces" || pathname.startsWith("/traces/");
}
