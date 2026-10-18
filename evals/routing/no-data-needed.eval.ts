import { routeEval } from "./route";

// The cost of always-on context: none of it should leak into an unrelated ask.
export default routeEval({
  description: "A question that needs none of his data uses no tools and drags none in.",
  prompt: "What is 15% of 240? Just the number.",
  noTools: true,
  reply: { label: "answers 36", test: (r) => r.includes("36") },
});
