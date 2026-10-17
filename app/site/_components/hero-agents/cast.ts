/**
 * The three characters that live in the homepage room, and the eve agent
 * each one talks with. The models are CC0: the robot is Tomás Laulhé's
 * RobotExpressive (from the three.js examples), the pigeon and the yeti are
 * from Quaternius's Ultimate Monsters pack.
 *
 * Where each one stands is a lane on something in the picture: the desk's
 * top (fractions of the desk image, measured from desk-oak-base.webp: the
 * back edge of the tabletop is at 0.437, the front edge at about 0.53, the
 * lamp at 0.19 to 0.25 and the pot from 0.75) or the windowsill.
 */

export type AgentId = "work" | "social" | "fitness";

/** Clip names inside each model for the moves the stage asks for. */
export type Moves = {
  idle: string;
  walk: string;
  /** Played once when you open a chat with it. */
  greet: string;
  /** Played once when its reply lands. */
  nod: string;
  /** Played when a reply fails. */
  shrug: string;
  /** Things it does now and then while it waits. */
  fidgets: string[];
};

export type Lane =
  /** On the desk: `depth` 0 is the tabletop's back edge, 1 its front edge. */
  | { on: "desk"; from: number; to: number; depth: number }
  /** On the windowsill, from/to as fractions of the window's width. */
  | { on: "sill"; from: number; to: number };

export type CastMember = {
  id: AgentId;
  /** What the character is, for labels and screen readers. */
  name: string;
  /** What to ask it about. */
  topic: string;
  /** The first line in its chat, before anyone has said anything. */
  hello: string;
  /** Prompts to get a visitor started. */
  starters: string[];
  model: string;
  moves: Moves;
  lane: Lane;
  /** Height in multiples of the desk's width (or, on the sill, of the casing scale × the hero's height, the jar's unit). */
  size: number;
  /** Walking speed in its own heights per second. */
  pace: number;
  /** A colour for its chat card. */
  accent: string;
};

const MONSTER_MOVES: Moves = {
  idle: "Idle",
  walk: "Walk",
  greet: "Jump",
  nod: "Yes",
  shrug: "No",
  fidgets: ["Dance", "Jump", "Yes"],
};

export const CAST: readonly CastMember[] = [
  {
    id: "work",
    name: "Robot",
    topic: "my work",
    hello:
      "Beep. I keep track of Berto's work: Aucctus, go-to-market, and the AI he builds. What do you want to know?",
    starters: [
      "What does Berto do at Aucctus?",
      "What has he built with AI?",
      "How do I book a meeting?",
    ],
    model: "/site-art/agent-robot.glb",
    moves: {
      idle: "Idle",
      walk: "Walking",
      greet: "Wave",
      nod: "ThumbsUp",
      shrug: "No",
      fidgets: ["Dance", "Yes", "Wave"],
    },
    lane: { on: "desk", from: 0.3, to: 0.68, depth: 0.25 },
    size: 0.14,
    pace: 0.55,
    accent: "#e2b33c",
  },
  {
    id: "social",
    name: "Pigeon",
    topic: "my writing and podcast",
    hello:
      "Coo. I hang around the window and read everything Berto posts. Ask me about his writing, the podcast, or where to follow him.",
    starters: [
      "What does Berto write about?",
      "What's the podcast?",
      "Where should I follow him?",
    ],
    model: "/site-art/agent-pigeon.glb",
    moves: MONSTER_MOVES,
    lane: { on: "sill", from: 0.28, to: 0.8 },
    size: 0.065,
    pace: 0.7,
    accent: "#8f7fd1",
  },
  {
    id: "fitness",
    name: "Yeti",
    topic: "my training and HYROX",
    hello:
      "Rawr. I'm Berto's training partner. Ask me about his HYROX races, his splits, or how he trains.",
    starters: [
      "How did Berto's last HYROX go?",
      "What's his best time?",
      "How does he train?",
    ],
    model: "/site-art/agent-yeti.glb",
    moves: MONSTER_MOVES,
    lane: { on: "desk", from: 0.08, to: 0.66, depth: 0.85 },
    size: 0.12,
    pace: 0.5,
    accent: "#6fb3d9",
  },
];

/** The tabletop in the desk image, as fractions of the image's box. */
export const DESK_TOP = { back: 0.437, front: 0.53 } as const;
