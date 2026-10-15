// The scene behind the glass, in linear colour at device resolution: the
// page's own background (`paper`, read from CSS so light and dark both match)
// ruled like drafting paper (a fine minor grid and a stronger major grid every
// few cells) so the glass has something to bend. On light paper the lines are
// faint ink; on dark paper, faint light. They fade out toward the canvas edges,
// where the floor is exactly the page, so the section has no seam.
//
// rgb = the floor; a = 0 (no emissive detail for the glass to re-tint).

struct Backdrop {
  viewport: vec2f,
  time: f32,
  dim: f32,
  dpr: f32,
  paper: vec3f,
}

@group(0) @binding(0) var<uniform> backdrop: Backdrop;

// Grid pitch (CSS px), how many minor cells make a major one, line widths
// (CSS px; never thinner than a device pixel, fainter instead) and how much
// each layer marks the paper.
const MINOR = 24.0;
const MAJOR_EVERY = 5.0;
const MINOR_WIDTH = 0.5;
const MAJOR_WIDTH = 1.0;
const MINOR_INK = 0.35;
const MAJOR_INK = 0.8;
// How far a full-strength line moves the paper toward its ink, on light and dark paper.
const INK_LIGHT = 0.07;
const INK_DARK = 0.035;
// Distance (CSS px) from the canvas edge over which the lines fade in.
const EDGE_FADE = 72.0;

// Distance (device px) from `q` to the nearest line of a grid with this pitch.
fn lineDistance(q: vec2f, pitch: f32) -> f32 {
  let e = abs(fract(q / pitch + 0.5) - 0.5) * pitch;
  return min(e.x, e.y);
}

// Ink of a line `width` device px wide at `dist` device px: a line narrower
// than a pixel stays one pixel wide and fades instead, so its weight holds at
// any DPR.
fn lineInk(dist: f32, width: f32) -> f32 {
  let w = max(width, 1.0);
  return min(width, 1.0) * (1.0 - smoothstep(0.5 * w - 0.5, 0.5 * w + 0.5, dist));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dpr = max(backdrop.dpr, 1.0);
  let major = MINOR * MAJOR_EVERY;
  // The major grid is centred in the frame, so both edges of the view end on
  // equal part-cells; the minor grid shares its origin. Working in device px
  // with the origin on a pixel centre keeps every hairline on one pixel.
  let origin = floor((backdrop.viewport - floor(backdrop.viewport / major) * major) * 0.5 * dpr) + 0.5;
  let q = uv * backdrop.viewport * dpr - origin;
  let minor = lineInk(lineDistance(q, MINOR * dpr), MINOR_WIDTH * dpr);
  let majorLine = lineInk(lineDistance(q, major * dpr), MAJOR_WIDTH * dpr);

  let p = uv * backdrop.viewport;
  let edge = min(min(p.x, backdrop.viewport.x - p.x), min(p.y, backdrop.viewport.y - p.y));
  let fade = smoothstep(0.0, EDGE_FADE, edge);

  let lum = dot(backdrop.paper, vec3f(0.2126, 0.7152, 0.0722));
  let light = smoothstep(0.05, 0.4, lum);
  let inkColour = mix(vec3f(1.0), vec3f(0.0), light);
  let strength = mix(INK_DARK, INK_LIGHT, light);
  let ink = max(MINOR_INK * minor, MAJOR_INK * majorLine) * fade * strength * (1.0 - backdrop.dim * 0.7);
  return vec4f(mix(backdrop.paper, inkColour, ink), 0.0);
}
