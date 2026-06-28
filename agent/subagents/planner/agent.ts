import { defineAgent } from "eve";

// A specialist Cael delegates to when the user faces a genuinely open decision
// or wants to think through a week/project — work that benefits from deeper,
// uninterrupted reasoning than a normal chat turn. The parent passes all needed
// context (todos, goals, constraints) in the delegation message, since the
// subagent never sees the parent's history.
export default defineAgent({
  description:
    "Deep planning and decision specialist. Delegate when the user faces an open-ended decision, wants to prioritize a busy week, or needs a project broken into steps. Pass the relevant todos, goals, and constraints in the message.",
  model: "anthropic/claude-opus-4.8",
});
