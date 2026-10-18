import { defineAgent, defineDynamic } from "eve";
import { getDb } from "../lib/db";
import { CHAT_MODEL_DEFAULT, getChatModelCached } from "../lib/chat-model";

// One log line per switch (not per turn), so the server logs always say which
// model answered without drowning in repeats.
let lastLogged: string | undefined;

// Reasoning is the biggest single cost in Cael's latency: on gpt-6-luna a model
// call took ~2.4s to its first token at "low" and ~0.8s at "none" (measured
// 2026-10-16), and a turn pays it once per tool round. Most of what Berto sends
// is a lookup or a quick ask that doesn't need it, so turns run with reasoning
// off unless the message reads like real thinking work: a long message, or one
// asking to weigh, plan, or decide. CAEL_REASONING pins a level (for evals).
const THINKING_WORK =
  /\b(should i|plan|strategy|strategi[sz]e|prioriti[sz]e|decide|decision|trade-?off|weigh|compare|analy[sz]e|think (it )?through|why|on track|review|reflect|break (it|this) down|figure out|pros and cons)\b/i;
const LONG_MESSAGE_CHARS = 400;

type Reasoning = "none" | "low";

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
    .join(" ");
}

function reasoningFor(messages: readonly { role: string; content: unknown }[]): Reasoning {
  const pinned = process.env.CAEL_REASONING;
  if (pinned === "none" || pinned === "low") return pinned;
  // His latest message — not Cael's injected context lines ([[Now: …]], the snapshot).
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    const text = textOf(m.content).trim();
    if (!text || text.startsWith("[[")) continue;
    return text.length > LONG_MESSAGE_CHARS || THINKING_WORK.test(text) ? "low" : "none";
  }
  return "none";
}

export default defineAgent({
  // Picked from the chat bar's model picker (lib/chat-model.ts), resolved at the
  // start of every turn (Berto wants a switch to apply mid-chat, not only to new
  // chats), from a 30s in-memory cache so most turns skip the db read.
  // Returning the gateway id (rather than a model object) lets eve look the
  // model's real context window up in the AI Gateway catalog, so compaction
  // triggers at 90% of *that* model's window instead of a hand-declared 200k
  // that a smaller model would overflow before reaching.
  model: defineDynamic({
    events: {
      "turn.started": async (_event, ctx) => {
        let id = CHAT_MODEL_DEFAULT;
        try {
          // CAEL_CHAT_MODEL pins a model without touching his picker (for evals).
          id = process.env.CAEL_CHAT_MODEL || (await getChatModelCached(getDb()));
        } catch {
          /* settings unreadable — the default is the honest answer */
        }
        if (id !== lastLogged) {
          console.log(`[model-picker] serving ${id}`);
          lastLogged = id;
        }
        return { model: id, reasoning: reasoningFor(ctx.messages) };
      },
    },
  }),
  // The fallback level; each turn's selection above overrides it.
  reasoning: "low",
  // sharp ships a native binary per platform. Left to eve's bundler it gets
  // inlined into the hosted function, which then can't find the Linux binary
  // and dies at boot with FUNCTION_INVOCATION_FAILED on every route, health
  // included (that is what killed the 0.49 attempt on 2026-09-02). Listing it
  // here keeps it a normal Node dependency that eve traces into the output.
  build: { externalDependencies: ["sharp"] },
});
