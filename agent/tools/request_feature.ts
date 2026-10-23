import { defineTool } from "eve/tools";
import { once } from "eve/tools/approval";
import { z } from "zod";
import { CAEL_REPO, createIssue } from "../../lib/github";

// The path for changes to the app itself (pages, components, API routes, lib/,
// the schema). It files a GitHub issue that mentions @claude; the Claude Code
// action (.github/workflows/claude.yml) picks it up, implements it on a branch
// and opens a pull request. Berto reviews and merges; nothing reaches production
// before that. Changes that only touch agent/ go through the self-modification
// subagent instead, which works inside this chat.
export default defineTool({
  deferred: true,
  description:
    "Ask a coding agent (Claude Code) to build a feature or fix in Cael's app — the web UI, pages, API routes, database schema, anything outside agent/. Opens a GitHub issue on the focuspoint repo that Claude Code picks up and turns into a pull request for Berto to review and merge. Write the spec the way you'd brief a developer who has the codebase but not this conversation: what he wants, where it shows up, how it should behave, anything he ruled out. Returns the issue link.",
  inputSchema: z.object({
    title: z.string().min(4).max(120).describe("Short imperative title, e.g. 'Add a weekly protein chart to /meals'."),
    spec: z
      .string()
      .min(20)
      .describe("The full brief in markdown: what to build, where, how it should behave, constraints, done-when."),
  }),
  approval: {
    request: once(),
    prompt: ({ input }) => `Open a GitHub issue for Claude Code to build "${input.title}"?`,
  },
  async execute({ title, spec }) {
    const body = [
      spec.trim(),
      "",
      "---",
      "Requested by Berto through Cael. @claude please implement this: follow CLAUDE.md, " +
        "run `npm run typecheck`, and open a pull request against `main` for review. " +
        "Don't merge it.",
    ].join("\n");
    return createIssue(CAEL_REPO, { title, body, labels: ["cael"] });
  },
  toModelOutput({ number, url }) {
    return {
      type: "text",
      value: `Opened issue #${number}: ${url}. Claude Code will reply on it and open a pull request; Berto merges it when he's happy.`,
    };
  },
});
