struct PresentParams {
  bloom_strength: f32,
  time: f32,
  padding: vec2f,
}

@group(0) @binding(0) var<uniform> params: PresentParams;
@group(0) @binding(1) var scene_texture: texture_2d<f32>;
@group(0) @binding(2) var bloom_texture: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;

fn aces(color: vec3f) -> vec3f {
  return (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(scene_texture, linear_sampler, uv, 0.0);
  let bloom = textureSampleLevel(bloom_texture, linear_sampler, uv, 0.0).rgb;
  var color = aces((scene.rgb + bloom * params.bloom_strength) * 1.05);
  let noise = fract(sin(dot(uv * 1000.0 + params.time, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  color += noise * 0.012 * step(0.001, params.time);
  // Site adaptation: the scene carries alpha (glass = 1, everything else = 0),
  // the output is premultiplied for a transparent canvas, and the example's
  // vignette is gone — there is no backdrop left to vignette. Bloom spills a
  // little glow past the glass edge: let it, faintly, so the edge isn't hard.
  let alpha = clamp(max(scene.a, dot(bloom, vec3f(0.333)) * params.bloom_strength), 0.0, 1.0);
  let graded = pow(clamp(color, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 1.05));
  return vec4f(graded * alpha, alpha);
}
