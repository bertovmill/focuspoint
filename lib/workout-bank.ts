// The workout bank: every structured workout he repeats, stored as one JSON
// definition per row so it can be edited from /training/workouts (or by Cael)
// without a deploy. Seeded on first read from SEED_WORKOUTS in
// lib/workout-templates.ts. Sessions on the calendar point at a bank workout by
// `training_sessions.workout_slug`; logs are keyed by slug + exercise key, so
// renaming a workout or an exercise keeps its history.
import { getDb } from "./db";
import { addDaysISO, todayISO, weekStartISO } from "./nutrition";
import { SESSION_TYPE_KEYS, minutesAtPace } from "./training";
import { RFE_SPLIT_SQUAT, SEED_WORKOUTS, normalizeTemplate, type WorkoutTemplate } from "./workout-templates";

let ready = false;
async function ensureBank() {
  if (ready) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_bank (
      slug TEXT PRIMARY KEY,
      position INTEGER NOT NULL DEFAULT 0,
      definition JSONB NOT NULL,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS workout_slug TEXT`;
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM workout_bank`;
  if (n === 0) {
    for (const [i, w] of SEED_WORKOUTS.entries()) {
      await sql`INSERT INTO workout_bank (slug, position, definition) VALUES (${w.slug}, ${i}, ${JSON.stringify(w)}) ON CONFLICT DO NOTHING`;
    }
    // Sessions planned before the bank existed linked by title; make that explicit once.
    await sql`UPDATE training_sessions SET workout_slug = 'unity-standard-upper-body' WHERE workout_slug IS NULL AND type = 'strength' AND title ~* 'upper[[:space:]-]*body'`;
    await sql`UPDATE training_sessions SET workout_slug = 'unity-standard-lower-body' WHERE workout_slug IS NULL AND type = 'strength' AND title ~* 'lower[[:space:]-]*body'`;
  }
  // One-time: rear-foot elevated split squats replace the wall balls on lower body
  // (Berto, 2026-10-06). Skipped once the split squat is in, so wall balls added
  // back from the editor stay.
  const [lower] = await sql`SELECT definition FROM workout_bank WHERE slug = 'unity-standard-lower-body'`;
  if (lower) {
    const def = (typeof lower.definition === "string" ? JSON.parse(lower.definition) : lower.definition) as WorkoutTemplate;
    const keys = def.blocks.flatMap((b) => b.exercises.map((e) => e.key));
    if (keys.includes("wall_balls") && !keys.includes(RFE_SPLIT_SQUAT.key)) {
      for (const b of def.blocks) b.exercises = b.exercises.map((e) => (e.key === "wall_balls" ? { ...RFE_SPLIT_SQUAT } : e));
      await sql`UPDATE workout_bank SET definition = ${JSON.stringify(def)}, updated_at = NOW() WHERE slug = 'unity-standard-lower-body'`;
    }
  }
  ready = true;
}

function shape(r: Record<string, unknown>): WorkoutTemplate {
  const def = (typeof r.definition === "string" ? JSON.parse(r.definition) : r.definition) as WorkoutTemplate;
  return normalizeTemplate({ ...def, slug: String(r.slug) });
}

export async function listWorkouts(): Promise<WorkoutTemplate[]> {
  await ensureBank();
  const rows = await getDb()`SELECT slug, definition FROM workout_bank WHERE archived = FALSE ORDER BY position ASC, slug ASC`;
  return rows.map((r) => shape(r as Record<string, unknown>));
}

/** By slug or any earlier slug it went by. Archived workouts still resolve, so old logs open. */
export async function getWorkout(slug: string): Promise<WorkoutTemplate | null> {
  await ensureBank();
  const [row] = await getDb()`
    SELECT slug, definition FROM workout_bank
    WHERE slug = ${slug} OR definition->'aliases' ? ${slug}
    ORDER BY (slug = ${slug}) DESC LIMIT 1
  `;
  return row ? shape(row as Record<string, unknown>) : null;
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workout";
}

function keyify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "exercise";
}

/**
 * Creates or replaces a workout. The slug never changes once made (URLs and logs
 * hang off it); exercise keys are kept as given and minted for new exercises, so
 * an exercise keeps its chart through renames.
 */
export async function saveWorkout(input: Partial<WorkoutTemplate> & { name: string }, slug?: string): Promise<WorkoutTemplate> {
  await ensureBank();
  const sql = getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Give the workout a name");
  const sessionType = SESSION_TYPE_KEYS.includes(input.session_type ?? "") ? input.session_type! : "strength";

  let finalSlug = slug;
  if (!finalSlug) {
    const base = slugify(name);
    finalSlug = base;
    for (let i = 2; (await sql`SELECT 1 FROM workout_bank WHERE slug = ${finalSlug}`).length; i++) finalSlug = `${base}-${i}`;
  }

  const used = new Set<string>();
  const blocks = (input.blocks ?? []).map((b, bi) => ({
    key: b.key || `block-${bi + 1}`,
    label: (b.label ?? "").trim() || `Block ${bi + 1}`,
    exercises: (b.exercises ?? []).map((e) => {
      let key = e.key || keyify(e.name);
      while (used.has(key)) key = `${key}_2`;
      used.add(key);
      return {
        ...e,
        key,
        name: (e.name ?? "").trim() || "Exercise",
        sets: Math.min(20, Math.max(1, Math.round(Number(e.sets) || 1))),
        ladder: (e.ladder ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
        weight: e.weight === null || e.weight === undefined || !Number.isFinite(Number(e.weight)) ? null : Number(e.weight),
      };
    }),
  }));
  const day = input.default_day;
  const def: WorkoutTemplate = normalizeTemplate({
    ...input,
    slug: finalSlug,
    name,
    session_type: sessionType,
    default_day: day === null || day === undefined || !(Number(day) >= 0 && Number(day) <= 6) ? null : Number(day),
    blocks,
  } as WorkoutTemplate);

  await sql`
    INSERT INTO workout_bank (slug, position, definition, updated_at)
    VALUES (${finalSlug}, (SELECT COALESCE(MAX(position), -1) + 1 FROM workout_bank), ${JSON.stringify(def)}, NOW())
    ON CONFLICT (slug) DO UPDATE SET definition = EXCLUDED.definition, archived = FALSE, updated_at = NOW()
  `;
  // Keep upcoming, unfinished sessions in step with the bank: name, type and targets.
  const p = def.plan ?? {};
  await sql`
    UPDATE training_sessions SET title = ${name}, type = ${sessionType}, target_km = ${p.km ?? null},
      target_minutes = ${minutesAtPace(p.km ?? null, p.pace_sec ?? null) ?? p.minutes ?? null},
      target_pace_sec = ${p.pace_sec ?? null}, intensity = ${p.intensity ?? null}, updated_at = NOW()
    WHERE workout_slug = ${finalSlug} AND done = FALSE AND session_date >= ${todayISO()}
  `;
  return def;
}

/** Out of the bank and the default week; its logs and past sessions stay. */
export async function archiveWorkout(slug: string) {
  await ensureBank();
  await getDb()`UPDATE workout_bank SET archived = TRUE, updated_at = NOW() WHERE slug = ${slug}`;
}

// ── the default week ─────────────────────────────────────────────────────

const FILLED_KEY = "training.bank_filled_weeks";

/**
 * Fills an empty week (this one or later) from the bank: each workout on its
 * default day, rest on any day left over. Each week is filled at most once, so a
 * week he clears on purpose stays clear. Returns true when it added sessions.
 *
 * `replace` is the "Fill from bank" button: it clears the week's unfinished
 * sessions first and lays the default lineup over it. Done sessions stay, and a
 * workout already done that week isn't added again.
 */
export async function fillWeekFromBank(weekStart: string, opts: { replace?: boolean } = {}): Promise<boolean> {
  if (weekStart !== weekStartISO(weekStart) || weekStart < weekStartISO(todayISO())) return false;
  await ensureBank();
  const sql = getDb();
  const [setting] = await sql`SELECT value FROM app_settings WHERE key = ${FILLED_KEY}`;
  const filled: string[] = setting ? JSON.parse(String(setting.value)) : [];
  if (filled.includes(weekStart) && !opts.replace) return false;
  const to = addDaysISO(weekStart, 6);
  const remember = async () => {
    if (filled.includes(weekStart)) return;
    const next = JSON.stringify([...filled, weekStart].slice(-104));
    await sql`
      INSERT INTO app_settings (key, value, updated_at) VALUES (${FILLED_KEY}, ${next}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  };
  if (opts.replace) {
    await sql`DELETE FROM training_sessions WHERE session_date BETWEEN ${weekStart} AND ${to} AND done = FALSE`;
  } else {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM training_sessions WHERE session_date BETWEEN ${weekStart} AND ${to}`;
    if (n > 0) {
      await remember();
      return false;
    }
  }
  const kept = await sql`SELECT EXTRACT(ISODOW FROM session_date)::int - 1 AS day, workout_slug FROM training_sessions WHERE session_date BETWEEN ${weekStart} AND ${to}`;
  const doneSlugs = new Set(kept.map((r) => r.workout_slug).filter(Boolean));
  const used = new Set<number>(kept.map((r) => Number(r.day)));
  const workouts = (await listWorkouts()).filter((w) => w.default_day !== null && !doneSlugs.has(w.slug));
  for (const w of workouts) {
    const day = w.default_day!;
    used.add(day);
    const p = w.plan ?? {};
    await sql`
      INSERT INTO training_sessions (session_date, position, type, title, target_km, target_minutes, target_pace_sec, intensity, workout_slug)
      VALUES (${addDaysISO(weekStart, day)}, 0, ${w.session_type}, ${w.name}, ${p.km ?? null}, ${minutesAtPace(p.km ?? null, p.pace_sec ?? null) ?? p.minutes ?? null},
              ${p.pace_sec ?? null}, ${p.intensity ?? null}, ${w.slug})
    `;
  }
  for (let day = 0; day < 7; day++) {
    if (used.has(day)) continue;
    await sql`INSERT INTO training_sessions (session_date, position, type, title) VALUES (${addDaysISO(weekStart, day)}, 0, 'rest', 'Rest')`;
  }
  await remember();
  return true;
}
