import { defineAgent, defineDynamic } from "eve";
import { getDb } from "../lib/db";
import { CHAT_MODEL_DEFAULT, getChatModel } from "../lib/chat-model";

// One log line per switch (not per turn), so the server logs always say which
// model answered without drowning in repeats.
let lastLogged: string | undefined;

export default defineAgent({
  // Picked from the chat bar's model picker (lib/chat-model.ts), re-read at the
  // start of every turn, so a new selection applies from the next message — no
  // rebuild, no new session. Returning the gateway id (rather than a model
  // object) lets eve look the model's real context window up in the AI Gateway
  // catalog, so compaction triggers at 90% of *that* model's window instead of
  // a hand-declared 200k that a smaller model would overflow before reaching.
  model: defineDynamic({
    events: {
      "turn.started": async () => {
        let id = CHAT_MODEL_DEFAULT;
        try {
          id = await getChatModel(getDb());
        } catch {
          /* settings unreadable — the default is the honest answer */
        }
        if (id !== lastLogged) {
          console.log(`[model-picker] serving ${id}`);
          lastLogged = id;
        }
        return id;
      },
    },
  }),
  reasoning: "low",
  // sharp ships a native binary per platform. Left to eve's bundler it gets
  // inlined into the hosted function, which then can't find the Linux binary
  // and dies at boot with FUNCTION_INVOCATION_FAILED on every route, health
  // included (that is what killed the 0.49 attempt on 2026-09-02). Listing it
  // here keeps it a normal Node dependency that eve traces into the output.
  build: { externalDependencies: ["sharp"] },
});
