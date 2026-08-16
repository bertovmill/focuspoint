import { verifyEmailToken } from "@/lib/newsletter-token";

/**
 * One-click unsubscribe for the newsletter.
 *
 * Answers two callers:
 *   GET  — the link in an email, clicked by a person. Returns a small HTML page.
 *   POST — Gmail/Apple Mail's own "Unsubscribe" button (RFC 8058 List-Unsubscribe-Post),
 *          which fires without the person ever opening the message.
 *
 * Both require the HMAC from `lib/newsletter-token`, so nobody can unsubscribe
 * someone else by editing the query string.
 */

const RESEND_API = "https://api.resend.com";

function page(title: string, body: string, status = 200) {
  // Self-contained: this renders in whatever browser an email client opens, and
  // shouldn't depend on the site's CSS loading.
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Berto Mill</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100dvh;display:grid;place-items:center;
 font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;
 background:#fafafa;color:#111}
@media(prefers-color-scheme:dark){body{background:#101010;color:#f5f5f5}}
main{max-width:32rem;padding:2rem;text-align:center}
h1{font-size:1.35rem;margin:0 0 .75rem;letter-spacing:-.01em}
p{margin:0 0 1.25rem;opacity:.75}
a{color:#e8590c;font-weight:500}
</style></head><body><main><h1>${title}</h1><p>${body}</p>
<a href="https://bertomill.com">bertomill.com</a></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function unsubscribe(request: Request): Promise<{ ok: boolean; reason?: string }> {
  const url = new URL(request.url);
  const email = url.searchParams.get("e")?.trim().toLowerCase();
  const token = url.searchParams.get("t");

  if (!email || !token || !verifyEmailToken(email, token)) {
    return { ok: false, reason: "bad-link" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) return { ok: false, reason: "unconfigured" };

  // Resend addresses contacts by email directly, so no lookup round trip.
  // Marking unsubscribed rather than deleting keeps them suppressed if they're
  // ever re-imported from another list.
  const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ unsubscribed: true }),
  });

  if (!res.ok) {
    // A contact that isn't on the list is already "unsubscribed" as far as the
    // person is concerned — don't show them an error for getting what they wanted.
    if (res.status === 404) return { ok: true };
    console.error("[site/unsubscribe] Resend rejected the update:", res.status, await res.text().catch(() => ""));
    return { ok: false, reason: "upstream" };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const { ok, reason } = await unsubscribe(request);
  if (ok) {
    return page("You're unsubscribed", "You won't get any more emails from me. No hard feelings — the writing stays free to read on the site.");
  }
  if (reason === "bad-link") {
    return page("That link didn't work", "It may have been cut short by your email client. Reply to any issue and I'll remove you by hand.", 400);
  }
  return page("Something went wrong", "I couldn't process that just now. Reply to any issue and I'll remove you by hand.", 502);
}

export async function POST(request: Request) {
  // One-click unsubscribe: the mail client wants a status code, not a page.
  const { ok } = await unsubscribe(request);
  return new Response(null, { status: ok ? 200 : 400 });
}
