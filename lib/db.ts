import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");
  return neon(url);
}

export async function ensureSchema() {
  const sql = getDb();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name, parent_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS thoughts (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT[],
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Semantic-search embedding column (pgvector). 1536 = text-embedding-3-small.
  await sql`ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(1536)`;
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
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT 'none'`;
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS in_progress BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS waiting BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ`;
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0`;
  await sql`
    CREATE TABLE IF NOT EXISTS dreams (
      id SERIAL PRIMARY KEY,
      dream_date DATE NOT NULL DEFAULT CURRENT_DATE,
      summary TEXT NOT NULL,
      patterns JSONB DEFAULT '[]',
      insights TEXT[] DEFAULT '{}',
      thoughts_analyzed INTEGER DEFAULT 0,
      todos_analyzed INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      session JSONB,
      events JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS lists (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS list_items (
      id SERIAL PRIMARY KEY,
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;

  // One-time migration: fold the legacy content_ideas table into a seeded "Content Ideas" list.
  const [{ exists: hasContentIdeas }] = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_ideas') AS exists
  `;
  if (hasContentIdeas) {
    const [{ count: existingListCount }] = await sql`SELECT COUNT(*) FROM lists WHERE name = 'Content Ideas'`;
    if (Number(existingListCount) === 0) {
      const [{ id: listId }] = await sql`INSERT INTO lists (name) VALUES ('Content Ideas') RETURNING id`;
      await sql`
        INSERT INTO list_items (list_id, title, completed, created_at, completed_at)
        SELECT ${listId}, title, completed, created_at, completed_at FROM content_ideas
      `;
    }
    await sql`DROP TABLE content_ideas`;
  }
  const [{ count: groceriesListCount }] = await sql`SELECT COUNT(*) FROM lists WHERE name = 'Groceries'`;
  if (Number(groceriesListCount) === 0) {
    await sql`INSERT INTO lists (name) VALUES ('Groceries')`;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS journal_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      fields JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES journal_templates(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS measures (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
      data JSONB NOT NULL DEFAULT '{}',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS vision_items (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT,
      content TEXT,
      image_url TEXT,
      horizon TEXT,
      achieved BOOLEAN DEFAULT FALSE,
      achieved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sketches (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      image_data TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cron TEXT NOT NULL,
      notify BOOLEAN NOT NULL DEFAULT TRUE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}
