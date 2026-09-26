// The training plan on /training: session types, the week's rows, Strava sync
// with auto-matching, and the weekly draft Cael writes. Date helpers are shared
// with the meal plan (lib/nutrition.ts) so both grids run Monday to Sunday.
import { generateObject } from "ai";
import { z } from "zod";

import { getDb } from "./db";
import { addDaysISO, num, todayISO } from "./nutrition";
import { fetchStravaActivities, isStravaConnected, type StravaActivity } from "./strava";

export const SESSION_TYPES = [
  { key: "long_run", label: "Long run", short: "Run", color: "bg-sky-500", strava: ["Run", "TrailRun", "VirtualRun"] },
  { key: "intervals", label: "Intervals / tempo", short: "Speed", color: "bg-orange-500", strava: ["Run", "TrailRun", "VirtualRun"] },
  { key: "easy", label: "Easy run / recovery", short: "Easy", color: "bg-teal-500", strava: ["Run", "TrailRun", "VirtualRun", "Walk", "Hike", "Ride"] },
  { key: "hyrox", label: "Hyrox / hybrid", short: "Hyrox", color: "bg-rose-500", strava: ["Workout", "Crossfit", "HighIntensityIntervalTraining", "WeightTraining", "Run"] },
  { key: "strength", label: "Strength", short: "Lift", color: "bg-violet-500", strava: ["WeightTraining", "Workout", "Crossfit"] },
  { key: "rest", label: "Rest", short: "Rest", color: "bg-muted-foreground/40", strava: [] },
] as const;

export type SessionType = (typeof SESSION_TYPES)[number]["key"];
export const SESSION_TYPE_KEYS = SESSION_TYPES.map((t) => t.key) as readonly string[];
export const INTENSITIES = ["easy", "moderate", "hard"] as const;

export function sessionMeta(type: string) {
  return SESSION_TYPES.find((t) => t.key === type) ?? SESSION_TYPES[3];
}

export interface TrainingSession {
  id: number;
  session_date: string;
  position: number;
  type: string;
  title: string;
  target_km: number | null;
  target_minutes: number | null;
  intensity: string | null;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  strava_activity_id: number | null;
  actual_km: number | null;
  actual_minutes: number | null;
  actual_effort: number | null;
}

export interface TrainingEvent {
  id: number;
  name: string;
  event_date: string;
  kind: string;
  notes: string | null;
}

const SESSION_COLUMNS = `id, to_char(session_date, 'YYYY-MM-DD') AS session_date, position, type, title, target_km,
  target_minutes, intensity, notes, done, done_at, strava_activity_id, actual_km, actual_minutes, actual_effort`;

function shapeSession(r: Record<string, unknown>): TrainingSession {
  return {
    id: Number(r.id),
    session_date: String(r.session_date),
    position: Number(r.position ?? 0),
    type: String(r.type),
    title: String(r.title),
    target_km: num(r.target_km),
    target_minutes: num(r.target_minutes),
    intensity: (r.intensity as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    done: Boolean(r.done),
    done_at: r.done_at ? String(r.done_at) : null,
    strava_activity_id: num(r.strava_activity_id),
    actual_km: num(r.actual_km),
    actual_minutes: num(r.actual_minutes),
    actual_effort: num(r.actual_effort),
  };
}

export function shapeEvent(r: Record<string, unknown>): TrainingEvent {
  return {
    id: Number(r.id),
    name: String(r.name),
    event_date: String(r.event_date),
    kind: String(r.kind ?? "hyrox"),
    notes: (r.notes as string | null) ?? null,
  };
}

export function shapeActivity(r: Record<string, unknown>): StravaActivity {
  return {
    id: Number(r.id),
    name: String(r.name),
    sport_type: String(r.sport_type),
    start_local: String(r.start_local),
    distance_m: num(r.distance_m) ?? 0,
    moving_time_s: num(r.moving_time_s) ?? 0,
    elapsed_time_s: num(r.elapsed_time_s) ?? 0,
    elevation_m: num(r.elevation_m),
    relative_effort: num(r.relative_effort),
    avg_speed: num(r.avg_speed),
  };
}

// ── reads ─────────────────────────────────────────────────────────────────

export async function getSessions(from: string, to: string): Promise<TrainingSession[]> {
  const sql = getDb();
  const rows = await sql.query(
    `SELECT ${SESSION_COLUMNS} FROM training_sessions WHERE session_date BETWEEN $1 AND $2
     ORDER BY session_date ASC, position ASC, id ASC`,
    [from, to],
  );
  return (rows as Record<string, unknown>[]).map(shapeSession);
}

export async function getEvents(): Promise<TrainingEvent[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, name, to_char(event_date, 'YYYY-MM-DD') AS event_date, kind, notes
    FROM training_events ORDER BY event_date ASC
  `;
  return rows.map((r) => shapeEvent(r as Record<string, unknown>));
}

export async function getActivities(from: string, to: string): Promise<StravaActivity[]> {
  const sql = getDb();
  const rows = await sql.query(
    `SELECT id, name, sport_type, to_char(start_local, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_local, distance_m,
       moving_time_s, elapsed_time_s, elevation_m, relative_effort, avg_speed
     FROM strava_activities WHERE start_local >= $1::date AND start_local < ($2::date + 1)
     ORDER BY start_local DESC`,
    [from, to],
  );
  return (rows as Record<string, unknown>[]).map(shapeActivity);
}

// ── writes ────────────────────────────────────────────────────────────────

export interface SessionInput {
  id?: number | null;
  session_date: string;
  position?: number;
  type: string;
  title?: string;
  target_km?: number | null;
  target_minutes?: number | null;
  intensity?: string | null;
  notes?: string | null;
}

export async function saveSession(input: SessionInput): Promise<TrainingSession> {
  if (!SESSION_TYPE_KEYS.includes(input.type)) throw new Error(`Unknown session type: ${input.type}`);
  const meta = sessionMeta(input.type);
  const title = input.title?.trim() || meta.label;
  const intensity = input.intensity && (INTENSITIES as readonly string[]).includes(input.intensity) ? input.intensity : null;
  const sql = getDb();
  if (input.id) {
    const [row] = await sql.query(
      `UPDATE training_sessions SET session_date = $2, position = COALESCE($3, position), type = $4, title = $5,
         target_km = $6, target_minutes = $7, intensity = $8, notes = $9, updated_at = NOW()
       WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
      [input.id, input.session_date, input.position ?? null, input.type, title, input.target_km ?? null,
        input.target_minutes ?? null, intensity, input.notes ?? null],
    );
    if (!row) throw new Error("Session not found");
    return shapeSession(row as Record<string, unknown>);
  }
  const [row] = await sql.query(
    `INSERT INTO training_sessions (session_date, position, type, title, target_km, target_minutes, intensity, notes)
     VALUES ($1, COALESCE($2, (SELECT COALESCE(MAX(position), -1) + 1 FROM training_sessions WHERE session_date = $1)),
             $3, $4, $5, $6, $7, $8)
     RETURNING ${SESSION_COLUMNS}`,
    [input.session_date, input.position ?? null, input.type, title, input.target_km ?? null,
      input.target_minutes ?? null, intensity, input.notes ?? null],
  );
  return shapeSession(row as Record<string, unknown>);
}

export async function setSessionDone(id: number, done: boolean, actual?: { km?: number | null; minutes?: number | null }) {
  const sql = getDb();
  const [row] = await sql.query(
    `UPDATE training_sessions SET done = $2, done_at = CASE WHEN $2 THEN COALESCE(done_at, NOW()) ELSE NULL END,
       actual_km = CASE WHEN $2 THEN COALESCE($3, actual_km) ELSE NULL END,
       actual_minutes = CASE WHEN $2 THEN COALESCE($4, actual_minutes) ELSE NULL END,
       strava_activity_id = CASE WHEN $2 THEN strava_activity_id ELSE NULL END,
       actual_effort = CASE WHEN $2 THEN actual_effort ELSE NULL END,
       updated_at = NOW()
     WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
    [id, done, actual?.km ?? null, actual?.minutes ?? null],
  );
  if (!row) throw new Error("Session not found");
  return shapeSession(row as Record<string, unknown>);
}

export async function deleteSession(id: number) {
  const sql = getDb();
  await sql`DELETE FROM training_sessions WHERE id = ${id}`;
}

export async function clearWeek(from: string, to: string, onlyUndone = true) {
  const sql = getDb();
  if (onlyUndone) await sql`DELETE FROM training_sessions WHERE session_date BETWEEN ${from} AND ${to} AND done = FALSE`;
  else await sql`DELETE FROM training_sessions WHERE session_date BETWEEN ${from} AND ${to}`;
}

// ── the written plan ──────────────────────────────────────────────────────
// One markdown document — the long-form plan (blocks, weekly structure, the
// February build) that the weekly drafts are written against. Lives in
// app_settings; Cael reads and edits it through the training_plan_doc tool.
const PLAN_DOC_KEY = "training.plan_markdown";

export async function getPlanDoc(): Promise<{ content: string; updated_at: string | null }> {
  const sql = getDb();
  const [row] = await sql`SELECT value, updated_at FROM app_settings WHERE key = ${PLAN_DOC_KEY}`;
  return { content: row ? String(row.value) : "", updated_at: row?.updated_at ? String(row.updated_at) : null };
}

export async function setPlanDoc(content: string) {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${PLAN_DOC_KEY}, ${content}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return getPlanDoc();
}

// ── Strava sync + matching ────────────────────────────────────────────────

/** Walks and rides under this are background movement, not a session. */
const MIN_SESSION_SECONDS = 15 * 60;

function matchable(a: StravaActivity) {
  if (a.moving_time_s < MIN_SESSION_SECONDS && a.distance_m < 2000) return false;
  return a.sport_type !== "Walk";
}

/**
 * Pulls the last `days` of activities into the cache, then marks planned
 * sessions done: an activity on a day is paired with the first undone session
 * that day whose type accepts that sport (a Run takes a long run before an
 * easy run; a Workout takes a Hyrox before strength), copying distance, time
 * and relative effort onto it. Manual ticks are never overwritten.
 */
export async function syncStrava(days = 14) {
  if (!(await isStravaConnected())) return { connected: false, fetched: 0, matched: 0 };
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const activities = await fetchStravaActivities(since);
  const sql = getDb();
  for (const a of activities) {
    await sql`
      INSERT INTO strava_activities (id, name, sport_type, start_local, distance_m, moving_time_s, elapsed_time_s, elevation_m, relative_effort, avg_speed, synced_at)
      VALUES (${a.id}, ${a.name}, ${a.sport_type}, ${a.start_local}, ${a.distance_m}, ${a.moving_time_s}, ${a.elapsed_time_s}, ${a.elevation_m}, ${a.relative_effort}, ${a.avg_speed}, NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sport_type = EXCLUDED.sport_type, distance_m = EXCLUDED.distance_m,
        moving_time_s = EXCLUDED.moving_time_s, elapsed_time_s = EXCLUDED.elapsed_time_s, elevation_m = EXCLUDED.elevation_m,
        relative_effort = EXCLUDED.relative_effort, avg_speed = EXCLUDED.avg_speed, synced_at = NOW()
    `;
  }
  const from = since.toISOString().slice(0, 10);
  const matched = await matchActivities(from, todayISO());
  return { connected: true, fetched: activities.length, matched };
}

export async function matchActivities(from: string, to: string) {
  const [sessions, activities] = await Promise.all([getSessions(from, to), getActivities(from, to)]);
  const linked = new Set(sessions.map((s) => s.strava_activity_id).filter(Boolean) as number[]);
  const open = sessions.filter((s) => !s.done && s.type !== "rest");
  const sql = getDb();
  let matched = 0;
  // Oldest first so a morning run claims the long run before the evening one does.
  for (const a of [...activities].reverse()) {
    if (linked.has(a.id) || !matchable(a)) continue;
    const day = a.start_local.slice(0, 10);
    const candidates = open.filter((s) => s.session_date === day && (sessionMeta(s.type).strava as readonly string[]).includes(a.sport_type));
    // Prefer the type whose accepted sports list is the most specific for this sport.
    const pick = candidates.sort((x, y) => sessionMeta(x.type).strava.length - sessionMeta(y.type).strava.length)[0];
    if (!pick) continue;
    await sql`
      UPDATE training_sessions SET done = TRUE, done_at = NOW(), strava_activity_id = ${a.id},
        actual_km = ${Math.round(a.distance_m / 100) / 10}, actual_minutes = ${Math.round(a.moving_time_s / 60)},
        actual_effort = ${a.relative_effort}, updated_at = NOW()
      WHERE id = ${pick.id}
    `;
    open.splice(open.indexOf(pick), 1);
    linked.add(a.id);
    matched++;
  }
  return matched;
}

// ── the weekly draft ──────────────────────────────────────────────────────

const TEXT_MODEL = "anthropic/claude-sonnet-4.6";

const DraftSession = z.object({
  day: z.number().int().min(0).max(6).describe("0 = Monday … 6 = Sunday"),
  type: z.enum(["long_run", "intervals", "easy", "hyrox", "strength", "rest"]),
  title: z.string().describe("Short session name, e.g. '18k steady' or 'Hyrox sim: 8 stations'"),
  target_km: z.number().nullable().describe("Distance target in km for runs, else null"),
  target_minutes: z.number().int().nullable().describe("Planned duration in minutes"),
  intensity: z.enum(["easy", "moderate", "hard"]),
  notes: z.string().describe("One or two lines: the point of the session and how to run it"),
});
const DraftWeek = z.object({
  summary: z.string().describe("One sentence on what this week is for in the build"),
  sessions: z.array(DraftSession).min(5).max(9),
});

/**
 * Writes a week of sessions for the Monday at `weekStart`, replacing any undone
 * sessions already there. Sessions already ticked (or matched from Strava) stay.
 */
export async function draftWeek(weekStart: string, sessionsPerWeek = 6) {
  const to = addDaysISO(weekStart, 6);
  const sql = getDb();
  const [events, recentSessions, recentActivities, notes, kept, doc] = await Promise.all([
    getEvents(),
    getSessions(addDaysISO(weekStart, -28), addDaysISO(weekStart, -1)),
    getActivities(addDaysISO(weekStart, -28), addDaysISO(weekStart, -1)),
    sql`SELECT to_char(logged_date, 'YYYY-MM-DD') AS d, note FROM workout_notes ORDER BY logged_date DESC LIMIT 10`,
    getSessions(weekStart, to).then((s) => s.filter((x) => x.done)),
    getPlanDoc(),
  ]);
  const weekly = new Map<string, { km: number; n: number; effort: number }>();
  for (const a of recentActivities) {
    if (!matchable(a)) continue;
    const wk = weekKeyOf(a.start_local.slice(0, 10));
    const cur = weekly.get(wk) ?? { km: 0, n: 0, effort: 0 };
    cur.n++;
    cur.km += a.distance_m / 1000;
    cur.effort += a.relative_effort ?? 0;
    weekly.set(wk, cur);
  }
  const upcoming = events.filter((e) => e.event_date >= weekStart);
  const context = [
    `WEEK: Monday ${weekStart} to Sunday ${to}. Today is ${todayISO()}.`,
    `TARGET: ${sessionsPerWeek} sessions and ${7 - sessionsPerWeek} rest day(s). Mix long runs, Hyrox/hybrid work and strength. He runs close to 20k when he runs long and does full Hyrox simulations.`,
    "",
    ...(doc.content.trim()
      ? ["HIS WRITTEN TRAINING PLAN (follow its structure and any week-specific instructions; this outranks the defaults above):", doc.content.trim().slice(0, 6000), ""]
      : []),
    upcoming.length
      ? "RACES AHEAD:\n" + upcoming.map((e) => `- ${e.name} on ${e.event_date} (${daysBetween(weekStart, e.event_date)} days after this Monday)${e.notes ? ` — ${e.notes}` : ""}`).join("\n")
      : "No races on the calendar.",
    "If a race falls in this week or the next, this is a taper: cut volume, keep one sharp touch, no hard strength in the last 3 days.",
    "",
    weekly.size
      ? "RECENT WEEKS FROM STRAVA (sessions / km / summed relative effort):\n" + [...weekly.entries()].sort().map(([w, v]) => `- week of ${w}: ${v.n} sessions, ${v.km.toFixed(1)} km, effort ${v.effort}`).join("\n")
      : "No Strava history yet.",
    "",
    recentSessions.length
      ? "RECENTLY PLANNED (✓ = done):\n" + recentSessions.map((s) => `- ${s.session_date} ${s.type} ${s.title}${s.done ? " ✓" : ""}${s.actual_km ? ` ${s.actual_km}km` : ""}`).join("\n")
      : "Nothing planned in the last four weeks.",
    "",
    kept.length ? "ALREADY DONE THIS WEEK (keep the plan consistent with these):\n" + kept.map((s) => `- ${s.session_date} ${s.type} ${s.title}`).join("\n") : "",
    notes.length ? "\nHIS RECENT TRAINING NOTES:\n" + notes.map((n) => `- ${n.d}: ${String(n.note).replace(/\s+/g, " ").slice(0, 240)}`).join("\n") : "",
  ].join("\n");

  const { object } = await generateObject({
    model: TEXT_MODEL,
    schema: DraftWeek,
    prompt: [
      "You are the coach writing next week's training for Berto: a hybrid athlete (long runs near 20k, full Hyrox",
      "simulations, heavy compound lifts) who trains hard nearly six days a week. Write one week. Progress volume",
      "sensibly week over week, put a rest day after the hardest day, never stack two hard runs back to back,",
      "and keep strength off the day before a long run. Be specific about targets. Use exactly one rest session on a rest day.",
      "",
      context,
    ].join("\n"),
  });

  await clearWeek(weekStart, to, true);
  const keptDays = new Set(kept.map((s) => s.session_date));
  const saved: TrainingSession[] = [];
  for (const s of object.sessions) {
    const date = addDaysISO(weekStart, s.day);
    if (keptDays.has(date) && s.type === "rest") continue;
    saved.push(
      await saveSession({
        session_date: date,
        type: s.type,
        title: s.title,
        target_km: s.target_km,
        target_minutes: s.target_minutes,
        intensity: s.intensity,
        notes: s.notes,
      }),
    );
  }
  return { summary: object.summary, sessions: saved };
}

function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function daysUntil(iso: string, from: string = todayISO()) {
  return daysBetween(from, iso);
}

function weekKeyOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
