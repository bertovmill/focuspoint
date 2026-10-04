// Meals went from lunch/snack/dinner to Meal 1–3 + an optional snack on
// 2026-10-04. Old lunch/dinner rows already fall outside the grid; this moves
// the old AI-era snacks to 'archived_snack' too, so past weeks start clean. Rows
// are kept (an archive), only relabelled. Idempotent — safe to re-run.
//   node --env-file=.env.local scripts/meals-numbered-migrate.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const plans = await sql`
  UPDATE meal_recommendations SET slot = 'archived_snack'
  WHERE slot = 'snack' AND meal_date < '2026-10-04'
  RETURNING id
`;
const logs = await sql`
  UPDATE nutrition_meals SET slot = 'archived_snack'
  WHERE slot = 'snack' AND eaten_date < '2026-10-04'
  RETURNING id
`;
console.log(`Archived ${plans.length} planned and ${logs.length} logged snacks.`);
