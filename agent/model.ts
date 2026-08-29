import { gateway } from "ai";
import type { LanguageModel } from "ai";
import { getDb } from "../lib/db.js";
import { CHAT_MODEL_DEFAULT, getChatModel } from "../lib/chat-model.js";

// eve fixes an agent's model at compile time, but the chat bar's picker needs it
// to move at runtime. This wraps the default gateway model in a proxy that
// re-reads the `chat_model` setting on every doGenerate/doStream, so a new
// selection applies from the very next model call — no rebuild, no new session.
// Everything else (modelId, provider, catalog metadata) is answered by the
// Balanced default, which is only used for compile-time routing and limits.
export function dynamicChatModel(): LanguageModel {
  const base = gateway(CHAT_MODEL_DEFAULT);
  const cache = new Map<string, ReturnType<typeof gateway>>([[CHAT_MODEL_DEFAULT, base]]);

  // One log line per switch (not per call), so the server logs always say which
  // rung answered without drowning in repeats.
  let lastLogged: string | undefined;

  const resolve = async () => {
    try {
      const id = await getChatModel(getDb());
      if (id !== lastLogged) {
        console.log(`[model-picker] serving ${id}`);
        lastLogged = id;
      }
      let model = cache.get(id);
      if (!model) {
        model = gateway(id);
        cache.set(id, model);
      }
      return model;
    } catch {
      return base;
    }
  };

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "doGenerate" || prop === "doStream") {
        return async (options: unknown) => {
          const model = await resolve();
          return (model[prop] as (o: unknown) => Promise<unknown>)(options);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
