import { defineEval } from "eve/evals";

// Verifies Cael captures a personal reflection rather than just replying.
// Like add-todo, this executes the tool for real against DATABASE_URL.
export default defineEval({
  description: "A personal reflection triggers capture_thought.",
  async test(t) {
    await t.send("I've been feeling anxious about whether I'm spending my time on the right things.");
    t.succeeded();
    t.calledTool("capture_thought");
  },
});
