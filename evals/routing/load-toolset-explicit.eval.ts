import { routeEval } from "./route";

// No trigger word here, so the toolset has to come from load_toolset itself.
export default routeEval({
  description: "With no trigger word, Cael loads a toolset itself before using it.",
  prompt: "How many people actually showed up to my last event?",
  allOf: ["load_toolset"],
  anyOf: ["list_luma_events", "get_luma_event"],
});
