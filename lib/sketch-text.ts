// Turning an Excalidraw scene into something Cael can actually read.
//
// A sketch is stored as `scene` JSONB: a flat array of elements with absolute x/y
// coordinates. The meaning of a diagram lives in two places the raw array hides:
// which text belongs to which shape (via `containerId`), and which shapes an arrow
// joins (via `startBinding`/`endBinding`). This module resolves both, so a flowchart
// reads as "A → B" instead of a pile of disconnected strings.
//
// Colors and stroke styles are dropped — they don't translate to text. Position is
// kept, but coarsened: raw x/y floats are meaningless to a model, so elements are
// bucketed into a 3x3 region grid ("top-left", "center", ...) and clustered by
// proximity. That's what tells Cael, e.g., that three unlabelled, unconnected
// diamonds are grouped together in a corner — something arrow/label reading alone
// can't see. Reading order is top-to-bottom, then left-to-right, like a person scans
// a page.

type SceneElement = {
  id?: string;
  type?: string;
  isDeleted?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Array<[number, number] | number[]>;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  label?: { text?: string } | null;
  boundElements?: Array<{ id?: string; type?: string }> | null;
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
};

export type SketchScene = { elements?: SceneElement[] } | null | undefined;

export type SketchReading = {
  /** Free-floating text, in reading order (top-to-bottom, left-to-right). */
  text: string[];
  /** Labelled shapes, e.g. `{ shape: "rectangle", label: "Energy on John Summit" }`. */
  shapes: Array<{ shape: string; label: string }>;
  /** Resolved arrow/line connections between labelled shapes, e.g. "A → B". */
  connections: string[];
  /** Element counts by type, for a sense of how much is drawn but unreadable. */
  counts: Record<string, number>;
  /** Total non-deleted elements. */
  total: number;
  /**
   * Every shape (labelled or not) and standalone text, placed on a coarse 3x3 grid
   * over the sketch's bounding box. Lets Cael reason about where things sit without
   * needing raw coordinates.
   */
  layout: Array<{ region: Region; kind: "shape" | "text"; type: string; label: string }>;
  /**
   * Groups of shapes/text that sit physically close together, regardless of whether
   * an arrow connects them. Each entry is a display label per member (unlabelled
   * shapes show as e.g. "(unlabelled diamond)").
   */
  clusters: string[][];
};

export type Region =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const CONTAINER_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "frame",
  "magicframe",
]);

function textOf(el: SceneElement): string {
  return (el.originalText ?? el.text ?? "").trim();
}

/**
 * Resolve a display name for an element an arrow points at: its own text if it's a
 * text element, otherwise the text of the label bound inside it.
 */
function labelOf(el: SceneElement | undefined, byId: Map<string, SceneElement>): string {
  if (!el) return "";
  const own = textOf(el);
  if (own) return own;
  if (el.label?.text?.trim()) return el.label.text.trim();
  for (const bound of el.boundElements ?? []) {
    if (bound?.type === "text" && bound.id) {
      const child = byId.get(bound.id);
      if (child && textOf(child)) return textOf(child);
    }
  }
  return "";
}

/** Collapse the internal newlines Excalidraw stores inside a single text element. */
function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").trim();
}

type Box = { x: number; y: number; w: number; h: number };

function boxOf(el: SceneElement): Box {
  return { x: el.x ?? 0, y: el.y ?? 0, w: el.width ?? 0, h: el.height ?? 0 };
}

function centerOf(b: Box): [number, number] {
  return [b.x + b.w / 2, b.y + b.h / 2];
}

/** Distance from a point to a box, 0 when the point is inside it. */
function distToBox(px: number, py: number, b: Box): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** The absolute endpoints of an arrow or line, from its relative `points` array. */
function endpointsOf(el: SceneElement): [[number, number], [number, number]] | null {
  const pts = el.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!Array.isArray(first) || !Array.isArray(last)) return null;
  const ox = el.x ?? 0;
  const oy = el.y ?? 0;
  return [
    [ox + (first[0] ?? 0), oy + (first[1] ?? 0)],
    [ox + (last[0] ?? 0), oy + (last[1] ?? 0)],
  ];
}

// How close a loose arrow endpoint must sit to something before we'll claim it points
// there. Tight on purpose: a wrong connection misleads worse than a missing one does.
const ENDPOINT_SNAP_PX = 24;

const REGION_ORDER: Region[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** Which cell of a 3x3 grid over `bbox` a point falls in. */
function regionOf(point: [number, number], bbox: Box): Region {
  const col = bbox.w > 0 ? Math.min(2, Math.floor(((point[0] - bbox.x) / bbox.w) * 3)) : 1;
  const row = bbox.h > 0 ? Math.min(2, Math.floor(((point[1] - bbox.y) / bbox.h) * 3)) : 1;
  if (row === 1 && col === 1) return "center";
  const rows = ["top", "middle", "bottom"];
  const cols = ["left", "center", "right"];
  return `${rows[row]}-${cols[col]}` as Region;
}

/** Bounding box that contains every given box, or null if there are none. */
function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Group items by physical proximity (union-find on center-to-center distance), using
 * the average element size as the "close enough" threshold so it scales with how big
 * the sketch's shapes actually are. Only groups of 2+ are returned.
 */
function clusterByProximity(
  items: Array<{ label: string; center: [number, number]; size: number }>,
): string[][] {
  if (items.length < 2) return [];
  const sizes = items.map((it) => it.size).filter((n) => n > 0);
  const avgSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 80;
  const threshold = avgSize * 1.5;

  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = Math.hypot(items[i].center[0] - items[j].center[0], items[i].center[1] - items[j].center[1]);
      if (d <= threshold) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }

  const groups = new Map<number, number[]>();
  items.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  });
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.map((i) => items[i].label));
}

export function readScene(scene: SketchScene): SketchReading {
  const elements = (scene?.elements ?? []).filter((el) => el && !el.isDeleted);
  const byId = new Map<string, SceneElement>();
  for (const el of elements) if (el.id) byId.set(el.id, el);

  const counts: Record<string, number> = {};
  for (const el of elements) {
    const t = el.type ?? "unknown";
    counts[t] = (counts[t] ?? 0) + 1;
  }

  // Text bound to a shape is that shape's label, not a standalone line — otherwise
  // every box's caption would be listed twice.
  const boundLabelIds = new Set<string>();
  for (const el of elements) {
    if (el.type === "text" && el.containerId) {
      if (el.id) boundLabelIds.add(el.id);
    }
    for (const bound of el.boundElements ?? []) {
      if (bound?.type === "text" && bound.id) boundLabelIds.add(bound.id);
    }
  }

  // Excalidraw only sets `containerId` when text is typed *into* a shape. Text that was
  // typed loose and dragged on top of a box is, to a reader, that box's caption — so
  // adopt a text element as a shape's label when it's the only one sitting inside.
  // Two or more and the shape is a grouping region, not a labelled node; leave it alone.
  const overlayLabel = new Map<string, SceneElement>(); // shape id -> its adopted text
  const looseText = elements.filter(
    (el) => el.type === "text" && el.id && !boundLabelIds.has(el.id) && textOf(el),
  );
  for (const shape of elements) {
    if (!shape.id || !CONTAINER_TYPES.has(shape.type ?? "")) continue;
    if (labelOf(shape, byId)) continue; // already has a real bound label
    const box = boxOf(shape);
    if (box.w <= 0 || box.h <= 0) continue;
    const inside = looseText.filter((t) => {
      const [cx, cy] = centerOf(boxOf(t));
      return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
    });
    if (inside.length === 1) overlayLabel.set(shape.id, inside[0]);
  }
  const adoptedTextIds = new Set(
    [...overlayLabel.values()].map((t) => t.id).filter((id): id is string => Boolean(id)),
  );

  /** The readable name of an element, counting adopted overlay text. */
  const nameOf = (el: SceneElement | undefined): string => {
    if (!el) return "";
    const direct = labelOf(el, byId);
    if (direct) return oneLine(direct);
    const adopted = el.id ? overlayLabel.get(el.id) : undefined;
    return adopted ? oneLine(textOf(adopted)) : "";
  };

  const inReadingOrder = <T extends SceneElement>(els: T[]) =>
    [...els].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

  const text = inReadingOrder(
    elements.filter(
      (el) =>
        el.type === "text" && !boundLabelIds.has(el.id ?? "") && !adoptedTextIds.has(el.id ?? ""),
    ),
  )
    .map((el) => oneLine(textOf(el)))
    .filter(Boolean);

  const shapes = inReadingOrder(elements.filter((el) => CONTAINER_TYPES.has(el.type ?? "")))
    .map((el) => ({ shape: el.type ?? "shape", label: nameOf(el) }))
    .filter((s) => s.label);

  // Anything an arrow could plausibly be pointing at, for arrows that were drawn by hand
  // and never snapped to a shape.
  const snapTargets = elements.filter(
    (el) => el.id && (CONTAINER_TYPES.has(el.type ?? "") || el.type === "text") && nameOf(el),
  );
  const snapTo = (point: [number, number] | undefined): string => {
    if (!point) return "";
    let best = "";
    let bestDist = ENDPOINT_SNAP_PX;
    for (const target of snapTargets) {
      const d = distToBox(point[0], point[1], boxOf(target));
      if (d < bestDist) {
        bestDist = d;
        best = nameOf(target);
      }
    }
    return best;
  };

  const connections: string[] = [];
  for (const el of elements) {
    if (el.type !== "arrow" && el.type !== "line") continue;
    const ends = endpointsOf(el);
    const from =
      nameOf(el.startBinding?.elementId ? byId.get(el.startBinding.elementId) : undefined) ||
      snapTo(ends?.[0]);
    const to =
      nameOf(el.endBinding?.elementId ? byId.get(el.endBinding.elementId) : undefined) ||
      snapTo(ends?.[1]);
    // One named end tells you nothing about what it joins, so require both.
    if (!from || !to || from === to) continue;
    // Excalidraw arrows can point both ways; only the arrowheads say which.
    const bidirectional = Boolean(el.startArrowhead) && Boolean(el.endArrowhead);
    const joiner = bidirectional ? "↔" : "→";
    const via = oneLine(labelOf(el, byId));
    const line = `${from} ${joiner} ${to}${via ? ` (${via})` : ""}`;
    if (!connections.includes(line)) connections.push(line);
  }

  // Spatial layer: every shape (labelled or not) plus standalone text, placed on the
  // region grid and clustered by proximity. Unlabelled shapes are named by type so a
  // cluster like three unconnected diamonds is still legible.
  const allShapeEls = elements.filter((el) => CONTAINER_TYPES.has(el.type ?? ""));
  const standaloneTextEls = elements.filter(
    (el) => el.type === "text" && !boundLabelIds.has(el.id ?? "") && !adoptedTextIds.has(el.id ?? ""),
  );
  const sceneBox = unionBox([...allShapeEls, ...standaloneTextEls].map(boxOf));

  const layout: SketchReading["layout"] = sceneBox
    ? inReadingOrder([...allShapeEls, ...standaloneTextEls]).map((el) => {
        const isShape = CONTAINER_TYPES.has(el.type ?? "");
        return {
          region: regionOf(centerOf(boxOf(el)), sceneBox),
          kind: isShape ? ("shape" as const) : ("text" as const),
          type: el.type ?? "shape",
          label: isShape ? nameOf(el) : oneLine(textOf(el)),
        };
      })
    : [];

  const clusters = clusterByProximity(
    [...allShapeEls, ...standaloneTextEls].map((el) => {
      const box = boxOf(el);
      const isShape = CONTAINER_TYPES.has(el.type ?? "");
      const label = isShape ? nameOf(el) : oneLine(textOf(el));
      return {
        label: label || `(unlabelled ${el.type ?? "shape"})`,
        center: centerOf(box),
        size: Math.max(box.w, box.h),
      };
    }),
  );

  return { text, shapes, connections, counts, total: elements.length, layout, clusters };
}

/** Render a reading as the compact text block a tool hands the model. */
export function formatReading(reading: SketchReading): string {
  const parts: string[] = [];
  if (reading.text.length) {
    parts.push(`Text:\n${reading.text.map((t) => `  • ${t}`).join("\n")}`);
  }
  if (reading.shapes.length) {
    parts.push(
      `Labelled shapes:\n${reading.shapes.map((s) => `  • [${s.shape}] ${s.label}`).join("\n")}`,
    );
  }
  if (reading.connections.length) {
    parts.push(`Connections:\n${reading.connections.map((c) => `  ${c}`).join("\n")}`);
  }
  if (reading.layout.length) {
    const byRegion = new Map<Region, string[]>();
    for (const item of reading.layout) {
      const display =
        item.kind === "shape" ? `[${item.type}] ${item.label || "(unlabelled)"}` : item.label;
      if (!display) continue;
      if (!byRegion.has(item.region)) byRegion.set(item.region, []);
      byRegion.get(item.region)!.push(display);
    }
    const lines = REGION_ORDER.filter((r) => byRegion.has(r)).map(
      (r) => `  ${r}: ${byRegion.get(r)!.join(", ")}`,
    );
    if (lines.length) parts.push(`Layout (by region):\n${lines.join("\n")}`);
  }
  if (reading.clusters.length) {
    parts.push(
      `Nearby groups (physically close, not necessarily arrow-connected):\n${reading.clusters
        .map((c) => `  • ${c.join(", ")}`)
        .join("\n")}`,
    );
  }
  const breakdown = Object.entries(reading.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}`)
    .join(", ");
  parts.push(`${reading.total} element${reading.total === 1 ? "" : "s"}${breakdown ? ` (${breakdown})` : ""}`);
  return parts.join("\n\n");
}
