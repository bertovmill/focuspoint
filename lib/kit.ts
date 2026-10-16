/**
 * The newsletter list lives in Kit (kit.com). Plain `fetch` against the v4 REST
 * API, authenticated with a v4 API key — no SDK needed for a handful of endpoints.
 * Broadcast drafts for new posts are in lib/kit-broadcast.ts.
 *
 *   KIT_API_KEY  v4 key from Kit → Settings → Developer
 *   KIT_FORM_ID  the form signups join; its double opt-in setting decides
 *                whether Kit sends a confirmation email first
 *
 * Kit owns everything after the signup: confirmation, the welcome sequence,
 * unsubscribes, and sending. This file never sends an email itself.
 */

const KIT_API = "https://api.kit.com/v4";

export function kitConfigured(): boolean {
  return Boolean(process.env.KIT_API_KEY && process.env.KIT_FORM_ID);
}

export async function kit(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${KIT_API}${path}`, {
    ...init,
    headers: {
      "X-Kit-Api-Key": process.env.KIT_API_KEY ?? "",
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}

/**
 * Put an address on the list through the signup form.
 *
 * Two calls because v4 only adds existing subscribers to forms. The subscriber
 * is created `inactive` so that joining a double opt-in form sends Kit's
 * confirmation email and they only become active once they click it. Creating
 * is an upsert, so someone already on the list is left as they were.
 */
export async function kitSubscribe(email: string, referrer?: string): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const created = await kit("/subscribers", {
    method: "POST",
    body: JSON.stringify({ email_address: email, state: "inactive" }),
  });
  if (!created.ok) return { ok: false, status: created.status, detail: await created.text().catch(() => "") };

  const joined = await kit(`/forms/${process.env.KIT_FORM_ID}/subscribers`, {
    method: "POST",
    body: JSON.stringify({ email_address: email, referrer: referrer ?? null }),
  });
  if (!joined.ok) return { ok: false, status: joined.status, detail: await joined.text().catch(() => "") };
  return { ok: true };
}

export interface KitSubscriber {
  id: string;
  email: string;
  createdAt: string;
  unsubscribed: boolean;
}

/**
 * Everyone who has confirmed, newest first. Unconfirmed (`inactive`) signups are
 * left out: they haven't opted in, so they aren't on the list yet.
 */
export async function listKitSubscribers(): Promise<KitSubscriber[] | null> {
  const out: KitSubscriber[] = [];
  let after: string | null = null;
  // Cursor-paginated at up to 1,000 a page; the cap is a guard, not a limit we expect to hit.
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ status: "all", per_page: "1000" });
    if (after) qs.set("after", after);
    const res = await kit(`/subscribers?${qs}`);
    if (!res.ok) {
      console.error("[kit] listing subscribers failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const body = await res.json();
    for (const s of body.subscribers ?? []) {
      if (s.state === "inactive") continue;
      out.push({
        id: String(s.id),
        email: String(s.email_address),
        createdAt: String(s.created_at),
        unsubscribed: s.state !== "active",
      });
    }
    if (!body.pagination?.has_next_page) break;
    after = body.pagination.end_cursor;
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
