import { routeEval } from "./route";

export default routeEval({
  description: "MakersLounge questions read the Luma mirror (an on-demand toolset).",
  prompt: "What MakersLounge events are coming up?",
  allOf: ["list_luma_events"],
});
