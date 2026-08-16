import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

/**
 * The starting content of the strategy board — the flywheel, drawn as real
 * Excalidraw shapes rather than React components.
 *
 * This is a *seed*, not a source of truth: it's stamped onto the board once, the
 * first time it's opened, and from then on the board is whatever Berto has drawn.
 * Editing this file will not change a board that already exists.
 *
 * Geometry is in Excalidraw scene units (1 unit = 1px at 100% zoom). The three
 * pillars sit in a row across the top; the feedback loops arc back underneath.
 */

// Pillar colours, matching CATEGORY_BADGE_CLASS in dashboard.tsx so a task's
// category chip still reads as the same pillar it ladders up to.
const AMBER = "#f59e0b";
const VIOLET = "#8b5cf6";
const EMERALD = "#10b981";
const INK = "#1e1e1e";

const BOX_W = 300;
const BOX_H = 150;
const BOX_Y = 40;
// Left edge of each pillar: 440px apart leaves a 140px gap for the arrow between.
const COL_X = [40, 480, 920];

// Boxes are transparent on purpose — the gradient wash behind the canvas shows
// through, which is the whole reason the board sits on a coloured background.
const PILLARS = [
  {
    id: "strategy-content",
    x: COL_X[0],
    color: AMBER,
    text: "More content\n\n• Consistency\n• Attention to detail",
  },
  {
    id: "strategy-events",
    x: COL_X[1],
    color: VIOLET,
    text: "More events\n\n• Energy\n• Aura\n• Appearance",
  },
  {
    id: "strategy-agents",
    x: COL_X[2],
    color: EMERALD,
    text: "More AI agents\n\n• Reading the docs\n• Time coding\n• Aggressive tinkering",
  },
] as const;

// A curved connector: `points` are relative to the arrow's own x/y, and the middle
// point is what makes it bow. roundness 2 smooths the polyline into an arc.
function arc(
  id: string,
  x: number,
  y: number,
  dx: number,
  dip: number,
  label: string,
  color: string,
): ExcalidrawElementSkeleton {
  return {
    type: "arrow",
    id,
    x,
    y,
    strokeColor: color,
    strokeWidth: 1,
    strokeStyle: "dashed",
    roundness: { type: 2 },
    points: [
      [0, 0],
      [dx / 2, dip],
      [dx, 0],
    ],
    label: { text: label, fontSize: 16, strokeColor: INK },
  } as ExcalidrawElementSkeleton;
}

export const STRATEGY_SEED: ExcalidrawElementSkeleton[] = [
  ...PILLARS.map(
    (p) =>
      ({
        type: "rectangle",
        id: p.id,
        x: p.x,
        y: BOX_Y,
        width: BOX_W,
        height: BOX_H,
        strokeColor: p.color,
        backgroundColor: "transparent",
        strokeWidth: 2,
        roundness: { type: 3 },
        label: {
          text: p.text,
          fontSize: 16,
          strokeColor: INK,
          textAlign: "left",
          verticalAlign: "top",
        },
      }) as ExcalidrawElementSkeleton,
  ),

  // Forward flow across the top. Bound to the boxes by id, so dragging a pillar
  // drags its arrows with it.
  {
    type: "arrow",
    x: COL_X[0] + BOX_W + 10,
    y: BOX_Y + BOX_H / 2,
    width: 120,
    height: 0,
    strokeColor: AMBER,
    strokeWidth: 2,
    start: { id: "strategy-content" },
    end: { id: "strategy-events" },
    label: { text: "More attendees", fontSize: 16, strokeColor: INK },
  } as ExcalidrawElementSkeleton,
  {
    type: "arrow",
    x: COL_X[1] + BOX_W + 10,
    y: BOX_Y + BOX_H / 2,
    width: 120,
    height: 0,
    strokeColor: VIOLET,
    strokeWidth: 2,
    start: { id: "strategy-events" },
    end: { id: "strategy-agents" },
    label: { text: "More clients", fontSize: 16, strokeColor: INK },
  } as ExcalidrawElementSkeleton,

  // The feedback loops, bowing back underneath right-to-left. These are left
  // unbound so they can dip below the boxes instead of being re-routed. The dips
  // are kept shallow: the whole board is fitted into a ~340px strip, so every
  // extra 100px of scene height costs zoom (and legibility) everywhere.
  arc("strategy-arc-agents-events", COL_X[2] + BOX_W / 2, BOX_Y + BOX_H + 20, -440, 70, "Better agents improve the events", EMERALD),
  arc("strategy-arc-events-content", COL_X[1] + BOX_W / 2, BOX_Y + BOX_H + 20, -440, 70, "Share learnings", VIOLET),
  arc("strategy-arc-agents-content", COL_X[2] + BOX_W - 10, BOX_Y + BOX_H + 32, -1030, 150, "Share learnings", EMERALD),

  {
    type: "text",
    id: "strategy-creed",
    x: COL_X[0],
    y: BOX_Y + BOX_H + 250,
    text: "Don't chase money — create the\nconditions where money becomes inevitable.",
    fontSize: 20,
    strokeColor: INK,
  } as ExcalidrawElementSkeleton,
];
