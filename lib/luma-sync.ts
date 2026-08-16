import { getDb } from "@/lib/db";
import {
  fetchLumaEvent,
  fetchLumaEvents,
  fetchLumaGuests,
  fetchLumaPeople,
  type LumaRecord,
} from "@/lib/luma";

/**
 * Pull the whole Luma calendar into Postgres.
 *
 * Runs as an **upsert**, never a wipe-and-reload: a guest row that Luma stops
 * returning (a deleted event, a paginated page that failed) stays put rather
 * than vanishing from Cael's memory. That does mean a cancelled registration
 * lingers until its `approval_status` changes — the trade favours never losing
 * history, which is the point of mirroring this at all.
 *
 * Every run writes a `luma_sync_runs` row, success or failure, so any answer
 * Cael gives can be dated.
 */

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const json = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

/** Luma sends timestamps as ISO strings; anything else becomes null rather than an error. */
const ts = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** The human-readable address, dug out of Luma's nested geo blob. */
function addressOf(event: LumaRecord): string | null {
  const geo = event.geo_address_json;
  if (!geo || typeof geo !== "object") return null;
  const g = geo as Record<string, unknown>;
  const parts = [g.address, g.city, g.region, g.country].filter((p): p is string => typeof p === "string" && !!p);
  return str(g.full_address) ?? (parts.length ? parts.join(", ") : null);
}

export interface LumaSyncResult {
  events: number;
  guests: number;
  people: number;
}

/**
 * Upsert many rows in a handful of round trips instead of one per row.
 *
 * The first cut inserted each guest individually: 7,614 registrations meant
 * 7,614 round trips to Neon and a five-minute sync, which is exactly the
 * function timeout. Batched into multi-row VALUES it's a few dozen queries.
 *
 * `columns[0]` must be the conflict key. Chunked at 200 rows because Postgres
 * caps a statement at 65,535 bind parameters and a huge single statement is
 * slower to plan than a few medium ones.
 */
async function upsertMany(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  chunkSize = 200,
): Promise<number> {
  if (rows.length === 0) return 0;
  const sql = getDb();
  const updates = columns
    .slice(1)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat("synced_at = NOW()")
    .join(", ");

  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")}, NOW())`;
    });
    await sql.query(
      `INSERT INTO ${table} (${columns.join(", ")}, synced_at) VALUES ${tuples.join(", ")}
       ON CONFLICT (${columns[0]}) DO UPDATE SET ${updates}`,
      params,
    );
    written += chunk.length;
  }
  return written;
}

export async function syncLuma(): Promise<LumaSyncResult> {
  const sql = getDb();
  const [run] = await sql`INSERT INTO luma_sync_runs DEFAULT VALUES RETURNING id`;
  const runId = run.id as number;
  const counts: LumaSyncResult = { events: 0, guests: 0, people: 0 };

  try {
    for (const summary of await fetchLumaEvents()) {
      const apiId = str(summary.api_id) ?? str(summary.id);
      if (!apiId) continue;

      // The list endpoint has no description, so each event is re-fetched in
      // full — that text is the most useful thing here for writing a newsletter.
      const { event, hosts } = await fetchLumaEvent(apiId);
      const e: LumaRecord = { ...summary, ...event };
      const guests = await fetchLumaGuests(apiId);

      counts.guests += await upsertMany(
        "luma_guests",
        [
          "api_id", "event_api_id", "name", "email", "phone_number", "approval_status",
          "registered_at", "joined_at", "invited_at", "checked_in_at", "source",
          "registration_answers", "raw",
        ],
        guests.flatMap((guest) => {
          const guestId = str(guest.api_id) ?? str(guest.id);
          if (!guestId) return [];
          return [[
            guestId, apiId, str(guest.name) ?? str(guest.user_name), str(guest.email) ?? str(guest.user_email),
            str(guest.phone_number), str(guest.approval_status),
            ts(guest.registered_at), ts(guest.joined_at), ts(guest.invited_at), ts(guest.checked_in_at),
            str(guest.custom_source) ?? str(guest.utm_source),
            json(guest.registration_answers), json(guest),
          ]];
        }),
      );

      const approved = guests.filter((g) => g.approval_status === "approved").length;
      const checkedIn = guests.filter((g) => !!g.checked_in_at).length;

      await sql`
        INSERT INTO luma_events (
          api_id, name, description, description_md, url, cover_url, start_at, end_at, timezone,
          location_type, address, visibility, spots_remaining, registration_open, require_approval,
          guest_count, approved_count, checked_in_count, hosts, tags, raw, created_at, synced_at
        ) VALUES (
          ${apiId}, ${str(e.name)}, ${str(e.description)}, ${str(e.description_md)}, ${str(e.url)},
          ${str(e.cover_url)}, ${ts(e.start_at)}, ${ts(e.end_at)}, ${str(e.timezone)},
          ${str(e.location_type)}, ${addressOf(e)}, ${str(e.visibility)}, ${num(e.spots_remaining)},
          ${bool(e.registration_open)}, ${bool(e.require_approval)},
          ${guests.length}, ${approved}, ${checkedIn}, ${json(hosts)}, ${json(e.tags)}, ${json(e)},
          ${ts(e.created_at)}, NOW()
        )
        ON CONFLICT (api_id) DO UPDATE SET
          name = EXCLUDED.name, description = EXCLUDED.description, description_md = EXCLUDED.description_md,
          url = EXCLUDED.url, cover_url = EXCLUDED.cover_url, start_at = EXCLUDED.start_at,
          end_at = EXCLUDED.end_at, timezone = EXCLUDED.timezone, location_type = EXCLUDED.location_type,
          address = EXCLUDED.address, visibility = EXCLUDED.visibility,
          spots_remaining = EXCLUDED.spots_remaining, registration_open = EXCLUDED.registration_open,
          require_approval = EXCLUDED.require_approval, guest_count = EXCLUDED.guest_count,
          approved_count = EXCLUDED.approved_count, checked_in_count = EXCLUDED.checked_in_count,
          hosts = EXCLUDED.hosts, tags = EXCLUDED.tags, raw = EXCLUDED.raw, synced_at = NOW()
      `;
      counts.events++;
    }

    counts.people = await upsertMany(
      "luma_people",
      [
        "api_id", "email", "name", "first_seen_at", "event_approved_count",
        "event_checked_in_count", "revenue_usd_cents", "membership", "tags", "raw",
      ],
      (await fetchLumaPeople()).flatMap((person) => {
        const personId = str(person.api_id) ?? str(person.id);
        if (!personId) return [];
        const user = (person.user ?? {}) as LumaRecord;
        return [[
          personId, str(person.email), str(person.name) ?? str(user.name), ts(person.created_at),
          num(person.event_approved_count), num(person.event_checked_in_count),
          num(person.revenue_usd_cents), json(person.membership), json(person.tags), json(person),
        ]];
      }),
    );

    await sql`
      UPDATE luma_sync_runs
      SET finished_at = NOW(), ok = TRUE,
          events = ${counts.events}, guests = ${counts.guests}, people = ${counts.people}
      WHERE id = ${runId}
    `;
    return counts;
  } catch (err) {
    await sql`
      UPDATE luma_sync_runs
      SET finished_at = NOW(), ok = FALSE, error = ${String(err).slice(0, 500)},
          events = ${counts.events}, guests = ${counts.guests}, people = ${counts.people}
      WHERE id = ${runId}
    `;
    throw err;
  }
}

/** When the last successful sync finished, or null if there has never been one. */
export async function lastLumaSync(): Promise<{ finished_at: string; events: number; guests: number; people: number } | null> {
  const sql = getDb();
  const [row] = await sql`
    SELECT finished_at, events, guests, people
    FROM luma_sync_runs
    WHERE ok = TRUE
    ORDER BY finished_at DESC
    LIMIT 1
  `;
  return (row as { finished_at: string; events: number; guests: number; people: number } | undefined) ?? null;
}
