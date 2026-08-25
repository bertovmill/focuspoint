import { getDb } from "@/lib/db";
import { hasWorkingSlot, WORKING_LIMIT_MESSAGE } from "@/lib/working-now";
import { logCompletedTaskToCalendar } from "@/lib/task-calendar";
import { TASK_CATEGORY_LABELS, normalizeCategory } from "@/lib/task-categories";
import {
  LATEST_UPDATE_COLUMNS,
  LATEST_UPDATE_JOIN,
  type LatestUpdate,
  type UpdateAuthor,
} from "@/lib/task-updates";

// The task-status operations, in one place, so the REST routes and the MCP
// server (app/api/mcp/route.ts) can't drift apart on what "start", "stop" and
// "complete" actually do to a row.

/** Every column a caller outside the canvas needs to reason about a task. */
const TASK_COLUMNS = `id, title, completed, in_progress, waiting, priority, due_date, recurrence,
  created_at, completed_at, timer_started_at, time_spent_seconds, task_number,
  estimated_minutes, category, parent_id`;

// The same columns, plus each task's newest progress note (see lib/task-updates.ts).
// Reads use this; RETURNING clauses can't join, so mutations still hand back the
// plain columns and leave the update fields undefined.
const TASK_READ_COLUMNS = `${TASK_COLUMNS}, ${LATEST_UPDATE_COLUMNS}`;

export type TaskRow = {
  id: number;
  title: string;
  completed: boolean;
  in_progress: boolean;
  waiting: boolean;
  priority: string | null;
  due_date: string | null;
  recurrence: string | null;
  created_at: string;
  completed_at: string | null;
  timer_started_at: string | null;
  time_spent_seconds: number;
  task_number: number | null;
  estimated_minutes: number | null;
  category: string | null;
  parent_id: number | null;
  // Newest line from the task's update thread — undefined when the row came back
  // from a mutation rather than a read.
  last_update?: string | null;
  last_update_by?: UpdateAuthor | null;
  last_update_at?: string | null;
};

/**
 * The lanes a task can sit in, as a single word. `working_now` is the
 * in-progress set (capped at WORKING_LIMIT), `waiting` is blocked on someone
 * else, `up_next` is everything else that isn't done.
 */
export type TaskStatus = "working_now" | "waiting" | "up_next" | "done";

export function taskStatus(t: Pick<TaskRow, "completed" | "in_progress" | "waiting">): TaskStatus {
  if (t.completed) return "done";
  if (t.in_progress) return "working_now";
  if (t.waiting) return "waiting";
  return "up_next";
}

/** What `list_tasks` can ask for. */
export type TaskFilter = TaskStatus | "open" | "all";

/**
 * Reads the task list. `open` (the default) is everything not finished;
 * `done` is only what was completed today, since older history is noise.
 */
export async function listTasks(filter: TaskFilter = "open", limit = 100): Promise<TaskRow[]> {
  const sql = getDb();
  const capped = Math.min(Math.max(Number(limit) || 100, 1), 200);
  // Written out per filter rather than interpolated: the neon client only
  // parameterises values, so a WHERE clause can't be built from a string.
  const rows =
    filter === "working_now"
      ? await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)} WHERE completed = FALSE AND in_progress = TRUE
          ORDER BY timer_started_at DESC NULLS LAST, priority DESC, created_at DESC LIMIT ${capped}`
      : filter === "waiting"
        ? await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)} WHERE completed = FALSE AND waiting = TRUE
            ORDER BY priority DESC, created_at DESC LIMIT ${capped}`
        : filter === "up_next"
          ? await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)}
              WHERE completed = FALSE AND in_progress = FALSE AND waiting = FALSE
              ORDER BY task_number ASC NULLS LAST, priority DESC, created_at DESC LIMIT ${capped}`
          : filter === "done"
            ? await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)} WHERE completed_at::date = CURRENT_DATE
                ORDER BY completed_at DESC LIMIT ${capped}`
            : filter === "all"
              ? await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)}
                  ORDER BY completed ASC, in_progress DESC, waiting DESC, priority DESC, created_at DESC LIMIT ${capped}`
              : await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)} WHERE completed = FALSE
                  ORDER BY in_progress DESC, waiting DESC, priority DESC, created_at DESC LIMIT ${capped}`;
  return rows as TaskRow[];
}

export async function getTask(id: number | string): Promise<TaskRow | null> {
  const sql = getDb();
  const [row] = await sql`SELECT ${sql.unsafe(TASK_READ_COLUMNS)} FROM todos ${sql.unsafe(LATEST_UPDATE_JOIN)} WHERE id = ${id}`;
  return (row as TaskRow) ?? null;
}

/** Seconds banked plus whatever the running timer has accrued so far. */
export function elapsedSeconds(t: Pick<TaskRow, "time_spent_seconds" | "timer_started_at">): number {
  const running = t.timer_started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(t.timer_started_at).getTime()) / 1000))
    : 0;
  return (t.time_spent_seconds ?? 0) + running;
}

export type TaskMutation = { ok: true; task: TaskRow } | { ok: false; error: string };

/**
 * Start working on a task: moves it into "working on now" and starts its timer.
 * Fails when the five working-now slots are already taken, same as the UI.
 */
export async function startTask(id: number | string): Promise<TaskMutation> {
  const sql = getDb();
  const existing = await getTask(id);
  if (!existing) return { ok: false, error: "No task with that id." };
  if (existing.completed) return { ok: false, error: "That task is already completed." };
  if (!(await hasWorkingSlot(sql, id))) return { ok: false, error: WORKING_LIMIT_MESSAGE };
  const [row] = await sql`
    UPDATE todos
    SET in_progress = TRUE, waiting = FALSE, timer_started_at = COALESCE(timer_started_at, NOW())
    WHERE id = ${id}
    RETURNING ${sql.unsafe(TASK_COLUMNS)}
  `;
  return { ok: true, task: row as TaskRow };
}

/**
 * Stop the timer on a task, banking the elapsed time. `moveTo` optionally moves
 * it out of "working on now" — to `up_next`, or to `waiting` when it's blocked
 * on someone else. Omitting it just pauses the clock.
 */
export async function stopTask(
  id: number | string,
  moveTo?: "up_next" | "waiting",
): Promise<TaskMutation> {
  const sql = getDb();
  const existing = await getTask(id);
  if (!existing) return { ok: false, error: "No task with that id." };
  const leaveWorking = moveTo !== undefined;
  const [row] = await sql`
    UPDATE todos
    SET time_spent_seconds = time_spent_seconds + CASE
          WHEN timer_started_at IS NULL THEN 0
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int
        END,
        timer_started_at = NULL,
        in_progress = CASE WHEN ${leaveWorking}::boolean THEN FALSE ELSE in_progress END,
        waiting = CASE WHEN ${moveTo === "waiting"}::boolean THEN TRUE ELSE waiting END
    WHERE id = ${id}
    RETURNING ${sql.unsafe(TASK_COLUMNS)}
  `;
  return { ok: true, task: row as TaskRow };
}

/** Local date, not UTC — toISOString() would roll the day over in the evening here. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextDueDate(recurrence: string): string {
  const today = new Date();
  if (recurrence === "daily") today.setDate(today.getDate() + 1);
  else if (recurrence === "weekly") today.setDate(today.getDate() + 7);
  else if (recurrence === "monthly") today.setMonth(today.getMonth() + 1);
  return today.toISOString().split("T")[0];
}

export type CompleteResult =
  | { ok: false; error: string }
  | {
      ok: true;
      recurring: boolean;
      next_due: string | null;
      repeated: TaskRow | null;
      calendar_event_id: string | null;
    };

/**
 * Cross a task off. Banks any running timer, plots a done-block onto Google
 * Calendar, and — with `repeat` (tomorrow) or `followUpDays` (any number of days
 * out) — lines the same work up again for later. A recurring task rolls its due
 * date forward instead of being marked done.
 */
export async function completeTask(
  id: number | string,
  { repeat = false, followUpDays }: { repeat?: boolean; followUpDays?: number | null } = {},
): Promise<CompleteResult> {
  // "Done & repeat tomorrow" is just the one-day case of a follow-up.
  const followUp = followUpDays != null && followUpDays > 0 ? Math.round(followUpDays) : repeat ? 1 : null;
  const sql = getDb();
  const [todo] = await sql`SELECT recurrence FROM todos WHERE id = ${id}`;
  if (!todo) return { ok: false, error: "No task with that id." };

  // Completing a task banks any running timer into time_spent_seconds.
  await sql`
    UPDATE todos
    SET time_spent_seconds = time_spent_seconds + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int,
        timer_started_at = NULL
    WHERE id = ${id} AND timer_started_at IS NOT NULL
  `;

  // Read back after banking the timer so the calendar block reflects the final time.
  const [finished] = await sql`
    SELECT title, time_spent_seconds, estimated_minutes, category FROM todos WHERE id = ${id}
  `;

  const recurring = Boolean(todo.recurrence && todo.recurrence !== "none");
  let next_due: string | null = null;
  if (recurring) {
    // A recurring task already comes back on its own — a follow-up just pulls that
    // next occurrence forward (or pushes it out) instead of spawning a duplicate row.
    next_due = followUp !== null ? daysFromNow(followUp) : nextDueDate(todo.recurrence as string);
    await sql`UPDATE todos SET due_date = ${next_due}, completed_at = NOW(), in_progress = FALSE WHERE id = ${id}`;
  } else {
    // A finished task gives up its queue slot.
    await sql`UPDATE todos SET completed = TRUE, completed_at = NOW(), in_progress = FALSE, task_number = NULL WHERE id = ${id}`;
  }

  // Plot the finished work onto Google Calendar so past weeks can be audited.
  // Best-effort: a null event id just means nothing was written.
  const category = normalizeCategory(finished?.category);
  const eventId = await logCompletedTaskToCalendar({
    title: (finished?.title as string) ?? "Task",
    time_spent_seconds: finished?.time_spent_seconds as number | undefined,
    estimated_minutes: finished?.estimated_minutes as number | undefined,
    categoryLabel: category ? TASK_CATEGORY_LABELS[category] : null,
  });
  if (eventId) {
    await sql`UPDATE todos SET calendar_event_id = ${eventId} WHERE id = ${id}`;
  }

  // A one-off task asked to repeat gets a fresh copy of itself dated N days out:
  // same title, priority, estimate, category, lane and card colour, but a clean
  // timer and no queue slot. The original stays completed so today's record —
  // and its calendar block — survives.
  let repeated: TaskRow | null = null;
  if (followUp !== null && !recurring) {
    const [source] = await sql`
      SELECT title, priority, estimated_minutes, category, parent_id, canvas_x, canvas_y, color
      FROM todos WHERE id = ${id}
    `;
    if (source) {
      const [row] = await sql`
        INSERT INTO todos (title, priority, due_date, recurrence, estimated_minutes, category, parent_id, canvas_x, canvas_y, color)
        VALUES (${source.title}, ${source.priority}, ${daysFromNow(followUp)}, 'none', ${source.estimated_minutes}, ${source.category}, ${source.parent_id}, ${source.canvas_x}, ${source.canvas_y}, ${source.color})
        RETURNING ${sql.unsafe(TASK_COLUMNS)}
      `;
      repeated = (row as TaskRow) ?? null;
    }
  }

  return { ok: true, recurring, next_due, repeated, calendar_event_id: eventId };
}

/** What a caller can set when putting a new task on the board. */
export type NewTask = {
  title: string;
  priority?: string | null;
  due_date?: string | null;
  recurrence?: string | null;
  estimated_minutes?: number | null;
  category?: string | null;
};

/**
 * Puts a new task in the queue ('up_next'). Deliberately narrow: no canvas
 * position (the board auto-places anything created off-canvas), no parent, and
 * never straight into 'working now' — starting work is start_task's job.
 */
export async function createTask(input: NewTask): Promise<TaskMutation> {
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "A task needs a title." };

  const sql = getDb();
  const estimate =
    input.estimated_minutes === null || input.estimated_minutes === undefined
      ? null
      : Math.max(1, Math.trunc(input.estimated_minutes));
  const [row] = await sql`
    INSERT INTO todos (title, priority, due_date, recurrence, estimated_minutes, category)
    VALUES (${title}, ${input.priority ?? "normal"}, ${input.due_date ?? null},
            ${input.recurrence ?? "none"}, ${estimate}, ${normalizeCategory(input.category) ?? null})
    RETURNING ${sql.unsafe(TASK_COLUMNS)}
  `;
  return { ok: true, task: row as TaskRow };
}
