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
 * Where the window goes for a wall of this aspect ratio (width / height).
 * Wide screens get a tall window on the upper right, above the money tree,
 * clear of the headline in the bottom left. Phones get a smaller one up and
 * to the right, so it still shows above the desk.
 */
export function windowRect(aspect: number): WindowRect {
  const t = Math.min(1, Math.max(0, (aspect - 0.7) / (1.3 - 0.7)));
  // Edges first, so the top always clears the nav that overlaps the wall
  // (64px: under 11% of even a short landscape hero, under 7% of a phone's).
  const left = lerp(0.50, 0.675, t);
  const right = lerp(0.92, 0.925, t);
  const top = lerp(0.09, 0.14, t);
  const bottom = lerp(0.28, 0.62, t);
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

/** The desk with the money tree, cut out on transparency. */
export const DESK_ART = { src: "/site-art/desk-money-tree.webp", width: 1536, height: 1024 } as const;
