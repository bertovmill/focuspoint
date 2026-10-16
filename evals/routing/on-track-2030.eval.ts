import { routeEval } from "./route";

export default routeEval({
  description: "Big-picture pacing reads the 2030 road and visions.",
  prompt: "Am I on track for where I want to be in 2030?",
  allOf: ["list_vision"],
  // A big-picture question: reads vision, home sections, todos and more in
  // parallel, like plate-today.
  budget: { toolCalls: 8 },
});
