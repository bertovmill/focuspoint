import { getDb } from "./db";
import { todayISO } from "@/agent/lib/now";
import { completeTask, createTask } from "./tasks";
import { removeCompletedTaskFromCalendar } from "./task-calendar";

/**
 * Great Thinkers → Naval (2026-10-23). Berto's call: "How to Get Rich (without
 * getting lucky)" (nav.al/rich) is the lesson; the hard part is following it, so
 * it's turned into three small weekday moves that reach him the ways that work
 * for him — tasks on the board (made here each weekday by the naval-moves cron,
 * which also sends a push), and a recurring 12:30 calendar block plus a Sunday
 * review on his personal calendar, bertmill19@gmail.com (made once on 2026-10-23
 * with Cael's add_calendar_event).
 *
 * The principles are paraphrased, not quoted.
 */

export { NAVAL_PRINCIPLES, NAVAL_SOURCE, type NavalPrinciple } from "./naval-content";
import { NAVAL_PRINCIPLES, type NavalPrinciple } from "./naval-content";

export type NavalMove = {
  key: "leverage" | "knowledge" | "long-game";
  label: string;
  /** Exactly the title the cron puts on the board; also how today's tasks are found again. */
  taskTitle: string;
  minutes: number;
  why: string;
};

export const NAVAL_MOVES: NavalMove[] = [
  {
    key: "leverage",
    label: "Leverage",
    taskTitle: "Naval · Leverage: ship or publish one thing",
    minutes: 30,
    why: "Code or media: a Cael feature, a post, a tweet. Something that works while you sleep.",
  },
  {
    key: "knowledge",
    label: "Specific knowledge",
    taskTitle: "Naval · Specific knowledge: 20 min deep on GTM eng / AI",
    minutes: 20,
    why: "Follow your curiosity, not a syllabus. Read, build, or take notes.",
  },
  {
    key: "long-game",
    label: "Long game",
    taskTitle: "Naval · Long game: one real touch with a long-term person",
    minutes: 10,
    why: "A thank-you, an intro, a useful DM. Compound trust.",
  },
];

/** Same principle all day, a different one each day, cycling through the list. */
export function principleOfTheDay(date = todayISO()): NavalPrinciple {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return NAVAL_PRINCIPLES[day % NAVAL_PRINCIPLES.length];
}

function isWeekend(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Puts today's three moves on the board, skipping any already there (the cron
 * may retry, and the page can add them by hand). Weekdays only unless forced.
 */
export async function addTodaysNavalMoves({ force = false } = {}): Promise<{ added: string[]; date: string }> {
  const date = todayISO();
  if (isWeekend(date) && !force) return { added: [], date };
  const sql = getDb();
  const titles = NAVAL_MOVES.map((m) => m.taskTitle);
  const existing = await sql`SELECT title FROM todos WHERE title = ANY(${titles}) AND due_date = ${date}`;
  const have = new Set(existing.map((r) => r.title as string));
  const added: string[] = [];
  for (const move of NAVAL_MOVES) {
    if (have.has(move.taskTitle)) continue;
    const res = await createTask({ title: move.taskTitle, due_date: date, estimated_minutes: move.minutes });
    if (res.ok) added.push(move.taskTitle);
  }
  return { added, date };
}

export type NavalStatus = {
  date: string;
  principle: NavalPrinciple;
  moves: (NavalMove & { taskId: number | null; done: boolean })[];
  /** Weekdays in a row with all three moves done, counting today only once it's complete. */
  streak: number;
  /** Moves done in the last 7 days, out of 15 possible weekday moves. */
  week: { done: number; possible: number };
};

export async function getNavalStatus(): Promise<NavalStatus> {
  const date = todayISO();
  const sql = getDb();
  const titles = NAVAL_MOVES.map((m) => m.taskTitle);
  const rows = await sql`
    SELECT id, title, completed, to_char(due_date, 'YYYY-MM-DD') AS due
    FROM todos
    WHERE title = ANY(${titles}) AND due_date > (${date}::date - 120)
  `;

  const today = new Map<string, { id: number; done: boolean }>();
  const doneByDay = new Map<string, number>();
  for (const r of rows) {
    if (r.due === date) today.set(r.title as string, { id: r.id as number, done: Boolean(r.completed) });
    if (r.completed) doneByDay.set(r.due as string, (doneByDay.get(r.due as string) ?? 0) + 1);
  }

  let streak = 0;
  let day = (doneByDay.get(date) ?? 0) >= NAVAL_MOVES.length ? date : previousDay(date);
  for (let i = 0; i < 120; i++, day = previousDay(day)) {
    if (isWeekend(day)) continue;
    if ((doneByDay.get(day) ?? 0) >= NAVAL_MOVES.length) streak++;
    else break;
  }

  let weekDone = 0;
  let weekPossible = 0;
  for (let i = 0, d = date; i < 7; i++, d = previousDay(d)) {
    if (!isWeekend(d)) weekPossible += NAVAL_MOVES.length;
    weekDone += doneByDay.get(d) ?? 0;
  }

  return {
    date,
    principle: principleOfTheDay(date),
    moves: NAVAL_MOVES.map((m) => {
      const t = today.get(m.taskTitle);
      return { ...m, taskId: t?.id ?? null, done: t?.done ?? false };
    }),
    streak,
    week: { done: weekDone, possible: weekPossible },
  };
}

/** Ticks or unticks one of today's moves. Ticking goes through completeTask so it scores like any task. */
export async function setNavalMoveDone(taskId: number, done: boolean): Promise<void> {
  const sql = getDb();
  const titles = NAVAL_MOVES.map((m) => m.taskTitle);
  const [row] = await sql`SELECT id, calendar_event_id FROM todos WHERE id = ${taskId} AND title = ANY(${titles})`;
  if (!row) throw new Error("Not a Naval move.");
  if (done) {
    await completeTask(taskId);
    return;
  }
  // Same as the board's uncomplete: take the done-block back off the calendar.
  await removeCompletedTaskFromCalendar(row.calendar_event_id as string | null);
  await sql`UPDATE todos SET completed = FALSE, completed_at = NULL, calendar_event_id = NULL WHERE id = ${taskId}`;
}
