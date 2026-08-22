// Creates the nutrition tables on the live Neon DB and seeds the staples shelf
// from the foods Berto already named in his notes. Idempotent — safe to re-run.
//   node --env-file=.env.local scripts/nutrition-migrate.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS nutrition_meals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    notes TEXT,
    felt_good BOOLEAN NOT NULL DEFAULT TRUE,
    eaten_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS nutrition_meals_date_idx ON nutrition_meals (eaten_date DESC)`;
await sql`
  CREATE TABLE IF NOT EXISTS nutrition_staples (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    why TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS nutrition_days (
    logged_date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    rules TEXT[] NOT NULL DEFAULT '{}',
    note TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`ALTER TABLE nutrition_meals ADD COLUMN IF NOT EXISTS slot TEXT`;
await sql`ALTER TABLE nutrition_staples ADD COLUMN IF NOT EXISTS image_url TEXT`;
await sql`ALTER TABLE meal_recommendations ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'dinner'`;
await sql`ALTER TABLE meal_recommendations DROP CONSTRAINT IF EXISTS meal_recommendations_meal_date_key`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS meal_recommendations_date_slot_key ON meal_recommendations (meal_date, slot)`;

// Seeded from thoughts 128, 77, 136, 133, 125, 147, 122 — every "why" is his own.
const STAPLES = [
  ["Dark chocolate", "Afternoon superpower. Calms the nerves, flavonoids + a little caffeine, no blood-sugar spike."],
  ["Avocado", "Ultimate fuel for mental performance. Fat slows digestion and holds the line."],
  ["Ginger", "One of the two ultimate immune boosters. Non-negotiable on every grocery run."],
  ["Garlic", "The other one. Buy it every time."],
  ["Beans", "Great for digestion and satiety — should show up more often."],
  ["Lentils", "Whole-food protein that keeps without any planning."],
  ["Sweet potato", "Slow carb for the evening meal."],
  ["Zucchini", "Bulk for a whole-food dinner."],
  ["Broccoli", "Fibre — the third leg of protein + fat + fibre."],
  ["Brown rice", "Kept at home. The base of a real dinner."],
  ["Almonds", "Snack that doesn't spike anything."],
  ["Frozen raspberries", "Fruit without the run to the store."],
  ["Apple cider vinegar", "Daily habit."],
  ["Pumpernickel bread", "Dense, slow, holds up to anything on top."],
  ["Pita bread", "Such an asset in the kitchen — you can put anything in it."],
];

for (const [i, [name, why]] of STAPLES.entries()) {
  await sql`
    INSERT INTO nutrition_staples (name, why, sort_order)
    VALUES (${name}, ${why}, ${i})
    ON CONFLICT (name) DO NOTHING
  `;
}

const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM nutrition_staples`;
console.log(`nutrition tables ready — ${count} staples on the shelf`);
