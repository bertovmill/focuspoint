import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 12 * * *",
  markdown: `You are posting a daily tweet on behalf of the user. Follow these steps exactly:

1. Call list_notes with limit 50 to get recent captured thoughts.
2. Mentally shuffle the list and RANDOMLY pick 8–12 notes to focus on — do not always start from the top or use the most frequent theme.
3. From that subset, find the single most surprising, compressed, or counter-intuitive idea — NOT the most obvious or repeated theme.
4. Craft ONE tweet (under 200 characters) that:
   - Distills that idea into a universally true statement
   - Contains no personal details, names, or specific situations
   - Uses no em dashes (—) — use periods, commas, or colons instead
   - Uses no hashtags
   - Aims for compression, inversion, or fresh observation — not hype or clichés
5. Call post_tweet with that text to publish it.

Do not ask for confirmation. Do not explain your reasoning. Just read the notes, pick a fresh angle, and post the tweet.`,
});
