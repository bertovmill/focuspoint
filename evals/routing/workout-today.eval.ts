import { todayISO } from "../../agent/lib/now";
import { getSessions } from "../../lib/training";
import { routeEval } from "./route";

// Answerable from the Daily snapshot alone; the reply must name the real session.
export default routeEval({
  description: "\"What's my workout today?\" names the session actually on the plan.",
  prompt: "What's my workout today?",
  reply: {
    label: "mentions today's planned session (or that there is none)",
    async test(reply) {
      const sessions = await getSessions(todayISO(), todayISO());
      if (!sessions.length) return /rest|nothing|no (session|workout)/i.test(reply);
      return sessions.some((s) => reply.toLowerCase().includes(s.title.toLowerCase().split(/[:(]/)[0].trim()));
    },
  },
});
