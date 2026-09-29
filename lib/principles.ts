import { getDb } from "@/lib/db";

// Berto's principles: one markdown document at the bottom of Home, written in a
// Notion-style editor. Lives in app_settings like the training plan doc; Cael
// reads and rewrites it through the principles_doc tool.
const PRINCIPLES_KEY = "principles.markdown";

// Until he first edits the doc, it opens on the four behaviours that used to be
// a hardcoded "Today that means: …" line under the dashboard.
export const DEFAULT_PRINCIPLES = [
  "1. Save",
  "2. Improve the service",
  "3. Go above and beyond",
  "4. Skip the AI noise",
].join("\n");

export async function getPrinciples(): Promise<{ content: string; updated_at: string | null }> {
  const sql = getDb();
  const [row] = await sql`SELECT value, updated_at FROM app_settings WHERE key = ${PRINCIPLES_KEY}`;
  if (!row) return { content: DEFAULT_PRINCIPLES, updated_at: null };
  return { content: String(row.value), updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}

export async function setPrinciples(content: string) {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${PRINCIPLES_KEY}, ${content}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return getPrinciples();
}
