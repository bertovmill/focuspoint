import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { normalizeTags } from "../../lib/note-tags";

export default defineTool({
  description:
    "Add or remove tags on an existing note. Use when the user asks to tag, label or untag a note, e.g. 'tag this note persona'. 'This note' is the one he has open (the context line names its id); otherwise find it with list_notes or search_memory first. Tagging a note 'persona' feeds the public persona profile on /persona.",
  inputSchema: z.object({
    id: z.number().int().describe("The note's id"),
    add: z.array(z.string()).optional().describe("Tags to add, e.g. ['persona']"),
    remove: z.array(z.string()).optional().describe("Tags to remove"),
  }),
  async execute({ id, add, remove }) {
    const sql = getDb();
    const [row] = await sql`SELECT tags FROM thoughts WHERE id = ${id}`;
    if (!row) return { ok: false as const, error: `No note with id ${id}.` };
    const drop = new Set(normalizeTags(remove ?? []));
    const next = normalizeTags([...((row.tags as string[] | null) ?? []), ...(add ?? [])]).filter((t) => !drop.has(t));
    await sql`UPDATE thoughts SET tags = ${next} WHERE id = ${id}`;
    return { ok: true as const, id, tags: next };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: output.ok ? `Note ${output.id} tags: ${output.tags.join(", ") || "(none)"}.` : output.error,
    };
  },
});
