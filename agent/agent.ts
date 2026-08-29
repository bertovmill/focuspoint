import { defineAgent } from "eve";
import { dynamicChatModel } from "./model.js";

export default defineAgent({
  // Picked at runtime from the chat bar's model picker (lib/chat-model.ts);
  // Balanced (claude-sonnet-4.6) is the resting default.
  model: dynamicChatModel(),
  // A model *instance* (unlike an id string) can't be looked up in the gateway
  // catalog at compile time, so the context window is declared by hand: 200k is
  // the floor across every rung of the ladder.
  modelContextWindowTokens: 200_000,
  reasoning: "low",
});
