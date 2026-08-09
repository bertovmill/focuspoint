const LUMA_API_BASE = "https://public-api.luma.com/v1";

export interface LumaContact {
  id: string;
  created_at: string;
}

/**
 * Fetches every contact (subscriber) on the Makers Lounge Luma calendar, paginating
 * until the API stops returning a next_cursor. Requires LUMA_API_KEY (a calendar-scoped
 * key from a Luma Plus account) in the environment.
 */
export async function fetchLumaContacts(): Promise<LumaContact[]> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) throw new Error("LUMA_API_KEY is not set");

  const contacts: LumaContact[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${LUMA_API_BASE}/calendars/contacts/list`);
    url.searchParams.set("sort_column", "created_at");
    url.searchParams.set("sort_direction", "asc");
    url.searchParams.set("pagination_limit", "100");
    if (cursor) url.searchParams.set("pagination_cursor", cursor);

    const res = await fetch(url, {
      headers: { "x-luma-api-key": apiKey },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Luma API error: ${res.status}`);

    const body = await res.json();
    for (const entry of body.entries ?? []) {
      if (entry?.id && entry?.created_at) contacts.push({ id: entry.id, created_at: entry.created_at });
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);

  return contacts;
}
