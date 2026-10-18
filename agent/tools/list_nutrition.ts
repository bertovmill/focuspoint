import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { isOnProtocol, todayISO, weekStartISO, addDaysISO } from "../../lib/nutrition";
import { getPlanRange, getProteinTarget, proteinEatenOn } from "../../lib/nutrition-plan";

export default defineTool({
  description:
    "Read the user's nutrition record: recently logged meals (with protein where known), today's protein eaten vs his target, this week's meal plan from /nutrition/plan, how many of the last N days were fully on protocol, and the standing shelf of energy staples. Use before suggesting what to eat or shop for, so suggestions build on foods that already work for them.",
  inputSchema: z.object({
    days: z.number().int().positive().max(180).optional().describe("How far back to look. Defaults to 30."),
  }),
  async execute({ days }) {
    const window = days ?? 30;
    const sql = getDb();
    const meals = await sql`
      SELECT name, notes, felt_good, eaten_date, protein_g, kcal
      FROM nutrition_meals
      WHERE eaten_date >= CURRENT_DATE - ${window}::int
      ORDER BY eaten_date DESC, created_at DESC
      LIMIT 60
    `;
    const dayRows = await sql`
      SELECT logged_date, rules FROM nutrition_days
      WHERE logged_date >= CURRENT_DATE - ${window}::int
      ORDER BY logged_date DESC
    `;
    const staples = await sql`SELECT name, why FROM nutrition_staples ORDER BY sort_order ASC, created_at ASC`;
    const plan = await sql`
      SELECT slot, name, feedback FROM meal_recommendations WHERE meal_date = CURRENT_DATE
    `;
    const onProtocol = dayRows.filter((d) => isOnProtocol(d.rules as string[])).length;
    const today = todayISO();
    const weekStart = weekStartISO(today);
    const [protein_target_g, protein_eaten_today_g, week_plan] = await Promise.all([
      getProteinTarget(),
      proteinEatenOn(today),
      getPlanRange(weekStart, addDaysISO(weekStart, 6)),
    ]);
    return {
      window,
      protein_target_g,
      protein_eaten_today_g,
      week_plan: week_plan.map((p) => ({ date: p.meal_date, slot: p.slot, name: p.name, protein_g: p.protein_g, kcal: p.kcal })),
      meals: meals.map((m) => ({ ...m, eaten_date: String(m.eaten_date).slice(0, 10) })),
      plan,
      days_logged: dayRows.length,
      days_on_protocol: onProtocol,
      staples,
    };
  },
  toModelOutput(output) {
    const meals = output.meals as { name: string; eaten_date: string; felt_good: boolean }[];
    const staples = output.staples as { name: string; why: string | null }[];
    const plan = output.plan as { slot: string; name: string; feedback: string | null }[];
    const lines = [
      plan.length
        ? `Today's plan: ${plan.map((p) => `${p.slot} — ${p.name}${p.feedback ? ` (${p.feedback})` : ""}`).join("; ")}`
        : "No meal plan for today yet.",
      "",
      `Last ${output.window} days: ${output.days_on_protocol}/${output.days_logged} logged days fully on protocol.`,
      "",
      meals.length ? `Meals (${meals.length}):` : "No meals logged.",
      ...meals.map((m) => `- ${m.eaten_date} ${m.name}${m.felt_good ? "" : " (felt off)"}`),
      "",
      `Staples: ${staples.map((s) => s.name).join(", ") || "none"}`,
    ];
    return { type: "text", value: lines.join("\n") };
  },
});
