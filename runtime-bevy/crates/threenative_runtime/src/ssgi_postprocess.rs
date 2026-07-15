#![allow(dead_code)]

use std::{collections::HashMap, sync::Mutex};

use bevy::{
    asset::{Handle, load_internal_asset},
    core_pipeline::{
        core_3d::graph::Core3d, fullscreen_vertex_shader::fullscreen_shader_vertex_state,
    },
    ecs::query::QueryItem,
    pbr::graph::NodePbr,
    prelude::*,
    render::{
        RenderApp,
        extract_component::{
            ComponentUniforms, DynamicUniformIndex, ExtractComponent, ExtractComponentPlugin,
            UniformComponentPlugin,
        },
        render_graph::{
            NodeRunError, RenderGraphApp, RenderGraphContext, RenderLabel, ViewNode, ViewNodeRunner,
        },
        render_resource::{
            BindGroupEntries, BindGroupLayout, BindGroupLayoutEntries, CachedRenderPipelineId,
            ColorTargetState, ColorWrites, Extent3d, FragmentState, MultisampleState, Operations,
            PipelineCache, PrimitiveState, RenderPassColorAttachment, RenderPassDescriptor,
            RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, Shader,
            ShaderStages, ShaderType, Texture, TextureDescriptor, TextureDimension, TextureUsages,
            TextureView, TextureViewDescriptor,
            binding_types::{
                sampler, texture_2d, texture_depth_2d, texture_depth_2d_multisampled,
                uniform_buffer,
            },
        },
        renderer::{RenderContext, RenderDevice},
        view::{ViewDepthTexture, ViewTarget, ViewUniform, ViewUniformOffset, ViewUniforms},
    },
};

const SHADER_HANDLE: Handle<Shader> = Handle::weak_from_u128(246919833244510315808552922712);

#[derive(Clone, Component, Debug, ExtractComponent, ShaderType)]
pub struct NativeSsgi {
    params: Vec4,
    ambient: Vec4,
    frame: f32,
    _padding: Vec3,
}

impl NativeSsgi {
    pub fn new(radius: f32, intensity: f32, ambient: Color) -> Self {
        Self::with_quality(radius, intensity, ambient, "high")
    }

    pub fn with_quality(radius: f32, intensity: f32, ambient: Color, quality: &str) -> Self {
        let ambient = ambient.to_linear();
        let authored_intensity = intensity.max(0.0);
        let (ray_count, step_count) = match quality {
            "low" => (4.0, 8.0),
            "medium" => (8.0, 12.0),
            _ => (8.0, 16.0),
        };
        // The native gather needs a stronger mid/high authored lift after the
        // hero ambient suppression, but an uncapped intensity of 2.0 can
        // overdrive the deferred post chain. Keep the curve smooth and bound
        // its native contribution independently of authored source values.
        let intensity_gain = 0.4 + 0.2 * authored_intensity.min(1.0);
        Self {
            // radius, intensity, ray count, depth step count
            params: Vec4::new(
                radius.max(0.01),
                (authored_intensity * intensity_gain).min(0.8),
                ray_count,
                step_count,
            ),
            ambient: Vec4::new(ambient.red, ambient.green, ambient.blue, 1.0),
            frame: 0.0,
            _padding: Vec3::ZERO,
        }
    }

    fn advance_frame(&mut self) {
        self.frame = (self.frame + 1.0).rem_euclid(4096.0);
    }
}

pub struct NativeSsgiPostProcessPlugin;

impl Plugin for NativeSsgiPostProcessPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            SHADER_HANDLE,
            "ssgi_postprocess.wgsl",
            Shader::from_wgsl
        );
        app.add_plugins((
            ExtractComponentPlugin::<NativeSsgi>::default(),
            UniformComponentPlugin::<NativeSsgi>::default(),
        ));
        app.add_systems(Update, advance_native_ssgi_frames);
    }
    fn finish(&self, app: &mut App) {
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .add_render_graph_node::<ViewNodeRunner<NativeSsgiNode>>(Core3d, NativeSsgiLabel)
            .add_render_graph_edges(
                Core3d,
                (
                    NodePbr::ScreenSpaceReflections,
                    NativeSsgiLabel,
                    NodePbr::VolumetricFog,
                ),
            )
            .init_resource::<NativeSsgiPipeline>()
            .init_resource::<NativeSsgiHistory>();
    }
}

fn advance_native_ssgi_frames(mut query: Query<&mut NativeSsgi>) {
    for mut settings in &mut query {
        settings.advance_frame();
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Clone, RenderLabel)]
struct NativeSsgiLabel;
#[derive(Default)]
struct NativeSsgiNode;

impl ViewNode for NativeSsgiNode {
    type ViewQuery = (
        Entity,
        &'static ViewTarget,
        &'static ViewDepthTexture,
        &'static DynamicUniformIndex<NativeSsgi>,
        &'static ViewUniformOffset,
    );
    fn run(
        &self,
        _graph: &mut RenderGraphContext,
        context: &mut RenderContext,
        (view_entity, target, depth, settings_index, view_offset): QueryItem<Self::ViewQuery>,
        world: &World,
    ) -> Result<(), NodeRunError> {
        let pipeline = world.resource::<NativeSsgiPipeline>();
        let multisampled = world.resource::<Msaa>() != &Msaa::Off;
        let pipeline_id = pipeline.pipeline_id(multisampled);
        let Some(render_pipeline) = world
            .resource::<PipelineCache>()
            .get_render_pipeline(pipeline_id)
        else {
            return Ok(());
        };
        let settings = world.resource::<ComponentUniforms<NativeSsgi>>();
        let views = world.resource::<ViewUniforms>();
        let (Some(settings_binding), Some(view_binding)) =
            (settings.uniforms().binding(), views.uniforms.binding())
        else {
            return Ok(());
        };
        let source = target.main_texture();
        let mut histories = world
            .resource::<NativeSsgiHistory>()
            .entries
            .lock()
            .expect("native SSGI history mutex should not be poisoned");
        let history = histories.entry(view_entity).or_insert_with(|| {
            NativeSsgiHistoryEntry::new(
                context.render_device(),
                source.width(),
                source.height(),
                target.main_texture_format(),
            )
        });
        if history.width != source.width() || history.height != source.height() {
            *history = NativeSsgiHistoryEntry::new(
                context.render_device(),
                source.width(),
                source.height(),
                target.main_texture_format(),
            );
        }
        if !history.initialized {
            context.command_encoder().copy_texture_to_texture(
                source.as_image_copy(),
                history.texture.as_image_copy(),
                Extent3d {
                    width: source.width(),
                    height: source.height(),
                    depth_or_array_layers: 1,
                },
            );
            history.initialized = true;
        }
        let sampleable_source = context.render_device().create_texture(&TextureDescriptor {
            label: Some("native_ssgi_sampleable_source"),
            size: Extent3d {
                width: source.width(),
                height: source.height(),
                depth_or_array_layers: 1,
            },
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
            Extent3d {
                width: source.width(),
                height: source.height(),
                depth_or_array_layers: 1,
            },
        );
        let sampleable_source_view =
            sampleable_source.create_view(&TextureViewDescriptor::default());
        let layout = pipeline.layout(multisampled);
        {
            let post = target.post_process_write();
            let bind_group = context.render_device().create_bind_group(
                "native_ssgi_bind_group",
                layout,
                &BindGroupEntries::sequential((
                    &sampleable_source_view,
                    &pipeline.sampler,
                    depth.view(),
                    &history.view,
                    settings_binding,
                    view_binding,
                )),
            );
            let mut pass = context.begin_tracked_render_pass(RenderPassDescriptor {
                label: Some("native_ssgi_pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: post.destination,
                    resolve_target: None,
                    ops: Operations::default(),
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_render_pipeline(render_pipeline);
            pass.set_bind_group(
                0,
                &bind_group,
                &[settings_index.index(), view_offset.offset],
            );
            pass.draw(0..3, 0..1);
        }
        context.command_encoder().copy_texture_to_texture(
            target.main_texture().as_image_copy(),
            history.texture.as_image_copy(),
            Extent3d {
                width: source.width(),
                height: source.height(),
                depth_or_array_layers: 1,
            },
        );
        Ok(())
    }
}

#[derive(Resource, Default)]
struct NativeSsgiHistory {
    entries: Mutex<HashMap<Entity, NativeSsgiHistoryEntry>>,
}

struct NativeSsgiHistoryEntry {
    texture: Texture,
    view: TextureView,
    width: u32,
    height: u32,
    initialized: bool,
}

impl NativeSsgiHistoryEntry {
    fn new(
        device: &RenderDevice,
        width: u32,
        height: u32,
        format: bevy::render::render_resource::TextureFormat,
    ) -> Self {
        let texture = device.create_texture(&TextureDescriptor {
            label: Some("native_ssgi_history"),
            size: Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format,
            usage: TextureUsages::COPY_DST | TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&TextureViewDescriptor::default());
        Self {
            texture,
            view,
            width,
            height,
            initialized: false,
        }
    }
}

#[derive(Resource)]
struct NativeSsgiPipeline {
    layout: BindGroupLayout,
    multisampled_layout: BindGroupLayout,
    sampler: Sampler,
    pipeline_id: CachedRenderPipelineId,
    multisampled_pipeline_id: CachedRenderPipelineId,
}
impl NativeSsgiPipeline {
    fn layout(&self, multisampled: bool) -> &BindGroupLayout {
        if multisampled {
            &self.multisampled_layout
        } else {
            &self.layout
        }
    }

    fn pipeline_id(&self, multisampled: bool) -> CachedRenderPipelineId {
        if multisampled {
            self.multisampled_pipeline_id
        } else {
            self.pipeline_id
        }
    }
}
impl FromWorld for NativeSsgiPipeline {
    fn from_world(world: &mut World) -> Self {
        let device = world.resource::<RenderDevice>();
        let layout = create_layout(device, false);
        let multisampled_layout = create_layout(device, true);
        let sampler = device.create_sampler(&SamplerDescriptor::default());
        let mut cache = world.resource_mut::<PipelineCache>();
        let pipeline_id = queue_pipeline(&mut cache, layout.clone(), false);
        let multisampled_pipeline_id =
            queue_pipeline(&mut cache, multisampled_layout.clone(), true);
        Self {
            layout,
            multisampled_layout,
            sampler,
            pipeline_id,
            multisampled_pipeline_id,
        }
    }
}
fn create_layout(device: &RenderDevice, multisampled: bool) -> BindGroupLayout {
    let depth = if multisampled {
        texture_depth_2d_multisampled()
    } else {
        texture_depth_2d()
    };
    device.create_bind_group_layout(
        "native_ssgi_layout",
        &BindGroupLayoutEntries::sequential(
            ShaderStages::FRAGMENT,
            (
                texture_2d(bevy::render::render_resource::TextureSampleType::Float {
                    filterable: true,
                }),
                sampler(SamplerBindingType::Filtering),
                depth,
                texture_2d(bevy::render::render_resource::TextureSampleType::Float {
                    filterable: true,
                }),
                uniform_buffer::<NativeSsgi>(true),
                uniform_buffer::<ViewUniform>(true),
            ),
        ),
    )
}
fn queue_pipeline(
    cache: &mut PipelineCache,
    layout: BindGroupLayout,
    multisampled: bool,
) -> CachedRenderPipelineId {
    cache.queue_render_pipeline(RenderPipelineDescriptor {
        label: Some("native_ssgi_pipeline".into()),
        layout: vec![layout],
        vertex: fullscreen_shader_vertex_state(),
        fragment: Some(FragmentState {
            shader: SHADER_HANDLE,
            shader_defs: if multisampled {
                vec!["MULTISAMPLED".into()]
            } else {
                vec![]
            },
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_shared_ssgi_intensity() {
        let settings = NativeSsgi::new(8.0, 0.12, Color::linear_rgb(0.1, 0.2, 0.3));
        assert!((settings.params.x - 8.0).abs() < 0.001);
        assert!((settings.params.y - 0.05088).abs() < 0.001);
        assert_eq!(settings.params.z, 8.0);
        assert_eq!(settings.params.w, 16.0);
        let high = NativeSsgi::new(8.0, 2.0, Color::linear_rgb(0.1, 0.2, 0.3));
        assert!((high.params.y - 0.8).abs() < 0.001);
    }

    #[test]
    fn maps_shared_ssgi_quality_to_ray_budget() {
        let ambient = Color::linear_rgb(0.1, 0.2, 0.3);
        let low = NativeSsgi::with_quality(8.0, 0.12, ambient, "low");
        let medium = NativeSsgi::with_quality(8.0, 0.12, ambient, "medium");
        assert_eq!((low.params.z, low.params.w), (4.0, 8.0));
        assert_eq!((medium.params.z, medium.params.w), (8.0, 12.0));
    }
}
