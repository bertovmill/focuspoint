import { defineSchedule } from "eve/schedules";

import twilio from "../channels/twilio.js";

// Morning digest: every day Cael reviews open todos + upcoming calendar
// events and texts a short focus summary for the day.
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
          "Review my open todos (use list_todos) and check today's calendar.",
          "Send one concise, encouraging SMS (a few sentences, no markdown):",
          "the 1-3 things worth focusing on today, and how they connect to my bigger goals.",
          "If there's nothing on the docket, just send a brief warm good-morning.",
        ].join(" "),
        target: { phoneNumber },
        auth: appAuth,
      }),
    );
  },
});
