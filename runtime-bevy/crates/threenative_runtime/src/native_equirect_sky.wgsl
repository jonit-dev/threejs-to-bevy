#import bevy_pbr::forward_io::VertexOutput
#import bevy_pbr::mesh_view_bindings::view

@group(2) @binding(0) var sky_texture: texture_2d<f32>;
@group(2) @binding(1) var sky_sampler: sampler;

const PI: f32 = 3.141592653589793;
const RECIPROCAL_PI: f32 = 0.3183098861837907;
const RECIPROCAL_TAU: f32 = 0.15915494309189535;

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let direction = normalize(in.world_position.xyz - view.world_position.xyz);
    let u = atan2(direction.z, direction.x) * RECIPROCAL_TAU + 0.5;
    let v = 0.5 - asin(clamp(direction.y, -1.0, 1.0)) * RECIPROCAL_PI;
    return textureSample(sky_texture, sky_sampler, vec2<f32>(u, v));
}
