import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { embedText, toVectorLiteral } from "../../lib/embeddings";
import { sessionMemory } from "../lib/session-state";

export default defineTool({
  description:
    "Save a thought, idea, observation, or reflection the user shares. Always call list_folders first to pick the right folder_id. If no suitable folder exists, call create_folder first. Call this whenever the user expresses something personal, mentions a goal, shares a feeling, or says something they want to remember. If the user has just shared a photo and asks to save or remember it, pass its public URL (from the '[Image uploaded — public URL: ...]' text in their message) as image_url — content can then be a short caption or the user's own words about the photo.",
  inputSchema: z.object({
    content: z.string().describe("The thought to capture, in the user's own words or a close paraphrase. If the note is just a saved photo with no real caption, a short description of the image is fine."),
    tags: z.array(z.string()).optional().describe("Short topic tags, e.g. ['health', 'work', 'goals']"),
    folder_id: z.number().int().optional().describe("ID of the folder to file this note under (get from list_folders or create_folder)"),
    image_url: z.string().url().optional().describe("Public Blob URL of a photo to attach to this note, from a '[Image uploaded — public URL: ...]' marker earlier in the conversation"),
  }),
  async execute({ content, tags, folder_id, image_url }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO thoughts (content, tags, folder_id, image_url)
      VALUES (${content}, ${tags ?? []}, ${folder_id ?? null}, ${image_url ?? null})
      RETURNING id, folder_id
    `;
    // Best-effort embedding for semantic search — never fail the capture if the
    // embeddings gateway is unavailable; the note just stays unsearchable by
    // meaning until re-embedded.
    try {
      const lit = toVectorLiteral(await embedText(content));
      await sql`UPDATE thoughts SET embedding = ${lit}::vector WHERE id = ${row.id}`;
    } catch (err) {
      console.error("capture_thought: embedding failed", err);
    }
    // Session memory only exists inside an eve session; over MCP there is none, and
    // the note is already saved, so a missing tally must not turn into an error.
    try {
      sessionMemory.update((s) => ({ ...s, thoughtsCaptured: s.thoughtsCaptured + 1 }));
    } catch {}
    return { id: Number(row.id), folder_id: row.folder_id != null ? Number(row.folder_id) : null, captured: true };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Thought captured (id: ${output.id}${output.folder_id ? `, folder: ${output.folder_id}` : ""}).`,
    };
  },
});
