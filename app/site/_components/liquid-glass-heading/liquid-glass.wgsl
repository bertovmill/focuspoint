// Ported from the example's lightStreams + fragmentFn. What changed for the site:
//  - the shape is the heading's rasterised text (coverage texture) instead of
//    the analytic TypeGPU logo SDF, and the field/gradient textures match the
//    canvas one to one, so `uv` addresses them directly;
//  - "distance" is derived from the blurred coverage: 0 at the letter edge,
//    saturating a few pixels either side, which is all the rim/glow terms need;
//  - the output is transparent and premultiplied. Only the letters (and a faint
//    rim) are drawn; the example's backdrop, vignette and drop shadow are gone
//    because the page supplies the background.
struct GlassParams {
  time: f32,
  aspect: f32,
  padding: vec2f,
}

@group(0) @binding(0) var<uniform> params: GlassParams;
@group(0) @binding(1) var coverage_texture: texture_2d<f32>;
@group(0) @binding(2) var field_texture: texture_2d<f32>;
@group(0) @binding(3) var gradient_texture: texture_2d<f32>;
@group(0) @binding(4) var field_sampler: sampler;

fn hash(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}

fn light_streams(point: vec2f, seconds: f32) -> vec3f {
  let direction = normalize(vec2f(0.7071 + sin(seconds) * 5.0, -0.7071));
  let normal = vec2f(0.7071, 0.7071);
  let along = dot(point, direction);
  let across = dot(point, normal);
  let convergence = smoothstep(-0.55, 0.38, along);
  let pulse = 0.76 + 0.24 * sin(seconds * 2.2 - along * 7.5);
  let shimmer = 0.82 + 0.18 * sin(seconds * 4.1 + along * 14.0 + across * 5.0);
  var color = vec3f(0.0);

  let split = 0.15;
  let red_center = -split * (1.0 - convergence) + 0.01 * sin(along * 8.0 - seconds * 1.7);
  let green_center = 0.01 * sin(along * 9.0 + seconds * 1.3);
  let blue_center = split * (1.0 - convergence) + 0.01 * sin(along * 7.0 + seconds * 1.9);
  let width = mix(0.045, 0.075, convergence);
  let red = exp(-pow(abs(across - red_center) / width, 1.65));
  let green = exp(-pow(abs(across - green_center) / width, 1.65));
  let blue = exp(-pow(abs(across - blue_center) / width, 1.65));

  let redc = vec3f(1.0, 0.0, 0.2) * red;
  let greenc = vec3f(0.0, 0.2, 0.3) * green;
  let bluec = vec3f(0.2, 0.1, 1.0) * blue;
  color += (redc + greenc + bluec) * pulse * shimmer;

  let merged_width = 0.06 + 0.035 * convergence;
  let merged = exp(-pow(abs(across) / merged_width, 1.45)) * convergence;
  color += vec3f(1.0, 0.94, 0.88) * merged * (1.15 + 0.35 * sin(seconds * 2.7 - along * 9.0));
  let halo = exp(-abs(across) * 7.5) * (0.16 + 0.22 * convergence);
  return color + vec3f(0.34, 0.2, 0.62) * halo;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let seconds = params.time;
  let p = (uv - 0.5) * 2.0 * vec2f(params.aspect, 1.0);

  // Crisp letter mask straight from the 2D canvas's own antialiasing.
  let mask = textureSampleLevel(coverage_texture, field_sampler, uv, 0.0).r;
  // Blurred coverage: 0.5 on the letter edge, 1 inside, 0 outside. `edge` is
  // 0 on the outline and 1 once the blur has saturated either side.
  let field = textureSampleLevel(field_texture, field_sampler, uv, 0.0).r;
  let edge = clamp(abs(field - 0.5) * 2.0, 0.0, 1.0);

  let smoothed = textureSampleLevel(gradient_texture, field_sampler, uv, 0.0);
  let decoded = smoothed.rg * 2.0 - 1.0;
  let glass_normal = decoded / max(length(decoded), 0.0001);
  let ripple = sin(p.y * 16.0 - seconds * 2.5) * sin(p.x * 11.0 + seconds * 1.8);
  let warped = p + glass_normal * (0.055 + ripple * 0.014) * mask;

  let streams = light_streams(p, seconds);
  let refracted = light_streams(warped * 1.06 - vec2f(0.025, -0.015), seconds + 0.18);
  let grain = hash(floor(uv * 520.0) + floor(seconds * 3.0)) - 0.5;

  var color = vec3f(0.014, 0.009, 0.03);
  color += streams * 0.2;
  color = mix(color, refracted * 1.08 + color * 0.25, mask);

  let inner_glow = pow(1.0 - edge, 1.5) * mask;
  let rim = pow(1.0 - edge, 3.0);
  let specular = pow(max(dot(glass_normal, vec2f(-0.62, -0.78)), 0.0), 9.0) * rim;
  color += vec3f(0.17, 0.3, 0.56) * inner_glow * 0.22;
  color += vec3f(0.72, 0.9, 1.0) * rim * 0.32;
  color += vec3f(1.0, 0.96, 0.9) * specular * 1.2;
  color += grain * 0.018;
  color = vec3f(1.0) - exp(color * -1.35); // tonemapping

  // Letters are opaque glass; the rim fades out just past the outline.
  let alpha = clamp(max(mask, rim * (1.0 - mask) * 0.3), 0.0, 1.0);
  return vec4f(color * alpha, alpha);
}
