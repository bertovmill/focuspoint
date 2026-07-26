import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "List the user's vision items: vision statements, long-term goals (with horizons), vision-board images, methods (the daily practices for a form of wealth, titled with the form's name), milestones (the yearly timeline from now to 2030, titled with the year), and routines (named recurring schedules, e.g. a weekly workout routine, titled with the routine's name). Use this before talking about the user's big picture or long-term direction.",
  inputSchema: z.object({
    kind: z
      .enum(["statement", "goal", "image", "method", "milestone", "routine"])
      .optional()
      .describe("Filter to one kind. Omit to get everything."),
  }),
  async execute({ kind }) {
    const sql = getDb();
    const rows = kind
      ? await sql`
          SELECT id, kind, title, content, image_url, horizon, achieved, created_at
          FROM vision_items WHERE kind = ${kind} ORDER BY created_at ASC
        `
      : await sql`
          SELECT id, kind, title, content, image_url, horizon, achieved, created_at
          FROM vision_items ORDER BY kind, created_at ASC
        `;
    return rows;
  },
  toModelOutput(output) {
    if (output.length === 0) return { type: "text", value: "No vision items yet." };
    const lines = output.map((r) => {
      if (r.kind === "statement") return `[statement #${r.id}]${r.title ? ` (${r.title})` : ""} ${r.content}`;
      if (r.kind === "method") return `[method #${r.id}]${r.title ? ` (${r.title})` : ""} ${r.content}`;
      if (r.kind === "milestone") return `[milestone #${r.id}]${r.title ? ` (${r.title})` : ""} ${r.content}`;
      if (r.kind === "routine") return `[routine #${r.id}]${r.title ? ` (${r.title})` : ""} ${r.content}`;
      if (r.kind === "goal")
        return `[goal #${r.id}] ${r.title}${r.horizon ? ` (${r.horizon})` : ""}${r.achieved ? " — achieved" : ""}${r.content ? ` — ${r.content}` : ""}`;
      return `[image #${r.id}]${r.title ? ` ${r.title}` : ""} ${r.image_url}`;
    });
    return { type: "text", value: lines.join("\n") };
  },
});
