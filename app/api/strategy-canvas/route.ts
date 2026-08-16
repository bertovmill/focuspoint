import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// The strategy board that sits above the task notebook: its own never-ending
// Excalidraw scene, stored in the same `task_canvas` table as the task board but
// under a different row, so the two are completely independent surfaces.
// Row 1 = the task notebook (see /api/task-canvas), row 2 = this.
const CANVAS_ID = 2;

const EMPTY_SCENE = { elements: [], appState: {}, files: {} };

export async function GET() {
  try {
    const sql = getDb();
    const [row] = await sql`SELECT scene, updated_at FROM task_canvas WHERE id = ${CANVAS_ID}`;
    // `updated_at: null` means the row has never been written — the client reads that
    // as "seed me with the starting flywheel" rather than opening a blank board.
    return NextResponse.json({ scene: row?.scene ?? EMPTY_SCENE, updated_at: row?.updated_at ?? null });
  } catch {
    // A missing table or an unreachable DB shouldn't stop the board from opening.
    // Report it as "already saved" so a blip can't overwrite real work with the seed.
    return NextResponse.json({ scene: EMPTY_SCENE, updated_at: new Date().toISOString() });
  }
}

export async function PUT(req: Request) {
  try {
    const { scene } = await req.json();
    if (!scene || typeof scene !== "object") {
      return NextResponse.json({ error: "scene required" }, { status: 400 });
    }
    const sql = getDb();
    await sql`
      INSERT INTO task_canvas (id, scene, updated_at) VALUES (${CANVAS_ID}, ${JSON.stringify(scene)}, NOW())
      ON CONFLICT (id) DO UPDATE SET scene = EXCLUDED.scene, updated_at = NOW()
    `;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save strategy board" }, { status: 500 });
  }
}
