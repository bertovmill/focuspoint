// The hello bubble's body as a sheet of pale glass, after the liquid-layout
// example in vgpu: one rounded rect (plus its tail) as a distance field,
// strained by a 2×2 jelly matrix the dynamics feed in, lit with a soft bevel
// toward the key light (upper left), a hairline on the rim, and a shadow on
// the desk below. One fullscreen pass over a canvas a little bigger than the
// bubble, so a squash or a stretch has room; the text is DOM, on top.
// Output is premultiplied: outside the glass only the shadow has any alpha.

struct Bubble {
  // xy: canvas size, CSS px. z: seconds. w: device pixel ratio.
  size: vec4f,
  // The body at rest: xy centre, zw half size, all canvas CSS px.
  rect: vec4f,
  // x corner radius, y the tail's x, z the tail's half diagonal, w energy (0 still, ~1 racing).
  shape: vec4f,
  // World → local 2×2 (m00 m01 m10 m11): undoes the strain so the field stays a rect.
  m: vec4f,
  // rgb the fill, w its opacity.
  fill: vec4f,
  // x distance scale under the strain, y 1 in dark mode, zw unused.
  look: vec4f,
}

@group(0) @binding(0) var<uniform> params: Bubble;

const KEY = vec2f(-0.7071, -0.7071);
const LENS = 14.0;
const SHADOW_OFFSET = vec2f(0.0, 9.0);
const SHADOW_FALLOFF = 24.0;
const SHADOW_COLOR = vec3f(0.08, 0.063, 0.04);
const TAIL_K = 3.0;

fn sdRoundRect(p: vec2f, half: vec2f, corner: f32) -> f32 {
  let r = min(corner, min(half.x, half.y));
  let q = abs(p) - half + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn sdDiamond(p: vec2f, half: f32) -> f32 {
  let q = abs(p);
  return (q.x + q.y - half) * 0.7071;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Signed distance to the glass at a canvas point, CSS px, negative inside.
fn field(p: vec2f) -> f32 {
  let offset = p - params.rect.xy;
  let local = vec2f(dot(params.m.xy, offset), dot(params.m.zw, offset));
  let body = sdRoundRect(local, params.rect.zw, params.shape.x);
  // The tail hangs off the bottom edge, strained with the body.
  let tailCentre = vec2f(params.shape.y - params.rect.x, params.rect.w);
  let tail = sdDiamond(local - tailCentre, params.shape.z);
  return smin(body, tail, TAIL_K) * params.look.x;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * params.size.xy;
  let d = field(p);
  let dark = params.look.y;
  let energy = params.shape.w;
  let aa = 0.7 / params.size.w;

  // The shadow on the desk, cast a little below; the glass hides its own.
  let ds = field(p - SHADOW_OFFSET);
  let shadowA = (0.16 + 0.05 * dark) * exp(-max(ds, 0.0) / SHADOW_FALLOFF) * smoothstep(-2.0, 10.0, d + 6.0);

  // Outward normal from the field's gradient, for the lighting.
  let e = vec2f(1.0, 0.0);
  let grad = vec2f(field(p + e.xy) - field(p - e.xy), field(p + e.yx) - field(p - e.yx)) * 0.5;
  let len = length(grad);
  let n = select(vec2f(0.0, -1.0), grad / len, len > 1e-4);
  let facing = dot(n, KEY);
  let depth = -d;

  // The body: the page's background, barely translucent.
  var color = params.fill.rgb;
  // A soft bevel inside the rim: lighter where it faces the key light, a touch
  // darker on the far side, stronger while the bubble is on the move.
  let bevel = pow(clamp(1.0 - depth / LENS, 0.0, 1.0), 2.0) * (1.0 + 0.8 * energy);
  color += bevel * facing * mix(0.045, 0.07, dark);
  // A faint sheen on the pane under the light, upper left.
  let toLight = (p - params.rect.xy) / max(params.rect.w, 1.0);
  color += mix(0.014, 0.03, dark) * clamp(1.0 - length(toLight - vec2f(-0.9, -1.2)) / 2.4, 0.0, 1.0);
  // The hairline on the rim: a thin dark ring in light mode, a lit edge in dark.
  let line = 1.0 - smoothstep(0.0, 1.1, depth);
  color = mix(color, color - vec3f(0.07), line * (1.0 - dark) * 0.75);
  color += line * dark * (0.12 + 0.1 * max(facing, 0.0));

  let cov = 1.0 - smoothstep(-aa, aa, d);
  let bodyA = params.fill.a * cov;
  // Premultiplied: body over shadow.
  let rgb = color * bodyA + SHADOW_COLOR * shadowA * (1.0 - bodyA);
  let a = bodyA + shadowA * (1.0 - bodyA);
  return vec4f(rgb, a);
}
