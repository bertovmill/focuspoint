/**
 * Replaces the meal bank with Tony Robbins–style meals (2026-10-23) and gives
 * each one a photo, then re-plans the coming week from the new bank.
 *
 *   node --env-file=.env.local scripts/robbins-meal-bank.mjs [https://cael.bertomill.com]
 *
 * Every meal keeps the four rules in lib/nutrition.ts: mostly water-rich food,
 * never animal protein with starch, greens first, and fruit alone (Meal 1 is
 * always fruit). Old bank meals are archived, not deleted. Photos go through
 * the deployed app, which holds the AI Gateway credentials (see
 * backfill-nutrition-art.mjs). Idempotent: meals already in the bank by name
 * are left alone, and only missing photos are generated.
 */
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "https://cael.bertomill.com";
const cookie = `cael_session=${process.env.BASIC_AUTH_PASSWORD}`;
const sql = neon(process.env.DATABASE_URL);

const MEALS = [
  // Meal 1 — fruit alone, on an empty stomach
  { slot: "meal1", name: "Mango, papaya & lime plate", description: "Ripe mango and papaya, sliced and squeezed with lime. Nothing else.", ingredients: ["Mango", "Papaya", "Lime"] },
  { slot: "meal1", name: "Watermelon & mint", description: "Big chilled wedges of watermelon torn with fresh mint — the most water-rich start there is.", ingredients: ["Watermelon", "Mint"] },
  { slot: "meal1", name: "Berry bowl", description: "Blueberries, raspberries and strawberries, piled high and eaten slowly.", ingredients: ["Blueberries", "Raspberries", "Strawberries"] },
  { slot: "meal1", name: "Pineapple & kiwi", description: "Fresh pineapple spears and halved golden kiwi.", ingredients: ["Pineapple", "Golden kiwi"] },
  { slot: "meal1", name: "Green juice & melon", description: "Celery, cucumber, apple and lemon juice, then a plate of honeydew and cantaloupe.", ingredients: ["Celery", "Cucumber", "Green apple", "Lemon", "Honeydew", "Cantaloupe"] },
  { slot: "meal1", name: "Citrus salad", description: "Blood orange, grapefruit and navel orange rounds with a few pomegranate seeds.", ingredients: ["Blood orange", "Grapefruit", "Navel orange", "Pomegranate"] },

  // Meal 2 — big water-rich plates: vegetables with protein OR with starch
  { slot: "meal2", name: "Rainbow chopped salad with grilled chicken", description: "Romaine, cucumber, tomato, peppers and radish with sliced grilled chicken and a lemon-olive oil dressing. No bread.", ingredients: ["Chicken breast", "Romaine", "Cucumber", "Cherry tomatoes", "Peppers", "Radish", "Lemon", "Olive oil"] },
  { slot: "meal2", name: "Avocado & sprout power salad", description: "Spinach, sprouts, cucumber and avocado with pumpkin seeds and a lemon-tahini drizzle.", ingredients: ["Spinach", "Alfalfa sprouts", "Cucumber", "Avocado", "Pumpkin seeds", "Tahini", "Lemon"] },
  { slot: "meal2", name: "Niçoise-style salmon salad (no potato)", description: "Flaked salmon, green beans, soft eggs, olives and tomatoes over butter lettuce.", ingredients: ["Salmon fillets", "Green beans", "Eggs", "Kalamata olives", "Cherry tomatoes", "Butter lettuce", "Dijon mustard", "Olive oil"] },
  { slot: "meal2", name: "Quinoa & roasted vegetable bowl", description: "Warm quinoa with roasted zucchini, peppers and red onion on a bed of arugula — starch and veg, no meat.", ingredients: ["Quinoa", "Zucchini", "Peppers", "Red onion", "Arugula", "Olive oil", "Lemon"] },
  { slot: "meal2", name: "Gazpacho with cucumber salad", description: "Chilled blended tomato, cucumber and pepper soup with a crisp cucumber-dill salad.", ingredients: ["Tomatoes", "Cucumber", "Peppers", "Garlic", "Red onion", "Dill", "Olive oil", "Sherry vinegar"] },
  { slot: "meal2", name: "Lettuce-wrap turkey tacos", description: "Spiced ground turkey in butter lettuce cups with pico de gallo, avocado and lime. No tortillas.", ingredients: ["Ground turkey", "Butter lettuce", "Tomatoes", "Red onion", "Cilantro", "Avocado", "Lime", "Cumin"] },
  { slot: "meal2", name: "Sweet potato & kale bowl", description: "Roasted sweet potato, massaged kale, red cabbage and avocado with a lime dressing.", ingredients: ["Sweet potato", "Kale", "Red cabbage", "Avocado", "Lime", "Olive oil"] },
  { slot: "meal2", name: "Greek salad with grilled shrimp", description: "Tomato, cucumber, pepper, red onion and olives with garlicky grilled shrimp. No pita.", ingredients: ["Shrimp", "Tomatoes", "Cucumber", "Peppers", "Red onion", "Kalamata olives", "Oregano", "Olive oil"] },
  { slot: "meal2", name: "Thai crunch salad", description: "Shredded cabbage, carrot, edamame, cucumber and herbs with a lime-ginger dressing.", ingredients: ["Napa cabbage", "Carrots", "Edamame", "Cucumber", "Cilantro", "Mint", "Ginger", "Lime"] },

  // Meal 3 — evening plates, same rule: protein + veg, or starch + veg
  { slot: "meal3", name: "Lemon-herb salmon with asparagus", description: "Pan-seared salmon with roasted asparagus and a big green salad. No rice.", ingredients: ["Salmon fillets", "Asparagus", "Lemon", "Dill", "Mixed greens", "Olive oil"] },
  { slot: "meal3", name: "Zucchini noodles with turkey meatballs", description: "Spiralised zucchini, fresh tomato-basil sauce and baked turkey meatballs. No pasta.", ingredients: ["Zucchini", "Ground turkey", "Tomatoes", "Basil", "Garlic", "Olive oil"] },
  { slot: "meal3", name: "Roasted vegetable & chickpea tray", description: "Cauliflower, carrots, red onion and chickpeas roasted with cumin, over spinach with tahini.", ingredients: ["Cauliflower", "Carrots", "Red onion", "Chickpeas", "Spinach", "Tahini", "Cumin"] },
  { slot: "meal3", name: "Grilled chicken with broccolini & greens", description: "Herb-marinated chicken thighs with charred broccolini and an arugula salad.", ingredients: ["Chicken thighs", "Broccolini", "Arugula", "Lemon", "Garlic", "Rosemary", "Olive oil"] },
  { slot: "meal3", name: "Stuffed bell peppers with wild rice", description: "Peppers filled with wild rice, mushrooms, spinach and herbs, with a side of greens. No meat.", ingredients: ["Peppers", "Wild rice", "Mushrooms", "Spinach", "Onion", "Parsley", "Mixed greens"] },
  { slot: "meal3", name: "Cod in tomato & fennel broth", description: "Flaky cod poached in a light tomato-fennel broth with green beans.", ingredients: ["Cod fillets", "Fennel", "Tomatoes", "Garlic", "Green beans", "Parsley", "Olive oil"] },
  { slot: "meal3", name: "Big green vegetable curry", description: "Coconut curry with spinach, zucchini, green beans and peas over cauliflower rice.", ingredients: ["Spinach", "Zucchini", "Green beans", "Peas", "Cauliflower", "Coconut milk", "Green curry paste", "Lime"] },
  { slot: "meal3", name: "Steak salad with chimichurri", description: "Sliced grilled flank steak over romaine, tomatoes and cucumber with chimichurri. No potatoes.", ingredients: ["Flank steak", "Romaine", "Tomatoes", "Cucumber", "Parsley", "Garlic", "Red wine vinegar", "Olive oil"] },
  { slot: "meal3", name: "Minestrone verde", description: "Brothy spring vegetable soup — zucchini, leeks, peas, white beans and kale with pesto.", ingredients: ["Zucchini", "Leeks", "Peas", "Cannellini beans", "Kale", "Basil", "Vegetable broth"] },
];

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

await sql`ALTER TABLE nutrition_recipes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;

const names = MEALS.map((m) => m.name);
const archived = await sql`
  UPDATE nutrition_recipes SET archived_at = NOW()
  WHERE archived_at IS NULL AND NOT (name = ANY(${names})) RETURNING id
`;
console.log(`archived ${archived.length} old bank meals`);

const have = new Set((await sql`SELECT name FROM nutrition_recipes WHERE archived_at IS NULL`).map((r) => r.name));
let added = 0;
for (const m of MEALS) {
  if (have.has(m.name)) continue;
  await sql`
    INSERT INTO nutrition_recipes (name, description, slot, ingredients)
    VALUES (${m.name}, ${m.description}, ${m.slot}, ${m.ingredients})
  `;
  added++;
}
console.log(`added ${added} Robbins meals`);

const missing = await sql`SELECT id, name FROM nutrition_recipes WHERE archived_at IS NULL AND image_url IS NULL ORDER BY id`;
console.log(`${missing.length} need a photo (→ ${BASE})`);
for (const r of missing) {
  process.stdout.write(`  ${r.name} … `);
  try {
    await api(`/api/nutrition/recipes/${r.id}/image`, { method: "POST" });
    console.log("ok");
  } catch (err) {
    console.log(`FAILED — ${err.message}`);
  }
}

// Re-plan today and the next six days from the new bank. Only the plan cells
// are replaced; anything already logged as eaten stays.
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
await sql`DELETE FROM meal_recommendations WHERE meal_date >= ${today}`;
const cells = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  const date = d.toISOString().slice(0, 10);
  for (const slot of ["meal1", "meal2", "meal3"]) cells.push({ date, slot });
}
const out = await api("/api/nutrition/plan/fill", { method: "POST", body: JSON.stringify({ cells }) });
console.log(`planned ${out.filled.length} sittings from ${today}`);

process.stdout.write("rule art … ");
try {
  const r = await api("/api/nutrition/rule-art", { method: "POST", body: "{}" });
  console.log(`generated ${r.generated.join(", ") || "nothing"}`);
} catch (err) {
  console.log(`FAILED — ${err.message}`);
}
