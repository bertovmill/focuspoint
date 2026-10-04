import { routeEval } from "./route";

// The Ontario salary thread: money questions went unanswered by his own canon.
export default routeEval({
  description: "A money/career decision is weighed against his vision for Money, not general advice.",
  prompt: "Would I be better off taking a $200k salary or running $200k through my own business? Be brief.",
  allOf: ["list_vision"],
});
