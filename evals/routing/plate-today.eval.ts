import { routeEval } from "./route";

export default routeEval({
  description: "\"What should I work on today?\" draws on todos and the calendar.",
  prompt: "What should I work on today?",
  anyOf: ["list_todos", "list_calendar_events"],
});
