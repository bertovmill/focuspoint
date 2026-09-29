// A lit plaster wall. One fullscreen pass: a procedural height field for the
// plaster, its normal, and a soft area light that drifts across it. Nothing is
// sampled from a texture; the whole surface is noise, so it never tiles.

struct WallParams {
  // xy: output size in pixels. z: seconds. w: 1 in dark mode, 0 in light.
  resolution_time_dark: vec4f,
  // xy: the light's current position in uv space. z: a cosine-drift phase used
  // by the window patches. w: unused.
  light: vec4f,
  // The visitor's sun, from their local time: x sun height (0 horizon, 1 noon),
  // y progress through the day (0 sunrise, 1 sunset), z golden-hour warmth,
  // w night (1 once it's dark out).
  sky: vec4f,
  // The visitor's weather: x cloud cover, y rain on the window (0 to 1).
  weather: vec4f,
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

// One layer of drops sliding down the glass. Returns the drops' coverage and
// their bright lensed cores; the window light passing through them is what
// lands on the wall, so drops read as small shadows with a sparkle inside.
// `q` is in wall units (aspect-corrected), `cells` sets the drop spacing.
fn sliding_drops(q: vec2f, t: f32, cells: vec2f, seed: f32) -> vec2f {
  let column = floor(q.x * cells.x);
  let column_rand = hash(vec2f(column, seed));
  // Each column falls at its own pace, in stop-start lurches like real drops.
  let fall = t * (0.08 + column_rand * 0.10);
  let lurch = fall + 0.35 * sin(fall * 6.2831 + column_rand * 20.0) / 6.2831;
  let s = vec2f(q.x * cells.x, q.y * cells.y - lurch + column_rand * 7.0);
  let id = floor(s);
  let f = fract(s) - vec2f(0.5);
  let r = hash(id + seed);
  if (r < 0.45) {
    return vec2f(0.0);
  }
  let wobble = sin(s.y * 5.0 + r * 30.0) * 0.08;
  let x = (hash(id + 3.1) - 0.5) * 0.5 + wobble;
  // Drops are round on the wall even though cells are tall.
  let d = (f - vec2f(x, 0.25)) * vec2f(1.0, cells.x / cells.y);
  let radius = 0.10 + r * 0.08;
  let dist = length(d);
  let body = smoothstep(radius, radius * 0.55, dist);
  let core = smoothstep(radius * 0.45, 0.0, length(d - vec2f(0.02, -0.03)));
  // A thin beaded trail left above the drop.
  let trail_x = smoothstep(0.05, 0.0, abs(f.x - x));
  let behind = smoothstep(0.25, -0.5, f.y) * step(f.y, 0.2);
  let beads = smoothstep(0.35, 0.8, fract(f.y * 5.0 + r * 3.0));
  let trail = trail_x * behind * beads * 0.5;
  return vec2f(max(body, trail), core);
}

// Small stationary droplets that bead up on the glass, fade, and come back.
fn static_drops(q: vec2f, t: f32, density: f32) -> vec2f {
  let s = q * 34.0;
  let id = floor(s);
  let f = fract(s) - vec2f(0.5);
  let r = hash(id + 11.0);
  let life = fract(t * 0.05 + r * 9.0);
  let visible = step(1.0 - density, hash(id + 5.0)) * smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.7, life);
  let c = vec2f(hash(id + 1.7), hash(id + 2.9)) - vec2f(0.5);
  let radius = 0.10 + r * 0.12;
  let dist = length(f - c * 0.6);
  let body = smoothstep(radius, radius * 0.5, dist) * visible;
  let core = smoothstep(radius * 0.4, 0.0, dist) * visible;
  return vec2f(body, core);
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
  //
  // The sun moves the panes: they slide across the wall through the day, and
  // stretch and lean further when the sun is low.
  let phase = params.light.z;
  let sun_height = params.sky.x;
  let sun_progress = params.sky.y;
  let warmth = params.sky.z;
  let night = params.sky.w;
  let cloud = params.weather.x;
  let rain = params.weather.y;
  let slide = (0.5 - sun_progress) * 0.14;
  let low = 1.0 - sun_height;
  let stretch = 1.0 + low * 0.35;
  let lean = 0.10 + low * 0.12;
  let pane_a = window_patch(uv, vec2f(0.16 + slide + phase * 0.03, 0.34 + low * 0.04), vec2f(0.20, 0.30 * stretch), lean, 0.22);
  let pane_b = window_patch(uv, vec2f(0.40 + slide + phase * 0.02, 0.26 + low * 0.04), vec2f(0.10, 0.22 * stretch), lean, 0.18);
  let band_axis = normalize(vec2f(0.55 + low * 0.3, -1.0));
  let band_d = dot(vec2f((uv.x - 0.86 + slide - phase * 0.02) * aspect, uv.y - 0.5), band_axis);
  let band = exp(-band_d * band_d * 260.0);

  // Rain on the glass. The drops' shadows only exist where window light falls,
  // so this modulates the panes rather than the whole wall.
  let q = vec2f(uv.x * aspect, uv.y);
  var drops = vec2f(0.0);
  if (rain > 0.001) {
    let big = sliding_drops(q, time, vec2f(9.0, 2.2), 1.0);
    let small = sliding_drops(q * 1.7 + vec2f(3.3, 0.0), time * 1.2, vec2f(9.0, 2.6), 7.0);
    let beads = static_drops(q, time, 0.15 + rain * 0.5);
    let big_weight = smoothstep(0.2, 0.7, rain);
    drops = max(max(big * big_weight, small * smoothstep(0.0, 0.4, rain)), beads);
  }
  // Soft shadow of the drop, a lensed bright point inside it.
  let rain_mod = 1.0 - drops.x * 0.9 + drops.y * 1.4;
  let windows = (pane_a * 0.55 + pane_b * 0.35 + band * 0.45) * rain_mod;
  // Windows still shade with the surface, faintly, so the grain shows in them.
  let window_shade = 0.85 + 0.15 * max(dot(n, vec3f(0.0, 0.0, 1.0)), 0.0);

  let h = height(p);
  let grit = (value_noise(p * 420.0) - 0.5) * 0.035;

  // Light mode: warm plaster. Dark mode: the same wall at night, lit the same way.
  let base_light = vec3f(0.84, 0.82, 0.78);
  let base_dark = vec3f(0.17, 0.165, 0.155);
  let base = mix(base_light, base_dark, dark) * (0.94 + h * 0.10 + grit);

  // Daylight dims under cloud and at night, though never so far in light mode
  // that the headline loses the wall behind it. Night leans cool.
  let overcast = cloud * (1.0 - night);
  let ambient = mix(0.86, 0.72, dark) - night * mix(0.10, 0.08, dark) - overcast * 0.02;
  let ambient_tint = mix(vec3f(1.0), vec3f(0.92, 0.95, 1.03), max(night, overcast * 0.6));

  // The pointer light becomes a warm lamp in the room once it's dark.
  let key_color = mix(vec3f(1.0), vec3f(1.12, 0.98, 0.82), night);
  let key_strength = mix(0.22, 0.30, dark) + night * 0.06;

  // Window light: white at noon, gold near sunrise and sunset, and at night a
  // weak sodium street light, so rain on the glass still shows after dark.
  let sun_color = mix(vec3f(1.0, 0.99, 0.96), vec3f(1.0, 0.80, 0.55), warmth);
  let street_color = vec3f(1.0, 0.78, 0.52);
  let window_color = mix(sun_color, street_color, night);
  // Overcast light is weaker but still comes through the window as a soft
  // pane, enough to carry the rain's shadows.
  let daylight = mix(1.0, 0.22, night) * mix(1.0, 0.62, cloud * (1.0 - night));
  let window_strength = mix(0.32, 0.12, dark) * daylight;

  let lit = base * ambient_tint * (ambient + key * key_strength * key_color)
    + window_color * windows * window_shade * window_strength;

  // Dither so the broad gradients don't band on 8-bit panels.
  let dither = (hash(uv * resolution + time) - 0.5) / 255.0;
  return vec4f(clamp(lit + dither, vec3f(0.0), vec3f(1.0)), 1.0);
}
