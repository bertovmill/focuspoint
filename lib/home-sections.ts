import { getDb } from "@/lib/db";

// Berto's own sections at the top of Home ("5-year review", "5-year plan", …):
// each a titled Notion-style markdown page he adds, renames, reorders and
// deletes himself. Cael reads and edits them through the home_sections tool.
// The table is also in ensureSchema (lib/db.ts); it's created lazily here
// because the read paths skip ensureSchema.

export interface HomeSection {
  id: number;
  title: string;
  content: string;
  sort_order: number;
  updated_at: string | null;
}

let ready: Promise<unknown> | null = null;

function ensureTable() {
  ready ??= getDb()`
    CREATE TABLE IF NOT EXISTS home_sections (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

function toSection(row: Record<string, unknown>): HomeSection {
  return {
    id: Number(row.id),
    title: String(row.title),
    content: String(row.content ?? ""),
    sort_order: Number(row.sort_order),
    updated_at: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

export async function listHomeSections(): Promise<HomeSection[]> {
  await ensureTable();
  const rows = await getDb()`SELECT * FROM home_sections ORDER BY sort_order, id`;
  return rows.map(toSection);
}

export async function getHomeSection(id: number): Promise<HomeSection | null> {
  await ensureTable();
  const [row] = await getDb()`SELECT * FROM home_sections WHERE id = ${id}`;
  return row ? toSection(row) : null;
}

export async function createHomeSection(title: string, content = ""): Promise<HomeSection> {
  await ensureTable();
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO home_sections (title, content, sort_order)
    VALUES (${title}, ${content}, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM home_sections))
    RETURNING *
  `;
  return toSection(row);
}

export async function updateHomeSection(
  id: number,
  fields: { title?: string; content?: string },
): Promise<HomeSection | null> {
  await ensureTable();
  const [row] = await getDb()`
    UPDATE home_sections SET
      title = COALESCE(${fields.title ?? null}, title),
      content = COALESCE(${fields.content ?? null}, content),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return row ? toSection(row) : null;
}

/** Swap a section with its neighbour above or below. */
export async function moveHomeSection(id: number, direction: "up" | "down"): Promise<HomeSection[]> {
  const sections = await listHomeSections();
  const i = sections.findIndex((s) => s.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sections.length) return sections;
  // Renumber everything so equal sort_orders can't make the swap a no-op.
  const order = sections.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  const sql = getDb();
  await sql.transaction(order.map((sid, n) => sql`UPDATE home_sections SET sort_order = ${(n + 1) * 10} WHERE id = ${sid}`));
  return listHomeSections();
}

export async function deleteHomeSection(id: number): Promise<void> {
  await ensureTable();
  await getDb()`DELETE FROM home_sections WHERE id = ${id}`;
}
