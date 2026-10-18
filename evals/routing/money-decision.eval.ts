import { routeEval } from "./route";

// The Ontario salary thread: money questions went unanswered by his own canon.
export default routeEval({
  description: "A money/career decision is weighed against his vision for Money, not general advice.",
  prompt: "Would I be better off taking a $200k salary or running $200k through my own business? Be brief.",
  // His Money vision rides in the Daily snapshot since 2026-10-16, so the
  // answer has to use it rather than fetch it: its two questions are whether the
  // path is genuinely different and whether he keeps control.
  reply: {
    label: "weighs it against his Money vision (difference / control / ownership)",
    test: (reply) => /\b(control|ownership|own(s|ing)?\b|different|money vision|sameness)/i.test(reply),
  },
  // The vision is already in context: one step to answer, two at most.
  budget: { steps: 2 },
});
