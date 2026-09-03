import { defineAgent } from "eve";
import { dynamicChatModel } from "./model.js";

export default defineAgent({
  // Picked at runtime from the chat bar's model picker (lib/chat-model.ts),
  // which now offers every model in the AI Gateway catalog; claude-sonnet-4.6
  // is the resting default.
  model: dynamicChatModel(),
  // A model *instance* (unlike an id string) can't be looked up in the gateway
  // catalog at compile time, so the context window is declared by hand. 200k
  // matches every Claude model and the frontier models worth picking; a smaller
  // model chosen from the catalog's long tail would have eve compacting later
  // than that model can actually take.
  modelContextWindowTokens: 200_000,
  reasoning: "low",
});
