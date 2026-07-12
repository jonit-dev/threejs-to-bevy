// A postprocessing pass that performs screen-space reflections.

#define_import_path bevy_pbr::ssr

#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import bevy_pbr::{
    lighting,
    lighting::{LAYER_BASE, LAYER_CLEARCOAT},
    mesh_view_bindings::{view, depth_prepass_texture, deferred_prepass_texture, ssr_settings},
    pbr_deferred_functions::pbr_input_from_deferred_gbuffer,
    pbr_deferred_types,
    pbr_functions,
    prepass_utils,
    raymarch::{
        depth_ray_march_from_cs,
        depth_ray_march_march,
        depth_ray_march_new_from_depth,
        depth_nearest_sampler,
        depth_ray_march_to_ws_dir,
    },
    utils,
    view_transformations::{
        depth_ndc_to_view_z,
        frag_coord_to_ndc,
        ndc_to_frag_coord,
        ndc_to_uv,
        position_ndc_to_world,
        position_view_to_ndc,
        position_world_to_ndc,
        position_world_to_view,
    },
}
#import bevy_render::view::View

#ifdef ENVIRONMENT_MAP
#import bevy_pbr::environment_map
#endif

// The texture representing the color framebuffer.
@group(1) @binding(0) var color_texture: texture_2d<f32>;

// The sampler that lets us sample from the color framebuffer.
@group(1) @binding(1) var color_sampler: sampler;

// Group 1, bindings 2 and 3 are in `raymarch.wgsl`.

const NATIVE_SSR_MAX_DISTANCE: f32 = 10.0;

fn native_ssr_opacity() -> f32 {
    // The shared web pass maps low/medium/high to 0.4/0.7/1.1. The Bevy
    // settings expose quality through the configured march step count, so keep
    // that same mapping without adding a second native-only material control.
    if ssr_settings.linear_steps <= 8u {
        return 0.4;
    }
    if ssr_settings.linear_steps >= 32u {
        return 1.1;
    }
    return 0.7;
}

fn native_ssr_hit_world_position(hit_uv: vec2<f32>) -> vec3<f32> {
    let hit_depth = textureSampleLevel(depth_prepass_texture, depth_nearest_sampler, hit_uv, 0.0);
    return position_ndc_to_world(vec3(
        hit_uv.x * 2.0 - 1.0,
        1.0 - hit_uv.y * 2.0,
        hit_depth,
    ));
}

fn native_ssr_blurred_color(hit_uv: vec2<f32>) -> vec3<f32> {
    // SSRPass blurs its reflection buffer twice before compositing. A compact
    // five-tap equivalent keeps the native hit stable while removing the
    // single-pixel neon/window stamps produced by Bevy's raw hit sample.
    let texel = 1.0 / vec2<f32>(textureDimensions(color_texture));
    var radius = 1.0;
    if (ssr_settings.linear_steps <= 8u) {
        radius = 1.5;
    } else if (ssr_settings.linear_steps >= 32u) {
        radius = 0.75;
    }
    let offset = texel * radius;
    let center = textureSampleLevel(color_texture, color_sampler, hit_uv, 0.0).rgb;
    let left = textureSampleLevel(color_texture, color_sampler, hit_uv - vec2(offset.x, 0.0), 0.0).rgb;
    let right = textureSampleLevel(color_texture, color_sampler, hit_uv + vec2(offset.x, 0.0), 0.0).rgb;
    let up = textureSampleLevel(color_texture, color_sampler, hit_uv - vec2(0.0, offset.y), 0.0).rgb;
    let down = textureSampleLevel(color_texture, color_sampler, hit_uv + vec2(0.0, offset.y), 0.0).rgb;
    return (center + left + right + up + down) * 0.2;
}

// Returns the reflected color in the RGB channel and the specular occlusion in
// the alpha channel.
//
// The general approach here is similar to [1]. We first project the reflection
// ray into screen space. Then we perform uniform steps along that screen-space
// reflected ray, converting each step to view space.
//
// The arguments are:
//
// * `R_world`: The reflection vector in world space.
//
// * `P_world`: The current position in world space.
//
// [1]: https://lettier.github.io/3d-game-shaders-for-beginners/screen-space-reflection.html
fn evaluate_ssr(R_world: vec3<f32>, P_world: vec3<f32>, N: vec3<f32>, V: vec3<f32>) -> vec4<f32> {
    let depth_size = vec2<f32>(textureDimensions(depth_prepass_texture));

    var raymarch = depth_ray_march_new_from_depth(depth_size);
    depth_ray_march_from_cs(&raymarch, position_world_to_ndc(P_world));
    depth_ray_march_to_ws_dir(&raymarch, normalize(R_world));
    raymarch.linear_steps = ssr_settings.linear_steps;
    raymarch.bisection_steps = ssr_settings.bisection_steps;
    raymarch.use_secant = ssr_settings.use_secant != 0u;
    raymarch.depth_thickness_linear_z = ssr_settings.thickness;
    raymarch.jitter = 1.0;  // Disable jitter for now.
    raymarch.march_behind_surfaces = false;

    let raymarch_result = depth_ray_march_march(&raymarch);
    if (raymarch_result.hit) {
        let hit_world = native_ssr_hit_world_position(raymarch_result.hit_uv);
        let hit_distance = distance(hit_world, P_world);
        if (hit_distance > NATIVE_SSR_MAX_DISTANCE) {
            return vec4(0.0, 0.0, 0.0, 1.0);
        }
        let distance_ratio = clamp(1.0 - hit_distance / NATIVE_SSR_MAX_DISTANCE, 0.0, 1.0);
        let distance_attenuation = distance_ratio * distance_ratio;
        let incident = -normalize(V);
        let fresnel = clamp((dot(incident, normalize(R_world)) + 1.0) * 0.5, 0.0, 1.0);
        let opacity = native_ssr_opacity() * distance_attenuation * fresnel;
        return vec4(native_ssr_blurred_color(raymarch_result.hit_uv) * opacity, 0.0);
    }

    return vec4(0.0, 0.0, 0.0, 1.0);
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    // Sample the depth.
    var frag_coord = in.position;
    frag_coord.z = prepass_utils::prepass_depth(in.position, 0u);

    // Load the G-buffer data.
    let fragment = textureLoad(color_texture, vec2<i32>(frag_coord.xy), 0);
    let gbuffer = textureLoad(deferred_prepass_texture, vec2<i32>(frag_coord.xy), 0);
    let pbr_input = pbr_input_from_deferred_gbuffer(frag_coord, gbuffer);

    // Don't do anything if the surface is too rough, since we can't blur or do
    // temporal accumulation yet.
    let perceptual_roughness = pbr_input.material.perceptual_roughness;
    if (perceptual_roughness > ssr_settings.perceptual_roughness_threshold) {
        return fragment;
    }

    // Unpack the PBR input.
    var specular_occlusion = pbr_input.specular_occlusion;
    let world_position = pbr_input.world_position.xyz;
    let N = pbr_input.N;
    let V = pbr_input.V;

    // Calculate the reflection vector.
    let R = reflect(-V, N);

    // Do the raymarching.
    let ssr_specular = evaluate_ssr(R, world_position, N, V);
    var indirect_light = ssr_specular.rgb;
    specular_occlusion *= ssr_specular.a;

    // Sample the environment map if necessary.
    //
    // This will take the specular part of the environment map into account if
    // the ray missed. Otherwise, it only takes the diffuse part.
    //
    // TODO: Merge this with the duplicated code in `apply_pbr_lighting`.
#ifdef ENVIRONMENT_MAP
    // Unpack values required for environment mapping.
    let base_color = pbr_input.material.base_color.rgb;
    let metallic = pbr_input.material.metallic;
    let reflectance = pbr_input.material.reflectance;
    let specular_transmission = pbr_input.material.specular_transmission;
    let diffuse_transmission = pbr_input.material.diffuse_transmission;
    let diffuse_occlusion = pbr_input.diffuse_occlusion;

#ifdef STANDARD_MATERIAL_CLEARCOAT
    // Do the above calculations again for the clearcoat layer. Remember that
    // the clearcoat can have its own roughness and its own normal.
    let clearcoat = pbr_input.material.clearcoat;
    let clearcoat_perceptual_roughness = pbr_input.material.clearcoat_perceptual_roughness;
    let clearcoat_roughness = lighting::perceptualRoughnessToRoughness(clearcoat_perceptual_roughness);
    let clearcoat_N = pbr_input.clearcoat_N;
    let clearcoat_NdotV = max(dot(clearcoat_N, pbr_input.V), 0.0001);
    let clearcoat_R = reflect(-pbr_input.V, clearcoat_N);
#endif  // STANDARD_MATERIAL_CLEARCOAT

    // Calculate various other values needed for environment mapping.
    let roughness = lighting::perceptualRoughnessToRoughness(perceptual_roughness);
    let diffuse_color = pbr_functions::calculate_diffuse_color(
        base_color,
        metallic,
        specular_transmission,
        diffuse_transmission
    );
    let NdotV = max(dot(N, V), 0.0001);
    let F_ab = lighting::F_AB(perceptual_roughness, NdotV);
    let F0 = pbr_functions::calculate_F0(base_color, metallic, reflectance);

    // Pack all the values into a structure.
    var lighting_input: lighting::LightingInput;
    lighting_input.layers[LAYER_BASE].NdotV = NdotV;
    lighting_input.layers[LAYER_BASE].N = N;
    lighting_input.layers[LAYER_BASE].R = R;
    lighting_input.layers[LAYER_BASE].perceptual_roughness = perceptual_roughness;
    lighting_input.layers[LAYER_BASE].roughness = roughness;
    lighting_input.P = world_position.xyz;
    lighting_input.V = V;
    lighting_input.diffuse_color = diffuse_color;
    lighting_input.F0_ = F0;
    lighting_input.F_ab = F_ab;
#ifdef STANDARD_MATERIAL_CLEARCOAT
    lighting_input.layers[LAYER_CLEARCOAT].NdotV = clearcoat_NdotV;
    lighting_input.layers[LAYER_CLEARCOAT].N = clearcoat_N;
    lighting_input.layers[LAYER_CLEARCOAT].R = clearcoat_R;
    lighting_input.layers[LAYER_CLEARCOAT].perceptual_roughness = clearcoat_perceptual_roughness;
    lighting_input.layers[LAYER_CLEARCOAT].roughness = clearcoat_roughness;
    lighting_input.clearcoat_strength = clearcoat;
#endif  // STANDARD_MATERIAL_CLEARCOAT

    // Sample the environment map.
    let environment_light = environment_map::environment_map_light(&lighting_input, false);

    // Accumulate the environment map light.
    indirect_light += view.exposure *
        (environment_light.diffuse * diffuse_occlusion +
        environment_light.specular * specular_occlusion);
#endif

    // Write the results.
    return vec4(fragment.rgb + indirect_light, 1.0);
}
