// A lit plaster wall with a window in it. One fullscreen pass: a procedural
// height field for the plaster, its normal, a soft area light that drifts
// across it, and on the homepage a window cut into the wall, looking out on
// Toronto. Nothing on the wall is sampled from a texture; the view through
// the glass is the only image.

struct WallParams {
  // xy: output size in pixels. z: seconds. w: 1 in dark mode, 0 in light.
  resolution_time_dark: vec4f,
  // xy: the light's current position in uv space. z: a cosine-drift phase used
  // by the window patches. w: unused.
  light: vec4f,
  // The sun over the desk, from Toronto's clock: x sun height (0 horizon,
  // 1 noon), y progress through the day (0 sunrise, 1 sunset), z golden-hour
  // warmth, w night (1 once it's dark out).
  sky: vec4f,
  // The weather: x cloud cover, y rain on the glass (0 to 1), z 1 once the
  // city textures have loaded, w unused.
  weather: vec4f,
  // The window's glass in uv: xy centre, zw half size. z <= 0 means no window.
  window: vec4f,
}

@group(0) @binding(0) var<uniform> params: WallParams;
// The view out of the window in four skies: 0 day, 1 golden hour, 2 night,
// 3 overcast. All the same photograph, so they cross-fade without the
// buildings moving.
@group(0) @binding(1) var city: texture_2d_array<f32>;
@group(0) @binding(2) var city_sampler: sampler;

// The city textures' aspect ratio; the glass shows a cover-fit crop of them.
const CITY_ASPECT: f32 = 1.5;
// The glazing, matching WINDOW_GRID in scene.ts: panes across, rows a sash.
const PANE_COLS: f32 = 2.0;
const PANE_ROWS: f32 = 1.0;

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

// One layer of drops sliding down the glass. Returns the drops' coverage, their
// bright lensed cores, and where inside the drop this point sits (for the
// refraction of the view behind it). `q` is in glass units (aspect-corrected),
// `cells` sets the drop spacing.
fn sliding_drops(q: vec2f, t: f32, cells: vec2f, seed: f32) -> vec4f {
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
    return vec4f(0.0);
  }
  let wobble = sin(s.y * 5.0 + r * 30.0) * 0.08;
  let x = (hash(id + 3.1) - 0.5) * 0.5 + wobble;
  // Drops are round on the glass even though cells are tall.
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
  return vec4f(max(body, trail), core, d / radius);
}

// Small stationary droplets that bead up on the glass, fade, and come back.
fn static_drops(q: vec2f, t: f32, density: f32) -> vec4f {
  let s = q * 34.0;
  let id = floor(s);
  let f = fract(s) - vec2f(0.5);
  let r = hash(id + 11.0);
  let life = fract(t * 0.05 + r * 9.0);
  let visible = step(1.0 - density, hash(id + 5.0)) * smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.7, life);
  let c = vec2f(hash(id + 1.7), hash(id + 2.9)) - vec2f(0.5);
  let radius = 0.10 + r * 0.12;
  let d = f - c * 0.6;
  let dist = length(d);
  let body = smoothstep(radius, radius * 0.5, dist) * visible;
  let core = smoothstep(radius * 0.4, 0.0, dist) * visible;
  return vec4f(body, core, d / radius);
}

// The architrave's profile across its width: `t` is 0 at the reveal and 1 at
// the wall. A shadow line where it meets the reveal, a small inner bead, a
// flat field, a rounded outer bead, and a shadow where it meets the plaster.
fn moulding(t: f32) -> f32 {
  var s = 1.0;
  s -= 0.18 * (1.0 - smoothstep(0.0, 0.08, t));
  s += 0.10 * smoothstep(0.10, 0.17, t) * (1.0 - smoothstep(0.17, 0.28, t));
  s += 0.12 * smoothstep(0.76, 0.85, t) * (1.0 - smoothstep(0.85, 0.94, t));
  s -= 0.16 * smoothstep(0.94, 1.0, t);
  return s;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = params.resolution_time_dark.xy;
  let time = params.resolution_time_dark.z;
  let dark = params.resolution_time_dark.w;
  let aspect = resolution.x / resolution.y;
  // Wall units: y is 0 to 1 top to bottom, x is scaled by the aspect so
  // distances are the same in both directions.
  let q = vec2f(uv.x * aspect, uv.y);
  let px = 1.5 / resolution.y;
  // Square-ish coordinates so the plaster grain isn't stretched on wide screens.
  let p = q * 1.6;

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

  // The sun and the weather.
  let phase = params.light.z;
  let sun_height = params.sky.x;
  let sun_progress = params.sky.y;
  let warmth = params.sky.z;
  let night = params.sky.w;
  let cloud = params.weather.x;
  let rain = params.weather.y;
  let city_ready = params.weather.z;

  // Window light on the wall from the room's other window, off to the left:
  // two soft panes drifting a little with the phase, and one diagonal band
  // that leans the way the key light travels. The sun moves the panes: they
  // slide across the wall through the day, and stretch and lean further when
  // the sun is low.
  let slide = (0.5 - sun_progress) * 0.14;
  let low = 1.0 - sun_height;
  let stretch = 1.0 + low * 0.35;
  let lean = 0.10 + low * 0.12;
  let pane_a = window_patch(uv, vec2f(0.16 + slide + phase * 0.03, 0.34 + low * 0.04), vec2f(0.20, 0.30 * stretch), lean, 0.22);
  let pane_b = window_patch(uv, vec2f(0.40 + slide + phase * 0.02, 0.26 + low * 0.04), vec2f(0.10, 0.22 * stretch), lean, 0.18);
  let band_axis = normalize(vec2f(0.55 + low * 0.3, -1.0));
  let band_d = dot(vec2f((uv.x - 0.86 + slide - phase * 0.02) * aspect, uv.y - 0.5), band_axis);
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

  // Daylight dims under cloud and at night, though never so far in light mode
  // that the headline loses the wall behind it. Night leans cool, and so does a
  // heavy sky: a few clouds barely register, a full overcast turns the wall a
  // flat blue-grey, and rain darkens it a little further.
  let overcast = cloud * (1.0 - night);
  let gloom = smoothstep(0.0, 1.0, overcast) + rain * 0.25 * (1.0 - night);
  let ambient = mix(0.86, 0.72, dark) - night * mix(0.10, 0.08, dark) - gloom * mix(0.16, 0.10, dark);
  let ambient_tint = mix(vec3f(1.0), vec3f(0.92, 0.95, 1.03), max(night, min(1.0, gloom)));

  // The pointer light becomes a warm lamp in the room once it's dark.
  let key_color = mix(vec3f(1.0), vec3f(1.12, 0.98, 0.82), night);
  let key_strength = mix(0.22, 0.30, dark) + night * 0.06;

  // Window light: white at noon, gold near sunrise and sunset, and at night a
  // weak sodium street light.
  let sun_color = mix(vec3f(1.0, 0.99, 0.96), vec3f(1.0, 0.80, 0.55), warmth);
  let street_color = vec3f(1.0, 0.78, 0.52);
  let window_color = mix(sun_color, street_color, night);
  // Overcast light is weaker but still comes through as a soft pane.
  let daylight = mix(1.0, 0.22, night) * mix(1.0, 0.45, overcast);
  let window_strength = mix(0.32, 0.12, dark) * daylight;

  // ---- The window in the wall -------------------------------------------
  //
  // A painted sash window set into the plaster, from the glass outward: the
  // panes divided by thin glazing bars, the two sashes meeting at a heavier
  // rail; the sash frame; a deep painted
  // reveal with a sill that steps out past the casing; and a moulded
  // architrave around it all. Everything painted is `paint`, lit by the room
  // and by the daylight coming through.

  let has_window = step(0.0001, params.window.z);
  let wc = vec2f(params.window.x * aspect, params.window.y);
  let wh = vec2f(params.window.z * aspect, params.window.w);
  let safe_wh = max(wh, vec2f(0.0001));
  // Joinery is sized to the window, so a small window on a phone doesn't get
  // a casing as deep as its glass.
  let joinery = clamp(safe_wh.y / 0.24, 0.5, 1.0);
  let sash_w = 0.014 * joinery;    // sash stiles and rails around the glass
  let reveal_w = 0.042 * joinery;  // the wall's thickness, painted
  let trim_w = 0.030 * joinery;    // the architrave on the wall
  let lip = 0.012 * joinery;       // how far the sill steps out past the trim
  let muntin_w = 0.0045 * joinery; // half width of a glazing bar
  let rail_w = 0.011 * joinery;    // half width of the meeting rail

  // Per-axis signed distance to the glass; the largest is the distance to the
  // (square-cornered) opening, negative inside it.
  let r = abs(q - wc) - wh;
  let ring = max(r.x, r.y);
  let edge_reveal = sash_w + reveal_w;
  let edge_trim = edge_reveal + trim_w;
  let glass = (1.0 - smoothstep(-px, px, ring)) * has_window;
  let sash = (1.0 - smoothstep(sash_w - px, sash_w + px, ring)) * (1.0 - glass) * has_window;
  let in_reveal = (1.0 - smoothstep(edge_reveal - px, edge_reveal + px, ring)) * (1.0 - glass) * (1.0 - sash) * has_window;
  let in_trim = (1.0 - smoothstep(edge_trim - px, edge_trim + px, ring)) * (1.0 - glass) * (1.0 - sash) * (1.0 - in_reveal) * has_window;
  let below = step(wc.y, q.y);
  let head_or_sill = step(r.x, r.y);
  let under_x = step(abs(q.x - wc.x), wh.x + edge_trim);
  // The sill's lip: a band just outside the reveal at the bottom, across the
  // casing's whole width, standing in front of the trim.
  let sill_lip = below * head_or_sill * under_x * has_window
    * smoothstep(edge_reveal - px, edge_reveal + px, ring)
    * (1.0 - smoothstep(edge_reveal + lip - px, edge_reveal + lip + px, ring));
  // Its shadow, down the apron and the wall beneath.
  let lip_shadow = below * head_or_sill * under_x * has_window
    * step(edge_reveal + lip, ring) * smoothstep(0.07 * joinery, 0.0, ring - edge_reveal - lip);
  // Distance out from the whole casing, for the light it spills on the wall.
  let outside = max(ring - edge_trim, 0.0);
  let halo = exp(-outside * 24.0) * daylight * 0.06 * has_window;

  let wall_lit = base * ambient_tint * (ambient + key * key_strength * key_color)
    * (1.0 - lip_shadow * 0.18 * (0.4 + 0.6 * daylight))
    + window_color * windows * window_shade * window_strength
    + window_color * halo;

  // The architrave: painted wood on the wall, lit by the room, with its
  // moulding profile across it.
  let paint = mix(vec3f(0.93, 0.91, 0.87), vec3f(0.26, 0.255, 0.245), dark);
  let td = clamp((ring - edge_reveal) / trim_w, 0.0, 1.0);
  let trim_shade = moulding(td);
  let trim_lit = paint * ambient_tint * (ambient + key * key_strength * 0.75) * trim_shade
    * (1.0 - lip_shadow * 0.45) + paint * halo * 1.5;

  // The sill's front edge: a bright rounded top, darker underneath.
  let ld = clamp((ring - edge_reveal) / lip, 0.0, 1.0);
  let lip_shade = 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.25, ld)) - 0.35 * smoothstep(0.5, 1.0, ld);
  let lip_lit = paint * ambient_tint * (ambient + key * key_strength * 0.6) * lip_shade + paint * daylight * 0.10;

  // The reveal: the sill faces up into the sky, the head faces down away from
  // it, the jambs sit between. Occluded in the corner by the sash, brighter
  // out by the trim.
  let jamb = 1.0 - head_or_sill;
  let depth = clamp((ring - sash_w) / reveal_w, 0.0, 1.0);
  let face_room = mix(mix(0.50, 0.92, below), 0.72, jamb);
  let face_sky = mix(mix(0.15, 1.0, below), 0.55, jamb);
  let ao = 0.80 + 0.20 * smoothstep(0.0, 0.5, depth);
  let reveal_lit = paint * ambient_tint * (ambient * face_room * ao + key * key_strength * 0.3)
    + window_color * daylight * 0.20 * face_sky;

  // The sash around the glass: a shadow line against the glass, a highlight
  // on the outer round.
  let fd = clamp(ring / sash_w, 0.0, 1.0);
  let sash_shade = 0.88 - 0.16 * (1.0 - smoothstep(0.0, 0.18, fd)) + 0.14 * smoothstep(0.45, 0.75, fd) - 0.10 * smoothstep(0.9, 1.0, fd);
  let sash_lit = paint * ambient_tint * (ambient * sash_shade + key * key_strength * 0.7) + paint * daylight * 0.06;

  // Glazing bars: uprights splitting the glass into PANE_COLS, PANE_ROWS
  // across each sash, and the meeting rail between the sashes. The distance
  // to the nearest bar is the distance to the nearest cell boundary.
  let gx = q.x - wc.x;
  let gy = q.y - wc.y;
  let cell_x = 2.0 * safe_wh.x / PANE_COLS;
  let cell_y = safe_wh.y / PANE_ROWS;
  let bar_x = (0.5 - abs(fract((gx + safe_wh.x) / cell_x) - 0.5)) * cell_x;
  let bar_y = (0.5 - abs(fract((gy + safe_wh.y) / cell_y) - 0.5)) * cell_y;
  let bar_v = 1.0 - smoothstep(muntin_w - px, muntin_w + px, bar_x);
  let bar_h = 1.0 - smoothstep(muntin_w - px, muntin_w + px, bar_y);
  let rail = 1.0 - smoothstep(rail_w - px, rail_w + px, abs(gy));
  let bars = max(max(bar_v, bar_h), rail) * glass;
  let bar_t = min(min(bar_x / muntin_w, bar_y / muntin_w), abs(gy) / rail_w);
  let bar_shade = 1.0 - 0.3 * smoothstep(0.55, 1.0, bar_t);
  let bars_lit = paint * ambient_tint * (ambient * bar_shade + key * key_strength * 0.7) + paint * daylight * 0.05;
  // How far this point is from the nearest bar or sash edge: the glazing
  // throws a soft shadow onto the rim of every pane.
  let pane_edge = max(min(min(bar_x - muntin_w, bar_y - muntin_w), min(abs(gy) - rail_w, min(safe_wh.x - abs(gx), safe_wh.y - abs(gy)))), 0.0);
  let pane_inset = smoothstep(0.0, 0.010 * joinery, pane_edge);
  // Each pane is its own sheet of glass, with a touch of its own tilt and tint.
  let pane_id = vec2f(floor((gx + safe_wh.x) / cell_x), floor((gy + safe_wh.y) / cell_y));
  let pane_rand = hash(pane_id + vec2f(0.5, 0.5));
  let pane_tilt = (vec2f(hash(pane_id + vec2f(1.3, 1.3)), hash(pane_id + vec2f(2.7, 2.7))) - vec2f(0.5)) * 0.004;
  // The lower sash sits behind the upper, so the meeting rail shades the
  // panes just under it.
  let rail_shadow = smoothstep(0.02 * joinery, 0.0, gy - rail_w) * step(rail_w, gy) * 0.16;

  // The glass. Glass-local coordinates run 0 to 1 across the opening; the city
  // is cover-fitted into it.
  let local = (q - (wc - wh)) / (2.0 * safe_wh);
  let win_aspect = safe_wh.x / safe_wh.y;
  var tuv = local;
  if (win_aspect < CITY_ASPECT) {
    tuv.x = 0.5 + (local.x - 0.5) * (win_aspect / CITY_ASPECT);
  } else {
    tuv.y = 0.5 + (local.y - 0.5) * (CITY_ASPECT / win_aspect);
  }
  tuv += pane_tilt;

  // Rain beads and runs down the glass, bending the view behind each drop.
  let g = vec2f(local.x * win_aspect, local.y) * 1.35;
  var drops = vec4f(0.0);
  if (rain > 0.001) {
    let big = sliding_drops(g, time, vec2f(9.0, 2.2), 1.0);
    let small = sliding_drops(g * 1.7 + vec2f(3.3, 0.0), time * 1.2, vec2f(9.0, 2.6), 7.0);
    let beads = static_drops(g, time, 0.15 + rain * 0.5);
    let big_weight = smoothstep(0.2, 0.7, rain);
    drops = big * big_weight;
    let small_w = small * smoothstep(0.0, 0.4, rain);
    if (small_w.x > drops.x) {
      drops = small_w;
    }
    if (beads.x > drops.x) {
      drops = beads;
    }
  }
  tuv += drops.zw * drops.x * vec2f(-0.035, -0.035 * win_aspect / CITY_ASPECT);
  tuv = clamp(tuv, vec2f(0.001), vec2f(0.999));

  let day_view = textureSample(city, city_sampler, tuv, 0).rgb;
  let golden_view = textureSample(city, city_sampler, tuv, 1).rgb;
  let night_view = textureSample(city, city_sampler, tuv, 2).rgb;
  let grey_view = textureSample(city, city_sampler, tuv, 3).rgb;
  let clear_view = mix(day_view, golden_view, warmth);
  let cloudy_view = mix(clear_view, grey_view, smoothstep(0.15, 0.85, cloud) * 0.85);
  var view = mix(cloudy_view, night_view * (1.0 - cloud * 0.35), night);
  // Until the photographs arrive, a plain sky in the right light.
  let sky_fallback = mix(vec3f(0.56, 0.68, 0.84), vec3f(0.84, 0.87, 0.90), local.y);
  let fallback = mix(mix(sky_fallback, vec3f(0.70, 0.72, 0.74), overcast), vec3f(0.07, 0.09, 0.14), night);
  view = mix(fallback, view, city_ready);
  // A window is a little overexposed next to the room by day.
  view *= mix(1.06, 1.0, night);

  // The room reflected in the glass: faint by day, and at night the warm lamp
  // shows up in it. The drops have dark rims and a bright lensed core.
  let reflection_color = mix(vec3f(0.92, 0.90, 0.86), vec3f(1.0, 0.86, 0.66), night);
  let reflection = reflection_color * (mix(0.045, 0.08, night) + night * key * 0.22 * (1.0 - dark * 0.4)) * (0.85 + 0.3 * pane_rand);
  let glass_lit = view * (0.84 + 0.16 * pane_inset) * (1.0 - rail_shadow) * (1.0 - drops.x * 0.18) * (0.97 + 0.06 * pane_rand)
    + drops.y * 0.18 * (0.3 + daylight) + reflection;

  var lit = wall_lit;
  lit = mix(lit, trim_lit, in_trim);
  lit = mix(lit, lip_lit, sill_lip);
  lit = mix(lit, reveal_lit, in_reveal);
  lit = mix(lit, sash_lit, sash);
  lit = mix(lit, glass_lit, glass);
  lit = mix(lit, bars_lit, bars);

  // Dither so the broad gradients don't band on 8-bit panels.
  let dither = (hash(uv * resolution + time) - 0.5) / 255.0;
  return vec4f(clamp(lit + dither, vec3f(0.0), vec3f(1.0)), 1.0);
}
