import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  addCheckpoint,
  deleteCheckpoint,
  getCareerActions,
  getCareerPlan,
  getCheckpoints,
  setDestination,
  setTick,
  summarizeCareerPlan,
  updateCheckpoint,
} from "../../lib/career-plan";
import { todayISO } from "../lib/now";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default defineTool({
  description:
    "Berto's career plan at the top of /career, built like his training plan: a destination (one sentence + the date he wants to be there by), dated checkpoints on the way, and the daily actions (from the career daily-actions doc) ticked off each day, with his pace projected to the date. " +
    "op=read shows all of it. op=set_destination changes the goal and/or target_date. op=add_checkpoint / update_checkpoint / delete_checkpoint manage checkpoints (done=true marks one reached). " +
    "op=tick / untick marks a daily action done for a day (default today) — when he says he sent the message, posted the comment or logged a win, tick it, with a short note of who or what. " +
    "Draft destinations and checkpoints with him; don't set ones he hasn't agreed to. To change which daily actions exist, edit the doc with career_daily_actions_doc.",
  inputSchema: z.object({
    op: z.enum(["read", "set_destination", "add_checkpoint", "update_checkpoint", "delete_checkpoint", "tick", "untick"]),
    goal: z.string().optional().describe("set_destination: the one-sentence destination"),
    target_date: z.string().nullable().optional().describe("set_destination: YYYY-MM-DD to be there by; null clears it"),
    checkpoint_id: z.number().int().optional().describe("update_checkpoint / delete_checkpoint"),
    name: z.string().optional().describe("Checkpoint name, e.g. '10 hiring-manager conversations'"),
    due_date: z.string().optional().describe("Checkpoint date, YYYY-MM-DD"),
    done: z.boolean().optional().describe("update_checkpoint: reached (true) or not (false)"),
    notes: z.string().nullable().optional(),
    action: z.string().optional().describe("tick / untick: the daily action's title (or part of it), e.g. 'Send one message'"),
    day: z.string().optional().describe("tick / untick: YYYY-MM-DD, default today"),
    note: z.string().optional().describe("tick: what he did, e.g. 'Messaged Dana Lee at Glean'"),
  }),
  async execute(input) {
    const today = todayISO();
    const plan = async (change: string) => ({ change, summary: summarizeCareerPlan(await getCareerPlan(today), today) });

    switch (input.op) {
      case "read":
        return plan("");
      case "set_destination": {
        if (input.target_date && !ISO.test(input.target_date)) throw new Error("target_date must be YYYY-MM-DD");
        const d = await setDestination({ goal: input.goal, target_date: input.target_date }, today);
        return plan(`Destination: ${d.goal}${d.target_date ? ` by ${d.target_date}` : ""}.`);
      }
      case "add_checkpoint": {
        if (!input.name?.trim() || !input.due_date || !ISO.test(input.due_date)) throw new Error("name and due_date (YYYY-MM-DD) are required");
        const c = await addCheckpoint({ name: input.name, due_date: input.due_date, notes: input.notes ?? null });
        return plan(`Added checkpoint ${c.id}: ${c.name} on ${c.due_date}.`);
      }
      case "update_checkpoint": {
        if (!input.checkpoint_id) throw new Error("checkpoint_id is required");
        if (input.due_date && !ISO.test(input.due_date)) throw new Error("due_date must be YYYY-MM-DD");
        const c = await updateCheckpoint(input.checkpoint_id, { name: input.name, due_date: input.due_date, notes: input.notes, done: input.done }, today);
        if (!c) throw new Error(`No checkpoint ${input.checkpoint_id}. Current: ${(await getCheckpoints()).map((x) => `${x.id} ${x.name}`).join("; ") || "none"}`);
        return plan(`Checkpoint ${c.id}: ${c.name} on ${c.due_date}${c.done_on ? ` ✓ reached ${c.done_on}` : ""}.`);
      }
      case "delete_checkpoint": {
        if (!input.checkpoint_id) throw new Error("checkpoint_id is required");
        await deleteCheckpoint(input.checkpoint_id);
        return plan(`Deleted checkpoint ${input.checkpoint_id}.`);
      }
      case "tick":
      case "untick": {
        const day = input.day ?? today;
        if (!ISO.test(day)) throw new Error("day must be YYYY-MM-DD");
        const actions = await getCareerActions();
        const q = (input.action ?? "").toLowerCase().trim();
        const match = actions.find((a) => a.title.toLowerCase() === q) ?? actions.find((a) => q && (a.title.toLowerCase().includes(q) || q.includes(a.title.toLowerCase())));
        if (!match) throw new Error(`No daily action matches "${input.action ?? ""}". The list: ${actions.map((a) => a.title).join("; ")}`);
        await setTick(day, match, input.op === "tick", input.note);
        return plan(`${input.op === "tick" ? "Ticked" : "Unticked"} "${match.title}" for ${day}${input.note ? ` — ${input.note}` : ""}.`);
      }
    }
  },
  toModelOutput(output) {
    return { type: "text", value: [output.change, "## Career plan", output.summary].filter(Boolean).join("\n") };
  },
});
