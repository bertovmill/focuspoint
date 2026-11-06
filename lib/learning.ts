/**
 * Learning: short lessons on things I just picked up, each with a quiz.
 *
 * The rule behind this section: whenever I learn something somewhat new while
 * building, I write a brief overview and a few questions to check I really got
 * it. Readers take the same quiz, and can post their score on X when they pass.
 *
 * Lessons are plain data here for now. If this grows, they move to the
 * database next to posts (lib/posts.ts) so Cael can publish them.
 */

export interface QuizQuestion {
  /** The question, in plain words. */
  prompt: string;
  /** Answer choices; exactly one is right. */
  options: string[];
  /** Index into `options` of the right answer. */
  answer: number;
  /** Shown after answering, right or wrong: the reason, in a sentence or two. */
  why: string;
}

export interface Lesson {
  slug: string;
  title: string;
  /** One line for the index and for metadata. */
  summary: string;
  /** ISO date I learned it. */
  date: string;
  /** Where it came from, if there is a canonical source. */
  source?: { label: string; url: string };
  /** Markdown overview, kept to a few minutes of reading. */
  overview: string;
  quiz: QuizQuestion[];
}

const LESSONS: Lesson[] = [
  {
    slug: "vercel-schedules",
    title: "Vercel Schedules",
    summary:
      "Cron jobs you can create from code at runtime, one-off or recurring, with a timezone and a payload.",
    date: "2026-11-06",
    source: {
      label: "Introducing Vercel Schedules",
      url: "https://vercel.com/blog/introducing-vercel-schedules",
    },
    overview: `
Vercel Cron Jobs have always been **static**: you list them in \`vercel.json\`, they sync when you deploy, and they run in UTC. Fine for "clean up at 2am". Useless for "remind me Friday at 9".

**Vercel Schedules** (public beta, November 2026) keeps that static option and adds a **dynamic** one. Your code can create, change or cancel a schedule at runtime, no redeploy:

\`\`\`ts
import { Schedules } from "@vercel/schedules";

await Schedules.create({
  name: \`reminder-\${id}\`,
  namespace: userId,
  expression: { type: "single", at: "2026-11-07T09:00" },
  timezone: "America/Toronto",
  target: { topic: "reminders" },
  payload: { userId, task: "Follow up with Sam" },
});
\`\`\`

Three things to notice:

1. **One-off or recurring.** \`expression\` is either \`single\` with a local time, or a cron expression.
2. **Delivery goes to a Queue topic.** A dynamic schedule doesn't call an HTTP path. It publishes to a Vercel Queue topic with your \`payload\`, and a handler you write consumes it. Static schedules can still target a function or a path directly.
3. **Timezones are real.** \`timezone\` means "9am Toronto" stays 9am through daylight saving, which a UTC cron never managed.

Why I care: my life agent, Cael, runs two static crons today. With Schedules it can set its own reminders while we talk, which is the difference between a scheduled script and an agent that plans ahead.
`.trim(),
    quiz: [
      {
        prompt:
          "An app already has cron jobs in vercel.json. What can a dynamic Vercel Schedule do that those crons cannot?",
        options: [
          "Run on a cron expression like 0 12 * * 1-5",
          "Be created, changed or cancelled at runtime from code, including one-off runs at a specific time, without a redeploy",
          "Call a serverless function",
          "Run on Fluid Compute",
        ],
        answer: 1,
        why: "Crons are fixed in config and synced on deploy. Schedules.create() runs at runtime, so the app itself can set 'nudge me Friday 9am' on the fly.",
      },
      {
        prompt:
          "When code creates a one-off schedule with Schedules.create(), where does Vercel deliver the trigger?",
        options: [
          "Directly to an HTTP path like /api/cron/x",
          "To a Vercel Queue topic, which your handler consumes",
          "To a Slack webhook",
          "To the Vercel dashboard only",
        ],
        answer: 1,
        why: "Dynamic schedules target a Queue topic and carry a payload. Only static schedules can hit a function or HTTP path directly.",
      },
      {
        prompt: "Why does the timezone field matter for a daily reminder?",
        options: [
          "It makes the function run faster",
          "Crons are UTC only, so a fixed UTC hour drifts against local time across daylight saving; a schedule with a timezone fires at the same local hour all year",
          "It lets the reminder run on weekends",
          "It is required for Queues",
        ],
        answer: 1,
        why: "Static crons have no timezone. Schedules take one, so 9am Toronto stays 9am in March and November.",
      },
    ],
  },
];

export function listLessons(): Lesson[] {
  return [...LESSONS].sort((a, b) => b.date.localeCompare(a.date));
}

export function getLesson(slug: string): Lesson | null {
  return LESSONS.find((l) => l.slug === slug) ?? null;
}
