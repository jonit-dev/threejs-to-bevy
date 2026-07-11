#![allow(dead_code)]

use bevy::{
    asset::{Handle, load_internal_asset},
    core_pipeline::{
        core_3d::graph::{Core3d, Node3d},
        fullscreen_vertex_shader::fullscreen_shader_vertex_state,
    },
    ecs::query::QueryItem,
    pbr::graph::NodePbr,
    prelude::*,
    render::{
        render_graph::{NodeRunError, RenderGraphApp, RenderGraphContext, RenderLabel, ViewNode, ViewNodeRunner},
        render_resource::{
            BindGroupEntries, BindGroupLayout, BindGroupLayoutEntries, CachedRenderPipelineId,
            ColorTargetState, ColorWrites, FragmentState, MultisampleState, Operations, PipelineCache,
            PrimitiveState, RenderPassColorAttachment, RenderPassDescriptor, RenderPipelineDescriptor,
            Sampler, SamplerBindingType, SamplerDescriptor, Shader, ShaderStages, ShaderType,
            binding_types::{sampler, texture_2d, texture_depth_2d, texture_depth_2d_multisampled, uniform_buffer},
        },
        renderer::{RenderContext, RenderDevice},
        extract_component::{ComponentUniforms, DynamicUniformIndex, ExtractComponent, ExtractComponentPlugin, UniformComponentPlugin},
        view::{ViewDepthTexture, ViewTarget, ViewUniform, ViewUniformOffset, ViewUniforms},
        RenderApp,
    },
};

const SHADER_HANDLE: Handle<Shader> = Handle::weak_from_u128(172931785933566365591256881071);

#[derive(Clone, Component, Debug, ExtractComponent, ShaderType)]
pub struct NativeHeightFog {
    color: Vec4,
    params: Vec4,
}

impl NativeHeightFog {
    pub fn new(color: Color, density: f32, base_height: f32, falloff_height: f32, max_distance: f32) -> Self {
        let linear = color.to_linear();
        Self {
            color: Vec4::new(linear.red, linear.green, linear.blue, linear.alpha),
            params: Vec4::new(
                base_height,
                std::f32::consts::LN_2 / falloff_height.max(0.001),
                density.max(0.0) * 0.08,
                max_distance.max(0.001),
            ),
        }
    }
}

pub struct NativeHeightFogPostProcessPlugin;

impl Plugin for NativeHeightFogPostProcessPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(app, SHADER_HANDLE, "height_fog_postprocess.wgsl", Shader::from_wgsl);
        app.add_plugins((
            ExtractComponentPlugin::<NativeHeightFog>::default(),
            UniformComponentPlugin::<NativeHeightFog>::default(),
        ));
    }

    fn finish(&self, app: &mut App) {
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else { return; };
        render_app
            .add_render_graph_node::<ViewNodeRunner<NativeHeightFogNode>>(Core3d, NativeHeightFogLabel)
            .add_render_graph_edges(Core3d, (NodePbr::VolumetricFog, NativeHeightFogLabel, Node3d::Bloom))
            .init_resource::<NativeHeightFogPipeline>();
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Clone, RenderLabel)]
struct NativeHeightFogLabel;

#[derive(Default)]
struct NativeHeightFogNode;

impl ViewNode for NativeHeightFogNode {
    type ViewQuery = (
        &'static ViewTarget,
        &'static ViewDepthTexture,
        &'static DynamicUniformIndex<NativeHeightFog>,
        &'static ViewUniformOffset,
    );

    fn run(
        &self,
        _graph: &mut RenderGraphContext,
        render_context: &mut RenderContext,
        (view_target, depth, fog_index, view_offset): QueryItem<Self::ViewQuery>,
        world: &World,
    ) -> Result<(), NodeRunError> {
        let pipeline = world.resource::<NativeHeightFogPipeline>();
        let pipeline_cache = world.resource::<PipelineCache>();
        let multisampled = world.resource::<Msaa>() != &Msaa::Off;
        let pipeline_id = if multisampled { pipeline.multisampled_pipeline_id } else { pipeline.pipeline_id };
        let Some(render_pipeline) = pipeline_cache.get_render_pipeline(pipeline_id) else { return Ok(()); };
        let fog_uniforms = world.resource::<ComponentUniforms<NativeHeightFog>>();
        let view_uniforms = world.resource::<ViewUniforms>();
        let (Some(fog_binding), Some(view_binding)) = (fog_uniforms.uniforms().binding(), view_uniforms.uniforms.binding()) else { return Ok(()); };
        let post_process = view_target.post_process_write();
        let layout = if multisampled { &pipeline.multisampled_layout } else { &pipeline.layout };
        let bind_group = render_context.render_device().create_bind_group(
            "native_height_fog_bind_group",
            layout,
            &BindGroupEntries::sequential((post_process.source, &pipeline.sampler, depth.view(), fog_binding, view_binding)),
        );
        let mut pass = render_context.begin_tracked_render_pass(RenderPassDescriptor {
            label: Some("native_height_fog_pass"),
            color_attachments: &[Some(RenderPassColorAttachment { view: post_process.destination, resolve_target: None, ops: Operations::default() })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        pass.set_render_pipeline(render_pipeline);
        pass.set_bind_group(0, &bind_group, &[fog_index.index(), view_offset.offset]);
        pass.draw(0..3, 0..1);
        Ok(())
    }
}

#[derive(Resource)]
struct NativeHeightFogPipeline {
    layout: BindGroupLayout,
    multisampled_layout: BindGroupLayout,
    sampler: Sampler,
    pipeline_id: CachedRenderPipelineId,
    multisampled_pipeline_id: CachedRenderPipelineId,
}

impl FromWorld for NativeHeightFogPipeline {
    fn from_world(world: &mut World) -> Self {
        let render_device = world.resource::<RenderDevice>();
        let layout = create_layout(render_device, false);
        let multisampled_layout = create_layout(render_device, true);
        let sampler = render_device.create_sampler(&SamplerDescriptor::default());
        let mut cache = world.resource_mut::<PipelineCache>();
        let pipeline_id = queue_pipeline(&mut cache, layout.clone(), false);
        let multisampled_pipeline_id = queue_pipeline(&mut cache, multisampled_layout.clone(), true);
        Self { layout, multisampled_layout, sampler, pipeline_id, multisampled_pipeline_id }
    }
}

fn create_layout(device: &RenderDevice, multisampled: bool) -> BindGroupLayout {
    let depth = if multisampled { texture_depth_2d_multisampled() } else { texture_depth_2d() };
    device.create_bind_group_layout(
        "native_height_fog_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::FRAGMENT,
            (texture_2d(bevy::render::render_resource::TextureSampleType::Float { filterable: true }), sampler(SamplerBindingType::Filtering), depth, uniform_buffer::<NativeHeightFog>(true), uniform_buffer::<ViewUniform>(true)),
        ),
    )
}

fn queue_pipeline(cache: &mut PipelineCache, layout: BindGroupLayout, multisampled: bool) -> CachedRenderPipelineId {
    cache.queue_render_pipeline(RenderPipelineDescriptor {
        label: Some("native_height_fog_pipeline".into()),
        layout: vec![layout],
        vertex: fullscreen_shader_vertex_state(),
        fragment: Some(FragmentState {
            shader: SHADER_HANDLE,
            shader_defs: if multisampled { vec!["MULTISAMPLED".into()] } else { vec![] },
            entry_point: "fragment".into(),
            targets: vec![Some(ColorTargetState { format: ViewTarget::TEXTURE_FORMAT_HDR, blend: None, write_mask: ColorWrites::ALL })],
        }),
        primitive: PrimitiveState::default(),
        depth_stencil: None,
        multisample: MultisampleState::default(),
        push_constant_ranges: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn height_fog_maps_the_same_exponential_density_as_web() {
        let settings = NativeHeightFog::new(Color::linear_rgb(0.5, 0.4, 0.3), 0.08, 1.0, 4.0, 35.0);
        assert!((settings.params.x - 1.0).abs() < 0.0001);
        assert!((settings.params.y - std::f32::consts::LN_2 / 4.0).abs() < 0.0001);
        assert!((settings.params.z - 0.0064).abs() < 0.0001);
    }
}
