// The training plan on /training: session types, the week's rows, Fitbit workout
// sync (via Google Health) with auto-matching, and the weekly draft Cael writes. Date helpers are shared
// with the meal plan (lib/nutrition.ts) so both grids run Monday to Sunday.
import { getDb } from "./db";
import { addDaysISO, num, todayISO } from "./nutrition";
import { fetchExercises, isHealthConnected } from "./google-health";

/** Fitbit exerciseType values each session type accepts. */
const RUNS = ["RUNNING", "TREADMILL", "TREADMILL_RUNNING", "TRAIL_RUNNING"];
const GYM = ["WEIGHTLIFTING", "WEIGHTS", "STRENGTH_TRAINING", "INTERVAL_WORKOUT", "HIIT", "CROSSFIT", "CIRCUIT_TRAINING", "OTHER", "SPORT"];

export const SESSION_TYPES = [
  { key: "long_run", label: "Long run", short: "Run", color: "bg-sky-500", sports: RUNS },
  { key: "intervals", label: "Intervals / tempo", short: "Speed", color: "bg-orange-500", sports: RUNS },
  { key: "easy", label: "Easy run / recovery", short: "Easy", color: "bg-teal-500", sports: [...RUNS, "HIKING"] },
  { key: "hyrox", label: "Hyrox / hybrid", short: "Hyrox", color: "bg-rose-500", sports: [...GYM, "RUNNING"] },
  { key: "strength", label: "Strength", short: "Lift", color: "bg-violet-500", sports: GYM },
  // Restorative yoga took Wednesday's rest day (Berto, 2026-10-04): a real session, ticked off like one.
  { key: "yoga", label: "Yoga / mobility", short: "Yoga", color: "bg-lime-500", sports: ["YOGA", "PILATES", "STRETCHING"] },
  { key: "rest", label: "Rest", short: "Rest", color: "bg-muted-foreground/40", sports: [] },
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
  /** Target pace in seconds per km (runs). */
  target_pace_sec: number | null;
  intensity: string | null;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  /** The Fitbit workout that marked it done. */
  activity_id: string | null;
  actual_km: number | null;
  actual_minutes: number | null;
  /** The pace he says he ran, seconds per km — typed in, not from the watch. */
  actual_pace_sec: number | null;
  /** Active Zone Minutes from the workout. */
  actual_effort: number | null;
  actual_avg_hr: number | null;
  /** Seconds in light / moderate / vigorous / peak heart-rate zones. */
  actual_zones: number[] | null;
  /** The bank workout this session logs into (lib/workout-bank.ts), if any. */
  workout_slug: string | null;
}

/** A Fitbit workout as /training shows it. */
export interface Activity {
  id: string;
  /** Fitbit exerciseType: RUNNING, WALKING, BIKING, OTHER… */
  sport_type: string;
  name: string;
  start_local: string;
  distance_m: number;
  moving_time_s: number;
  avg_hr: number | null;
  azm: number | null;
  zones: number[] | null;
}

export interface TrainingEvent {
  id: number;
  name: string;
  event_date: string;
  kind: string;
  notes: string | null;
}

const SESSION_COLUMNS = `id, to_char(session_date, 'YYYY-MM-DD') AS session_date, position, type, title, target_km,
  target_minutes, target_pace_sec, intensity, notes, done, done_at, activity_id, actual_km, actual_minutes, actual_pace_sec, actual_effort, actual_avg_hr, actual_zones, workout_slug`;

function shapeSession(r: Record<string, unknown>): TrainingSession {
  return {
    id: Number(r.id),
    session_date: String(r.session_date),
    position: Number(r.position ?? 0),
    type: String(r.type),
    title: String(r.title),
    target_km: num(r.target_km),
    target_minutes: num(r.target_minutes),
    target_pace_sec: num(r.target_pace_sec),
    intensity: (r.intensity as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    done: Boolean(r.done),
    done_at: r.done_at ? String(r.done_at) : null,
    activity_id: (r.activity_id as string | null) ?? null,
    actual_km: num(r.actual_km),
    actual_minutes: num(r.actual_minutes),
    actual_effort: num(r.actual_effort),
    actual_pace_sec: num(r.actual_pace_sec),
    actual_avg_hr: num(r.actual_avg_hr),
    actual_zones: Array.isArray(r.actual_zones) ? (r.actual_zones as unknown[]).map(Number) : null,
    workout_slug: (r.workout_slug as string | null) ?? null,
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

export function shapeActivity(r: Record<string, unknown>): Activity {
  return {
    id: String(r.id),
    sport_type: String(r.exercise_type),
    name: String(r.name),
    start_local: String(r.start_local),
    distance_m: num(r.distance_m) ?? 0,
    moving_time_s: num(r.active_s) ?? 0,
    avg_hr: num(r.avg_hr),
    azm: num(r.azm),
    zones: Array.isArray(r.zones) ? (r.zones as unknown[]).map(Number) : null,
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

export async function getActivities(from: string, to: string): Promise<Activity[]> {
  const sql = getDb();
  const rows = await sql.query(
    `SELECT id, exercise_type, name, to_char(start_local, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_local, distance_m,
       active_s, avg_hr, azm, zones
     FROM fitbit_exercises WHERE start_local >= $1::date AND start_local < ($2::date + 1)
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
  target_pace_sec?: number | null;
  intensity?: string | null;
  notes?: string | null;
  /** undefined = leave as is; null = unlink from the bank. */
  workout_slug?: string | null;
}

/** 330 → "5:30". */
export function formatPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "5:30" (or "5.5", "5") → seconds per km; null when unreadable. */
export function parsePace(text: string): number | null {
  const t = text.trim();
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) return Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
}

/** Minutes a run takes at a pace — runs are planned by distance + pace, so time is derived. */
export function minutesAtPace(km: number | null, paceSec: number | null): number | null {
  return km && paceSec ? Math.round((km * paceSec) / 60) : null;
}

/** "20 km · 5:30/km · 110 min" — whichever targets are set. */
export function targetLabel(s: Pick<TrainingSession, "target_km" | "target_minutes" | "target_pace_sec">): string {
  return [
    s.target_km !== null && `${s.target_km} km`,
    s.target_pace_sec !== null && `${formatPace(s.target_pace_sec)}/km`,
    s.target_minutes !== null && `${s.target_minutes} min`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function saveSession(input: SessionInput): Promise<TrainingSession> {
  if (!SESSION_TYPE_KEYS.includes(input.type)) throw new Error(`Unknown session type: ${input.type}`);
  const meta = sessionMeta(input.type);
  const title = input.title?.trim() || meta.label;
  const intensity = input.intensity && (INTENSITIES as readonly string[]).includes(input.intensity) ? input.intensity : null;
  const pace = input.target_pace_sec ? Math.round(input.target_pace_sec) : null;
  const minutes = minutesAtPace(input.target_km ?? null, pace) ?? input.target_minutes ?? null;
  const sql = getDb();
  if (input.id) {
    const [row] = await sql.query(
      `UPDATE training_sessions SET session_date = $2, position = COALESCE($3, position), type = $4, title = $5,
         target_km = $6, target_minutes = $7, intensity = $8, notes = $9, target_pace_sec = $10,
         workout_slug = CASE WHEN $12 THEN $11 ELSE workout_slug END, updated_at = NOW()
       WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
      [input.id, input.session_date, input.position ?? null, input.type, title, input.target_km ?? null,
        minutes, intensity, input.notes ?? null, pace, input.workout_slug ?? null, input.workout_slug !== undefined],
    );
    if (!row) throw new Error("Session not found");
    return shapeSession(row as Record<string, unknown>);
  }
  const [row] = await sql.query(
    `INSERT INTO training_sessions (session_date, position, type, title, target_km, target_minutes, intensity, notes, target_pace_sec, workout_slug)
     VALUES ($1, COALESCE($2, (SELECT COALESCE(MAX(position), -1) + 1 FROM training_sessions WHERE session_date = $1)),
             $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${SESSION_COLUMNS}`,
    [input.session_date, input.position ?? null, input.type, title, input.target_km ?? null,
      minutes, intensity, input.notes ?? null, pace, input.workout_slug ?? null],
  );
  return shapeSession(row as Record<string, unknown>);
}

/**
 * Tick or untick a session. He ticks it himself (Fitbit's distance and time were
 * off — 5:19/km on the watch for a run Strava had at ~4:50), so the watch only
 * contributes heart rate: ticking attaches that day's Fitbit workout HR if there is
 * one. Unticking clears everything that came with done.
 */
export async function setSessionDone(id: number, done: boolean, actual?: { km?: number | null; minutes?: number | null; pace_sec?: number | null }) {
  const sql = getDb();
  const km = actual?.km ?? null;
  const pace = actual?.pace_sec ? Math.round(actual.pace_sec) : null;
  const minutes = minutesAtPace(km, pace) ?? actual?.minutes ?? null;
  const [row] = await sql.query(
    `UPDATE training_sessions SET done = $2, done_at = CASE WHEN $2 THEN COALESCE(done_at, NOW()) ELSE NULL END,
       actual_km = CASE WHEN $2 THEN COALESCE($3, actual_km) ELSE NULL END,
       actual_minutes = CASE WHEN $2 THEN COALESCE($4, actual_minutes) ELSE NULL END,
       actual_pace_sec = CASE WHEN $2 THEN COALESCE($5, actual_pace_sec) ELSE NULL END,
       activity_id = CASE WHEN $2 THEN activity_id ELSE NULL END,
       actual_effort = CASE WHEN $2 THEN actual_effort ELSE NULL END,
       actual_avg_hr = CASE WHEN $2 THEN actual_avg_hr ELSE NULL END,
       actual_zones = CASE WHEN $2 THEN actual_zones ELSE NULL END,
       updated_at = NOW()
     WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
    [id, done, km, minutes, pace],
  );
  if (!row) throw new Error("Session not found");
  const s = shapeSession(row as Record<string, unknown>);
  if (done && !s.activity_id) {
    await attachHeartRate(s.session_date, s.session_date).catch((err) => console.warn("[training] heart rate attach failed:", err));
    return (await getSessions(s.session_date, s.session_date)).find((x) => x.id === id) ?? s;
  }
  return s;
}

/** What he actually ran, typed in: distance + pace, time worked out. Null clears. */
export async function setActuals(id: number, km: number | null, paceSec: number | null) {
  const sql = getDb();
  const pace = paceSec ? Math.round(paceSec) : null;
  const [row] = await sql.query(
    `UPDATE training_sessions SET actual_km = $2, actual_pace_sec = $3, actual_minutes = $4, updated_at = NOW()
     WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
    [id, km, pace, minutesAtPace(km, pace)],
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

// ── the goal ──────────────────────────────────────────────────────────────
// One sentence shown under the Training title and handed to every weekly draft.
const GOAL_KEY = "training.goal";
export const DEFAULT_GOAL = "Train optimally to reach my potential in Hyrox.";

export async function getGoal(): Promise<string> {
  const sql = getDb();
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${GOAL_KEY}`;
  return row && String(row.value).trim() ? String(row.value) : DEFAULT_GOAL;
}

export async function setGoal(goal: string) {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${GOAL_KEY}, ${goal}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return getGoal();
}

// ── Fitbit sync + matching ────────────────────────────────────────────────
// Workouts come off his Fitbit through the Google Health connection Cael already
// has for steps and sleep. Strava was the plan, but its API went subscriber-only.

/** Short workouts are background movement, not a session. */
const MIN_SESSION_SECONDS = 15 * 60;
/** Never a training session: walks and the bike commute. */
const NOT_TRAINING = ["WALKING", "BIKING", "OUTDOOR_BIKE", "ELLIPTICAL"];

export function isTraining(a: Pick<Activity, "sport_type">) {
  return !NOT_TRAINING.includes(a.sport_type);
}

function matchable(a: Activity) {
  if (a.moving_time_s < MIN_SESSION_SECONDS && a.distance_m < 2000) return false;
  return isTraining(a);
}

/**
 * Pulls the last `days` of Fitbit workouts into the cache, then attaches heart
 * rate to sessions he has ticked (see attachHeartRate). Nothing gets ticked here.
 */
export async function syncWorkouts(days = 14) {
  if (!(await isHealthConnected())) return { connected: false, fetched: 0, matched: 0 };
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const workouts = await fetchExercises(since);
  const sql = getDb();
  for (const w of workouts) {
    await sql`
      INSERT INTO fitbit_exercises (id, exercise_type, name, start_local, distance_m, active_s, avg_hr, azm, zones, auto, synced_at)
      VALUES (${w.id}, ${w.exercise_type}, ${w.name}, ${w.start_local}, ${w.distance_m}, ${w.active_s}, ${w.avg_hr}, ${w.azm}, ${w.zones}, ${w.auto}, NOW())
      ON CONFLICT (id) DO UPDATE SET exercise_type = EXCLUDED.exercise_type, name = EXCLUDED.name, start_local = EXCLUDED.start_local,
        distance_m = EXCLUDED.distance_m, active_s = EXCLUDED.active_s, avg_hr = EXCLUDED.avg_hr, azm = EXCLUDED.azm,
        zones = EXCLUDED.zones, auto = EXCLUDED.auto, synced_at = NOW()
    `;
  }
  const from = since.toISOString().slice(0, 10);
  const matched = await attachHeartRate(from, todayISO());
  return { connected: true, fetched: workouts.length, matched };
}

export async function lastWorkoutSync(): Promise<string | null> {
  const [r] = await getDb()`SELECT MAX(synced_at) AS at FROM fitbit_exercises`;
  return r?.at ? new Date(r.at as string).toISOString() : null;
}

/**
 * Heart rate only: each ticked session with no workout attached gets the day's
 * Fitbit workout whose sport fits its type — avg HR, Active Zone Minutes and zone
 * time. Never ticks anything and never touches distance or time.
 */
export async function attachHeartRate(from: string, to: string) {
  const [sessions, activities] = await Promise.all([getSessions(from, to), getActivities(from, to)]);
  const linked = new Set(sessions.map((s) => s.activity_id).filter(Boolean) as string[]);
  const open = sessions.filter((s) => s.done && !s.activity_id && s.type !== "rest");
  const sql = getDb();
  let matched = 0;
  // Oldest first so a morning run pairs with the first session of the day.
  for (const a of [...activities].reverse()) {
    if (linked.has(a.id) || !matchable(a)) continue;
    const day = a.start_local.slice(0, 10);
    const candidates = open.filter((s) => s.session_date === day && (sessionMeta(s.type).sports as readonly string[]).includes(a.sport_type));
    // Prefer the type whose accepted sports list is the most specific for this sport.
    const pick = candidates.sort((x, y) => sessionMeta(x.type).sports.length - sessionMeta(y.type).sports.length)[0];
    if (!pick) continue;
    await sql`
      UPDATE training_sessions SET activity_id = ${a.id}, actual_effort = ${a.azm}, actual_avg_hr = ${a.avg_hr},
        actual_zones = ${a.zones}, updated_at = NOW()
      WHERE id = ${pick.id}
    `;
    open.splice(open.indexOf(pick), 1);
    linked.add(a.id);
    matched++;
  }
  return matched;
}

// ── the weekly draft ──────────────────────────────────────────────────────
// The week isn't written in one shot any more: the training_coach subagent
// (agent/subagents/training_coach) reads this brief, then adds, edits and
// removes sessions one call at a time so /training fills in live.

/**
 * Everything the coach needs to write the week starting Monday `weekStart`:
 * the goal, the written plan, races, recent load from his Fitbit, recent notes, his
 * weekly routine, and the sessions already on the week (with ids to edit).
 */
export async function weekDraftContext(weekStart: string, sessionsPerWeek = 6) {
  const to = addDaysISO(weekStart, 6);
  // Dynamic: workout-bank imports this module.
  const bank = await (await import("./workout-bank")).listWorkouts().catch(() => []);
  const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const sql = getDb();
  const [events, recentSessions, recentActivities, notes, week, doc, goal, routines] = await Promise.all([
    getEvents(),
    getSessions(addDaysISO(weekStart, -28), addDaysISO(weekStart, -1)),
    getActivities(addDaysISO(weekStart, -28), addDaysISO(weekStart, -1)),
    sql`SELECT to_char(logged_date, 'YYYY-MM-DD') AS d, note FROM workout_notes ORDER BY logged_date DESC LIMIT 10`,
    getSessions(weekStart, to),
    getPlanDoc(),
    getGoal(),
    sql`SELECT title, content FROM vision_items WHERE kind = 'routine' ORDER BY created_at ASC`,
  ]);
  const weekly = new Map<string, { km: number; n: number; effort: number }>();
  // Sessions and km from what he ticked and typed in; effort from his Fitbit.
  for (const s of recentSessions) {
    if (!s.done || s.type === "rest") continue;
    const wk = weekKeyOf(s.session_date);
    const cur = weekly.get(wk) ?? { km: 0, n: 0, effort: 0 };
    cur.n++;
    cur.km += s.actual_km ?? 0;
    weekly.set(wk, cur);
  }
  for (const a of recentActivities) {
    if (!matchable(a)) continue;
    const wk = weekKeyOf(a.start_local.slice(0, 10));
    const cur = weekly.get(wk) ?? { km: 0, n: 0, effort: 0 };
    cur.effort += a.azm ?? 0;
    weekly.set(wk, cur);
  }
  const dayName = (iso: string) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][daysBetween(weekStart, iso)];
  const upcoming = events.filter((e) => e.event_date >= weekStart);
  return [
    `WEEK: Monday ${weekStart} to Sunday ${to}. Today is ${todayISO()}.`,
    `HIS GOAL: ${goal}`,
    `TARGET: ${sessionsPerWeek} sessions and ${7 - sessionsPerWeek} rest day(s). Mix long runs, Hyrox/hybrid work and strength. He runs close to 20k when he runs long and does full Hyrox simulations.`,
    "HIS WORKOUT BANK: his repeatable workouts (Unity Standard Upper/Lower Body, Threshold Intervals, Stations, Hyrox Sim, 20K Long Run) live in the workout bank, each with a default day — empty weeks fill from it automatically. When you schedule one of them, pass its workout_slug (from the workout_bank tool) and its name as the title, and leave notes empty: the exercises, weights and targets live in the bank.",
    ...(bank.length
      ? ["THE BANK (workout_slug · name · type · default day):", ...bank.map((w) => `- ${w.slug} · ${w.name} · ${w.session_type} · ${w.default_day === null ? "no default day" : DAY[w.default_day]}`), ""]
      : []),
    "",
    ...(doc.content.trim()
      ? ["HIS WRITTEN TRAINING PLAN (follow its structure and any week-specific instructions; this outranks the defaults above):", doc.content.trim().slice(0, 6000), ""]
      : []),
    ...(routines.length
      ? ["HIS WEEKLY ROUTINE (the shape of his days; fit sessions to it):", ...routines.map((r) => `${r.title}:\n${String(r.content).trim()}`), ""]
      : []),
    upcoming.length
      ? "RACES AHEAD:\n" + upcoming.map((e) => `- ${e.name} on ${e.event_date} (${daysBetween(weekStart, e.event_date)} days after this Monday)${e.notes ? ` — ${e.notes}` : ""}`).join("\n")
      : "No races on the calendar.",
    "If a race falls in this week or the next, this is a taper: cut volume, keep one sharp touch, no hard strength in the last 3 days.",
    "",
    weekly.size
      ? "RECENT WEEKS (sessions done / km he logged / Fitbit Active Zone Minutes):\n" + [...weekly.entries()].sort().map(([w, v]) => `- week of ${w}: ${v.n} sessions, ${v.km.toFixed(1)} km, effort ${v.effort}`).join("\n")
      : "No workout history yet.",
    "",
    recentSessions.length
      ? "RECENTLY PLANNED (✓ = done):\n" + recentSessions.map((s) => `- ${s.session_date} ${s.type} ${s.title}${s.done ? " ✓" : ""}${s.actual_km ? ` ${s.actual_km}km` : ""}`).join("\n")
      : "Nothing planned in the last four weeks.",
    "",
    week.length
      ? "ALREADY ON THIS WEEK (✓ = done, never touch those; the rest you may keep, edit, move or delete by id):\n" +
        week.map((s) => `- id ${s.id} · ${dayName(s.session_date)} ${s.session_date} · ${s.type} "${s.title}"${s.target_km ? ` ${s.target_km}km` : ""}${s.target_pace_sec ? ` @${formatPace(s.target_pace_sec)}/km` : ""}${s.target_minutes ? ` ${s.target_minutes}min` : ""}${s.intensity ? ` ${s.intensity}` : ""}${s.done ? " ✓ done" : ""}${s.notes ? ` — ${s.notes}` : ""}`).join("\n")
      : "THIS WEEK IS EMPTY.",
    notes.length ? "\nHIS RECENT TRAINING NOTES:\n" + notes.map((n) => `- ${n.d}: ${String(n.note).replace(/\s+/g, " ").slice(0, 240)}`).join("\n") : "",
  ].join("\n");
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

// ── pace suggestions ──────────────────────────────────────────────────────
// What pace to put on a planned run, from what he's actually been running on
// his Fitbit (and, for intervals, his Hyrox race runs). Shown under the pace box on
// the session page with where it came from, so he can take it or ignore it.

export interface PaceSuggestion {
  pace_sec: number;
  basis: string;
}

const RUN_TYPES = ["long_run", "intervals", "easy"];
const LONG_RUN_M = 14_000;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function paceSuggestions(): Promise<Record<string, PaceSuggestion | null>> {
  const { HYROX_RESULTS, hyroxSeconds } = await import("./hyrox");
  const sql = getDb();
  // From the paces he typed in on done runs — the watch's distances run short.
  const rows = await sql`
    SELECT actual_km, COALESCE(actual_pace_sec, actual_minutes * 60.0 / NULLIF(actual_km, 0)) AS pace
    FROM training_sessions
    WHERE done AND type = ANY(${RUN_TYPES}) AND actual_km >= 3
      AND COALESCE(actual_pace_sec, actual_minutes) IS NOT NULL
      AND session_date >= CURRENT_DATE - 60
  `;
  const runs = rows.map((r) => ({ m: Number(r.actual_km) * 1000, pace: Number(r.pace) }));
  const long = runs.filter((r) => r.m >= LONG_RUN_M);
  const short = runs.filter((r) => r.m < LONG_RUN_M);
  // Easy runs: the slower half of his shorter runs, so tempo days don't drag it fast.
  const shortMedian = short.length ? median(short.map((r) => r.pace)) : null;
  const easy = shortMedian === null ? [] : short.filter((r) => r.pace >= shortMedian);
  const race = HYROX_RESULTS[0];
  const raceRuns = race ? race.splits.map((s) => hyroxSeconds(s.run)) : [];

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return {
    long_run: long.length
      ? { pace_sec: median(long.map((r) => r.pace)), basis: `median of your last ${plural(long.length, "run")} of 14 km+ you logged (60 days)` }
      : null,
    easy: easy.length
      ? { pace_sec: median(easy.map((r) => r.pace)), basis: `median of your easier ${plural(easy.length, "run")} under 14 km you logged (60 days)` }
      : null,
    intervals: raceRuns.length
      ? { pace_sec: raceRuns.reduce((a, b) => a + b, 0) / raceRuns.length, basis: `your average 1 km run at ${race.event}, the pace to hold every rep` }
      : null,
  };
}
