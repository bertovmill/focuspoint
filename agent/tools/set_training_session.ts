import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteSession, saveSession, setSessionDone } from "../../lib/training";

export default defineTool({
  description:
    "Add, edit, complete or delete one session on Berto's training plan (/training). To add: give date, type and a title. To edit or complete: give the id (from list_training_plan). Types: long_run, intervals, easy, hyrox, strength, rest. When he says he did a session that isn't on the plan, add it with done=true and the actuals.",
  inputSchema: z.object({
    id: z.number().int().optional().describe("Existing session id to edit, complete, or delete"),
    delete: z.boolean().optional().describe("Remove the session with this id"),
    session_date: z.string().optional().describe("ISO date. Required when adding."),
    type: z.enum(["long_run", "intervals", "easy", "hyrox", "strength", "rest"]).optional(),
    title: z.string().optional().describe("Short name, e.g. '18k steady' or 'Hyrox sim'"),
    target_km: z.number().nullable().optional(),
    target_minutes: z.number().int().nullable().optional().describe("For non-run sessions. Runs derive it from target_km × target_pace_sec."),
    target_pace_sec: z.number().int().nullable().optional().describe("Run target pace in seconds per km, e.g. 330 for 5:30/km"),
    intensity: z.enum(["easy", "moderate", "hard"]).nullable().optional(),
    notes: z.string().nullable().optional(),
    done: z.boolean().optional().describe("Mark done (true) or not done (false)"),
    actual_km: z.number().optional(),
    actual_minutes: z.number().int().optional(),
  }),
  async execute(input) {
    if (input.id && input.delete) {
      await deleteSession(input.id);
      return { deleted: input.id };
    }
    let row = null;
    const editing = input.id && (input.session_date || input.type || input.title || input.target_km !== undefined || input.target_minutes !== undefined || input.target_pace_sec !== undefined || input.intensity !== undefined || input.notes !== undefined);
    if (!input.id) {
      if (!input.session_date || !input.type) throw new Error("session_date and type are required to add a session");
      row = await saveSession({ session_date: input.session_date, type: input.type, title: input.title, target_km: input.target_km ?? null, target_minutes: input.target_minutes ?? null, target_pace_sec: input.target_pace_sec ?? null, intensity: input.intensity ?? null, notes: input.notes ?? null });
    } else if (editing) {
      const { getSessions } = await import("../../lib/training");
      const cur = (await getSessions("1970-01-01", "2999-12-31")).find((s) => s.id === input.id);
      if (!cur) throw new Error("Session not found");
      row = await saveSession({
        id: input.id,
        session_date: input.session_date ?? cur.session_date,
        type: input.type ?? cur.type,
        title: input.title ?? cur.title,
        target_km: input.target_km !== undefined ? input.target_km : cur.target_km,
        target_minutes: input.target_minutes !== undefined ? input.target_minutes : cur.target_minutes,
        target_pace_sec: input.target_pace_sec !== undefined ? input.target_pace_sec : cur.target_pace_sec,
        intensity: input.intensity !== undefined ? input.intensity : cur.intensity,
        notes: input.notes !== undefined ? input.notes : cur.notes,
      });
    }
    if (typeof input.done === "boolean") {
      row = await setSessionDone(row?.id ?? input.id!, input.done, { km: input.actual_km ?? null, minutes: input.actual_minutes ?? null });
    }
    return row;
  },
  toModelOutput(output) {
    if (!output) return { type: "text", value: "Nothing changed." };
    if ("deleted" in output) return { type: "text", value: `Deleted session ${output.deleted}.` };
    return { type: "text", value: `${output.session_date} ${output.type}: "${output.title}"${output.done ? " ✓ done" : ""}${output.actual_km ? ` (${output.actual_km} km)` : ""}.` };
  },
});
