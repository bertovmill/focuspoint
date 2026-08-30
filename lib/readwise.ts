// Readwise — the "notes written" metric on the daily scorecard.
//
// **Notes, not highlights.** Berto cut highlights from an earlier draft of this
// scorecard as "high noise, less signal", and that was right: a highlight is a swipe,
// and you can produce fifty in an afternoon without thinking once. A *note* is
// something he typed — a reaction, an objection, a connection — so it only happens when
// he actually engaged. Only highlights carrying a non-empty `note` are counted.
//
// The API is official and pleasant: a token from readwise.io/access_token, and
// `GET /api/v2/export/?updatedAfter=` returns books each with their highlights. Rate
// limit is 240/min, and this runs once a day.
//
// Docs: https://readwise.io/api_deets

const API = "https://readwise.io/api/v2";

export function isReadwiseConfigured(): boolean {
  return Boolean(process.env.READWISE_TOKEN);
}

function authHeaders() {
  const token = process.env.READWISE_TOKEN;
  if (!token) throw new Error("READWISE_TOKEN is not set");
  return { Authorization: `Token ${token}` };
}

/** 204 means the token is good. Used by the status route so a bad token is obvious. */
export async function checkReadwiseToken(): Promise<boolean> {
  if (!isReadwiseConfigured()) return false;
  try {
    const res = await fetch(`${API}/auth/`, { headers: authHeaders() });
    return res.status === 204;
  } catch {
    return false;
  }
}

type ExportHighlight = {
  note?: string | null;
  highlighted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ExportBook = { highlights?: ExportHighlight[] };

/**
 * Every highlight touched since `updatedAfter`, across all books.
 *
 * Paginated with `pageCursor`; the loop is capped because an unbounded `while` against
 * someone else's pagination is how a cron job runs forever.
 */
async function exportSince(updatedAfter: string): Promise<ExportHighlight[]> {
  const out: ExportHighlight[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const url = new URL(`${API}/export/`);
    url.searchParams.set("updatedAfter", updatedAfter);
    if (cursor) url.searchParams.set("pageCursor", cursor);

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Readwise export failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { results?: ExportBook[]; nextPageCursor?: string | null };

    for (const book of json.results ?? []) out.push(...(book.highlights ?? []));
    cursor = json.nextPageCursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/**
 * The day a highlight belongs to, bucketed in Berto's timezone.
 *
 * Prefers `highlighted_at` — when he actually read it — over `created_at`, which is
 * when Readwise ingested it and can be hours or days later for a Kindle sync.
 */
function noteDay(h: ExportHighlight, timeZone: string): string | null {
  const raw = h.highlighted_at ?? h.created_at ?? h.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Notes written per day for the last `days` days, keyed YYYY-MM-DD.
 *
 * Returns a map rather than a single day's count so a backfill is one API call rather
 * than fourteen.
 */
export async function fetchNotesByDay(days: number, timeZone: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const highlights = await exportSince(since);

  const byDay = new Map<string, number>();
  for (const h of highlights) {
    // The whole point of the metric: a highlight without his own words doesn't count.
    if (!h.note || !h.note.trim()) continue;
    const day = noteDay(h, timeZone);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return byDay;
}
