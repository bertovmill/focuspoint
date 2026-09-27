// Ported from the example's gradientFragment: the screen-space derivative of the
// field, encoded as a normal (rg, 0..1) plus its magnitude (b). The example
// differentiated a signed distance that grows outward; the field here is
// blurred text coverage, which grows inward, so it is flipped first to keep the
// normal pointing out of the glass the way the composite shader expects.
@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var field_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sample = 0.5 - textureSampleLevel(source_texture, field_sampler, uv, 0.0).r;
  let derivative = vec2f(dpdx(sample), dpdy(sample));
  let magnitude = length(derivative);
  let normal = derivative / max(magnitude, 0.000001);
  return vec4f(normal * 0.5 + 0.5, magnitude, 1.0);
}
