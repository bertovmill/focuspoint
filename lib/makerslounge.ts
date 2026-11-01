// makerslounge.ca, read as an admin. Since Nov 2026 MakersLounge events, RSVPs
// and the guest list live on the site itself (not Luma), and Cael is an admin
// there: it calls the site's admin API with MAKERSLOUNGE_ADMIN_TOKEN, which the
// site checks against its CAEL_ADMIN_TOKEN. Read-only for now.

const BASE = process.env.MAKERSLOUNGE_URL ?? "https://makerslounge.ca";

export type MakersLoungeEvent = {
  id: string;
  slug: string | null;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  capacity: number | null;
  series_slug: string | null;
  rsvps: number;
  /** null = the site doesn't track check-ins yet (unknown, not zero). */
  check_ins: number | null;
  url: string;
};

export type MakersLoungeTotals = {
  members: number;
  events_total: number;
  events_run: number;
  events_upcoming: number;
  rsvps_total: number;
  rsvps_past: number;
  check_ins: number | null;
};

export type MakersLoungeGuest = {
  name: string;
  building: string | null;
  member: boolean;
  rsvped_at: string;
};

async function adminGet<T>(path: string): Promise<T> {
  const token = process.env.MAKERSLOUNGE_ADMIN_TOKEN;
  if (!token) throw new Error("MAKERSLOUNGE_ADMIN_TOKEN is not set, so Cael can't read makerslounge.ca.");
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`makerslounge.ca ${path} answered ${res.status}`);
  return (await res.json()) as T;
}

export function listMakersLoungeEvents(when: "upcoming" | "past" | "all", limit: number) {
  return adminGet<{ totals: MakersLoungeTotals; events: MakersLoungeEvent[] }>(
    `/api/admin/events?when=${when}&limit=${limit}`,
  );
}

/** The guest list, without emails: Cael has no reason to hold them yet. */
export async function getMakersLoungeGuests(eventId: string): Promise<MakersLoungeGuest[]> {
  const { data } = await adminGet<{
    data: { name: string; building: string | null; profile_id: string | null; created_at: string }[];
  }>(`/api/events/${encodeURIComponent(eventId)}/rsvps`);
  return data.map((r) => ({
    name: r.name,
    building: r.building,
    member: r.profile_id !== null,
    rsvped_at: r.created_at,
  }));
}
