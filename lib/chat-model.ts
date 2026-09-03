// The model behind Cael's chat bar picker. One global setting, not per-thread:
// whatever model is selected is the brain every Cael conversation gets, chat
// page included.
//
// The list of models is *not* hardcoded — it comes from the AI Gateway catalog
// at runtime (lib/gateway-catalog.ts), so new models show up on their own and
// the prices shown in the picker are the gateway's own, not a stale copy. The
// constants here are only the fallback for when that fetch fails.
//
// No db import at module scope: the helpers take their `sql` from the caller and
// the client components import the pure bits (same shape as lib/streak.ts).

export type ChatModel = {
  /** AI Gateway model id, e.g. "anthropic/claude-sonnet-4.6". */
  readonly id: string;
  /** Display name, e.g. "Claude Sonnet 4.6". */
  readonly label: string;
  /** Provider slug, the half before the slash. Also keys the picker's logos. */
  readonly provider: string;
  /** USD per 1M input tokens, or null when the gateway doesn't publish a price. */
  readonly inputPrice: number | null;
  /** USD per 1M output tokens. */
  readonly outputPrice: number | null;
};

/**
 * Shown when the gateway catalog can't be reached — the ladder Cael ran on
 * before the picker went cross-provider. Prices are list prices per 1M tokens.
 */
export const CHAT_MODEL_FALLBACK: readonly ChatModel[] = [
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "anthropic", inputPrice: 1, outputPrice: 5 },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "anthropic", inputPrice: 3, outputPrice: 15 },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", provider: "anthropic", inputPrice: 5, outputPrice: 25 },
  { id: "anthropic/claude-opus-5", label: "Claude Opus 5", provider: "anthropic", inputPrice: 5, outputPrice: 25 },
];

export const CHAT_MODEL_DEFAULT = "anthropic/claude-sonnet-4.6";

/** What the picker pins until Berto pins something of his own. */
export const CHAT_MODEL_DEFAULT_PINS: readonly string[] = [
  "anthropic/claude-haiku-4.5",
  CHAT_MODEL_DEFAULT,
  "anthropic/claude-opus-5",
];

/**
 * Providers listed first in the picker, in this order; everything else follows
 * alphabetically. Purely presentational — every model the gateway offers is
 * still in the list and still searchable.
 */
export const PROVIDER_ORDER: readonly string[] = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "deepseek",
  "mistral",
  "meta",
  "moonshotai",
];

const MODEL_KEY = "chat_model";
const PINS_KEY = "chat_model_pins";

/**
 * A gateway model id is `provider/model`. The catalog is the real authority on
 * which ids exist, but it isn't always reachable, so anything of the right
 * shape is accepted rather than pinning the app to a list that goes stale.
 */
export function isChatModelId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(value);
}

/** "$3.00" — a per-1M-token price, or "—" when the gateway publishes none. */
export function formatPricePerMillion(price: number | null): string {
  if (price == null) return "—";
  if (price === 0) return "free";
  // Always two decimals so the in/out columns line up under tabular-nums.
  return `$${price.toFixed(2)}`;
}

/** Display name for a provider slug — the picker's group headings. */
export function providerLabel(provider: string): string {
  const known: Record<string, string> = {
    openai: "OpenAI",
    xai: "xAI",
    deepseek: "DeepSeek",
    moonshotai: "Moonshot AI",
    zai: "Z.ai",
    "amazon-bedrock": "Amazon Bedrock",
    "arcee-ai": "Arcee AI",
    inceptionlabs: "Inception Labs",
    morph: "Morph",
  };
  return (
    known[provider] ??
    provider
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/** Sort key: preferred providers first, then alphabetical. */
export function providerRank(provider: string): number {
  const i = PROVIDER_ORDER.indexOf(provider);
  return i === -1 ? PROVIDER_ORDER.length : i;
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

/** The currently selected model id, defaulting to Sonnet. */
export async function getChatModel(sql: Sql): Promise<string> {
  try {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = ${MODEL_KEY}`;
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
    INSERT INTO app_settings (key, value, updated_at) VALUES (${MODEL_KEY}, ${id}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return id;
}

/** The pinned model ids, in the order they were pinned. */
export async function getPinnedModels(sql: Sql): Promise<string[]> {
  try {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = ${PINS_KEY}`;
    if (typeof row?.value !== "string") return [...CHAT_MODEL_DEFAULT_PINS];
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [...CHAT_MODEL_DEFAULT_PINS];
    return parsed.filter(isChatModelId);
  } catch {
    return [...CHAT_MODEL_DEFAULT_PINS];
  }
}

/** Replace the pin list wholesale — the client always sends the full set. */
export async function setPinnedModels(sql: Sql, value: unknown): Promise<string[]> {
  const ids = Array.isArray(value) ? value.filter(isChatModelId).slice(0, 24) : [];
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${PINS_KEY}, ${JSON.stringify(ids)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return ids;
}
