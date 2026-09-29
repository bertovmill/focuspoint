import { getDb } from "@/lib/db";

// A whole markdown document kept under one app_settings key. The Notion-style
// pages (Principles on Home, Notes on Meals) each own a key; the editor and
// Cael's tools read and replace the full text.
export interface SettingsDoc {
  content: string;
  updated_at: string | null;
}

export async function getSettingsDoc(key: string, fallback = ""): Promise<SettingsDoc> {
  const sql = getDb();
  const [row] = await sql`SELECT value, updated_at FROM app_settings WHERE key = ${key}`;
  if (!row) return { content: fallback, updated_at: null };
  return { content: String(row.value), updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}

export async function setSettingsDoc(key: string, content: string): Promise<SettingsDoc> {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${content}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return getSettingsDoc(key);
}
