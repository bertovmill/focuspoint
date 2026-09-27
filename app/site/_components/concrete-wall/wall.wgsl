// A lit plaster wall. One fullscreen pass: a procedural height field for the
// plaster, its normal, and a soft area light that drifts across it. Nothing is
// sampled from a texture; the whole surface is noise, so it never tiles.

struct WallParams {
  // xy: output size in pixels. z: seconds. w: 1 in dark mode, 0 in light.
  resolution_time_dark: vec4f,
  // xy: the light's current position in uv space. z: a cosine-drift phase used
  // by the window patches. w: unused.
  light: vec4f,
}

@group(0) @binding(0) var<uniform> params: WallParams;

fn hash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn value_noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Plaster height: broad trowel mottle plus fine grit.
fn height(p: vec2f) -> f32 {
  var h = 0.0;
  h += value_noise(p * 3.0) * 0.5;
  h += value_noise(p * 9.0) * 0.25;
  h += value_noise(p * 27.0) * 0.125;
  h += value_noise(p * 81.0) * 0.0625;
  h += value_noise(p * 240.0) * 0.025;
  return h;
}

// A soft-edged rectangle of window light, rotated slightly so it reads as
// cast through a frame rather than drawn on.
fn window_patch(uv: vec2f, center: vec2f, size: vec2f, angle: f32, softness: f32) -> f32 {
  let c = cos(angle);
  let s = sin(angle);
  let d = uv - center;
  let r = vec2f(c * d.x - s * d.y, s * d.x + c * d.y);
  let edge = smoothstep(size, size - vec2f(softness), abs(r));
  return edge.x * edge.y;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = params.resolution_time_dark.xy;
  let time = params.resolution_time_dark.z;
  let dark = params.resolution_time_dark.w;
  let aspect = resolution.x / resolution.y;
  // Square-ish coordinates so the plaster grain isn't stretched on wide screens.
  let p = vec2f(uv.x * aspect, uv.y) * 1.6;

  // Normal from the height field by central differences.
  let e = 1.5 / resolution.y;
  let hx = height(p + vec2f(e, 0.0)) - height(p - vec2f(e, 0.0));
  let hy = height(p + vec2f(0.0, e)) - height(p - vec2f(0.0, e));
  let bump = 1.4;
  let n = normalize(vec3f(-hx * bump, -hy * bump, 1.0));

  // The moving light: a broad soft source hovering just off the wall.
  let light_uv = params.light.xy;
  let to_light = vec3f((light_uv.x - uv.x) * aspect, (light_uv.y - uv.y), 0.9);
  let dist = length(to_light);
  let l = to_light / dist;
  let diffuse = max(dot(n, l), 0.0);
  let falloff = 1.0 / (1.0 + dist * dist * 1.1);
  let key = diffuse * falloff;

  // Window light: two soft panes drifting a little with the phase, and one
  // diagonal band that leans the way the key light travels.
  let phase = params.light.z;
  let pane_a = window_patch(uv, vec2f(0.16 + phase * 0.03, 0.34), vec2f(0.20, 0.30), 0.10, 0.22);
  let pane_b = window_patch(uv, vec2f(0.40 + phase * 0.02, 0.26), vec2f(0.10, 0.22), 0.10, 0.18);
  let band_axis = normalize(vec2f(0.55, -1.0));
  let band_d = dot(vec2f((uv.x - 0.86 - phase * 0.02) * aspect, uv.y - 0.5), band_axis);
  let band = exp(-band_d * band_d * 260.0);
  let windows = pane_a * 0.55 + pane_b * 0.35 + band * 0.45;
  // Windows still shade with the surface, faintly, so the grain shows in them.
  let window_shade = 0.85 + 0.15 * max(dot(n, vec3f(0.0, 0.0, 1.0)), 0.0);

  let h = height(p);
  let grit = (value_noise(p * 420.0) - 0.5) * 0.035;

  // Light mode: warm plaster. Dark mode: the same wall at night, lit the same way.
  let base_light = vec3f(0.84, 0.82, 0.78);
  let base_dark = vec3f(0.17, 0.165, 0.155);
  let base = mix(base_light, base_dark, dark) * (0.94 + h * 0.10 + grit);

  let ambient = mix(0.86, 0.72, dark);
  let key_strength = mix(0.22, 0.30, dark);
  let window_strength = mix(0.32, 0.12, dark);
  let lit = base * (ambient + key * key_strength) + vec3f(1.0, 0.99, 0.96) * windows * window_shade * window_strength;

  // Dither so the broad gradients don't band on 8-bit panels.
  let dither = (hash(uv * resolution + time) - 0.5) / 255.0;
  return vec4f(clamp(lit + dither, vec3f(0.0), vec3f(1.0)), 1.0);
}
