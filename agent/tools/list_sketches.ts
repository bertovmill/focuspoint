import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { readScene } from "../../lib/sketch-text.js";

export default defineTool({
  description:
    "List the user's sketches — the drawings and diagrams they've made on the sketch canvas. Returns each sketch's id, title, when it was last worked on, and a short preview of the text in it. Use this to browse what the user has drawn, then call read_sketch to read one in full.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(25).describe("How many sketches to return"),
    search: z
      .string()
      .optional()
      .describe("Only return sketches whose title contains this text (case-insensitive)"),
  }),
  async execute({ limit, search }) {
    const sql = getDb();
    const rows = search
      ? await sql`
          SELECT id, title, scene, created_at, updated_at
          FROM sketches
          WHERE title ILIKE ${"%" + search + "%"}
          ORDER BY updated_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, title, scene, created_at, updated_at
          FROM sketches
          ORDER BY updated_at DESC
          LIMIT ${limit}
        `;

    const sketches = rows.map((r) => {
      const reading = r.scene ? readScene(r.scene) : null;
      // Older sketches predate the Excalidraw switch and are stored as a flat PNG only,
      // so there's no text to extract from them — say so rather than showing them empty.
      const words = reading ? [...reading.text, ...reading.shapes.map((s) => s.label)] : [];
      const preview = words.join(" · ").slice(0, 140);
      return {
        id: Number(r.id),
        title: String(r.title),
        readable: Boolean(r.scene),
        preview,
        elements: reading?.total ?? 0,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      };
    });

    return { sketches, count: sketches.length };
  },
  toModelOutput(output) {
    if (output.count === 0) return { type: "text", value: "No sketches found." };
    const lines = output.sketches.map((s) => {
      const when = s.updated_at.slice(0, 10);
      if (!s.readable) return `#${s.id} "${s.title}" (${when}) — image-only, no readable text`;
      return `#${s.id} "${s.title}" (${when})${s.preview ? ` — ${s.preview}` : ""}`;
    });
    return {
      type: "text",
      value: `${output.count} sketch${output.count === 1 ? "" : "es"}:\n${lines.join("\n")}\n\nCall read_sketch with an id to read one in full.`,
    };
  },
});
