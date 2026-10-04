import { defineDynamic } from "eve/tools";

import { sessionMemory } from "../lib/session-state";
import { matchesToolset, TOOLSET_NAMES, TOOLSETS, type ToolsetName } from "../toolsets";

// Hands eve the on-demand toolsets (agent/toolsets) that this session has
// loaded, right before each model call — so a `load_toolset` call mid-turn is
// usable on the very next step. A toolset counts as loaded when the model asked
// for it, or when any user message so far plainly needs it (the Writing editor
// prefix, "tweet", "Luma", …).
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
      if (loaded.size === 0) return null;
      const tools = {};
      // Stable order regardless of how they were loaded, so the tool list (and
      // the provider's cached prefix) doesn't reshuffle between steps.
      for (const name of TOOLSET_NAMES) if (loaded.has(name)) Object.assign(tools, TOOLSETS[name].tools);
      return tools;
    },
  },
});
