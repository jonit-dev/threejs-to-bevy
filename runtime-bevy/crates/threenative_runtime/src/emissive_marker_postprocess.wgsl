#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
@group(0) @binding(2) var mask_texture: texture_2d<f32>;

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let source = textureSample(source_texture, source_sampler, in.uv);
    let raw_mask = textureSample(mask_texture, source_sampler, in.uv).r;
    let mask = smoothstep(0.01, 0.25, raw_mask);
    let marker_color = vec3<f32>(0.0, 1.0, 0.88);
    let corrected = mix(source.rgb, marker_color, clamp(mask * 0.88, 0.0, 1.0));
    return vec4<f32>(corrected, source.a);
}
