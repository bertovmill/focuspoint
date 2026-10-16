import { routeEval } from "./route";

export default routeEval({
  description: "\"What should I work on today?\" draws on todos and the calendar.",
  prompt: "What should I work on today?",
  anyOf: ["list_todos", "list_calendar_events"],
  // Fans out to 6–8 parallel reads (todos, calendar, vision, career docs) and
  // sometimes hands off to the planner subagent, which is where the uncached
  // tokens come from.
  budget: { toolCalls: 8, uncachedInputTokens: 40_000 },
});
