use bevy::{
    asset::{Handle, load_internal_asset},
    core_pipeline::{
        core_3d::graph::{Core3d, Node3d},
        fullscreen_vertex_shader::fullscreen_shader_vertex_state,
    },
    ecs::query::QueryItem,
    prelude::*,
    render::{
        RenderApp,
        camera::{ExtractedCamera, NormalizedRenderTarget},
        extract_resource::ExtractResourcePlugin,
        render_asset::RenderAssets,
        render_graph::{
            NodeRunError, RenderGraphApp, RenderGraphContext, RenderLabel, ViewNode, ViewNodeRunner,
        },
        render_resource::{
            BindGroupEntries, BindGroupLayout, BindGroupLayoutEntries, CachedRenderPipelineId,
            ColorTargetState, ColorWrites, FragmentState, MultisampleState, Operations,
            PipelineCache, PrimitiveState, RenderPassColorAttachment, RenderPassDescriptor,
            RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, Shader,
            ShaderStages, TextureSampleType, binding_types::sampler, binding_types::texture_2d,
        },
        renderer::{RenderContext, RenderDevice},
        texture::GpuImage,
        view::ViewTarget,
    },
};

use crate::map_world::NativeEmissiveMarkerMask;

const SHADER_HANDLE: Handle<Shader> = Handle::weak_from_u128(9351765139455510371);

pub struct NativeEmissivePostProcessPlugin;

impl Plugin for NativeEmissivePostProcessPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            SHADER_HANDLE,
            "emissive_marker_postprocess.wgsl",
            Shader::from_wgsl
        );
        app.add_plugins(ExtractResourcePlugin::<NativeEmissiveMarkerMask>::default());
    }

    fn finish(&self, app: &mut App) {
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .add_render_graph_node::<ViewNodeRunner<NativeEmissivePostProcessNode>>(
                Core3d,
                NativeEmissivePostProcessLabel,
            )
            .add_render_graph_edges(
                Core3d,
                (
                    Node3d::Tonemapping,
                    NativeEmissivePostProcessLabel,
                    Node3d::EndMainPassPostProcessing,
                ),
            )
            .init_resource::<NativeEmissivePostProcessPipeline>();
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Clone, RenderLabel)]
struct NativeEmissivePostProcessLabel;

#[derive(Default)]
struct NativeEmissivePostProcessNode;

impl ViewNode for NativeEmissivePostProcessNode {
    type ViewQuery = (&'static ViewTarget, &'static ExtractedCamera);

    fn run(
        &self,
        _graph: &mut RenderGraphContext,
        render_context: &mut RenderContext,
        (view_target, camera): QueryItem<Self::ViewQuery>,
        world: &World,
    ) -> Result<(), NodeRunError> {
        if !supports_emissive_postprocess(view_target.main_texture_format()) {
            return Ok(());
        }
        let pipeline = world.resource::<NativeEmissivePostProcessPipeline>();
        let pipeline_cache = world.resource::<PipelineCache>();
        let Some(render_pipeline) = pipeline_cache.get_render_pipeline(pipeline.pipeline_id) else {
            return Ok(());
        };

        let Some(mask) = world.get_resource::<NativeEmissiveMarkerMask>() else {
            return Ok(());
        };
        if matches!(
            camera.target.as_ref(),
            Some(NormalizedRenderTarget::Image(image)) if image == &mask.image
        ) {
            return Ok(());
        }
        let images = world.resource::<RenderAssets<GpuImage>>();
        let Some(mask_image) = images.get(&mask.image) else {
            return Ok(());
        };

        let post_process = view_target.post_process_write();
        let bind_group = render_context.render_device().create_bind_group(
            "native_emissive_postprocess_bind_group",
            &pipeline.layout,
            &BindGroupEntries::sequential((
                post_process.source,
                &pipeline.sampler,
                &mask_image.texture_view,
            )),
        );

        let mut render_pass = render_context.begin_tracked_render_pass(RenderPassDescriptor {
            label: Some("native_emissive_postprocess_pass"),
            color_attachments: &[Some(RenderPassColorAttachment {
                view: post_process.destination,
                resolve_target: None,
                ops: Operations::default(),
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        render_pass.set_render_pipeline(render_pipeline);
        render_pass.set_bind_group(0, &bind_group, &[]);
        render_pass.draw(0..3, 0..1);

        Ok(())
    }
}

fn supports_emissive_postprocess(format: bevy::render::render_resource::TextureFormat) -> bool {
    format == ViewTarget::TEXTURE_FORMAT_HDR
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::render::render_resource::TextureFormat;

    #[test]
    fn emissive_postprocess_pipeline_only_targets_hdr_views() {
        assert!(supports_emissive_postprocess(TextureFormat::Rgba16Float));
        assert!(!supports_emissive_postprocess(
            TextureFormat::Rgba8UnormSrgb
        ));
    }
}

#[derive(Resource)]
struct NativeEmissivePostProcessPipeline {
    layout: BindGroupLayout,
    sampler: Sampler,
    pipeline_id: CachedRenderPipelineId,
}

impl FromWorld for NativeEmissivePostProcessPipeline {
    fn from_world(world: &mut World) -> Self {
        let render_device = world.resource::<RenderDevice>();
        let layout = render_device.create_bind_group_layout(
            "native_emissive_postprocess_bind_group_layout",
            &BindGroupLayoutEntries::sequential(
                ShaderStages::FRAGMENT,
                (
                    texture_2d(TextureSampleType::Float { filterable: true }),
                    sampler(SamplerBindingType::Filtering),
                    texture_2d(TextureSampleType::Float { filterable: true }),
                ),
            ),
        );
        let sampler = render_device.create_sampler(&SamplerDescriptor::default());
        let pipeline_id =
            world
                .resource_mut::<PipelineCache>()
                .queue_render_pipeline(RenderPipelineDescriptor {
                    label: Some("native_emissive_postprocess_pipeline".into()),
                    layout: vec![layout.clone()],
                    vertex: fullscreen_shader_vertex_state(),
                    fragment: Some(FragmentState {
                        shader: SHADER_HANDLE,
                        shader_defs: vec![],
                        entry_point: "fragment".into(),
                        targets: vec![Some(ColorTargetState {
                            format: ViewTarget::TEXTURE_FORMAT_HDR,
                            blend: None,
                            write_mask: ColorWrites::ALL,
                        })],
                    }),
                    primitive: PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: MultisampleState::default(),
                    push_constant_ranges: vec![],
                });
        Self {
            layout,
            sampler,
            pipeline_id,
        }
    }
}
