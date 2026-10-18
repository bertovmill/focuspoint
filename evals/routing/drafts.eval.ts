import { routeEval } from "./route";

export default routeEval({
  description: "Questions about his articles load the publishing toolset and list posts.",
  prompt: "Which of my articles are still drafts?",
  allOf: ["list_posts"],
  never: ["publish_post"],
});
