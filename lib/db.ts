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
  // Manual "do this next" queue position. NULL = unnumbered; numbers need not be
  // contiguous or unique — they're whatever order the owner typed.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS task_number INTEGER`;
  // Estimated time to complete, in minutes. NULL = no estimate; drives the timer countdown.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER`;
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
  // The editable Excalidraw document ({elements, appState, files}). image_data is now just
  // the PNG thumbnail for the gallery. Sketches drawn before the Excalidraw switch have a
  // NULL scene and are re-opened by importing their PNG as an image element.
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS scene JSONB`;
  // Google Calendar OAuth tokens — single-user app, one row (id = 1)
  await sql`
    CREATE TABLE IF NOT EXISTS google_auth (
      id INTEGER PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      email TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Daily meal recommendation (photo + name/description), one row per day. Feedback
  // (thumbs up/down) on today's meal informs the next day's suggestion.
  await sql`
    CREATE TABLE IF NOT EXISTS meal_recommendations (
      id SERIAL PRIMARY KEY,
      meal_date DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      cuisine TEXT,
      image_url TEXT,
      feedback TEXT,
      feedback_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Workout log: one row per exercise per day. `value` is lbs for the lifts
  // (squat/deadlift/bench/chinups) and minutes for the 10k run.
  await sql`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id SERIAL PRIMARY KEY,
      exercise TEXT NOT NULL,
      value NUMERIC NOT NULL,
      logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(exercise, logged_date)
    )
  `;
  // Reading log: one row per finished book (append-only, like thoughts). `is_estimate`
  // flags the 15 pre-tracking books seeded as a rough average so the year's pace/projection
  // isn't starting from zero.
  await sql`
    CREATE TABLE IF NOT EXISTS reading_logs (
      id SERIAL PRIMARY KEY,
      book_title TEXT NOT NULL,
      pages INTEGER NOT NULL,
      logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
      is_estimate BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Family memories: an optional photo + title + description + the date it happened,
  // added from chat, the Family widget, or the /family page. Editable after creation.
  await sql`
    CREATE TABLE IF NOT EXISTS memories (
      id SERIAL PRIMARY KEY,
      title TEXT,
      description TEXT,
      image_url TEXT,
      memory_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE memories ALTER COLUMN image_url DROP NOT NULL`;
  await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS memory_date DATE NOT NULL DEFAULT CURRENT_DATE`;
  // Service thank-yous: a screenshot/photo of a DM, email, or written card someone sent, plus an
  // optional note. Logged from chat via the log_thank_you tool. Feeds the Service wealth-form chart.
  await sql`
    CREATE TABLE IF NOT EXISTS thank_yous (
      id SERIAL PRIMARY KEY,
      title TEXT,
      note TEXT,
      image_url TEXT,
      thanked_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
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
