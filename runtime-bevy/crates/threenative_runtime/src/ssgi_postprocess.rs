#![allow(dead_code)]

use bevy::{
    asset::{Handle, load_internal_asset},
    core_pipeline::{core_3d::graph::Core3d, fullscreen_vertex_shader::fullscreen_shader_vertex_state},
    ecs::query::QueryItem,
    pbr::graph::NodePbr,
    prelude::*,
    render::{
        RenderApp,
        extract_component::{ComponentUniforms, DynamicUniformIndex, ExtractComponent, ExtractComponentPlugin, UniformComponentPlugin},
        render_graph::{NodeRunError, RenderGraphApp, RenderGraphContext, RenderLabel, ViewNode, ViewNodeRunner},
        render_resource::{BindGroupEntries, BindGroupLayout, BindGroupLayoutEntries, CachedRenderPipelineId, ColorTargetState, ColorWrites, Extent3d, FragmentState, MultisampleState, Operations, PipelineCache, PrimitiveState, RenderPassColorAttachment, RenderPassDescriptor, RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, Shader, ShaderStages, ShaderType, TextureDescriptor, TextureDimension, TextureUsages, TextureViewDescriptor, binding_types::{sampler, texture_2d, texture_depth_2d, texture_depth_2d_multisampled, uniform_buffer}},
        renderer::{RenderContext, RenderDevice},
        view::{ViewDepthTexture, ViewTarget, ViewUniform, ViewUniformOffset, ViewUniforms},
    },
};

const SHADER_HANDLE: Handle<Shader> = Handle::weak_from_u128(246919833244510315808552922712);

#[derive(Clone, Component, Debug, ExtractComponent, ShaderType)]
pub struct NativeSsgi {
    params: Vec4,
    ambient: Vec4,
}

impl NativeSsgi {
    pub fn new(radius: f32, intensity: f32, ambient: Color) -> Self {
        let ambient = ambient.to_linear();
        Self {
            params: Vec4::new(radius.max(0.01), intensity.max(0.0) * 0.4, 0.0, 0.0),
            ambient: Vec4::new(ambient.red, ambient.green, ambient.blue, 1.0),
        }
    }
}

pub struct NativeSsgiPostProcessPlugin;

impl Plugin for NativeSsgiPostProcessPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(app, SHADER_HANDLE, "ssgi_postprocess.wgsl", Shader::from_wgsl);
        app.add_plugins((ExtractComponentPlugin::<NativeSsgi>::default(), UniformComponentPlugin::<NativeSsgi>::default()));
    }
    fn finish(&self, app: &mut App) {
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else { return; };
        render_app
            .add_render_graph_node::<ViewNodeRunner<NativeSsgiNode>>(Core3d, NativeSsgiLabel)
            .add_render_graph_edges(Core3d, (NodePbr::ScreenSpaceReflections, NativeSsgiLabel, NodePbr::VolumetricFog))
            .init_resource::<NativeSsgiPipeline>();
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Clone, RenderLabel)]
struct NativeSsgiLabel;
#[derive(Default)]
struct NativeSsgiNode;

impl ViewNode for NativeSsgiNode {
    type ViewQuery = (&'static ViewTarget, &'static ViewDepthTexture, &'static DynamicUniformIndex<NativeSsgi>, &'static ViewUniformOffset);
    fn run(&self, _graph: &mut RenderGraphContext, context: &mut RenderContext, (target, depth, settings_index, view_offset): QueryItem<Self::ViewQuery>, world: &World) -> Result<(), NodeRunError> {
        let pipeline = world.resource::<NativeSsgiPipeline>();
        let multisampled = world.resource::<Msaa>() != &Msaa::Off;
        let pipeline_id = if multisampled { pipeline.multisampled_pipeline_id } else { pipeline.pipeline_id };
        let Some(render_pipeline) = world.resource::<PipelineCache>().get_render_pipeline(pipeline_id) else { return Ok(()); };
        let settings = world.resource::<ComponentUniforms<NativeSsgi>>();
        let views = world.resource::<ViewUniforms>();
        let (Some(settings_binding), Some(view_binding)) = (settings.uniforms().binding(), views.uniforms.binding()) else { return Ok(()); };
        let source = target.main_texture();
        let sampleable_source = context.render_device().create_texture(&TextureDescriptor {
            label: Some("native_ssgi_sampleable_source"),
            size: Extent3d { width: source.width(), height: source.height(), depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: target.main_texture_format(),
            usage: TextureUsages::COPY_DST | TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        context.command_encoder().copy_texture_to_texture(
            source.as_image_copy(),
            sampleable_source.as_image_copy(),
            Extent3d { width: source.width(), height: source.height(), depth_or_array_layers: 1 },
        );
        let sampleable_source_view = sampleable_source.create_view(&TextureViewDescriptor::default());
        let post = target.post_process_write();
        let layout = if multisampled { &pipeline.multisampled_layout } else { &pipeline.layout };
        let bind_group = context.render_device().create_bind_group("native_ssgi_bind_group", layout, &BindGroupEntries::sequential((&sampleable_source_view, &pipeline.sampler, depth.view(), settings_binding, view_binding)));
        let mut pass = context.begin_tracked_render_pass(RenderPassDescriptor { label: Some("native_ssgi_pass"), color_attachments: &[Some(RenderPassColorAttachment { view: post.destination, resolve_target: None, ops: Operations::default() })], depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None });
        pass.set_render_pipeline(render_pipeline);
        pass.set_bind_group(0, &bind_group, &[settings_index.index(), view_offset.offset]);
        pass.draw(0..3, 0..1);
        Ok(())
    }
}

#[derive(Resource)]
struct NativeSsgiPipeline { layout: BindGroupLayout, multisampled_layout: BindGroupLayout, sampler: Sampler, pipeline_id: CachedRenderPipelineId, multisampled_pipeline_id: CachedRenderPipelineId }
impl FromWorld for NativeSsgiPipeline {
    fn from_world(world: &mut World) -> Self {
        let device = world.resource::<RenderDevice>();
        let layout = create_layout(device, false);
        let multisampled_layout = create_layout(device, true);
        let sampler = device.create_sampler(&SamplerDescriptor::default());
        let mut cache = world.resource_mut::<PipelineCache>();
        let pipeline_id = queue_pipeline(&mut cache, layout.clone(), false);
        let multisampled_pipeline_id = queue_pipeline(&mut cache, multisampled_layout.clone(), true);
        Self { layout, multisampled_layout, sampler, pipeline_id, multisampled_pipeline_id }
    }
}
fn create_layout(device: &RenderDevice, multisampled: bool) -> BindGroupLayout {
    let depth = if multisampled { texture_depth_2d_multisampled() } else { texture_depth_2d() };
    device.create_bind_group_layout("native_ssgi_layout", &BindGroupLayoutEntries::sequential(ShaderStages::FRAGMENT, (texture_2d(bevy::render::render_resource::TextureSampleType::Float { filterable: true }), sampler(SamplerBindingType::Filtering), depth, uniform_buffer::<NativeSsgi>(true), uniform_buffer::<ViewUniform>(true))))
}
fn queue_pipeline(cache: &mut PipelineCache, layout: BindGroupLayout, multisampled: bool) -> CachedRenderPipelineId {
    cache.queue_render_pipeline(RenderPipelineDescriptor { label: Some("native_ssgi_pipeline".into()), layout: vec![layout], vertex: fullscreen_shader_vertex_state(), fragment: Some(FragmentState { shader: SHADER_HANDLE, shader_defs: if multisampled { vec!["MULTISAMPLED".into()] } else { vec![] }, entry_point: "fragment".into(), targets: vec![Some(ColorTargetState { format: ViewTarget::TEXTURE_FORMAT_HDR, blend: None, write_mask: ColorWrites::ALL })] }), primitive: PrimitiveState::default(), depth_stencil: None, multisample: MultisampleState::default(), push_constant_ranges: vec![] })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_shared_ssgi_intensity() {
        let settings = NativeSsgi::new(8.0, 0.12, Color::linear_rgb(0.1, 0.2, 0.3));
        assert!((settings.params.x - 8.0).abs() < 0.001);
        assert!((settings.params.y - 0.048).abs() < 0.001);
    }
}
