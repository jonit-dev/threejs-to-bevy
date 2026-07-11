#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import bevy_render::view::View

struct HeightFog {
    color: vec4<f32>,
    // base height, exponential falloff rate, density, maximum distance
    params: vec4<f32>,
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
#ifdef MULTISAMPLED
@group(0) @binding(2) var depth_texture: texture_depth_multisampled_2d;
#else
@group(0) @binding(2) var depth_texture: texture_depth_2d;
#endif
@group(0) @binding(3) var<uniform> fog: HeightFog;
@group(0) @binding(4) var<uniform> view: View;

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let source = textureSample(source_texture, source_sampler, in.uv);
#ifdef MULTISAMPLED
    let depth = textureLoad(depth_texture, vec2<i32>(in.position.xy), 0);
#else
    let depth = textureLoad(depth_texture, vec2<i32>(in.position.xy), 0);
#endif
    if depth <= 0.000001 {
        return source;
    }

    let ndc = vec4<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0, depth, 1.0);
    let world_h = view.world_from_clip * ndc;
    let world_position = world_h.xyz / max(world_h.w, 0.000001);
    let delta = world_position - view.world_position;
    let surface_distance = min(length(delta), fog.params.w);
    let ray_direction = normalize(delta);

    let base_density = fog.params.z * exp(-(view.world_position.y - fog.params.x) * fog.params.y);
    let vertical_rate = ray_direction.y * fog.params.y;
    var optical_depth = base_density * surface_distance;
    if abs(vertical_rate) >= 0.00001 {
        optical_depth = base_density * (1.0 - exp(-surface_distance * vertical_rate)) / vertical_rate;
    }
    let amount = clamp(1.0 - exp(-max(optical_depth, 0.0)), 0.0, 1.0);
    return vec4<f32>(mix(source.rgb, fog.color.rgb, amount), source.a);
}
