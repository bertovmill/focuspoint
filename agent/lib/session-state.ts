import { defineState } from "eve/context";

// Per-session working memory for Cael. Durable across turns and step
// boundaries, but scoped to a single session (never shared with subagents,
// never persisted beyond the conversation). Use this for short-term context —
// what the user said they want to focus on right now, and a light tally of
// activity this session — rather than anything that belongs in Postgres.
export interface SessionMemory {
  focus: string | null;
  thoughtsCaptured: number;
}

export const sessionMemory = defineState<SessionMemory>("cael.session", () => ({
  focus: null,
  thoughtsCaptured: 0,
}));
