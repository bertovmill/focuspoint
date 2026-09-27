// Ported from the vgpu "TypeGPU Liquid Glass" example's createBlurFragment:
// the same five-tap separable Gaussian (weights 0.227027 / 0.316216 / 0.07027,
// offsets 1.384615 / 3.230769 texels). The example fixed the texel at 1/1024;
// here it comes in as a uniform because the field is the size of the heading.
struct FieldBlurParams {
  direction: vec2f,
  texel: vec2f,
}

@group(0) @binding(0) var<uniform> params: FieldBlurParams;
@group(0) @binding(1) var source_texture: texture_2d<f32>;
@group(0) @binding(2) var field_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let offset = params.direction * params.texel;
  var value = textureSampleLevel(source_texture, field_sampler, uv, 0.0) * 0.227027;
  value += textureSampleLevel(source_texture, field_sampler, uv + offset * 1.384615, 0.0) * 0.316216;
  value += textureSampleLevel(source_texture, field_sampler, uv - offset * 1.384615, 0.0) * 0.316216;
  value += textureSampleLevel(source_texture, field_sampler, uv + offset * 3.230769, 0.0) * 0.07027;
  value += textureSampleLevel(source_texture, field_sampler, uv - offset * 3.230769, 0.0) * 0.07027;
  return value;
}
