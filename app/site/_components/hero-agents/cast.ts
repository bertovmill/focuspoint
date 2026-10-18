/**
 * The plush buddy on the homepage desk (built in `buddy.ts`) and the eve
 * agent it talks with: `guide`, in the separate bertomill-agents project,
 * which knows Berto's work, writing, podcast and training from his public
 * pages.
 *
 * It walks a lane along the desk's top, in fractions of the desk image
 * (desk-oak-base.webp): the tabletop's back edge is at 0.437 and its front
 * edge at about 0.53; the lamp stands at 0.19 to 0.25 and the pot from 0.75.
 */

export const BUDDY = {
  agent: "guide",
  /** The first line in its chat, before anyone has said anything. */
  hello: "Hi! I'm Berto's little helper. Ask me about his work, what he writes and records, or his HYROX training.",
  starters: ["What does Berto do?", "What's the podcast?", "How's his HYROX going?", "How do I book a meeting?"],
  /** Faint ghost questions that rotate in the empty input; Tab fills one in. */
  suggestions: [
    "What is Berto building right now?",
    "What has he written lately?",
    "What's Aucctus?",
    "What talks has he given?",
    "What's his HYROX race time?",
    "What's the best way to reach him?",
    "What does he think about AI agents?",
    "What's his latest podcast episode?",
  ],
  /** Along the desk, from/to across its width; depth 0 is the back edge, 1 the front. */
  lane: { from: 0.3, to: 0.68, depth: 0.6 },
  /** Height as a multiple of the desk's width. */
  size: 0.13,
  /** Walking speed in its own heights per second. */
  pace: 0.45,
} as const;

/** The tabletop in the desk image, as fractions of the image's box. */
export const DESK_TOP = { back: 0.437, front: 0.53 } as const;
