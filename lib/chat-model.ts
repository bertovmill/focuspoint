// The model ladder behind the chat bar's picker: five rungs, Balanced in the
// middle — the model Cael has always run on — with two steps down for speed and
// two steps up for weight. One global setting, not per-thread: whatever rung is
// selected is the brain every Cael conversation gets, chat page included.
//
// No db import at module scope: the helpers take their `sql` from the caller and
// the client components import the pure bits (same shape as lib/streak.ts).

export type ChatModelTier = {
  /** AI Gateway model id, verified against the gateway catalog. */
  readonly id: string;
  /** Short name shown on the picker button. */
  readonly label: string;
  /** One-line description shown in the picker menu. */
  readonly blurb: string;
};

/** Ordered bottom → top. Index 2 (Balanced) is the default middle. */
export const CHAT_MODEL_TIERS: readonly ChatModelTier[] = [
  { id: "anthropic/claude-3-haiku", label: "Minimal", blurb: "Fastest and lightest — quick lookups" },
  { id: "anthropic/claude-haiku-4.5", label: "Quick", blurb: "Fast with modern smarts" },
  { id: "anthropic/claude-sonnet-4.6", label: "Balanced", blurb: "Cael's usual self" },
  { id: "anthropic/claude-opus-4.8", label: "Strong", blurb: "Deeper thinking, a bit slower" },
  { id: "anthropic/claude-opus-5", label: "Max", blurb: "The heaviest model available" },
];

export const CHAT_MODEL_DEFAULT = CHAT_MODEL_TIERS[2]!.id;

const SETTING_KEY = "chat_model";

export function isChatModelId(value: unknown): value is string {
  return typeof value === "string" && CHAT_MODEL_TIERS.some((t) => t.id === value);
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

/** The currently selected model id, defaulting to Balanced. */
export async function getChatModel(sql: Sql): Promise<string> {
  try {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = ${SETTING_KEY}`;
    return isChatModelId(row?.value) ? row.value : CHAT_MODEL_DEFAULT;
  } catch {
    // Table not created yet (first boot) — the default is the honest answer.
    return CHAT_MODEL_DEFAULT;
  }
}

/** Persist a selection. Unknown ids fall back to the default rather than throwing. */
export async function setChatModel(sql: Sql, value: unknown): Promise<string> {
  const id = isChatModelId(value) ? value : CHAT_MODEL_DEFAULT;
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${SETTING_KEY}, ${id}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return id;
}
