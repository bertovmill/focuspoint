import { getDb } from "@/lib/db";

// Where each block sits on Home: a react-grid-layout layout (12 columns), kept in
// app_settings so desktop and phone share it. Blocks are dragged by their grip and
// resized from the corner; the saved layout is just positions, never content.

export interface HomeBlockPosition {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SETTING_KEY = "home_layout";

function isPosition(v: unknown): v is HomeBlockPosition {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.i === "string" && ["x", "y", "w", "h"].every((k) => Number.isFinite(p[k]));
}

export function cleanLayout(value: unknown): HomeBlockPosition[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPosition).map(({ i, x, y, w, h }) => ({
    i: i.slice(0, 64),
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
  }));
}

export async function getHomeLayout(): Promise<HomeBlockPosition[] | null> {
  try {
    const [row] = await getDb()`SELECT value FROM app_settings WHERE key = ${SETTING_KEY}`;
    return row ? cleanLayout(JSON.parse(String(row.value))) : null;
  } catch {
    return null;
  }
}

/** Saves the layout; null clears it, so Home falls back to the default arrangement. */
export async function setHomeLayout(layout: HomeBlockPosition[] | null): Promise<void> {
  const sql = getDb();
  if (layout === null) {
    await sql`DELETE FROM app_settings WHERE key = ${SETTING_KEY}`;
    return;
  }
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${SETTING_KEY}, ${JSON.stringify(layout)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}
