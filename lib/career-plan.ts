// The career plan at the top of /career, built like /training: a destination with a
// date (the "race"), dated checkpoints on the way, and the daily actions ticked off
// day by day, with a trajectory projecting today's pace out to the destination date.
//
// The daily actions themselves aren't a table: they're the numbered list in the
// career daily-actions doc (lib/career-daily-actions.ts), so editing that doc, by
// hand or through Cael, changes the checklist. A tick is stored by a key slugged
// from the action's bold title, so rewording the detail keeps its history; renaming
// the title starts a fresh one.
import { getDb } from "./db";
import { addDaysISO } from "./nutrition";
import { getCareerDailyActions } from "./career-daily-actions";

const DESTINATION_KEY = "career.destination";

export const DEFAULT_CAREER_GOAL = "Land a senior GTM strategy role at an AI company I believe in, on my terms.";

/** How far back the trajectory looks to measure his pace. */
export const PACE_WINDOW_DAYS = 28;

export interface CareerDestination {
  goal: string;
  /** YYYY-MM-DD he's aiming to be there by, or null until he sets one. */
  target_date: string | null;
  /** When the date was first set; the left end of the trajectory line. */
  started_on: string | null;
}

export interface CareerCheckpoint {
  id: number;
  name: string;
  due_date: string;
  done_on: string | null;
  notes: string | null;
}

export interface CareerAction {
  key: string;
  title: string;
  detail: string;
  /** The principle numbers it advances, as written in the doc, e.g. "1, 4". */
  principles: string;
}

export interface CareerActionTick {
  day: string;
  key: string;
  note: string | null;
}

export interface ActionPace {
  key: string;
  title: string;
  /** Ticks inside the pace window. */
  count: number;
  per_week: number;
  /** More of these by the destination date at this pace; null without a date. */
  projected: number | null;
}

export interface CareerPace {
  /** Days the pace is measured over: the last 28, or fewer if he started more recently. 0 = no ticks yet. */
  window_days: number;
  done: number;
  possible: number;
  days_left: number | null;
  actions: ActionPace[];
}

export interface CareerPlan {
  destination: CareerDestination;
  checkpoints: CareerCheckpoint[];
  actions: CareerAction[];
  ticks: CareerActionTick[];
  pace: CareerPace;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isISODate = (s: unknown): s is string => typeof s === "string" && ISO.test(s);

// The read paths skip ensureSchema (it walks every table), so make ours on first use.
let ready = false;
async function ensureTables() {
  if (ready) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS career_checkpoints (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      due_date DATE NOT NULL,
      done_on DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS career_action_log (
      day DATE NOT NULL,
      action_key TEXT NOT NULL,
      title TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (day, action_key)
    )
  `;
  ready = true;
}

// ── destination ─────────────────────────────────────────────────────────

export async function getDestination(): Promise<CareerDestination> {
  const [row] = await getDb()`SELECT value FROM app_settings WHERE key = ${DESTINATION_KEY}`;
  const fallback: CareerDestination = { goal: DEFAULT_CAREER_GOAL, target_date: null, started_on: null };
  if (!row) return fallback;
  try {
    const v = JSON.parse(String(row.value)) as Partial<CareerDestination>;
    return {
      goal: typeof v.goal === "string" && v.goal.trim() ? v.goal : DEFAULT_CAREER_GOAL,
      target_date: isISODate(v.target_date) ? v.target_date : null,
      started_on: isISODate(v.started_on) ? v.started_on : null,
    };
  } catch {
    return fallback;
  }
}

/** Merge a change into the destination. Setting the first date also starts the trajectory line today. */
export async function setDestination(
  change: { goal?: string; target_date?: string | null },
  today: string,
): Promise<CareerDestination> {
  const cur = await getDestination();
  const next: CareerDestination = {
    goal: change.goal?.trim() ? change.goal.trim().slice(0, 300) : cur.goal,
    target_date: change.target_date !== undefined ? change.target_date : cur.target_date,
    started_on: cur.started_on,
  };
  if (next.target_date && !next.started_on) next.started_on = today;
  await getDb()`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${DESTINATION_KEY}, ${JSON.stringify(next)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return next;
}

// ── checkpoints ─────────────────────────────────────────────────────────

function shapeCheckpoint(r: Record<string, unknown>): CareerCheckpoint {
  return {
    id: Number(r.id),
    name: String(r.name),
    due_date: String(r.due_date),
    done_on: (r.done_on as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

export async function getCheckpoints(): Promise<CareerCheckpoint[]> {
  await ensureTables();
  const rows = await getDb()`
    SELECT id, name, to_char(due_date, 'YYYY-MM-DD') AS due_date, to_char(done_on, 'YYYY-MM-DD') AS done_on, notes
    FROM career_checkpoints ORDER BY due_date ASC, id ASC
  `;
  return rows.map((r) => shapeCheckpoint(r as Record<string, unknown>));
}

export async function addCheckpoint(c: { name: string; due_date: string; notes?: string | null }): Promise<CareerCheckpoint> {
  await ensureTables();
  const [row] = await getDb()`
    INSERT INTO career_checkpoints (name, due_date, notes) VALUES (${c.name.trim()}, ${c.due_date}, ${c.notes?.trim() || null})
    RETURNING id, name, to_char(due_date, 'YYYY-MM-DD') AS due_date, to_char(done_on, 'YYYY-MM-DD') AS done_on, notes
  `;
  return shapeCheckpoint(row as Record<string, unknown>);
}

/** Change any of name / date / notes / done. `done: true` stamps today; false clears it. */
export async function updateCheckpoint(
  id: number,
  change: { name?: string; due_date?: string; notes?: string | null; done?: boolean },
  today: string,
): Promise<CareerCheckpoint | null> {
  await ensureTables();
  const sql = getDb();
  const [cur] = await sql`
    SELECT id, name, to_char(due_date, 'YYYY-MM-DD') AS due_date, to_char(done_on, 'YYYY-MM-DD') AS done_on, notes
    FROM career_checkpoints WHERE id = ${id}
  `;
  if (!cur) return null;
  const c = shapeCheckpoint(cur as Record<string, unknown>);
  const name = change.name?.trim() || c.name;
  const due = change.due_date && isISODate(change.due_date) ? change.due_date : c.due_date;
  const notes = change.notes !== undefined ? change.notes?.trim() || null : c.notes;
  const doneOn = change.done === undefined ? c.done_on : change.done ? (c.done_on ?? today) : null;
  const [row] = await sql`
    UPDATE career_checkpoints SET name = ${name}, due_date = ${due}, notes = ${notes}, done_on = ${doneOn}
    WHERE id = ${id}
    RETURNING id, name, to_char(due_date, 'YYYY-MM-DD') AS due_date, to_char(done_on, 'YYYY-MM-DD') AS done_on, notes
  `;
  return shapeCheckpoint(row as Record<string, unknown>);
}

export async function deleteCheckpoint(id: number) {
  await ensureTables();
  await getDb()`DELETE FROM career_checkpoints WHERE id = ${id}`;
}

// ── daily actions ───────────────────────────────────────────────────────

export function actionKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const stripMarks = (s: string) => s.replace(/\*\*|__|[*_`]/g, "").trim();

/**
 * The top-level list items of the daily-actions doc, in order. "1. **Send one
 * message.** A new outreach… *(1, 4)*" → title "Send one message", the rest as
 * detail, the trailing "(1, 4)" as the principles it serves.
 */
export function parseCareerActions(md: string): CareerAction[] {
  const out: CareerAction[] = [];
  const seen = new Set<string>();
  for (const line of md.split("\n")) {
    const m = line.match(/^(?:\d+[.)]|[-*+])\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (!m) continue;
    let text = m[1].trim();
    let principles = "";
    const tags = text.match(/\s*[*_]?\(([\d,\s]+)\)[*_]?\s*$/);
    if (tags) {
      principles = tags[1].trim();
      text = text.slice(0, tags.index).trim();
    }
    const bold = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    const title = stripMarks(bold ? bold[1] : text).replace(/[.:;,]\s*$/, "");
    const detail = bold ? stripMarks(bold[2]) : "";
    const key = actionKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, title, detail, principles });
  }
  return out;
}

export async function getCareerActions(): Promise<CareerAction[]> {
  return parseCareerActions((await getCareerDailyActions()).content);
}

export async function getTicks(from: string, to: string): Promise<CareerActionTick[]> {
  await ensureTables();
  const rows = await getDb()`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, action_key, note FROM career_action_log
    WHERE day BETWEEN ${from} AND ${to} ORDER BY day ASC, created_at ASC
  `;
  return rows.map((r) => ({ day: String(r.day), key: String(r.action_key), note: (r.note as string | null) ?? null }));
}

/** Tick (or untick) one action on one day. A note on an already-ticked action replaces the old one. */
export async function setTick(day: string, action: CareerAction, done: boolean, note?: string | null) {
  await ensureTables();
  const sql = getDb();
  if (!done) {
    await sql`DELETE FROM career_action_log WHERE day = ${day} AND action_key = ${action.key}`;
    return;
  }
  if (note === undefined) {
    await sql`
      INSERT INTO career_action_log (day, action_key, title) VALUES (${day}, ${action.key}, ${action.title})
      ON CONFLICT (day, action_key) DO UPDATE SET title = EXCLUDED.title
    `;
    return;
  }
  const n = note?.trim() || null;
  await sql`
    INSERT INTO career_action_log (day, action_key, title, note) VALUES (${day}, ${action.key}, ${action.title}, ${n})
    ON CONFLICT (day, action_key) DO UPDATE SET title = EXCLUDED.title, note = EXCLUDED.note
  `;
}

// ── trajectory ──────────────────────────────────────────────────────────

export function daysBetweenISO(from: string, to: string) {
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/**
 * His pace over the last four weeks (or since his first tick, if that's sooner),
 * carried forward to the destination date: "18 messages in 4 weeks → ~80 more by Feb 27".
 */
export function computePace(actions: CareerAction[], ticks: CareerActionTick[], firstTick: string | null, today: string, targetDate: string | null): CareerPace {
  const windowStart = addDaysISO(today, -(PACE_WINDOW_DAYS - 1));
  const start = firstTick && firstTick > windowStart ? firstTick : windowStart;
  const windowDays = firstTick ? daysBetweenISO(start, today) + 1 : 0;
  const daysLeft = targetDate ? Math.max(0, daysBetweenISO(today, targetDate)) : null;
  const inWindow = ticks.filter((t) => t.day >= start && t.day <= today);
  const per = actions.map((a) => {
    const count = inWindow.filter((t) => t.key === a.key).length;
    const perDay = windowDays ? count / windowDays : 0;
    return {
      key: a.key,
      title: a.title,
      count,
      per_week: Math.round(perDay * 7 * 10) / 10,
      projected: daysLeft === null ? null : Math.round(perDay * daysLeft),
    };
  });
  return {
    window_days: windowDays,
    done: per.reduce((n, a) => n + a.count, 0),
    possible: windowDays * actions.length,
    days_left: daysLeft,
    actions: per,
  };
}

/** Everything /career's plan needs: the ticks for [from, to] plus enough history for the pace. */
export async function getCareerPlan(today: string, from: string = today, to: string = today): Promise<CareerPlan> {
  await ensureTables();
  const paceFrom = addDaysISO(today, -(PACE_WINDOW_DAYS - 1));
  const lo = from < paceFrom ? from : paceFrom;
  const hi = to > today ? to : today;
  const [destination, checkpoints, actions, allTicks, [first]] = await Promise.all([
    getDestination(),
    getCheckpoints(),
    getCareerActions(),
    getTicks(lo, hi),
    getDb()`SELECT to_char(MIN(day), 'YYYY-MM-DD') AS d FROM career_action_log`,
  ]);
  const keys = new Set(actions.map((a) => a.key));
  const current = allTicks.filter((t) => keys.has(t.key));
  return {
    destination,
    checkpoints,
    actions,
    ticks: current.filter((t) => t.day >= from && t.day <= to),
    pace: computePace(actions, current, (first?.d as string | null) ?? null, today, destination.target_date),
  };
}

/** The few lines Cael needs: destination, next checkpoint, today's list. Used by the snapshot and the tool. */
export function summarizeCareerPlan(plan: CareerPlan, today: string): string {
  const { destination: d, checkpoints, actions, ticks, pace } = plan;
  const lines = [
    `- Destination: ${d.goal}${d.target_date ? ` — by ${d.target_date} (${daysBetweenISO(today, d.target_date)} days)` : " — no date set yet"}`,
  ];
  const open = checkpoints.filter((c) => !c.done_on);
  const overdue = open.filter((c) => c.due_date < today);
  const next = open.find((c) => c.due_date >= today);
  if (overdue.length) lines.push(`- Overdue checkpoints: ${overdue.map((c) => `${c.name} (was due ${c.due_date}, id ${c.id})`).join("; ")}`);
  if (next) lines.push(`- Next checkpoint: ${next.name} on ${next.due_date} (${daysBetweenISO(today, next.due_date)} days, id ${next.id})`);
  const doneCount = checkpoints.length - open.length;
  if (checkpoints.length) lines.push(`- Checkpoints done: ${doneCount}/${checkpoints.length}`);
  const todays = new Map(ticks.filter((t) => t.day === today).map((t) => [t.key, t]));
  if (actions.length) {
    lines.push(`- Daily actions today (${todays.size}/${actions.length}):`);
    for (const a of actions) {
      const t = todays.get(a.key);
      lines.push(`  - ${t ? "✓" : "☐"} ${a.title}${t?.note ? ` — ${t.note}` : ""}`);
    }
  }
  if (pace.window_days) {
    const pct = pace.possible ? Math.round((pace.done / pace.possible) * 100) : 0;
    lines.push(`- Pace (last ${pace.window_days} days): ${pace.done}/${pace.possible} actions, ${pct}%`);
    if (pace.days_left !== null) {
      lines.push(`- Projected by the destination date at this pace: ${pace.actions.map((a) => `${a.title} ~${a.projected} more`).join("; ")}`);
    }
  }
  return lines.join("\n");
}
