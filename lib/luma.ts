/**
 * Luma API client — everything the MakersLounge calendar key can reach.
 *
 * Surveyed against the live API (2026-08-16); this key reaches:
 *
 *   /calendar/list-events        every event, but **without** its description
 *   /event/get?api_id=           the full event: description, description_md, hosts
 *   /event/get-guests?event_id=  guests: name, email, phone, approval, check-in, answers
 *   /calendar/list-people        people: email, attendance counts, revenue, membership
 *   /calendars/contacts/list     contacts (what the Community chart has always used)
 *
 * Coupons, hosts-list and ticket-types all 404 on this key, so they're not here.
 *
 * Every fetch keeps the raw entry alongside the fields we name, because the sync
 * stores it: Luma adds fields over time and a JSONB column costs nothing.
 */

const LUMA_API_BASE = "https://public-api.luma.com/v1";

/** A raw Luma object. Narrowed at the call site rather than modelled twice. */
export type LumaRecord = Record<string, unknown>;

function apiKey(): string {
  const key = process.env.LUMA_API_KEY;
  if (!key) throw new Error("LUMA_API_KEY is not set");
  return key;
}

async function lumaGet(
  path: string,
  params: Record<string, string> = {},
  revalidateSeconds?: number,
): Promise<LumaRecord> {
  const url = new URL(`${LUMA_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // A sync always wants the truth; the Community chart is happy with a 5-minute
  // cache and is hit on every dashboard load. `next` is Next's own fetch option
  // and is simply ignored in the eve/node process, where the sync actually runs.
  const caching = revalidateSeconds
    ? ({ next: { revalidate: revalidateSeconds } } as RequestInit)
    : ({ cache: "no-store" } as RequestInit);
  // Luma rate-limits, and a batched sync is fast enough to trip it — the first
  // version that wrote rows in bulk got a 429 on the very next call. Back off and
  // retry rather than failing a whole pull over one throttled request.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "x-luma-api-key": apiKey() }, ...caching });
    if (res.ok) return (await res.json()) as LumaRecord;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Luma ${path} → ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
    }
    // Honour Retry-After when Luma sends one; otherwise exponential, 2s → 16s.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
    await sleep(waitMs);
  }
}

const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Walk a paginated Luma list endpoint to the end.
 *
 * Luma pages with `next_cursor`/`has_more` rather than offsets. `guard` stops a
 * runaway if the cursor ever fails to advance — without it a server-side bug
 * would spin here forever.
 */
async function lumaList(
  path: string,
  params: Record<string, string> = {},
  revalidateSeconds?: number,
): Promise<LumaRecord[]> {
  const out: LumaRecord[] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const body = await lumaGet(
      path,
      { ...params, pagination_limit: "100", ...(cursor ? { pagination_cursor: cursor } : {}) },
      revalidateSeconds,
    );
    const entries = Array.isArray(body.entries) ? (body.entries as LumaRecord[]) : [];
    out.push(...entries);
    cursor = body.has_more ? (body.next_cursor as string | undefined) : undefined;
  } while (cursor && ++guard < 200);
  return out;
}

// ─── events ──────────────────────────────────────────────────────────────────

/** Every event on the calendar. Summary shape — no description; see below. */
export const fetchLumaEvents = () => lumaList("/calendar/list-events");

/**
 * One event in full. This is the only endpoint that carries `description` and
 * `description_md`, which is exactly the part a newsletter wants, so the sync
 * pays for one call per event rather than settling for the list shape.
 */
export async function fetchLumaEvent(apiId: string): Promise<{ event: LumaRecord; hosts: LumaRecord[] }> {
  const body = await lumaGet("/event/get", { api_id: apiId });
  return {
    event: (body.event as LumaRecord) ?? {},
    hosts: Array.isArray(body.hosts) ? (body.hosts as LumaRecord[]) : [],
  };
}

/** Everyone registered for an event, approved or not. Note: `event_id`, not `api_id`. */
export const fetchLumaGuests = (eventApiId: string) => lumaList("/event/get-guests", { event_id: eventApiId });

// ─── audience ────────────────────────────────────────────────────────────────

/** Calendar people: one row per human, with lifetime attendance counts. */
export const fetchLumaPeople = () => lumaList("/calendar/list-people");

export interface LumaContact {
  id: string;
  created_at: string;
}

/**
 * Fetches every contact (subscriber) on the Makers Lounge Luma calendar.
 *
 * Kept as its own narrow function because the Community wealth-form chart has
 * used it since 2026-08-09 and only ever needs the join timestamps.
 */
export async function fetchLumaContacts(): Promise<LumaContact[]> {
  const entries = await lumaList(
    "/calendars/contacts/list",
    { sort_column: "created_at", sort_direction: "asc" },
    300,
  );
  return entries.flatMap((e) =>
    e?.id && e?.created_at ? [{ id: String(e.id), created_at: String(e.created_at) }] : [],
  );
}
