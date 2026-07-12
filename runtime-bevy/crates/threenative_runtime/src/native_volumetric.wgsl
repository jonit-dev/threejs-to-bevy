// Adapter-owned copy of Bevy 0.14's volumetric fog shader.
// The raymarch retains Bevy's bindings and phase model, while the sample
// position is jittered per pixel to match the web GodRays pass.

#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import bevy_pbr::mesh_view_bindings::{lights, view}
#import bevy_pbr::mesh_view_types::DIRECTIONAL_LIGHT_FLAGS_VOLUMETRIC_BIT
#import bevy_pbr::shadow_sampling::sample_shadow_map_hardware
#import bevy_pbr::shadows::{get_cascade_index, world_to_directional_light_local}
#import bevy_pbr::view_transformations::{
    frag_coord_to_ndc,
    position_ndc_to_view,
    position_ndc_to_world
}

struct VolumetricFog {
    // Keep this layout identical to Bevy's VolumetricFogUniform. The adapter
    // uses the authored density, asymmetry, depth, and intensity fields below;
    // the remaining fields stay bound for render-graph compatibility.
    fog_color: vec3<f32>,
    light_tint: vec3<f32>,
    ambient_color: vec3<f32>,
    ambient_intensity: f32,
    step_count: u32,
    max_depth: f32,
    absorption: f32,
    scattering: f32,
    density: f32,
    scattering_asymmetry: f32,
    light_intensity: f32,
}

@group(1) @binding(0) var<uniform> volumetric_fog: VolumetricFog;
@group(1) @binding(1) var color_texture: texture_2d<f32>;
@group(1) @binding(2) var color_sampler: sampler;

#ifdef MULTISAMPLED
@group(1) @binding(3) var depth_texture: texture_depth_multisampled_2d;
#else
@group(1) @binding(3) var depth_texture: texture_depth_2d;
#endif

fn henyey_greenstein(neg_LdotV: f32) -> f32 {
    let g = volumetric_fog.scattering_asymmetry;
    let denom = 1.0 + g * g - 2.0 * g * neg_LdotV;
    // The web GodRays pass intentionally omits Bevy's normalized 1/(4pi)
    // factor; retain that artistic convention on native.
    return (1.0 - g * g) / (denom * sqrt(denom));
}

fn pixel_jitter(pixel: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(0.06711056 * pixel.x + 0.00583715 * pixel.y));
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let step_count = volumetric_fog.step_count;
    let max_depth = volumetric_fog.max_depth;
    let density = volumetric_fog.density;
    let light_intensity = volumetric_fog.light_intensity;

    let frag_coord = in.position;
    let depth = textureLoad(depth_texture, vec2<i32>(frag_coord.xy), 0);
    let end_depth = min(
        max_depth,
        -position_ndc_to_view(frag_coord_to_ndc(vec4(in.position.xy, depth, 1.0))).z
    );
    let step_size = end_depth / f32(step_count);

    let directional_light_count = lights.n_directional_lights;
    let Rd_ndc = vec3(frag_coord_to_ndc(in.position).xy, 1.0);
    let Rd_view = normalize(position_ndc_to_view(Rd_ndc));
    let Ro_world = view.world_position;
    let Rd_world = normalize(position_ndc_to_world(Rd_ndc) - Ro_world);

    var accumulated_color = vec3<f32>(0.0);
    let jitter = pixel_jitter(frag_coord.xy);

    for (var light_index = 0u; light_index < directional_light_count; light_index += 1u) {
        let light = &lights.directional_lights[light_index];
        if (((*light).flags & DIRECTIONAL_LIGHT_FLAGS_VOLUMETRIC_BIT) == 0) {
            break;
        }

        let depth_offset = (*light).shadow_depth_bias * (*light).direction_to_light.xyz;
        let neg_LdotV = clamp(dot(normalize((*light).direction_to_light.xyz), Rd_world), -1.0, 1.0);
        let phase = henyey_greenstein(neg_LdotV);
        var optical_depth = 0.0;

        for (var step = 0u; step < step_count; step += 1u) {
            // Match the web pass's stratified per-pixel offset. This removes
            // fixed banding and preserves the fine stochastic surface response
            // visible in the web reference.
            let sample_step = f32(step) + jitter;
            let P_world = Ro_world + Rd_world * sample_step * step_size;
            let P_view = Rd_view * sample_step * step_size;

            let cascade_index = get_cascade_index(light_index, P_view.z);
            let light_local = world_to_directional_light_local(
                light_index,
                cascade_index,
                vec4(P_world + depth_offset, 1.0)
            );
            var local_light_attenuation = f32(light_local.w != 0.0);
            if (local_light_attenuation != 0.0) {
                let cascade = &(*light).cascades[cascade_index];
                let array_index = i32((*light).depth_texture_base_index + cascade_index);
                local_light_attenuation =
                    sample_shadow_map_hardware(light_local.xy, light_local.z, array_index);
            }
            if (local_light_attenuation != 0.0) {
                optical_depth += local_light_attenuation * density * step_size;
                if (optical_depth >= 4.0) {
                    break;
                }
            }
        }
        let shaft = (1.0 - exp(-optical_depth)) * light_intensity * phase;
        accumulated_color += clamp((*light).color.rgb * shaft, vec3<f32>(0.0), vec3<f32>(4.0));
    }

    let source = textureSample(color_texture, color_sampler, in.uv);
    return vec4(source.rgb + accumulated_color, source.a);
}
