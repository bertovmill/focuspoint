import { routeEval } from "./route";

export default routeEval({
  description: "Big-picture pacing reads the 2030 road and visions.",
  prompt: "Am I on track for where I want to be in 2030?",
  allOf: ["list_vision"],
});
