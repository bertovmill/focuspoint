import { routeEval } from "./route";

export default routeEval({
  description: "Big-picture pacing uses the 2030 road and visions (in the Daily snapshot since 2026-10-16).",
  prompt: "Am I on track for where I want to be in 2030?",
  reply: {
    label: "talks about the road to 2030 (a year milestone or the vision)",
    test: (reply) => /\b20(2[6-9]|30)\b|milestone|vision/i.test(reply),
  },
  // A big-picture question: the vision is in context, and anything else it
  // reads (home sections, todos, notes) goes out in one parallel round.
  budget: { toolCalls: 8, steps: 2 },
});
