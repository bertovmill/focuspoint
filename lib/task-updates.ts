import { getDb } from "@/lib/db";

// Progress notes on a task. The point of these is the hand-off: an agent working
// a task over MCP posts a line when it finishes an intermediary step and needs
// Berto to take the next one, so the board itself tells him rather than the note
// living in some session transcript he's not looking at.
//
// The full thread is kept in `task_updates` (see lib/db.ts); every list of tasks
// carries only the newest line, because that's all a card has room for.

/** Who wrote the update — Berto himself, or an agent working the task. */
export const UPDATE_AUTHORS = ["me", "agent"] as const;
export type UpdateAuthor = (typeof UPDATE_AUTHORS)[number];

export function normalizeAuthor(value: unknown): UpdateAuthor {
  return value === "agent" ? "agent" : "me";
}

export type TaskUpdate = {
  id: number;
  task_id: number;
  body: string;
  author: UpdateAuthor;
  created_at: string;
};

/** The newest update on a task, flattened onto the task row itself. */
export type LatestUpdate = {
  last_update: string | null;
  last_update_by: UpdateAuthor | null;
  last_update_at: string | null;
};

// Both halves of "give me each task's newest update" as raw SQL, so every place
// that lists tasks (lib/tasks.ts, /api/todos) joins it the same way. The lateral
// aliases its columns so nothing collides with todos.created_at in the SELECT.
export const LATEST_UPDATE_JOIN = `LEFT JOIN LATERAL (
  SELECT body AS last_update, author AS last_update_by, created_at AS last_update_at
  FROM task_updates WHERE task_id = todos.id
  ORDER BY created_at DESC, id DESC LIMIT 1
) latest ON TRUE`;
export const LATEST_UPDATE_COLUMNS = `latest.last_update, latest.last_update_by, latest.last_update_at`;

export type NewUpdateResult = { ok: true; update: TaskUpdate } | { ok: false; error: string };

/** Post a note onto a task's thread. Fails if the task isn't there. */
export async function addTaskUpdate(
  taskId: number | string,
  body: string,
  author: UpdateAuthor = "me",
): Promise<NewUpdateResult> {
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "An update needs some text." };
  const sql = getDb();
  const [task] = await sql`SELECT id FROM todos WHERE id = ${taskId}`;
  if (!task) return { ok: false, error: "No task with that id." };
  const [row] = await sql`
    INSERT INTO task_updates (task_id, body, author)
    VALUES (${taskId}, ${text}, ${normalizeAuthor(author)})
    RETURNING id, task_id, body, author, created_at
  `;
  return { ok: true, update: row as TaskUpdate };
}

/** The whole thread on one task, newest first. */
export async function listTaskUpdates(taskId: number | string, limit = 50): Promise<TaskUpdate[]> {
  const sql = getDb();
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await sql`
    SELECT id, task_id, body, author, created_at FROM task_updates
    WHERE task_id = ${taskId}
    ORDER BY created_at DESC, id DESC LIMIT ${capped}
  `;
  return rows as TaskUpdate[];
}
