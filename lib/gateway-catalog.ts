import "server-only";

import { gateway } from "ai";

import { CHAT_MODEL_FALLBACK, type ChatModel, providerRank } from "@/lib/chat-model";

// The picker's model list comes straight from the AI Gateway catalog, so new
// models appear without a deploy and the prices shown are the gateway's own.
// The catalog barely moves, so one fetch per hour per lambda is plenty.

const TTL_MS = 60 * 60 * 1000;

let cache: { at: number; models: ChatModel[] } | null = null;

/** Per-token USD string → USD per 1M tokens, or null when unpriced. */
function perMillion(price: string | undefined): number | null {
  if (!price) return null;
  const n = Number(price) * 1_000_000;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Every language model the gateway will serve, ordered provider-first. Falls
 * back to the built-in ladder if the gateway is unreachable or unauthenticated
 * (which is the normal state in local dev without an OIDC token).
 */
export async function listChatModels(): Promise<ChatModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  try {
    const { models } = await gateway.getAvailableModels();
    const mapped = models
      .filter((m) => m.modelType == null || m.modelType === "language")
      .map<ChatModel>((m) => ({
        id: m.id,
        label: m.name || m.id.split("/")[1] || m.id,
        provider: m.id.split("/")[0] ?? "unknown",
        inputPrice: perMillion(m.pricing?.input),
        outputPrice: perMillion(m.pricing?.output),
      }))
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
