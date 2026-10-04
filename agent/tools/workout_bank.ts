import { defineTool } from "eve/tools";
import { z } from "zod";
import { archiveWorkout, getWorkout, listWorkouts, saveWorkout } from "../../lib/workout-bank";

// The workout bank (/training/workouts): Berto's repeatable workouts, each a JSON
// definition. Same data the editor page writes, so a change here shows there.
export default defineTool({
  description:
    "Read or change Berto's workout bank — the repeatable structured workouts at /training/workouts (Unity Standard Upper/Lower Body, Threshold Intervals, Stations, Hyrox Sim, 20K Long Run). action 'list' gives every workout with its default day; 'get' gives one workout's full definition (blocks → exercises with key, name, sets, ladder of rep targets or target seconds for measure 'time', weight, weightUnit, perSide, tracked, note); 'save' replaces a workout's definition (always 'get' first and send the whole thing back with your change — keep each exercise's key so its history stays, omit key only for new exercises); 'remove' archives it. default_day: 0 = Monday … 6 = Sunday, null = not in the default week. New weeks fill themselves from those days.",
  inputSchema: z.object({
    action: z.enum(["list", "get", "save", "remove"]),
    slug: z.string().optional().describe("The workout's slug, e.g. unity-standard-upper-body. Omit with 'save' to create a new workout."),
    definition: z.string().optional().describe("For 'save': the full workout definition as JSON (name, session_type, default_day, plan, warmup, cooldown, blocks)."),
  }),
  async execute({ action, slug, definition }) {
    if (action === "list") {
      const all = await listWorkouts();
      return all.map((w) => ({ slug: w.slug, name: w.name, session_type: w.session_type, default_day: w.default_day, exercises: w.blocks.flatMap((b) => b.exercises.map((e) => e.name)) }));
    }
    if (!slug && action !== "save") throw new Error("slug is required");
    if (action === "get") {
      const w = await getWorkout(slug!);
      if (!w) throw new Error(`No workout ${slug}`);
      return w;
    }
    if (action === "remove") {
      await archiveWorkout(slug!);
      return { removed: slug };
    }
    if (!definition) throw new Error("definition is required to save");
    const def = JSON.parse(definition);
    const existing = slug ? await getWorkout(slug) : null;
    if (slug && !existing) throw new Error(`No workout ${slug}`);
    return saveWorkout(def, existing?.slug);
  },
  toModelOutput(output) {
    return { type: "text", value: JSON.stringify(output) };
  },
});
