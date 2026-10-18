import { routeEval } from "./route";

export default routeEval({
  description: "MakersLounge questions read the Luma mirror (an on-demand toolset).",
  prompt: "What MakersLounge events are coming up?",
  allOf: ["list_luma_events"],
  // "MakersLounge" is a trigger word, so the toolset is already loaded: a
  // load_toolset call here is a wasted round trip.
  never: ["load_toolset"],
  budget: { steps: 2 },
});
