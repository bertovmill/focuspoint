import { routeEval } from "./route";

export default routeEval({
  description: "Something he said before is recalled from his notes by meaning.",
  prompt: "What have I said before about fasting?",
  anyOf: ["search_memory", "list_notes"],
});
