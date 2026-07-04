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
          "It's the start of the day. Compose my morning digest.",
          "IMPORTANT: your entire reply is sent to me directly as the text message — there is no separate send step and no one will review it first. So output ONLY the finished digest text. Do NOT add any preamble like 'Here's your digest' or 'ready to send', do NOT wrap it in --- fences, do NOT ask whether to send it or for my phone number, and do NOT append notes about tools, memory, or anything you can't do. The first character of your reply is the first character I read in the text.",
          "Gather ALL of the following before composing: (1) latest_ai_news with limit 1 for the top AI newsletter story, (2) ai_reading_list with limit 5 for individual article links, (3) list_todos for open todos, (4) list_calendar_events for today's events.",
          "",
          "Format it for reading on a phone — follow these rules exactly:",
          "- Plain text only. SMS does NOT render markdown, so never use *, **, _, or # for emphasis (it shows up as literal characters). For emphasis use a short ALL-CAPS word or an emoji instead.",
          "- Multi-line and scannable: short lines with a blank line between sections, not one long paragraph.",
          "- Use emojis sparingly and tastefully — about 2 to 4 in the whole message, at most one per line, as quiet section markers (not decoration).",
          "- Open with a brief warm greeting line.",
          "- TOP STORY section: one line summarizing the top AI headline, then its link on its own line (plain URL — phones make it tappable).",
          "- TODAY section: 1-3 focus items pulled from my todos and calendar, each on its own line, with a word on how they connect to my bigger goals.",
          "- AI READS section: list 4-5 article links from ai_reading_list, each on its own line formatted as: short title (Source) then the URL on the next line. Pick the most interesting/diverse mix across sources.",
          "- Close with one short encouraging line.",
          "",
          "If there are no todos or calendar events, skip those sections quietly.",
          "If ai_reading_list returns no results, skip the AI READS section — don't mention it.",
          "If a calendar tool isn't connected, just skip the calendar quietly — don't mention missing tools.",
        ].join("\n"),
        target: { phoneNumber },
        auth: appAuth,
      }),
    );
  },
});
