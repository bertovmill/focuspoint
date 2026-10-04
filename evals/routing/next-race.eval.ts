import { daysUntil, getEvents } from "../../lib/training";
import { routeEval } from "./route";

export default routeEval({
  description: "Next race comes back with its real date, not a guess.",
  prompt: "When is my next race?",
  reply: {
    label: "mentions the next race's name or date",
    async test(reply) {
      const next = (await getEvents()).find((e) => daysUntil(e.event_date) >= 0);
      if (!next) return /no (upcoming )?race/i.test(reply);
      const [y, m, d] = next.event_date.split("-").map(Number);
      const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      return reply.includes(next.event_date) || (reply.includes(month) && reply.includes(String(d))) || reply.includes(next.name);
    },
  },
});
