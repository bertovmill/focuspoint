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
  // Optional kind of work — see lib/task-categories.ts. The four pipeline categories
  // ('content' | 'code' | 'community' | 'sales') also decide which lane a top-level
  // task shows up in. NULL = uncategorized, which is most tasks.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS category TEXT`;
  // Google Calendar event written when the task was completed, so the block can be
  // removed again on uncomplete (see lib/task-calendar.ts). NULL = nothing logged.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS calendar_event_id TEXT`;
  // Where the task's card sits on the Tasks canvas, in Excalidraw *scene* coordinates
  // (not pixels — they survive pan/zoom). NULL on both = never placed, so the canvas
  // auto-drops it into the inbox column and persists the position it landed on.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS canvas_x DOUBLE PRECISION`;
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS canvas_y DOUBLE PRECISION`;
  // Parent task, used by the Content lane on the Tasks canvas: a category='content'
  // row with parent_id NULL is a content *piece* (a video, a post), and the tasks
  // needed to ship it hang off it as children. NULL = a normal standalone task.
  // Cascade so deleting the piece takes its checklist with it.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES todos(id) ON DELETE CASCADE`;
  // Cosmetic card colour picked from the canvas right-click menu (see lib/task-colors.ts).
  // NULL = a plain card. Deliberately not tied to in_progress/waiting.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS color TEXT`;
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
  // The Tasks canvas: one single, never-ending Excalidraw scene (id = 1) holding the
  // freeform half of the notebook — arrows, scribbles, headings, anything Berto draws
  // around the task cards. The cards themselves are NOT in here; they're `todos` rows
  // positioned by canvas_x/canvas_y and rendered as React on top of this scene.
  await sql`
    CREATE TABLE IF NOT EXISTS task_canvas (
      id INTEGER PRIMARY KEY,
      scene JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // ── Luma mirror ────────────────────────────────────────────────────────────
  // The MakersLounge calendar, pulled in whole so Cael can use it as context —
  // what's coming up, how the last one went, who keeps showing up. Every table
  // keeps the full API object in `raw`: Luma adds fields over time, JSONB costs
  // nothing, and it means a schema gap never loses data that was already fetched.
  await sql`
    CREATE TABLE IF NOT EXISTS luma_events (
      api_id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      description_md TEXT,
      url TEXT,
      cover_url TEXT,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      timezone TEXT,
      location_type TEXT,
      address TEXT,
      visibility TEXT,
      spots_remaining INTEGER,
      registration_open BOOLEAN,
      require_approval BOOLEAN,
      guest_count INTEGER,
      approved_count INTEGER,
      checked_in_count INTEGER,
      hosts JSONB,
      tags JSONB,
      raw JSONB,
      created_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS luma_guests (
      api_id TEXT PRIMARY KEY,
      event_api_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone_number TEXT,
      approval_status TEXT,
      registered_at TIMESTAMPTZ,
      joined_at TIMESTAMPTZ,
      invited_at TIMESTAMPTZ,
      checked_in_at TIMESTAMPTZ,
      source TEXT,
      registration_answers JSONB,
      raw JSONB,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS luma_guests_event_idx ON luma_guests (event_api_id)`;
  await sql`CREATE INDEX IF NOT EXISTS luma_guests_email_idx ON luma_guests (email)`;
  await sql`
    CREATE TABLE IF NOT EXISTS luma_people (
      api_id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      first_seen_at TIMESTAMPTZ,
      event_approved_count INTEGER,
      event_checked_in_count INTEGER,
      revenue_usd_cents INTEGER,
      membership JSONB,
      tags JSONB,
      raw JSONB,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // One row per sync so a stale answer can always be explained — "as of when".
  await sql`
    CREATE TABLE IF NOT EXISTS luma_sync_runs (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      events INTEGER DEFAULT 0,
      guests INTEGER DEFAULT 0,
      people INTEGER DEFAULT 0,
      ok BOOLEAN DEFAULT FALSE,
      error TEXT
    )
  `;
  // Everyone who has ever signed in through Clerk. A ledger of accounts, not an
  // authorisation table: `is_owner` is a mirror of the email check in lib/owner.ts,
  // recorded for visibility, and never read to decide access. See lib/users.ts.
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      clerk_user_id TEXT UNIQUE NOT NULL,
      email TEXT,
      is_owner BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
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
