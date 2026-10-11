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
 * The glazing: how many panes across, and how many rows in each sash (the
 * meeting rail between the sashes is always there). The shader has the same
 * numbers as constants; keep them together.
 */
export const WINDOW_GRID = { cols: 2, rowsPerSash: 1 } as const;

/**
 * Where the window's glass goes for a wall of this aspect ratio (width /
 * height) and width in pixels. Wide screens get a big window on the upper
 * right, behind the desk and the money tree, clear of the headline in the
 * bottom left. Phones get a smaller one beside the headshot, above the desk.
 *
 * The casing adds about 0.086 of the height around the glass (half that on
 * phones), so the top keeps that clear of the nav (64px). On narrow laptops
 * the glass starts further right so the headline's first line still fits
 * beside it.
 */
export function windowRect(aspect: number, width = 1440): WindowRect {
  const t = Math.min(1, Math.max(0, (aspect - 0.7) / (1.3 - 0.7)));
  const wide = Math.min(1, Math.max(0, (width - 1024) / (1440 - 1024)));
  const left = lerp(0.50, lerp(0.72, 0.655, wide), t);
  const right = lerp(0.88, 0.935, t);
  const top = lerp(0.16, 0.16, t);
  const bottom = lerp(0.31, 0.70, t);
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
  src: "/site-art/desk-oak-money-tree.webp",
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
