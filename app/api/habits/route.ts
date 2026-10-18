import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getHabitsToday, setHabit } from "@/lib/habits";

// The core-habits checklist under the scorecard — see lib/habits.ts. Unscored on purpose.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getHabitsToday(getDb()));
  } catch (err) {
    console.error("habits read failed:", err);
    return NextResponse.json({ error: "Failed to load habits" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sql = getDb();

    if (typeof body.meditate === "boolean") await setHabit(sql, "meditate", body.meditate);
    if (typeof body.window === "boolean") await setHabit(sql, "window", body.window);

    return NextResponse.json(await getHabitsToday(sql));
  } catch (err) {
    console.error("habits write failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
