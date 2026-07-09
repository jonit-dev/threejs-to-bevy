#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

@group(0) @binding(0) var current_frame: texture_2d<f32>;
@group(0) @binding(1) var previous_frame: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;

struct NativeTemporalMotionBlurUniform {
    previous_weight: f32,
    reset: u32,
}

@group(0) @binding(3) var<uniform> settings: NativeTemporalMotionBlurUniform;

struct Output {
    @location(0) color: vec4<f32>,
    @location(1) history: vec4<f32>,
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> Output {
    let current = textureSample(current_frame, linear_sampler, in.uv);
    let previous = textureSample(previous_frame, linear_sampler, in.uv);
    let previous_weight = select(settings.previous_weight, 0.0, settings.reset != 0u);
    let accumulated = mix(current, previous, previous_weight);
    return Output(accumulated, accumulated);
}
