import { defineSchedule } from "eve/schedules";

import twilio from "../channels/twilio.js";

// Morning digest: every day Cael leads with the top AI news headline, then
// reviews open todos + upcoming calendar events and texts a short focus summary.
//
// Cron is evaluated by Vercel in UTC. "0 12 * * *" = 12:00 UTC, which is
// 8:00 AM US Eastern during daylight time. Adjust the hour for your timezone.
export default defineSchedule({
  cron: "0 12 * * *",
  async run({ receive, waitUntil, appAuth }) {
    const phoneNumber = process.env.MY_PHONE_NUMBER;
    if (!phoneNumber) {
      console.warn("[morning-digest] MY_PHONE_NUMBER not set — skipping run.");
      return;
    }

    waitUntil(
      receive(twilio, {
        message: [
          "It's the start of the day. Build and send my morning digest as a single SMS.",
          "Gather: latest_ai_news (limit 1) for the top AI story, list_todos for open todos, and list_calendar_events for today's events.",
          "",
          "Format it for reading on a phone — follow these rules exactly:",
          "- Plain text only. SMS does NOT render markdown, so never use *, **, _, or # for emphasis (it shows up as literal characters). For emphasis use a short ALL-CAPS word or an emoji instead.",
          "- Multi-line and scannable: short lines with a blank line between sections, not one long paragraph.",
          "- Use emojis sparingly and tastefully — about 2 to 4 in the whole message, at most one per line, as quiet section markers (not decoration).",
          "- Open with a brief warm greeting line.",
          "- AI section: one line summarizing the top AI headline, then put its link on its own line (plain URL — phones make it tappable).",
          "- TODAY section: 1-3 focus items pulled from my todos and calendar, each on its own line, with a word on how they connect to my bigger goals.",
          "- Close with one short encouraging line.",
          "",
          "If there are no todos or calendar events, still send the greeting, the AI headline + link, and a brief warm good-morning.",
          "If a calendar tool isn't connected, just skip the calendar quietly — don't mention missing tools.",
        ].join("\n"),
        target: { phoneNumber },
        auth: appAuth,
      }),
    );
  },
});
