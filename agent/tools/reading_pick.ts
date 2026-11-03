import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  afterReadingRating,
  getInterestProfile,
  listReadingPicks,
  pickTonightsRead,
  rateReadingPick,
} from "../../lib/reading-picks";

// The evening reading loop (lib/reading-picks.ts): see tonight's pick, swap it,
// or record his 👍/👎 and what he thought, which rewrites his interest profile.

export default defineTool({
  description:
    "Berto's evening reading loop. action 'tonight' returns tonight's pick (making one if 7pm's hasn't run), " +
    "'swap' replaces it with another, 'history' lists recent picks with ratings plus his interest profile, " +
    "'rate' saves his 👍/👎 and/or one-line feedback on a pick (use it whenever he says he liked, disliked, " +
    "or has a take on something Cael suggested reading). Rating rewrites the interest profile the next pick uses.",
  inputSchema: z.object({
    action: z.enum(["tonight", "swap", "history", "rate"]),
    id: z.number().int().optional().describe("For 'rate': the pick id. Defaults to the latest pick."),
    rating: z.enum(["up", "down"]).optional().describe("For 'rate'"),
    feedback: z.string().optional().describe("For 'rate': what he thought, in his words"),
  }),
  async execute({ action, id, rating, feedback }) {
    if (action === "tonight" || action === "swap") {
      return { pick: await pickTonightsRead({ force: action === "swap" }) };
    }
    if (action === "history") {
      const [picks, profile] = await Promise.all([listReadingPicks(14), getInterestProfile()]);
      return { picks, profile: profile.content };
    }
    const target = id ?? (await listReadingPicks(1))[0]?.id;
    if (!target) return { error: "No reading picks yet." };
    const pick = await rateReadingPick(target, rating, feedback);
    if (!pick) return { error: `No pick ${target}.` };
    await afterReadingRating();
    return { pick, profile: (await getInterestProfile()).content };
  },
  toModelOutput(output) {
    if ("error" in output) return { type: "text" as const, value: String(output.error) };
    const p = (x: { title: string; url: string; why: string; prompt: string; rating: string | null; feedback: string | null; id: number; date: string }) =>
      `#${x.id} ${x.date}: ${x.title} (${x.url})${x.rating ? ` [${x.rating === "up" ? "👍" : "👎"}]` : ""}${x.feedback ? ` "${x.feedback}"` : ""}\nWhy: ${x.why}\nAfter: ${x.prompt}`;
    if ("picks" in output && output.picks) {
      return { type: "text" as const, value: `${output.picks.map(p).join("\n\n") || "No picks yet."}\n\nInterest profile:\n${output.profile || "(empty)"}` };
    }
    if (!("pick" in output) || !output.pick) return { type: "text" as const, value: "No pick." };
    return {
      type: "text" as const,
      value: p(output.pick) + ("profile" in output && output.profile ? `\n\nUpdated interest profile:\n${output.profile}` : ""),
    };
  },
});
