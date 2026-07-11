#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput
#import bevy_render::view::View

struct SsgiSettings {
    // radius, intensity, frame, unused
    params: vec4<f32>,
    ambient: vec4<f32>,
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
#ifdef MULTISAMPLED
@group(0) @binding(2) var depth_texture: texture_depth_multisampled_2d;
#else
@group(0) @binding(2) var depth_texture: texture_depth_2d;
#endif
@group(0) @binding(3) var<uniform> settings: SsgiSettings;
@group(0) @binding(4) var<uniform> view: View;

fn depth_at(pixel: vec2<i32>) -> f32 {
#ifdef MULTISAMPLED
    return textureLoad(depth_texture, pixel, 0);
#else
    return textureLoad(depth_texture, pixel, 0);
#endif
}

fn world_position(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
    let world_h = view.world_from_clip * ndc;
    return world_h.xyz / max(world_h.w, 0.000001);
}

fn project_uv(world: vec3<f32>) -> vec2<f32> {
    let clip = view.clip_from_world * vec4<f32>(world, 1.0);
    let ndc = clip.xy / max(clip.w, 0.000001);
    return vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
}

fn gather_offset(index: i32) -> vec2<f32> {
    switch index {
        case 0: { return vec2<f32>(-1.0, 0.0); }
        case 1: { return vec2<f32>(1.0, 0.0); }
        case 2: { return vec2<f32>(0.0, -1.0); }
        case 3: { return vec2<f32>(0.0, 1.0); }
        case 4: { return vec2<f32>(-0.707, -0.707); }
        case 5: { return vec2<f32>(0.707, -0.707); }
        case 6: { return vec2<f32>(-0.707, 0.707); }
        case 7: { return vec2<f32>(0.707, 0.707); }
        case 8: { return vec2<f32>(-0.45, 0.0); }
        case 9: { return vec2<f32>(0.45, 0.0); }
        case 10: { return vec2<f32>(0.0, -0.45); }
        default: { return vec2<f32>(0.0, 0.45); }
    }
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let source = textureSample(source_texture, source_sampler, in.uv);
    let size = vec2<i32>(textureDimensions(depth_texture));
    let pixel = clamp(vec2<i32>(in.position.xy), vec2<i32>(0), size - vec2<i32>(1));
    let depth = depth_at(pixel);
    if depth <= 0.000001 {
        return source;
    }
    let texel = 1.0 / vec2<f32>(size);
    let center = world_position(in.uv, depth);
    let right_uv = clamp(in.uv + vec2<f32>(texel.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
    let down_uv = clamp(in.uv + vec2<f32>(0.0, texel.y), vec2<f32>(0.0), vec2<f32>(1.0));
    let right = world_position(right_uv, depth_at(clamp(pixel + vec2<i32>(1, 0), vec2<i32>(0), size - vec2<i32>(1))));
    let down = world_position(down_uv, depth_at(clamp(pixel + vec2<i32>(0, 1), vec2<i32>(0), size - vec2<i32>(1))));
    var normal = normalize(cross(right - center, down - center));
    if dot(normal, view.world_position - center) < 0.0 { normal = -normal; }
    // A wide, bounded gather is required for large indoor receivers such as a
    // ceiling to see nearby window/emissive radiance. Depth weighting below
    // keeps the wider footprint from becoming an unbounded color blur.
    let screen_radius = clamp(settings.params.x / 45.0, 0.025, 0.20);
    var gathered = settings.ambient.rgb * 0.35;
    var gathered_chroma = vec3<f32>(0.0);
    var chroma_weight = 0.0;
    var total_weight = 0.35;
    for (var sample_index = 0; sample_index < 12; sample_index += 1) {
        let uv = clamp(in.uv + gather_offset(sample_index) * screen_radius, vec2<f32>(0.001), vec2<f32>(0.999));
        let hit_pixel = clamp(vec2<i32>(uv * vec2<f32>(size)), vec2<i32>(0), size - vec2<i32>(1));
        let scene_depth = depth_at(hit_pixel);
        if scene_depth <= 0.000001 { continue; }
        let scene_position = world_position(uv, scene_depth);
        let separation = distance(scene_position, center);
        let weight = exp(-separation / max(settings.params.x, 0.001)) / (1.0 + separation * 0.25);
        let radiance = min(textureSampleLevel(source_texture, source_sampler, uv, 0.0).rgb, vec3<f32>(1.0));
        let neutral = min(radiance.r, min(radiance.g, radiance.b));
        let chroma = max(radiance - vec3<f32>(neutral), vec3<f32>(0.0));
        let peak = max(radiance.r, max(radiance.g, radiance.b));
        let saturation = max(chroma.r, max(chroma.g, chroma.b)) / max(peak, 0.0001);
        gathered += radiance * weight;
        let saturation_weight = pow(saturation, 4.0) * weight;
        gathered_chroma += chroma * saturation_weight;
        chroma_weight += saturation_weight;
        total_weight += weight;
    }
    // Diffuse neighborhood averaging otherwise desaturates colored bounce too
    // aggressively after ACES. Preserve only chroma already present in nearby
    // radiance; this remains hue-agnostic and does not invent fixture colors.
    let indirect = gathered / max(total_weight, 0.00001)
        + gathered_chroma / max(chroma_weight, 0.00001) * 2.0;
    return vec4<f32>(source.rgb + indirect * settings.params.y, source.a);
}
