import { routeEval } from "./route";

export default routeEval({
  description: "Shipping pace comes from GitHub PRs.",
  prompt: "How many PRs have I shipped this month?",
  allOf: ["list_github_prs"],
});
