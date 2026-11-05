import { defineTool } from "eve/tools";
import { z } from "zod";

import { getDb } from "../../lib/db";
import { getChatModel, setChatModel } from "../../lib/chat-model";
import { listChatModels } from "../../lib/gateway-catalog";

// Cael switching its own brain. Same setting the chat bar's picker writes
// (lib/chat-model.ts), so a switch here shows up in the picker and applies from
// the next turn — agent/agent.ts re-reads the selection at every turn start.
// Since 2026-11-05 Cael has the same say over this as Berto: it may switch on its
// own judgement, not only when asked.
export default defineTool({
  description:
    "Switch the model you (Cael) run on, from your next turn onward. Use it when the user asks ('switch to Haiku', " +
    "'use a cheaper model') and also on your own judgement: a cheaper, faster model for quick lookups and logging, " +
    "a stronger one for planning, writing, or careful reasoning. Only models under the price ceiling are allowed — " +
    "call `list_chat_models` first if you aren't sure of the exact id. The user sees the switch in the chat bar; " +
    "mention it in one short clause when you switch on your own.",
  inputSchema: z.object({
    model: z
      .string()
      .describe("AI Gateway model id, provider/model — e.g. 'anthropic/claude-haiku-5.5' or 'openai/gpt-5-mini'."),
    reason: z.string().optional().describe("One short phrase on why, e.g. 'quick lookup' or 'planning the week'."),
  }),
  async execute({ model, reason }) {
    const sql = getDb();
    const offered = await listChatModels();
    const match =
      offered.find((m) => m.id === model) ??
      // Forgive a missing provider or a label instead of an id ("haiku 5.5").
      offered.find((m) => m.id.split("/")[1] === model.toLowerCase()) ??
      offered.find((m) => m.label.toLowerCase() === model.toLowerCase());
    if (!match) {
      const current = await getChatModel(sql);
      return { ok: false as const, current, requested: model, offered: offered.map((m) => m.id) };
    }
    const previous = await getChatModel(sql);
    const current = await setChatModel(sql, match.id);
    return { ok: true as const, previous, current, label: match.label, reason };
  },
  toModelOutput(output) {
    if (!output.ok) {
      return {
        type: "text" as const,
        value:
          `"${output.requested}" isn't a model you can run on (over the price ceiling or not in the catalog). ` +
          `Still on ${output.current}. Offered: ${output.offered.join(", ")}.`,
      };
    }
    if (output.previous === output.current) {
      return { type: "text" as const, value: `Already running on ${output.label} (${output.current}).` };
    }
    return {
      type: "text" as const,
      value: `Switched from ${output.previous} to ${output.label} (${output.current}) from your next turn on.`,
    };
  },
});
