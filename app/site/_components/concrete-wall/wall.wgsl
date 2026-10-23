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
  // The roller shade in the window: x how far its hem hangs down the glass (0
  // rolled up, 1 closed), y 1 when the shader draws it (0 leaves it to the
  // page). zw unused.
  blind: vec4f,
  // Which window (WINDOW_STYLES in scene.ts): x kind (0 square, 1 arched), y
  // panes across, z panes down, w the arch's rise as a fraction of the glass height.
  design: vec4f,
  // Its joinery at full size, in wall units: x frame width, y glazing bar half
  // width, z the ledge's height, w how far the ledge runs past the frame.
  dims: vec4f,
  // xyz the frame's paint, w spokes in the arch's fanlight.
  paint: vec4f,
}

@group(0) @binding(0) var<uniform> params: WallParams;
// The view out of the window in four skies: 0 day, 1 golden hour, 2 night,
// 3 overcast. All the same photograph, so they cross-fade without the
// buildings moving.
@group(0) @binding(1) var city: texture_2d_array<f32>;
@group(0) @binding(2) var city_sampler: sampler;

// The city textures' aspect ratio; the glass shows a cover-fit crop of them.
const CITY_ASPECT: f32 = 1.5;
const PI: f32 = 3.14159265;

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

// The view out of the window at one point, sampled without derivatives so it can
// be called from inside a branch. The same mix of the four skies as the glass uses.
fn city_view_at(tuv: vec2f, warmth: f32, cloud: f32, night: f32) -> vec3f {
  let day = textureSampleLevel(city, city_sampler, tuv, 0, 0.0).rgb;
  let golden = textureSampleLevel(city, city_sampler, tuv, 1, 0.0).rgb;
  let dark_sky = textureSampleLevel(city, city_sampler, tuv, 2, 0.0).rgb;
  let grey = textureSampleLevel(city, city_sampler, tuv, 3, 0.0).rgb;
  let clear_sky = mix(day, golden, warmth);
  let cloudy = mix(clear_sky, grey, smoothstep(0.15, 0.85, cloud) * 0.85);
  return mix(cloudy, dark_sky * (1.0 - cloud * 0.35), night);
}

// The same view, softened: what a light-filtering shade lets through. A golden-angle
// spiral of taps, so the blur has no grid to it.
fn city_view_diffused(tuv: vec2f, warmth: f32, cloud: f32, night: f32, radius: f32) -> vec3f {
  var acc = city_view_at(tuv, warmth, cloud, night);
  for (var i = 0; i < 14; i++) {
    let a = f32(i) * 2.399963;
    let r = radius * sqrt((f32(i) + 0.5) / 14.0);
    let tap = clamp(tuv + vec2f(cos(a), sin(a)) * r, vec2f(0.001), vec2f(0.999));
    acc += city_view_at(tap, warmth, cloud, night);
  }
  return acc / 15.0;
}

// Signed distance to the window's opening (negative inside): a box, or for an
// arched window the box capped by a segmental arch that rises `rise` from the
// top corners to the crown.
fn opening_sd(p: vec2f, c: vec2f, h: vec2f, arched: f32, rise: f32) -> f32 {
  let r = abs(p - c) - h;
  let box_d = max(r.x, r.y);
  let safe_rise = max(rise, 0.0001);
  let radius = (h.x * h.x + safe_rise * safe_rise) / (2.0 * safe_rise);
  let arc_d = length(p - vec2f(c.x, c.y - h.y + radius)) - radius;
  return mix(box_d, max(box_d, arc_d), arched);
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
  // A window set flush into the plaster, in whichever style the visitor
  // picked: a frame around the glass, glazing bars splitting it into panes,
  // and a ledge just under it (the jar stands on it). Black steel, a bronze
  // arch with a sunburst fanlight, or painted white timber with a deeper
  // sill. The only depth is a soft contact shadow where the frame meets the
  // wall, the ledge's shadow, and a faint inner shadow on each pane.

  let has_window = step(0.0001, params.window.z);
  let wc = vec2f(params.window.x * aspect, params.window.y);
  let wh = vec2f(params.window.z * aspect, params.window.w);
  let safe_wh = max(wh, vec2f(0.0001));
  // Sized to the window, so a phone's small window gets a slimmer frame.
  // Keep these in step with sillAnchor in scene.ts.
  let joinery = clamp(safe_wh.y / 0.24, 0.5, 1.0);
  let arched = step(0.5, params.design.x);
  let cols = max(params.design.y, 1.0);
  let rows = max(params.design.z, 1.0);
  let rise = params.design.w * 2.0 * safe_wh.y * arched;
  let fan = max(params.paint.w, 1.0);
  let frame_w = params.dims.x * joinery;    // the frame around the glass
  let mullion_w = params.dims.y * joinery;  // half width of a glazing bar
  let ledge_h = params.dims.z * joinery;    // the ledge's full height, top face and front
  let ledge_top = ledge_h * 0.38;           // the ledge's top face, seen from just above
  let ledge_over = params.dims.w * joinery; // how far the ledge runs past the frame each side

  // How light the paint is: black steel and bronze catch sharp highlights,
  // white timber reads by its shadows instead.
  let paint = params.paint.rgb;
  let bright = smoothstep(0.3, 0.8, dot(paint, vec3f(0.3333)));

  // Signed distance to the opening; negative inside it.
  let ring = opening_sd(q, wc, safe_wh, arched, rise);
  let glass = (1.0 - smoothstep(-px, px, ring)) * has_window;
  let frame = (1.0 - smoothstep(frame_w - px, frame_w + px, ring)) * (1.0 - glass) * has_window;

  // The ledge: a bar right under the frame, a little wider than it.
  let ledge_y0 = wc.y + wh.y + frame_w;
  let ledge_dx = abs(q.x - wc.x) - (wh.x + frame_w + ledge_over);
  let ledge_dy = q.y - ledge_y0;
  let in_ledge_x = 1.0 - smoothstep(-px, px, ledge_dx);
  let ledge = in_ledge_x * smoothstep(-px, px, ledge_dy) * (1.0 - smoothstep(ledge_h - px, ledge_h + px, ledge_dy)) * has_window;
  let ledge_face = smoothstep(ledge_top - px, ledge_top + px, ledge_dy);
  // Its shadow on the wall below, softening as it falls; a deeper sill throws a longer one.
  let below_ledge = ledge_dy - ledge_h;
  let ledge_shadow = (1.0 - smoothstep(-0.004 * joinery, 0.004 * joinery, ledge_dx)) * step(0.0, below_ledge)
    * smoothstep(ledge_h * 3.3, 0.0, below_ledge) * has_window;

  // A soft contact shadow around the frame, dropped a touch, so it sits in
  // the wall rather than on it.
  let ring_s = opening_sd(q - vec2f(0.0, 0.003 * joinery), wc, safe_wh, arched, rise);
  let contact = smoothstep(frame_w + 0.012 * joinery, frame_w, ring_s) * has_window;
  // Distance out from the frame, for the daylight it spills on the wall.
  let outside = max(ring - frame_w, 0.0);
  let halo = exp(-outside * 24.0) * daylight * 0.06 * has_window;

  let wall_lit = base * ambient_tint * (ambient + key * key_strength * key_color)
    * (1.0 - contact * mix(0.10, 0.16, bright)) * (1.0 - ledge_shadow * 0.22 * (0.4 + 0.6 * daylight))
    + window_color * windows * window_shade * window_strength
    + window_color * halo;

  // The frame, lit by the room. Dark metal gets a fine highlight along its
  // outer edge; painted timber gets a soft bevel instead (a lit outer
  // edge, a shadowed rebate against the glass) and a faint brushed grain.
  let paint_room = paint * ambient_tint * (ambient + key * key_strength * 0.9);
  let fd = clamp(ring / frame_w, 0.0, 1.0);
  let frame_edge = smoothstep(0.75, 0.95, fd) * (1.0 - smoothstep(0.95, 1.0, fd));
  let rebate = 1.0 - smoothstep(0.0, 0.35, fd);
  let brush = (value_noise(q * vec2f(900.0, 60.0)) - 0.5) * 0.035 * bright;
  let frame_lit = paint_room * (1.0 + frame_edge * mix(0.9, 0.07, bright) - rebate * 0.16 * bright + brush)
    + window_color * daylight * mix(0.015, 0.03, bright);
  let ledge_lit = paint_room * mix(mix(2.2, 1.07, bright), mix(1.0, 0.84, bright), ledge_face)
    + window_color * daylight * mix(0.05, 0.03, bright) * (1.0 - ledge_face);

  // The glazing bars. Below the arch (or everywhere, on a square window) a
  // grid of `cols` by `rows`; in the arch, a transom along its springing line,
  // a little semicircular hub, and spokes fanning out from it.
  let gx = q.x - wc.x;
  let top_y = wc.y - safe_wh.y;
  let spring_y = top_y + rise;
  let cell_x = 2.0 * safe_wh.x / cols;
  let cell_y = (2.0 * safe_wh.y - rise) / rows;
  let fx = (gx + safe_wh.x) / cell_x;
  let fy = (q.y - spring_y) / cell_y;
  let bar_x = (0.5 - abs(fract(fx) - 0.5)) * cell_x;
  let bar_y = (0.5 - abs(fract(fy) - 0.5)) * cell_y;
  let grid_d = min(bar_x, bar_y);

  let hub = vec2f(wc.x, spring_y);
  let hub_r = rise * 0.3;
  let to_hub = q - hub;
  let hub_dist = length(to_hub);
  let theta = atan2(to_hub.x, -to_hub.y);
  let spoke_step = PI / (fan + 1.0);
  let spoke_k = clamp(round((theta + PI * 0.5) / spoke_step), 1.0, fan);
  let spoke_d = mix(1.0, hub_dist * abs(sin(theta - (spoke_k * spoke_step - PI * 0.5))), step(hub_r, hub_dist));
  let arch_d = min(min(spoke_d, abs(hub_dist - hub_r)), abs(q.y - spring_y));
  let in_arch = arched * (1.0 - step(spring_y, q.y));
  let bar_d = mix(grid_d, arch_d, in_arch);

  let mullion = (1.0 - smoothstep(mullion_w - px, mullion_w + px, bar_d)) * glass;
  let bar_profile = smoothstep(0.4, 0.0, bar_d / mullion_w);
  let mullion_lit = paint_room * (1.0 + bar_profile * mix(0.5, 0.06, bright) + brush);
  // A faint inner shadow on each pane against the frame and the bars.
  let pane_edge = max(min(bar_d - mullion_w, -ring), 0.0);
  let pane_inset = smoothstep(0.0, mix(0.006, 0.009, bright) * joinery, pane_edge);
  // Each pane is its own sheet of glass, with a touch of its own tilt and tint.
  let sector = select(floor((theta + PI * 0.5) / spoke_step), -1.0, hub_dist < hub_r);
  let pane_id = mix(vec2f(floor(fx), floor(fy)), vec2f(sector + 40.0, -3.0), in_arch);
  let pane_rand = hash(pane_id + vec2f(0.5, 0.5));
  let pane_tilt = (vec2f(hash(pane_id + vec2f(1.3, 1.3)), hash(pane_id + vec2f(2.7, 2.7))) - vec2f(0.5)) * 0.004;

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
  let glass_lit = view * (0.90 + 0.10 * pane_inset) * (1.0 - drops.x * 0.18) * (0.97 + 0.06 * pane_rand)
    + drops.y * 0.18 * (0.3 + daylight) + reflection;

  // ---- The roller shade ---------------------------------------------------
  //
  // A light-filtering linen shade hanging in front of the glass (and the
  // mullion), from the roller at the top to a hem that the page moves. It is
  // translucent: the view behind it is softened and dimmed, and the fabric
  // itself glows with the day, so the buildings read as ghosts through it.
  // No hem bar, no tube: just a faint seam and a soft shadow on the view below.
  let hem = params.blind.x;
  let shade_on = step(0.5, params.blind.y) * step(0.002, hem);
  let hem_px = px / (2.0 * safe_wh.y);
  let shade_cov = (1.0 - smoothstep(hem - hem_px, hem + hem_px, local.y)) * glass * shade_on;
  // Height above the hem and below the roller, in wall units.
  let hem_dist = (hem - local.y) * 2.0 * safe_wh.y;
  let top_dist = local.y * 2.0 * safe_wh.y;

  // The shade's shadow on the view just under its hem.
  let hem_shadow = (1.0 - smoothstep(0.0, 0.03 * joinery, -hem_dist)) * step(0.0, -hem_dist) * glass * shade_on;
  var glass_final = glass_lit * (1.0 - 0.28 * hem_shadow);

  if (shade_cov > 0.001) {
    let diffused = city_view_diffused(tuv, warmth, cloud, night, 0.024);
    var behind = mix(fallback, diffused * mix(1.06, 1.0, night), city_ready);
    // The glazing bars, softened, behind the fabric.
    let mull_soft = (1.0 - smoothstep(0.0, mullion_w * 3.5, bar_d)) * 0.75;
    behind = mix(behind, paint_room, mull_soft);

    let linen = vec3f(0.93, 0.90, 0.83);
    // Light scattered in the weave (the day coming through it), plus what gets
    // straight through.
    var shade_rgb = behind * 0.38 + linen * (0.55 * daylight + 0.06);
    // Thread-scale weave, a touch denser along the hem, a darker curve under the
    // roller, and a faint seam where the hem is stitched.
    let weave = (value_noise(q * 460.0) - 0.5) * 0.035
      + (value_noise(vec2f(q.x * 36.0, q.y * 3.0)) - 0.5) * 0.02;
    let curve = 0.20 * exp(-top_dist / (0.02 * joinery));
    let pocket = (1.0 - smoothstep(0.0, 0.010 * joinery, hem_dist)) * 0.10;
    let seam = (1.0 - smoothstep(0.0, 2.5 * px, abs(hem_dist - 0.011 * joinery))) * 0.05;
    shade_rgb *= (1.0 + weave) * (1.0 - curve - pocket - seam);
    glass_final = mix(glass_final, shade_rgb, shade_cov);
  }

  var lit = wall_lit;
  lit = mix(lit, ledge_lit, ledge);
  lit = mix(lit, frame_lit, frame);
  lit = mix(lit, glass_final, glass);
  lit = mix(lit, mullion_lit, mullion * (1.0 - shade_cov));

  // Dither so the broad gradients don't band on 8-bit panels.
  let dither = (hash(uv * resolution + time) - 0.5) / 255.0;
  return vec4f(clamp(lit + dither, vec3f(0.0), vec3f(1.0)), 1.0);
}
