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
          "It's the start of the day. Build a short morning digest for me.",
          "First, call latest_ai_news (limit 1) and open with one sentence on the top AI headline.",
          "Then review my open todos (use list_todos) and check today's calendar.",
          "Send one concise, encouraging SMS (a few sentences, no markdown):",
          "lead with the AI headline, then the 1-3 things worth focusing on today and how they connect to my bigger goals.",
          "If there's nothing on the docket, still share the AI headline plus a brief warm good-morning.",
        ].join(" "),
        target: { phoneNumber },
        auth: appAuth,
      }),
    );
  },
});
