import { defineTool } from "eve/tools";
import { z } from "zod";

import { sessionMemory } from "../lib/session-state";
import { TOOLSET_NAMES, TOOLSETS } from "../lib/toolsets";

const catalog = TOOLSET_NAMES.map(
  (name) => `- ${name}: ${TOOLSETS[name].summary} (${Object.keys(TOOLSETS[name].tools).join(", ")})`,
).join("\n");

export default defineTool({
  description:
    "Load a group of tools that isn't carried by default. If the tool you need is already in your tool list, skip this and call it directly. Otherwise call this first; the tools are available from your next step and stay loaded for the rest of the conversation.\n" +
    catalog,
  inputSchema: z.object({
    toolset: z.enum(TOOLSET_NAMES as [string, ...string[]]).describe("Which toolset to load."),
  }),
  async execute({ toolset }) {
    sessionMemory.update((s) => ({
      ...s,
      toolsets: s.toolsets.includes(toolset) ? s.toolsets : [...s.toolsets, toolset],
    }));
    return { toolset, tools: Object.keys(TOOLSETS[toolset as keyof typeof TOOLSETS].tools) };
  },
  toModelOutput({ toolset, tools }) {
    return { type: "text" as const, value: `Loaded ${toolset}: ${tools.join(", ")} are available now.` };
  },
});
