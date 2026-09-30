import { after, NextResponse } from "next/server";
import { suggestMeal } from "@/lib/meal-suggest";
import { MEAL_SLOT_KEYS, type MealSlot } from "@/lib/nutrition";
import { getFillJob, hasPlannedMeal, saveFillJob, type FillJob } from "@/lib/nutrition-plan";

// The fill keeps running in after() once the response is sent; a full week is
// at most 21 text-only dishes, three at a time, well inside this.
export const maxDuration = 300;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET   progress of the latest fill ({ running, total, done, failed } or null)
export async function GET() {
  try {
    return NextResponse.json(await getFillJob());
  } catch {
    return NextResponse.json(null);
  }
}

// POST { cells: [{ date, slot }], today }   starts filling those cells in the
// background and returns at once. Photos only for `today`, same as one cell.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const today = String(body?.today ?? "");
  const cells = (Array.isArray(body?.cells) ? body.cells : []).filter(
    (c: { date?: unknown; slot?: unknown }) => ISO.test(String(c?.date)) && MEAL_SLOT_KEYS.includes(String(c?.slot)),
  ) as { date: string; slot: MealSlot }[];
  if (cells.length === 0) return NextResponse.json({ error: "No cells to fill" }, { status: 400 });
  if (cells.length > 21) return NextResponse.json({ error: "Too many cells" }, { status: 400 });

  const current = await getFillJob();
  if (current?.running) return NextResponse.json(current, { status: 409 });

  const job: FillJob = { total: cells.length, done: 0, failed: 0, started_at: new Date().toISOString(), finished_at: null };
  await saveFillJob(job);

  after(async () => {
    const queue = [...cells];
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift()!;
        try {
          // Skip a cell filled by hand (or by another run) since the button was pressed.
          if (!(await hasPlannedMeal(c.date, c.slot))) {
            await suggestMeal(c.slot, c.date, { withImage: c.date === today });
          }
        } catch (err) {
          console.error("[api/nutrition/plan/fill]", c, err);
          job.failed++;
        }
        job.done++;
        await saveFillJob(job).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, cells.length) }, worker));
    job.finished_at = new Date().toISOString();
    await saveFillJob(job).catch(() => {});
  });

  return NextResponse.json({ ...job, running: true }, { status: 202 });
}
