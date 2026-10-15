// Final pass: the lit scene plus a faint quarter-resolution bloom on the
// brightest rim highlights, the sRGB transfer for the canvas and a one-step
// dither so soft gradients do not band.
//
// Unlike the example's dark room, there is no ACES tone map or vignette: the
// floor is the page's own background and has to come out of the canvas as
// exactly that colour, edge to edge. The scene is already in display range,
// so it is only clamped. (`aspect` and `vignette` stay in the struct, so the
// pipeline binds it unchanged; a vignette of 0 turns it off.)

import { linearToSrgb3 } from "@vgpu/wgsl-std/color";
import { pcg2d } from "@vgpu/wgsl-std/hash";

struct Composite {
  aspect: f32,
  bloom: f32,
  exposure: f32,
  vignette: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var bloomTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> composite: Composite;

@fragment fn fs_main(@location(0) uv: vec2f, @builtin(position) position: vec4f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let glow = textureSampleLevel(bloomTex, samp, uv, 0.0).rgb;
  let linear = clamp((base + glow * composite.bloom) * composite.exposure, vec3f(0.0), vec3f(1.0));
  var color = linearToSrgb3(linear);

  var q = uv - 0.5;
  q.x *= composite.aspect;
  let radius = length(q) / length(vec2f(0.5 * composite.aspect, 0.5));
  color *= 1.0 - composite.vignette * smoothstep(0.45, 1.05, radius);

  let noise = pcg2d(vec2u(position.xy));
  let dither = (f32(noise.x & 0xffffu) + f32(noise.y & 0xffffu)) / 65535.0 - 1.0;
  color += dither / 255.0;
  return vec4f(color, 1.0);
}
