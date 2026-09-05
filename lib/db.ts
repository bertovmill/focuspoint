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
  // Set when a task was taken out of the pinned window ("remove from pinned"). It
  // stays an ordinary task on the board — it just stops being featured up there
  // until it's put back, or until it's started again. NULL = eligible for the
  // pinned window, which is nearly every task.
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS pinned_hidden_at TIMESTAMPTZ`;
  // Progress notes on a task, newest last. Written by Berto from the board and by
  // Claude over MCP (see app/api/mcp/route.ts) when an agent finishes an intermediary
  // step and needs him to pick it up — `author` says which. The whole thread is kept;
  // the cards only ever show the latest line.
  await sql`
    CREATE TABLE IF NOT EXISTS task_updates (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'me',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS task_updates_task_idx ON task_updates (task_id, created_at DESC, id DESC)`;
  // Small key/value store for app-wide settings that aren't worth a table of their
  // own — currently just `working_limit`, how many things Berto lets himself work
  // on at once (see lib/working-now.ts).
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
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
  // Three recommendations a day, one per sitting, instead of the original single
  // daily dish. The old UNIQUE(meal_date) has to go for that.
  await sql`ALTER TABLE meal_recommendations ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'dinner'`;
  await sql`ALTER TABLE meal_recommendations DROP CONSTRAINT IF EXISTS meal_recommendations_meal_date_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS meal_recommendations_date_slot_key ON meal_recommendations (meal_date, slot)`;
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
  // Merged pull requests authored on GitHub, mirrored from the Search API by
  // lib/github-sync.ts. This is the real Craft metric on the home screen — it
  // replaced a count of thoughts tagged "craft", which was only ever a proxy.
  //
  // Keyed on GitHub's own PR node id so a re-sync upserts instead of duplicating,
  // and `merged_at` (never `created_at`) is the date a PR counts on: shipping is
  // the signal, and a PR opened in March and merged in May belongs to May.
  await sql`
    CREATE TABLE IF NOT EXISTS github_prs (
      id BIGINT PRIMARY KEY,
      account TEXT NOT NULL,
      repo TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      merged_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS github_prs_merged_at_idx ON github_prs (merged_at)`;

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
  // ── Nutrition ────────────────────────────────────────────────────────────
  // Meals worth repeating: the ones that left Berto with good energy. Logged by
  // one tap on the Nutrition screen (or by Cael), never scored on macros.
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
  // Which sitting the meal was — 'lunch' | 'snack' | 'dinner', matching the three
  // slots Berto eats. NULL for a meal logged outside the three (or by Cael from chat).
  await sql`ALTER TABLE nutrition_meals ADD COLUMN IF NOT EXISTS slot TEXT`;
  // The standing shelf of energy-boosting staples — foods that reliably work,
  // each with the reason. `why` is usually lifted from the thought that named it.
  await sql`
    CREATE TABLE IF NOT EXISTS nutrition_staples (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      why TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // AI-generated photo of the ingredient (see lib/nutrition-art.ts). NULL until generated.
  await sql`ALTER TABLE nutrition_staples ADD COLUMN IF NOT EXISTS image_url TEXT`;
  // Art for the four protocol rules. Only four rows, ever — but the pictures live
  // here rather than in the repo because generating them needs AI Gateway creds,
  // which only exist on the deployed app.
  await sql`
    CREATE TABLE IF NOT EXISTS nutrition_rule_art (
      rule_key TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // One row per day recording which of the protocol rules were kept (rule keys
  // live in lib/nutrition.ts). A day is "on protocol" only when all of them are.
  await sql`
    CREATE TABLE IF NOT EXISTS nutrition_days (
      logged_date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
      rules TEXT[] NOT NULL DEFAULT '{}',
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // The daily scorecard (lib/scorecard.ts) — one row per day, holding only the
  // numbers that have nowhere better to live. PRs come from github_prs and the
  // eating window from nutrition_days.rules, so neither is duplicated here.
  // NULL means "never logged", which is not the same as a logged zero.
  await sql`
    CREATE TABLE IF NOT EXISTS daily_metrics (
      recorded_date DATE PRIMARY KEY,
      steps INTEGER,
      sleep_minutes INTEGER,
      portfolio NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Readwise *notes* (not highlights) counted from their export API and cached here,
  // so the card doesn't call out to Readwise on every page load.
  await sql`ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS readwise_notes INTEGER`;

  // Keystrokes per day, posted by the local macOS counter (keystroke-agent/). One row
  // per day in Berto's timezone; `count` is *only* how many keys were pressed — never
  // which ones. The agent sends a cumulative running total, so lib/keystrokes.ts upserts
  // with GREATEST: a restart that lost its local tally can never walk the number backward.
  await sql`
    CREATE TABLE IF NOT EXISTS keystroke_days (
      logged_date DATE PRIMARY KEY,
      count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Reading notes, imported from Kindle's local `My Clippings.txt` (read.amazon.com/notebook
  // and Readwise both source from the same clippings — this just skips their sync lag by
  // reading the file directly off the device). `note_date` is the date Kindle stamped on the
  // clipping, not the import date, so notes land on the day they were actually written. The
  // unique constraint is the dedupe: re-pasting the same file after adding new notes is a
  // no-op for everything already stored.
  await sql`
    CREATE TABLE IF NOT EXISTS reading_notes (
      id SERIAL PRIMARY KEY,
      book_title TEXT NOT NULL,
      note TEXT NOT NULL,
      location TEXT,
      note_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (book_title, note, note_date)
    )
  `;

  // The daily journal — one free-form markdown document per day, written by hand in
  // the editor on the home page (app/_components/daily-journal.tsx). Keyed by the
  // local date so there is exactly one page per day; an absent row means "not
  // written yet", which is not the same as an emptied one.
  await sql`
    CREATE TABLE IF NOT EXISTS daily_journal (
      entry_date DATE PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // The training log — one plain-text note per day describing the workout that was
  // done and what was accomplished ("push day, bench 5x5 @185, first unbroken set
  // of dips"). Deliberately separate from `workout_logs`, which holds only the six
  // numeric lifts: the number says how much, this says what happened. Keyed by the
  // local date, one note per day, so re-logging a day overwrites rather than
  // appending — the note is the day's summary, not a stream of entries.
  await sql`
    CREATE TABLE IF NOT EXISTS workout_notes (
      logged_date DATE PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // The two core habits with nowhere else to live (lib/habits.ts). Read and journal
  // are derived from reading_notes / daily_journal instead of stored here — only
  // meditate and fasting need a manual tap. One row per day; an absent row means
  // neither happened yet, not a logged "no".
  await sql`
    CREATE TABLE IF NOT EXISTS daily_habits (
      habit_date DATE PRIMARY KEY,
      meditated BOOLEAN NOT NULL DEFAULT FALSE,
      fasted_til_noon BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // 12–8 eating window (2026-09-05). Not the old fasted_til_noon: that was the
  // morning half only; this is the whole window, so it is its own flag.
  await sql`ALTER TABLE daily_habits ADD COLUMN IF NOT EXISTS ate_in_window BOOLEAN NOT NULL DEFAULT FALSE`;
}
