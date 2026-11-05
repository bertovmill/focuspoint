import { defineTool } from "eve/tools";
import { z } from "zod";

// Moves Berto's screen, not the data: the chat client (app/_components/
// agent-chat.tsx, useAgentNavigation) watches for this tool's result and does
// a client-side route change, then scrolls to and flashes the `highlight`
// element. Nothing happens server-side, and over MCP there is no screen, so
// this tool is deliberately left out of lib/agent-tool-registry.ts.
//
// Destinations the app knows how to open and highlight (Berto, 2026-11-05):
//   /notes?note=<id>          one note (highlight: note-<id>)
//   /writing?post=<slug>      one article in the editor
//   /sketches?sketch=<id>     one sketch
//   /                         Home; highlight: a section's slug (its title,
//                             lowercased, dashes for anything non-alphanumeric)
//   /career                   highlight: principles | daily-actions | pipeline |
//                             relationships | portfolio
//   /persona                  highlight: persona-draft
//   /tasks /meals /training /calendar /vision /family /measures /nutrition
export default defineTool({
  description:
    "Take Berto to a page of the Cael app and highlight one thing on it — the note you just saved, the Career section you just rewrote. Use it ONLY when he asks to see or go to something (\"show me\", \"take me there\", \"navigate there\", \"open it\") or when you tell him you'll show him; never after every edit. Paths: /notes?note=<id> (highlight note-<id>), /writing?post=<slug>, /sketches?sketch=<id>, / with highlight = a Home section's slug (title lowercased, non-alphanumerics to dashes), /career with highlight principles | daily-actions | pipeline | relationships | portfolio, /persona with highlight persona-draft, and /tasks, /meals, /training, /calendar, /vision, /family, /measures. Call it after the edit is saved, then tell him in one line what he's looking at.",
  inputSchema: z.object({
    path: z
      .string()
      .regex(/^\/[^\s]*$/, "an in-app path like /notes?note=12")
      .describe("In-app path, starting with /, with any query string (e.g. /notes?note=12)."),
    highlight: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/i)
      .optional()
      .describe("Element to scroll to and flash: an id on the page (note-12, relationships, persona-draft, a Home section slug)."),
    label: z.string().max(80).optional().describe("Short name of what he'll see, e.g. 'Lovis's advice in Relationships'."),
  }),
  async execute({ path, highlight, label }) {
    return { path, highlight: highlight ?? null, label: label ?? null };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Navigating his screen to ${output.path}${output.highlight ? ` and highlighting #${output.highlight}` : ""}. Tell him in one line what he's looking at.`,
    };
  },
});
