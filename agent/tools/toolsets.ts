import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";

import { sessionMemory } from "../lib/session-state";
import { matchesToolset, TOOLSET_NAMES, TOOLSETS, type ToolsetName } from "../lib/toolsets";

// Hands eve the on-demand toolsets (agent/lib/toolsets) that this session has
// loaded, right before each model call — so a `load_toolset` call mid-turn is
// usable on the very next step. A toolset counts as loaded when the model asked
// for it, or when any user message so far plainly needs it (the Writing editor
// prefix, "tweet", "Luma", …).
//
// `load_toolset` lives here too, and only lists toolsets that aren't loaded yet:
// when a trigger word already loaded one, the model used to call `load_toolset`
// for it anyway, spending a whole extra step. Once everything is loaded the tool
// drops out entirely.
const INJECTED_PREFIXES = ["[[Daily snapshot", "[[Now:"];

export default defineDynamic({
  events: {
    "step.started": (_event, ctx) => {
      const loaded = new Set<ToolsetName>(
        sessionMemory.get().toolsets.filter((n): n is ToolsetName => n in TOOLSETS),
      );
      for (const message of ctx.messages) {
        if (message.role !== "user") continue;
        const text = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
        // Cael's own injected context (the Daily snapshot, the clock line) isn't
        // Berto asking for anything — his principles mention "portfolio".
        if (INJECTED_PREFIXES.some((p) => text.trimStart().startsWith(p))) continue;
        for (const name of matchesToolset(text)) loaded.add(name);
      }

      const tools = {};
      const unloaded = TOOLSET_NAMES.filter((name) => !loaded.has(name));
      if (unloaded.length > 0) {
        const catalog = unloaded
          .map((name) => `- ${name}: ${TOOLSETS[name].summary} (${Object.keys(TOOLSETS[name].tools).join(", ")})`)
          .join("\n");
        Object.assign(tools, { load_toolset: defineTool({
          description:
            "Load a group of tools that isn't carried by default. Call this first when you need one of the tools listed below; they are available from your next step and stay loaded for the rest of the conversation.\n" +
            catalog,
          inputSchema: z.object({
            toolset: z.enum(unloaded as [string, ...string[]]).describe("Which toolset to load."),
          }),
          async execute({ toolset }) {
            sessionMemory.update((s) => ({
              ...s,
              toolsets: s.toolsets.includes(toolset) ? s.toolsets : [...s.toolsets, toolset],
            }));
            return { toolset, tools: Object.keys(TOOLSETS[toolset as ToolsetName].tools) };
          },
          toModelOutput({ toolset, tools }) {
            return { type: "text" as const, value: `Loaded ${toolset}: ${tools.join(", ")} are available now.` };
          },
        }) });
      }
      // Stable order regardless of how they were loaded, so the tool list (and
      // the provider's cached prefix) doesn't reshuffle between steps.
      for (const name of TOOLSET_NAMES) if (loaded.has(name)) Object.assign(tools, TOOLSETS[name].tools);
      return tools;
    },
  },
});
