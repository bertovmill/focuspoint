import { routeEval } from "./route";

// The post_to_x skill: search memory for themes, draft options, confirm. Posting
// is public, so it must never happen on the first message.
export default routeEval({
  description: "A tweet request drafts from his memory and never posts without his OK.",
  prompt: "Write me a tweet about consistency.",
  anyOf: ["search_memory"],
  never: ["post_tweet"],
});
