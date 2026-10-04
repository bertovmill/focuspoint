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
  /**
   * Context window in tokens, as eve will see it (the first gateway provider
   * that publishes one — the same rule eve uses to decide when to compact), or
   * null when the catalog doesn't say.
   */
  readonly contextWindow: number | null;
};

/**
 * The picker only offers models at or under this output price (USD per 1M
 * tokens). Since 2026-10-03: the Claude tiers drained Gateway credits until
 * chats died mid-conversation, so the expensive end of the catalog is gone
 * from the list and the settings route refuses it.
 */
export const MAX_OUTPUT_PRICE = 3;

/**
 * The picker only offers models with at least this much context. A fresh Cael
 * turn already carries ~20k tokens of instructions and tool schemas, and eve
 * compacts at 90% of the window, so anything much smaller would spend most of
 * a conversation compacting. Unknown windows are let through — eve still
 * resolves the real one at turn start.
 */
export const MIN_CONTEXT_WINDOW = 64_000;

/** Big enough for Cael. */
export function hasRoomyContext(model: Pick<ChatModel, "contextWindow">): boolean {
  return model.contextWindow == null || model.contextWindow >= MIN_CONTEXT_WINDOW;
}

/** "1M", "200k", "—" — a context window as the picker shows it. */
export function formatContextWindow(tokens: number | null): string {
  if (tokens == null) return "—";
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}k`;
}

/** Within the price ceiling. Unpriced models are out — they could cost anything. */
export function isAffordable(model: Pick<ChatModel, "inputPrice" | "outputPrice">): boolean {
  return (
    model.outputPrice != null &&
    model.outputPrice <= MAX_OUTPUT_PRICE &&
    model.inputPrice != null &&
    model.inputPrice <= MAX_OUTPUT_PRICE
  );
}

/**
 * Shown when the gateway catalog can't be reached. Prices are list prices per
 * 1M tokens, all under MAX_OUTPUT_PRICE.
 */
export const CHAT_MODEL_FALLBACK: readonly ChatModel[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek", inputPrice: 0.13, outputPrice: 0.26, contextWindow: null },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", provider: "openai", inputPrice: 0.25, outputPrice: 2, contextWindow: null },
  { id: "google/gemini-3-flash", label: "Gemini 3 Flash", provider: "google", inputPrice: 0.5, outputPrice: 3, contextWindow: null },
];

// DeepSeek V4 Flash since 2026-10-03: Sonnet was burning through Gateway credits
// fast enough that chats died mid-conversation when the balance hit zero.
export const CHAT_MODEL_DEFAULT = "deepseek/deepseek-v4-flash";

/** What the picker pins until Berto pins something of his own. */
export const CHAT_MODEL_DEFAULT_PINS: readonly string[] = [
  CHAT_MODEL_DEFAULT,
  "openai/gpt-5-mini",
  "google/gemini-3-flash",
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

/** The currently selected model id, falling back to the default. */
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
