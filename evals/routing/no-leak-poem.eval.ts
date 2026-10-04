import { routeEval } from "./route";

export default routeEval({
  description: "A creative ask doesn't get his training, food or todos stuffed into it.",
  prompt: "Write a four-line poem about the ocean.",
  reply: {
    label: "no personal context leaks in",
    test: (r) => !/hyrox|protein|todo|principle|long run|makerslounge/i.test(r),
  },
});
