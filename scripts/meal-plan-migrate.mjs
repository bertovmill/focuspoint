// Adds the meal-plan columns and the recipe library to the live Neon DB.
// Mirrors the block in lib/db.ts ensureSchema(). Idempotent — safe to re-run.
//   node --env-file=.env.local scripts/meal-plan-migrate.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE meal_recommendations ADD COLUMN IF NOT EXISTS protein_g NUMERIC`;
await sql`ALTER TABLE meal_recommendations ADD COLUMN IF NOT EXISTS kcal INTEGER`;
await sql`ALTER TABLE meal_recommendations ADD COLUMN IF NOT EXISTS ingredients TEXT[] NOT NULL DEFAULT '{}'`;
await sql`ALTER TABLE meal_recommendations ADD COLUMN IF NOT EXISTS recipe_id INTEGER`;
await sql`ALTER TABLE nutrition_meals ADD COLUMN IF NOT EXISTS protein_g NUMERIC`;
await sql`ALTER TABLE nutrition_meals ADD COLUMN IF NOT EXISTS kcal INTEGER`;
await sql`
  CREATE TABLE IF NOT EXISTS nutrition_recipes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    slot TEXT,
    protein_g NUMERIC,
    kcal INTEGER,
    ingredients TEXT[] NOT NULL DEFAULT '{}',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM nutrition_recipes`;
console.log(`meal-plan migration done; ${count} recipe(s) in the library`);
