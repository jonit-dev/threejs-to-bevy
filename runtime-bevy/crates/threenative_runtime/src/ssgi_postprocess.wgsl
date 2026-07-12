#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import bevy_render::view::View

struct SsgiSettings {
    // radius, intensity, ray count, depth step count
    params: vec4<f32>,
    ambient: vec4<f32>,
    frame: f32,
    padding: vec3<f32>,
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
#ifdef MULTISAMPLED
@group(0) @binding(2) var depth_texture: texture_depth_multisampled_2d;
#else
@group(0) @binding(2) var depth_texture: texture_depth_2d;
#endif
@group(0) @binding(3) var history_texture: texture_2d<f32>;
@group(0) @binding(4) var<uniform> settings: SsgiSettings;
@group(0) @binding(5) var<uniform> view: View;

fn depth_at(pixel: vec2<i32>) -> f32 {
    return textureLoad(depth_texture, pixel, 0);
}

fn world_position(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
    let world_h = view.world_from_clip * ndc;
    return world_h.xyz / max(world_h.w, 0.000001);
}

fn view_position(world: vec3<f32>) -> vec3<f32> {
    return (view.view_from_world * vec4<f32>(world, 1.0)).xyz;
}

fn project_uv(world: vec3<f32>) -> vec3<f32> {
    let clip = view.clip_from_world * vec4<f32>(world, 1.0);
    let ndc = clip.xy / max(clip.w, 0.000001);
    return vec3<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, clip.w);
}

fn cosine_hemisphere(normal: vec3<f32>, sample_point: vec2<f32>) -> vec3<f32> {
    let phi = 6.28318530718 * sample_point.x;
    let radial = sqrt(sample_point.y);
    var tangent = cross(normal, vec3<f32>(0.0, 0.0, 1.0));
    if (abs(normal.z) >= 0.999) {
        tangent = cross(normal, vec3<f32>(0.0, 1.0, 0.0));
    }
    tangent = normalize(tangent);
    let bitangent = normalize(cross(normal, tangent));
    return normalize(
        tangent * cos(phi) * radial
            + bitangent * sin(phi) * radial
            + normal * sqrt(max(0.0, 1.0 - sample_point.y))
    );
}

fn pixel_hash(pixel: vec2<f32>, frame: f32) -> f32 {
    return fract(sin(dot(pixel, vec2<f32>(12.9898, 78.233)) + frame * 0.754877666) * 43758.5453);
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let source = textureSample(source_texture, source_sampler, in.uv);
    let size = vec2<i32>(textureDimensions(depth_texture));
    let pixel = clamp(vec2<i32>(in.position.xy), vec2<i32>(0), size - vec2<i32>(1));
    let depth = depth_at(pixel);
    if (depth <= 0.000001) {
        return vec4<f32>(source.rgb + settings.ambient.rgb * settings.params.y, source.a);
    }

    let center = world_position(in.uv, depth);
    let texel = 1.0 / vec2<f32>(size);
    let right_uv = clamp(in.uv + vec2<f32>(texel.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
    let down_uv = clamp(in.uv + vec2<f32>(0.0, texel.y), vec2<f32>(0.0), vec2<f32>(1.0));
    let right = world_position(
        right_uv,
        depth_at(clamp(pixel + vec2<i32>(1, 0), vec2<i32>(0), size - vec2<i32>(1))),
    );
    let down = world_position(
        down_uv,
        depth_at(clamp(pixel + vec2<i32>(0, 1), vec2<i32>(0), size - vec2<i32>(1))),
    );
    var normal = normalize(cross(right - center, down - center));
    if (dot(normal, view.world_position - center) < 0.0) {
        normal = -normal;
    }

    let ray_count = max(settings.params.z, 1.0);
    let step_count = max(settings.params.w, 1.0);
    let radius = max(settings.params.x, 0.001);
    let base_noise = pixel_hash(floor(in.position.xy), settings.frame);
    var gathered = vec3<f32>(0.0);
    var total_weight = 0.0;

    // Match the web SSGI path: cosine-weighted hemisphere rays with a
    // depth crossing and short binary refinement instead of a screen-space
    // neighborhood blur. This keeps reflected window color localized to
    // surfaces that can actually see it.
    for (var ray_index = 0; ray_index < 8; ray_index += 1) {
        if (f32(ray_index) >= ray_count) {
            break;
        }
        let ray_seed = (f32(ray_index) + base_noise) / ray_count;
        let sample_point = vec2<f32>(
            fract(ray_seed * 0.754877666),
            fract(ray_seed * 0.569840296 + base_noise),
        );
        let direction = cosine_hemisphere(normal, sample_point);
        let cosine_weight = max(dot(normal, direction), 0.0);
        var radiance = settings.ambient.rgb;
        var hit_weight = 0.25;
        var previous_distance = 0.0;

        for (var step_index = 1; step_index <= 16; step_index += 1) {
            if (f32(step_index) > step_count) {
                break;
            }
            let distance_along_ray = radius * f32(step_index) / step_count;
            let ray_position = center + direction * distance_along_ray;
            let projected = project_uv(ray_position);
            if (projected.z <= 0.0 || projected.x <= 0.001 || projected.x >= 0.999 || projected.y <= 0.001 || projected.y >= 0.999) {
                break;
            }
            let ray_uv = projected.xy;
            let hit_pixel = clamp(vec2<i32>(ray_uv * vec2<f32>(size)), vec2<i32>(0), size - vec2<i32>(1));
            let scene_depth = depth_at(hit_pixel);
            if (scene_depth <= 0.000001) {
                previous_distance = distance_along_ray;
                continue;
            }
            let scene_position = world_position(ray_uv, scene_depth);
            let crossing = view_position(scene_position).z - view_position(ray_position).z;
            let thickness = max(0.04, distance_along_ray * 0.08);
            if (crossing >= 0.0 && crossing <= thickness) {
                var low_distance = previous_distance;
                var high_distance = distance_along_ray;
                var refined_uv = ray_uv;
                for (var refine_index = 0; refine_index < 4; refine_index += 1) {
                    let mid_distance = (low_distance + high_distance) * 0.5;
                    let mid_position = center + direction * mid_distance;
                    let mid_projected = project_uv(mid_position);
                    if (mid_projected.z <= 0.0 || mid_projected.x <= 0.001 || mid_projected.x >= 0.999 || mid_projected.y <= 0.001 || mid_projected.y >= 0.999) {
                        break;
                    }
                    let mid_uv = mid_projected.xy;
                    let mid_pixel = clamp(vec2<i32>(mid_uv * vec2<f32>(size)), vec2<i32>(0), size - vec2<i32>(1));
                    let mid_depth = depth_at(mid_pixel);
                    if (mid_depth <= 0.000001) {
                        break;
                    }
                    let mid_scene_position = world_position(mid_uv, mid_depth);
                    let mid_crossing = view_position(mid_scene_position).z - view_position(mid_position).z;
                    if (mid_crossing >= 0.0) {
                        high_distance = mid_distance;
                        refined_uv = mid_uv;
                    } else {
                        low_distance = mid_distance;
                    }
                }
                radiance = textureSampleLevel(source_texture, source_sampler, refined_uv, 0.0).rgb;
                hit_weight = 1.0 - high_distance / radius;
                break;
            }
            previous_distance = distance_along_ray;
        }

        let weight = cosine_weight * max(hit_weight, 0.05);
        gathered += radiance * weight;
        total_weight += weight;
    }

    let indirect = gathered / max(total_weight, 0.00001);
    let current = source.rgb + indirect * settings.params.y;
    // The web path keeps a depth-aware temporal history. Native retains the
    // same bounded history blend here; the source and history are both the
    // resolved HDR frame, so static surfaces converge without a broad light
    // fill and the changing ray pattern removes the fixed salt-and-pepper
    // pattern from the single-frame gather.
    let history = textureSample(history_texture, source_sampler, in.uv).rgb;
    let resolved = mix(current, history, 0.94);
    return vec4<f32>(resolved, source.a);
}
