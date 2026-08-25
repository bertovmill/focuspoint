import { defineTool } from "eve/tools";
import { z } from "zod";
import { addTaskUpdate } from "../../lib/task-updates.js";

// Cael's side of the task update thread — the same notes Claude posts over MCP
// (app/api/mcp/route.ts). The note lands on the task's card tagged as coming from
// an agent, so a hand-off is visible on the board instead of only in this chat.

export default defineTool({
  description:
    "Leave a short progress note on a task. Use it when you've finished an intermediary step, " +
    "hit something the user has to decide or do, or are handing the work back — the note shows " +
    "on the task's card marked as coming from an agent. It does not change the task's status.",
  inputSchema: z.object({
    id: z.number().int().describe("The task id to post the update on"),
    update: z
      .string()
      .min(1)
      .describe("One or two plain sentences: what's done, and what's needed next"),
  }),
  async execute({ id, update }) {
    const result = await addTaskUpdate(id, update, "agent");
    if (!result.ok) return { success: false, message: result.error };
    return { success: true, id, update: result.update.body };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed." };
    return { type: "text" as const, value: `Posted an update on task ${output.id}: ${output.update}` };
  },
});
