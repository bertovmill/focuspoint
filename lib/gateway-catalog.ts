import "server-only";

import { gateway } from "ai";

import {
  CHAT_MODEL_FALLBACK,
  type ChatModel,
  hasRoomyContext,
  isAffordable,
  providerRank,
} from "@/lib/chat-model";

// The picker's model list comes straight from the AI Gateway catalog, so new
// models appear without a deploy and the prices shown are the gateway's own.
// The catalog barely moves, so one fetch per hour per lambda is plenty.

const TTL_MS = 60 * 60 * 1000;

let cache: { at: number; models: ChatModel[] } | null = null;
let windowsCache: { at: number; windows: Map<string, number> } | null = null;

// The catalog eve itself reads to size a model's context window. Public, no
// auth needed, so it works in local dev too.
const CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models/catalog";

type CatalogResponse = {
  models?: { slug?: string; providers?: { contextWindowTokens?: number }[] }[];
};

/**
 * Model id → context window, using eve's own rule (the first provider that
 * publishes a window), so what the picker and traces show is the number eve
 * compacts against. An empty map when the catalog can't be reached.
 */
export async function getContextWindows(): Promise<Map<string, number>> {
  if (windowsCache && Date.now() - windowsCache.at < TTL_MS) return windowsCache.windows;
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as CatalogResponse;
    const windows = new Map<string, number>();
    for (const m of body.models ?? []) {
      const tokens = m.providers?.find((p) => (p.contextWindowTokens ?? 0) > 0)?.contextWindowTokens;
      if (m.slug && tokens) windows.set(m.slug, tokens);
    }
    windowsCache = { at: Date.now(), windows };
    return windows;
  } catch (err) {
    console.warn("[model-picker] context-window catalog unavailable:", err);
    return new Map();
  }
}

/** Per-token USD string → USD per 1M tokens, or null when unpriced. */
function perMillion(price: string | undefined): number | null {
  if (!price) return null;
  const n = Number(price) * 1_000_000;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Every language model the gateway will serve under the price ceiling
 * (MAX_OUTPUT_PRICE) and with enough context for Cael (MIN_CONTEXT_WINDOW),
 * ordered provider-first. Falls
 * back to the built-in ladder if the gateway is unreachable or unauthenticated
 * (which is the normal state in local dev without an OIDC token).
 */
export async function listChatModels(): Promise<ChatModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  try {
    const [{ models }, windows] = await Promise.all([gateway.getAvailableModels(), getContextWindows()]);
    const mapped = models
      .filter((m) => m.modelType == null || m.modelType === "language")
      .map<ChatModel>((m) => ({
        id: m.id,
        label: m.name || m.id.split("/")[1] || m.id,
        provider: m.id.split("/")[0] ?? "unknown",
        inputPrice: perMillion(m.pricing?.input),
        outputPrice: perMillion(m.pricing?.output),
        contextWindow: windows.get(m.id) ?? null,
      }))
      .filter((m) => isAffordable(m) && hasRoomyContext(m))
      .sort(
        (a, b) =>
          providerRank(a.provider) - providerRank(b.provider) ||
          a.provider.localeCompare(b.provider) ||
          a.label.localeCompare(b.label),
      );
    if (mapped.length === 0) throw new Error("empty catalog");
    cache = { at: Date.now(), models: mapped };
    return mapped;
  } catch (err) {
    console.warn("[model-picker] gateway catalog unavailable, using fallback:", err);
    return [...CHAT_MODEL_FALLBACK];
  }
}
