import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");
  return neon(url);
}

export async function ensureSchema() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS thoughts (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      priority TEXT DEFAULT 'normal',
      due_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
}
