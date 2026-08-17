import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { formatReading, readScene } from "../../lib/sketch-text.js";

export default defineTool({
  description:
    "Read one sketch's contents: every piece of text in it, the labelled shapes, and which shapes the arrows connect. Use this when the user refers to something they drew — a diagram, a plan, a map on the canvas — so you can reason about what's actually on it. Identify the sketch by id (from list_sketches) or by title.",
  inputSchema: z.object({
    id: z.number().int().optional().describe("The sketch id, from list_sketches"),
    title: z
      .string()
      .optional()
      .describe("Part of the sketch's title, if you don't have the id (case-insensitive)"),
  }),
  async execute({ id, title }) {
    if (id === undefined && !title) {
      return { found: false as const, reason: "Give either an id or a title." };
    }

    const sql = getDb();
    const rows =
      id !== undefined
        ? await sql`SELECT id, title, scene, created_at, updated_at FROM sketches WHERE id = ${id}`
        : await sql`
            SELECT id, title, scene, created_at, updated_at
            FROM sketches
            WHERE title ILIKE ${"%" + title + "%"}
            ORDER BY updated_at DESC
            LIMIT 5
          `;

    if (rows.length === 0) {
      return {
        found: false as const,
        reason: id !== undefined ? `No sketch with id ${id}.` : `No sketch whose title matches "${title}".`,
      };
    }
    // A title search can be ambiguous — hand back the candidates rather than guessing.
    if (rows.length > 1) {
      return {
        found: false as const,
        reason: `Several sketches match "${title}".`,
        candidates: rows.map((r) => ({ id: Number(r.id), title: String(r.title) })),
      };
    }

    const row = rows[0];
    const reading = row.scene ? readScene(row.scene) : null;
    return {
      found: true as const,
      id: Number(row.id),
      title: String(row.title),
      readable: Boolean(row.scene),
      reading,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  },
  toModelOutput(output) {
    if (!output.found) {
      const list = output.candidates?.length
        ? `\n${output.candidates.map((c) => `  #${c.id} "${c.title}"`).join("\n")}`
        : "";
      return { type: "text", value: `${output.reason}${list}` };
    }
    const header = `Sketch #${output.id} "${output.title}" (updated ${output.updated_at.slice(0, 10)})`;
    if (!output.readable || !output.reading) {
      return {
        type: "text",
        value: `${header}\n\nThis one was drawn before the canvas stored editable scenes — it exists only as a flat image, so there's no text to read from it.`,
      };
    }
    return { type: "text", value: `${header}\n\n${formatReading(output.reading)}` };
  },
});
