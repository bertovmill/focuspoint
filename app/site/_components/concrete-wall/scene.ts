/**
 * The desk scene on the homepage wall: where the window sits and what hangs
 * in it. Shared by the WebGPU wall (which cuts the window into the plaster)
 * and the CSS fallback (which lays a framed picture over it), so the two
 * agree at any viewport size.
 */

/** The window's glass in wall uv space: centre and half size, 0 to 1. */
export type WindowRect = { x: number; y: number; hw: number; hh: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The windows a visitor can choose between, cycled by the pill on the glass.
 * Everything the shader needs to draw one is here, so the WebGPU wall, the
 * CSS fallback and the sill anchor all agree on it.
 *
 * - `kind`: 0 square-cornered, 1 a segmental arch over the top.
 * - `cols` / `rows`: panes across and down, split by glazing bars.
 * - `frame`, `bar`, `ledgeH`, `ledgeOver`: in wall units at full size (the
 *   shader scales them down for a phone's small window). `bar` is half width.
 * - `paint`: the frame's colour (linear-ish rgb, 0 to 1), and `css` the same
 *   for the fallback.
 * - `rise`: for the arch, its height as a fraction of the glass's height.
 * - `fan`: spokes in the arch's fanlight.
 */
export type WindowStyle = {
  id: string;
  label: string;
  kind: 0 | 1;
  cols: number;
  rows: number;
  frame: number;
  bar: number;
  ledgeH: number;
  ledgeOver: number;
  paint: readonly [number, number, number];
  css: string;
  rise: number;
  fan: number;
};

export const WINDOW_STYLES = [
  {
    id: "steel",
    label: "Modern steel",
    kind: 0,
    cols: 2,
    rows: 1,
    frame: 0.0085,
    bar: 0.003,
    ledgeH: 0.0105,
    ledgeOver: 0.01,
    paint: [0.085, 0.085, 0.09],
    css: "#161617",
    rise: 0,
    fan: 0,
  },
  {
    id: "factory",
    label: "Factory grid",
    kind: 0,
    cols: 5,
    rows: 3,
    frame: 0.0095,
    bar: 0.0019,
    ledgeH: 0.0105,
    ledgeOver: 0.01,
    paint: [0.07, 0.072, 0.075],
    css: "#141516",
    rise: 0,
    fan: 0,
  },
  {
    id: "arched",
    label: "Arched",
    kind: 1,
    cols: 3,
    rows: 1,
    frame: 0.0095,
    bar: 0.0022,
    ledgeH: 0.0105,
    ledgeOver: 0.012,
    paint: [0.12, 0.1, 0.085],
    css: "#2a241f",
    rise: 0.3,
    fan: 7,
  },
  {
    id: "cottage",
    label: "Classic white wood",
    kind: 0,
    cols: 3,
    rows: 2,
    frame: 0.016,
    bar: 0.0034,
    ledgeH: 0.02,
    ledgeOver: 0.022,
    paint: [0.93, 0.925, 0.9],
    css: "#efede6",
    rise: 0,
    fan: 0,
  },
] as const satisfies readonly WindowStyle[];

export type WindowStyleId = (typeof WINDOW_STYLES)[number]["id"];

/**
 * Where the window's glass goes for a wall of this aspect ratio (width /
 * height) and width in pixels. Wide screens get a big window on the upper
 * right, behind the desk and the money tree, clear of the headline in the
 * bottom left, and wide: it runs from just past the headline's end to near
 * the wall's right edge. Phones get a smaller one beside the headshot, above the desk.
 *
 * The frame adds under 0.01 of the height around the glass, so the top
 * stays well clear of the nav (64px). On narrow laptops
 * the glass starts further right so the headline's first line still fits
 * beside it.
 */
export function windowRect(aspect: number, width = 1440): WindowRect {
  const t = Math.min(1, Math.max(0, (aspect - 0.7) / (1.3 - 0.7)));
  const wide = Math.min(1, Math.max(0, (width - 1024) / (1440 - 1024)));
  const left = lerp(0.45, lerp(0.70, 0.575, wide), t);
  const right = lerp(0.92, 0.965, t);
  // On phones the glass lines up with the headshot beside it (about 0.155 to
  // 0.28 of the hero from 360 to 430px wide), so the sill ends above the
  // clock line under the photo instead of sitting on it.
  const top = lerp(0.155, 0.16, t);
  const bottom = lerp(0.27, 0.70, t);
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    hw: (right - left) / 2,
    hh: (bottom - top) / 2,
  };
}

/**
 * The view out of the window, as four photographs of the same frame that the
 * wall cross-fades by Toronto's sky. Order matters: it is the texture layer
 * index the shader reads.
 */
export const CITY_VIEWS = [
  "/site-art/toronto-day.webp",
  "/site-art/toronto-golden.webp",
  "/site-art/toronto-night.webp",
  "/site-art/toronto-overcast.webp",
] as const;

/** Pixel size of every city view; the texture is allocated to match. */
export const CITY_SIZE = [1200, 800] as const;

/**
 * The desk with the money tree, cut out on transparency. `clear` is how far
 * down the image (0 top, 1 bottom) the highest thing on the desk other than
 * the tree reaches, so the page can keep its headline above it; `sink` is
 * how much of the image's height hangs below the hero, so only the top of
 * the legs shows. Regenerate with scripts/generate-desk-art.mjs and remeasure.
 */
export const DESK_ART = {
  // The desk alone: scripts/split-desk-plant.mjs clears the plant out of
  // desk-oak-money-tree.webp so it can live on its own layer (PLANT_ART).
  src: "/site-art/desk-oak-base.webp",
  width: 1310,
  height: 952,
  clear: 0.273,
  sink: 0.22,
} as const;

/** CSS custom properties the hero and the wall share to lay the desk out. */
export function deskLayoutVars() {
  const ratio = DESK_ART.height / DESK_ART.width;
  return {
    // Image height as a multiple of its width.
    "--desk-ratio": ratio.toFixed(4),
    // Multiples of the image height, measured up from the hero's bottom edge:
    // where the tree's top is, and where the desk (with what's on it) is.
    "--desk-tree-clear": (1 - DESK_ART.sink + 0.03).toFixed(3),
    "--desk-top-clear": (1 - DESK_ART.sink - DESK_ART.clear + 0.03).toFixed(3),
    "--desk-sink": DESK_ART.sink.toFixed(3),
  } as Record<string, string>;
}

/**
 * The money tree above the soil, split out of the desk image by
 * scripts/split-desk-plant.mjs (the pot stays on the desk image). `left`/`right`/`top`/`bottom` are where its
 * box sits in the desk image (fractions), so it lands back exactly on the
 * desk; `pot` is the pot's opening inside the plant image (fractions of its
 * own box): centre x, top y, and half width. All printed by that script.
 */
export const PLANT_ART = {
  src: "/site-art/plant-money-tree.webp",
  width: 479,
  height: 440,
  left: 0.6053,
  right: 0.971,
  top: 0.0011,
  bottom: 0.4632,
  pot: { x: 0.5344, top: 0.8273, r: 0.1357 },
} as const;

/**
 * The Makerslounge book lying on the desk, between the notebook and the pot,
 * towards the back so the buddy (whose lane runs at depth 0.6, see
 * hero-agents/cast.ts) walks in front of it. `x` is its centre and `y` where
 * its box's bottom rests (fractions of the desk image); `width` is its box's
 * width as a fraction of the desk's.
 */
export const BOOK_SPOT = { x: 0.66, y: 0.478, width: 0.17 } as const;

/**
 * The mason jar on the windowsill: upright, and tipped to pour. `mouth` is
 * where the water leaves each image (fractions of its box); `aspect` is
 * width / height. Measured from the cutouts.
 */
export const JAR_ART = {
  upright: { src: "/site-art/jar-upright.webp", aspect: 0.879, mouth: { x: 0.5, y: 0.04 } },
  pouring: { src: "/site-art/jar-pouring.webp", aspect: 0.781, mouth: { x: 0.9, y: 0.32 } },
} as const;

/**
 * Where the ledge under the window is, so things can stand on it: a point
 * on the ledge's top face as a fraction of the wall's height, and a spot on
 * its left as a fraction of the wall's width. `joinery` is the frame scale
 * the shader uses (1 on wide screens, down to 0.5 for a phone's small
 * window). The frame and the ledge come from the style; the ledge's top face
 * (0.38 of its height) matches the shader's `ledge_top`.
 */
export function sillAnchor(rect: WindowRect, style: WindowStyle = WINDOW_STYLES[0]) {
  const joinery = Math.min(1, Math.max(0.5, rect.hh / 0.24));
  return {
    x: rect.x - rect.hw + rect.hw * 2 * 0.1,
    y: rect.y + rect.hh + (style.frame + style.ledgeH * 0.38 * 0.7) * joinery,
    joinery,
  };
}
