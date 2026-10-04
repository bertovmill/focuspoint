import { routeEval } from "./route";

export default routeEval({
  description: "How the training week is going reads the plan and recent activity.",
  prompt: "How is my training week going so far?",
  allOf: ["list_training_plan"],
});
