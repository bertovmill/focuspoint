import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Whether a task is featured in the pinned window. Removing it from there doesn't
// change what the task *is* — it stays an ordinary task on the board, in the same
// lane, at the same priority. It just stops taking up one of the pinned slots so
// the next thing can move up.
//
// PUT { pinned: false } removes it; { pinned: true } puts it back. Starting the
// task again (start_task, the timer, the working-now toggle) also clears the flag —
// working on something is the clearest possible statement that it belongs up there.

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { pinned } = await req.json();
    const sql = getDb();
    if (pinned === false) {
      // A task being taken off the pinned window shouldn't keep a timer running or
      // hold a working-now slot — those are exactly what the window is for.
      const [row] = await sql`
        UPDATE todos
        SET pinned_hidden_at = NOW(),
            in_progress = FALSE,
            time_spent_seconds = time_spent_seconds + CASE
              WHEN timer_started_at IS NULL THEN 0
              ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int
            END,
            timer_started_at = NULL
        WHERE id = ${id}
        RETURNING id, pinned_hidden_at, in_progress, time_spent_seconds, timer_started_at
      `;
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(row);
    }
    const [row] = await sql`
      UPDATE todos SET pinned_hidden_at = NULL WHERE id = ${id}
      RETURNING id, pinned_hidden_at, in_progress, time_spent_seconds, timer_started_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update the pinned window" }, { status: 500 });
  }
}
