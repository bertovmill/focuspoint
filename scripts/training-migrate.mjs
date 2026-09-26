// Creates the training-plan tables on the live Neon DB and seeds the two races
// Berto named. Mirrors lib/db.ts ensureSchema(). Idempotent.
//   node --env-file=.env.local scripts/training-migrate.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

await sql`CREATE TABLE IF NOT EXISTS training_events (id SERIAL PRIMARY KEY, name TEXT NOT NULL, event_date DATE NOT NULL, kind TEXT NOT NULL DEFAULT 'hyrox', notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
await sql`CREATE TABLE IF NOT EXISTS training_sessions (id SERIAL PRIMARY KEY, session_date DATE NOT NULL, position INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL, title TEXT NOT NULL, target_km NUMERIC, target_minutes INTEGER, intensity TEXT, notes TEXT, done BOOLEAN NOT NULL DEFAULT FALSE, done_at TIMESTAMPTZ, strava_activity_id BIGINT, actual_km NUMERIC, actual_minutes INTEGER, actual_effort INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`;
await sql`CREATE INDEX IF NOT EXISTS training_sessions_date_idx ON training_sessions (session_date)`;
await sql`CREATE TABLE IF NOT EXISTS strava_activities (id BIGINT PRIMARY KEY, name TEXT NOT NULL, sport_type TEXT NOT NULL, start_local TIMESTAMP NOT NULL, distance_m NUMERIC NOT NULL DEFAULT 0, moving_time_s INTEGER NOT NULL DEFAULT 0, elapsed_time_s INTEGER NOT NULL DEFAULT 0, elevation_m NUMERIC, relative_effort INTEGER, avg_speed NUMERIC, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
await sql`CREATE INDEX IF NOT EXISTS strava_activities_start_idx ON strava_activities (start_local DESC)`;

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM training_events`;
if (n === 0) {
  // Placeholder dates — Berto said "one in a week, then February". Editable on /training.
  await sql`INSERT INTO training_events (name, event_date, kind, notes) VALUES
    ('Hyrox', '2026-10-03', 'hyrox', 'Date is a placeholder — set the real one.'),
    ('Hyrox (February)', '2027-02-13', 'hyrox', 'The main build. Date is a placeholder — set the real one.')`;
  console.log("seeded 2 races");
}
console.log("training migration done");
