import { defineTool } from "eve/tools";
import { z } from "zod";

import { getDb } from "../../lib/db";
import { formatContextWindow, formatPricePerMillion, getChatModel, getPinnedModels } from "../../lib/chat-model";
import { listChatModels } from "../../lib/gateway-catalog";

// The same list the chat bar's model picker shows: every AI Gateway model under
// the price ceiling with enough context for Cael, with the gateway's own prices.
// Cael reads this before switching with `set_chat_model`, so it picks from what
// is actually offered rather than guessing an id.
export default defineTool({
  description:
    "List the models you (Cael) can run on, with price per 1M tokens (in / out), context window, which are pinned " +
    "in the chat bar, and which one is running right now. Call this before `set_chat_model` when you don't already " +
    "know the exact model id, or when the user asks what models are available or what you're running on.",
  inputSchema: z.object({}),
  async execute() {
    const sql = getDb();
    const [models, current, pinned] = await Promise.all([listChatModels(), getChatModel(sql), getPinnedModels(sql)]);
    return { current, pinned, models };
  },
  toModelOutput({ current, pinned, models }) {
    const pins = new Set(pinned);
    const lines = models.map(
      (m) =>
        `${m.id === current ? "* " : "  "}${m.id} — ${m.label}, ${formatPricePerMillion(m.inputPrice)} / ` +
        `${formatPricePerMillion(m.outputPrice)} per 1M, ${formatContextWindow(m.contextWindow)} context` +
        (pins.has(m.id) ? ", pinned" : ""),
    );
    return { type: "text" as const, value: `Running on ${current}. Available (* = current):\n${lines.join("\n")}` };
  },
});
