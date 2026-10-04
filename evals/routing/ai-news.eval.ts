import { routeEval } from "./route";

export default routeEval({
  description: "AI headlines come from latest_ai_news, not open-ended web search.",
  prompt: "What are the latest AI headlines?",
  allOf: ["latest_ai_news"],
  never: ["web_search"],
});
