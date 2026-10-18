import { routeEval } from "./route";

export default routeEval({
  description: "A reference to something he drew goes to the sketches.",
  prompt: "Pull up the flywheel I sketched.",
  anyOf: ["list_sketches", "read_sketch"],
});
