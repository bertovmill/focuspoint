import { defineAgent } from "eve";

// The coach that writes a week on /training. Unlike the old one-shot draft
// (one generateObject call, wipe the week, insert everything at once), it works
// the week session by session through set_training_session, so the grid fills
// in live while it thinks and it edits what's already there instead of
// replacing it. The page's "Draft this week" button and chat both reach it.
export default defineAgent({
  description:
    "Training coach that drafts or reworks a week on Berto's /training plan, writing sessions onto the calendar one at a time. Delegate when he asks to draft, redraft, or rework a training week (or part of one). Pass the Monday of the week (ISO date) and anything he said about it (travel, soreness, a day he can't train).",
  model: "anthropic/claude-sonnet-4.6",
});
