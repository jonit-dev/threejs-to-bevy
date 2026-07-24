// ShaderType generates compile-time field checks that rustc reports as dead
// code even though the fields are consumed through GPU uniform bindings.
#![allow(dead_code)]

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::{
    collections::{HashMap, HashSet},
    mem,
};

use bevy::{
    asset::{Handle, load_internal_asset},
    core_pipeline::{
        core_3d::{Camera3d, graph::Core3d, graph::Node3d},
        fullscreen_vertex_shader::fullscreen_shader_vertex_state,
    },
    ecs::query::QueryItem,
    prelude::*,
    render::{
        ExtractSchedule, MainWorld, Render, RenderApp, RenderSet,
        camera::{CameraProjection, ExtractedCamera, Projection},
        extract_component::{ComponentUniforms, DynamicUniformIndex, UniformComponentPlugin},
        render_graph::{
            NodeRunError, RenderGraphApp, RenderGraphContext, RenderLabel, ViewNode, ViewNodeRunner,
        },
        render_resource::{
            BindGroupEntries, BindGroupLayout, BindGroupLayoutEntries, CachedRenderPipelineId,
            ColorTargetState, ColorWrites, Extent3d, FilterMode, FragmentState, MultisampleState,
            Operations, PipelineCache, PrimitiveState, RenderPassColorAttachment,
            RenderPassDescriptor, RenderPipelineDescriptor, Sampler, SamplerBindingType,
            SamplerDescriptor, Shader, ShaderStages, ShaderType, SpecializedRenderPipeline,
            SpecializedRenderPipelines, TextureDescriptor, TextureDimension, TextureFormat,
            TextureSampleType, TextureUsages, binding_types::sampler, binding_types::texture_2d,
        },
        renderer::{RenderContext, RenderDevice},
        texture::{BevyDefault, CachedTexture},
        view::{ExtractedView, ViewTarget},
    },
};

const SHADER_HANDLE: Handle<Shader> = Handle::weak_from_u128(117475166811916816518762912181);

/// Screen-space history accumulation used by both adapters until a portable
/// velocity-buffer implementation can provide equivalent edge coverage.
#[derive(Component, Clone, Debug)]
pub struct NativeTemporalMotionBlur {
    pub previous_camera_projection: Option<[f32; 16]>,
    pub previous_camera_rotation: Option<Quat>,
    pub previous_camera_translation: Option<Vec3>,
    pub previous_weight: f32,
    pub reset: bool,
}

impl NativeTemporalMotionBlur {
    pub fn from_shutter_angle(shutter_angle: f32) -> Self {
        Self {
            previous_camera_projection: None,
            previous_camera_rotation: None,
            previous_camera_translation: None,
            previous_weight: temporal_motion_blur_previous_weight(shutter_angle),
            reset: true,
        }
    }
}

pub fn temporal_motion_blur_previous_weight(shutter_angle: f32) -> f32 {
    (shutter_angle * 0.3).clamp(0.0, 0.25)
}

#[derive(Component, Clone, ShaderType)]
#[allow(dead_code)]
struct NativeTemporalMotionBlurUniform {
    #[allow(dead_code)]
    pub previous_weight: f32,
    reset: u32,
}

pub struct NativeTemporalMotionBlurPlugin;

impl Plugin for NativeTemporalMotionBlurPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            SHADER_HANDLE,
            "motion_blur_postprocess.wgsl",
            Shader::from_wgsl
        );
        app.add_plugins(UniformComponentPlugin::<NativeTemporalMotionBlurUniform>::default());

        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app
            .init_resource::<SpecializedRenderPipelines<NativeTemporalMotionBlurPipeline>>()
            .init_resource::<NativeTemporalMotionBlurHistories>()
            .add_systems(ExtractSchedule, extract_temporal_motion_blur_settings)
            .add_systems(
                Render,
                prepare_temporal_motion_blur_history.in_set(RenderSet::ManageViews),
            )
            .add_systems(
                Render,
                prepare_temporal_motion_blur_pipelines.in_set(RenderSet::Prepare),
            )
            .add_render_graph_node::<ViewNodeRunner<NativeTemporalMotionBlurNode>>(
                Core3d,
                NativeTemporalMotionBlurLabel,
            )
            .add_render_graph_edges(
                Core3d,
                (
                    Node3d::MotionBlur,
                    NativeTemporalMotionBlurLabel,
                    Node3d::Bloom,
                ),
            );
    }

    fn finish(&self, app: &mut App) {
        let Some(render_app) = app.get_sub_app_mut(RenderApp) else {
            return;
        };
        render_app.init_resource::<NativeTemporalMotionBlurPipeline>();
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Clone, RenderLabel)]
struct NativeTemporalMotionBlurLabel;

fn extract_temporal_motion_blur_settings(
    mut commands: Commands,
    mut main_world: ResMut<MainWorld>,
) {
    let mut cameras = main_world.query_filtered::<
        (
            Entity,
            &Camera,
            &GlobalTransform,
            &Projection,
            &mut NativeTemporalMotionBlur,
        ),
        With<Camera3d>,
    >();
    for (entity, camera, camera_transform, projection, mut settings) in
        cameras.iter_mut(&mut main_world)
    {
        if !camera.is_active {
            continue;
        }
        let (_, camera_rotation, camera_translation) =
            camera_transform.to_scale_rotation_translation();
        settings.reset |= native_temporal_camera_history_requires_reset(
            settings.previous_camera_translation,
            settings.previous_camera_rotation,
            settings.previous_camera_projection,
            camera_translation,
            camera_rotation,
            projection.get_clip_from_view().to_cols_array(),
        );
        commands.get_or_spawn(entity).insert((
            settings.clone(),
            NativeTemporalMotionBlurUniform {
                previous_weight: settings.previous_weight,
                reset: u32::from(settings.reset),
            },
        ));
        settings.previous_camera_projection =
            Some(projection.get_clip_from_view().to_cols_array());
        settings.previous_camera_rotation = Some(camera_rotation);
        settings.previous_camera_translation = Some(camera_translation);
        settings.reset = false;
    }
}

fn native_temporal_camera_history_requires_reset(
    previous_translation: Option<Vec3>,
    previous_rotation: Option<Quat>,
    previous_projection: Option<[f32; 16]>,
    current_translation: Vec3,
    current_rotation: Quat,
    current_projection: [f32; 16],
) -> bool {
    let Some(previous_translation) = previous_translation else {
        return true;
    };
    let Some(previous_rotation) = previous_rotation else {
        return true;
    };
    let Some(previous_projection) = previous_projection else {
        return true;
    };
    previous_translation.distance_squared(current_translation) > 0.000001
        || 1.0 - previous_rotation.dot(current_rotation).abs() > 0.000001
        || previous_projection
            .iter()
            .zip(current_projection)
            .any(|(previous, current)| (previous - current).abs() > 0.000001)
}

#[derive(Component)]
struct NativeTemporalMotionBlurHistory {
    initialized: Arc<AtomicBool>,
    read: CachedTexture,
    write: CachedTexture,
}

struct NativeTemporalMotionBlurPersistentHistory {
    format: TextureFormat,
    initialized: Arc<AtomicBool>,
    read: CachedTexture,
    size: UVec2,
    write: CachedTexture,
}

#[derive(Default, Resource)]
struct NativeTemporalMotionBlurHistories(
    HashMap<Entity, NativeTemporalMotionBlurPersistentHistory>,
);

fn prepare_temporal_motion_blur_history(
    mut commands: Commands,
    render_device: Res<RenderDevice>,
    mut histories: ResMut<NativeTemporalMotionBlurHistories>,
    mut views: Query<(
        Entity,
        &ExtractedCamera,
        &ExtractedView,
        &mut NativeTemporalMotionBlurUniform,
    )>,
) {
    let mut active_views = HashSet::new();
    for (entity, camera, view, mut settings) in &mut views {
        let Some(size) = camera.physical_target_size else {
            continue;
        };
        active_views.insert(entity);
        let format = if view.hdr {
            ViewTarget::TEXTURE_FORMAT_HDR
        } else {
            TextureFormat::bevy_default()
        };
        let had_matching_history = histories
            .0
            .get(&entity)
            .is_some_and(|history| history.size == size && history.format == format);
        if !had_matching_history {
            histories.0.insert(
                entity,
                allocate_temporal_motion_blur_history(&render_device, size, format),
            );
        }
        let persistent = histories
            .0
            .get_mut(&entity)
            .expect("temporal motion blur history should be allocated");
        mem::swap(&mut persistent.read, &mut persistent.write);
        let initialized = Arc::clone(&persistent.initialized);
        let reset = temporal_motion_blur_history_requires_reset(
            settings.reset != 0 || !initialized.load(Ordering::Acquire),
            had_matching_history.then_some(size),
            size,
        );
        commands
            .entity(entity)
            .insert(NativeTemporalMotionBlurHistory {
                initialized,
                read: persistent.read.clone(),
                write: persistent.write.clone(),
            });
        settings.reset = u32::from(reset);
    }
    histories
        .0
        .retain(|entity, _| active_views.contains(entity));
}

fn allocate_temporal_motion_blur_history(
    render_device: &RenderDevice,
    size: UVec2,
    format: TextureFormat,
) -> NativeTemporalMotionBlurPersistentHistory {
    let texture = |label| {
        let texture = render_device.create_texture(&TextureDescriptor {
            label: Some(label),
            size: Extent3d {
                width: size.x,
                height: size.y,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let default_view = texture.create_view(&Default::default());
        CachedTexture {
            texture,
            default_view,
        }
    };
    NativeTemporalMotionBlurPersistentHistory {
        format,
        initialized: Arc::new(AtomicBool::new(false)),
        read: texture("native_temporal_motion_blur_history_1"),
        write: texture("native_temporal_motion_blur_history_2"),
        size,
    }
}

fn temporal_motion_blur_history_requires_reset(
    requested_reset: bool,
    previous_size: Option<UVec2>,
    current_size: UVec2,
) -> bool {
    requested_reset || previous_size != Some(current_size)
}

#[derive(Component)]
struct NativeTemporalMotionBlurPipelineId(CachedRenderPipelineId);

fn prepare_temporal_motion_blur_pipelines(
    mut commands: Commands,
    pipeline_cache: Res<PipelineCache>,
    pipeline: Res<NativeTemporalMotionBlurPipeline>,
    mut pipelines: ResMut<SpecializedRenderPipelines<NativeTemporalMotionBlurPipeline>>,
    views: Query<(Entity, &ExtractedView), With<NativeTemporalMotionBlurHistory>>,
) {
    for (entity, view) in &views {
        let id = pipelines.specialize(
            &pipeline_cache,
            &pipeline,
            NativeTemporalMotionBlurPipelineKey { hdr: view.hdr },
        );
        commands
            .entity(entity)
            .insert(NativeTemporalMotionBlurPipelineId(id));
    }
}

#[derive(Resource)]
struct NativeTemporalMotionBlurPipeline {
    layout: BindGroupLayout,
    sampler: Sampler,
}

impl FromWorld for NativeTemporalMotionBlurPipeline {
    fn from_world(world: &mut World) -> Self {
        let render_device = world.resource::<RenderDevice>();
        let layout = render_device.create_bind_group_layout(
            "native_temporal_motion_blur_layout",
            &BindGroupLayoutEntries::sequential(
                ShaderStages::FRAGMENT,
                (
                    texture_2d(TextureSampleType::Float { filterable: true }),
                    texture_2d(TextureSampleType::Float { filterable: true }),
                    sampler(SamplerBindingType::Filtering),
                    bevy::render::render_resource::binding_types::uniform_buffer::<
                        NativeTemporalMotionBlurUniform,
                    >(true),
                ),
            ),
        );
        let sampler = render_device.create_sampler(&SamplerDescriptor {
            label: Some("native_temporal_motion_blur_sampler"),
            mag_filter: FilterMode::Linear,
            min_filter: FilterMode::Linear,
            ..default()
        });
        Self { layout, sampler }
    }
}

#[derive(Clone, Hash, PartialEq, Eq)]
struct NativeTemporalMotionBlurPipelineKey {
    hdr: bool,
}

impl SpecializedRenderPipeline for NativeTemporalMotionBlurPipeline {
    type Key = NativeTemporalMotionBlurPipelineKey;

    fn specialize(&self, key: Self::Key) -> RenderPipelineDescriptor {
        let format = if key.hdr {
            ViewTarget::TEXTURE_FORMAT_HDR
        } else {
            TextureFormat::bevy_default()
        };
        RenderPipelineDescriptor {
            label: Some("native_temporal_motion_blur_pipeline".into()),
            layout: vec![self.layout.clone()],
            vertex: fullscreen_shader_vertex_state(),
            fragment: Some(FragmentState {
                shader: SHADER_HANDLE,
                shader_defs: Vec::new(),
                entry_point: "fragment".into(),
                targets: vec![
                    Some(ColorTargetState {
                        format,
                        blend: None,
                        write_mask: ColorWrites::ALL,
                    }),
                    Some(ColorTargetState {
                        format,
                        blend: None,
                        write_mask: ColorWrites::ALL,
                    }),
                ],
            }),
            primitive: PrimitiveState::default(),
            depth_stencil: None,
            multisample: MultisampleState::default(),
            push_constant_ranges: Vec::new(),
        }
    }
}

#[derive(Default)]
struct NativeTemporalMotionBlurNode;

impl ViewNode for NativeTemporalMotionBlurNode {
    type ViewQuery = (
        &'static ExtractedCamera,
        &'static ViewTarget,
        &'static NativeTemporalMotionBlurHistory,
        &'static NativeTemporalMotionBlurPipelineId,
        &'static DynamicUniformIndex<NativeTemporalMotionBlurUniform>,
    );

    fn run(
        &self,
        _graph: &mut RenderGraphContext,
        render_context: &mut RenderContext,
        (camera, view_target, history, pipeline_id, uniform_index): QueryItem<Self::ViewQuery>,
        world: &World,
    ) -> Result<(), NodeRunError> {
        let pipeline = world.resource::<NativeTemporalMotionBlurPipeline>();
        let pipeline_cache = world.resource::<PipelineCache>();
        let uniforms = world.resource::<ComponentUniforms<NativeTemporalMotionBlurUniform>>();
        let (Some(render_pipeline), Some(uniform_binding)) = (
            pipeline_cache.get_render_pipeline(pipeline_id.0),
            uniforms.uniforms().binding(),
        ) else {
            return Ok(());
        };
        let post_process = view_target.post_process_write();
        let bind_group = render_context.render_device().create_bind_group(
            "native_temporal_motion_blur_bind_group",
            &pipeline.layout,
            &BindGroupEntries::sequential((
                post_process.source,
                &history.read.default_view,
                &pipeline.sampler,
                uniform_binding.clone(),
            )),
        );
        let mut pass = render_context.begin_tracked_render_pass(RenderPassDescriptor {
            label: Some("native_temporal_motion_blur_pass"),
            color_attachments: &[
                Some(RenderPassColorAttachment {
                    view: post_process.destination,
                    resolve_target: None,
                    ops: Operations::default(),
                }),
                Some(RenderPassColorAttachment {
                    view: &history.write.default_view,
                    resolve_target: None,
                    ops: Operations::default(),
                }),
            ],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        pass.set_render_pipeline(render_pipeline);
        pass.set_bind_group(0, &bind_group, &[uniform_index.index()]);
        if let Some(viewport) = camera.viewport.as_ref() {
            pass.set_camera_viewport(viewport);
        }
        pass.draw(0..3, 0..1);
        history.initialized.store(true, Ordering::Release);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temporal_history_weight_matches_web_mapping() {
        assert_eq!(temporal_motion_blur_previous_weight(-1.0), 0.0);
        assert!((temporal_motion_blur_previous_weight(0.5) - 0.15).abs() < 0.001);
        assert_eq!(temporal_motion_blur_previous_weight(2.0), 0.25);
    }

    #[test]
    fn temporal_history_resets_initially_and_after_resize() {
        let size = UVec2::new(1280, 720);
        assert!(temporal_motion_blur_history_requires_reset(
            false, None, size
        ));
        assert!(!temporal_motion_blur_history_requires_reset(
            false,
            Some(size),
            size,
        ));
        assert!(temporal_motion_blur_history_requires_reset(
            false,
            Some(size),
            UVec2::new(800, 600),
        ));
        assert!(temporal_motion_blur_history_requires_reset(
            true,
            Some(size),
            size,
        ));
    }

    #[test]
    fn temporal_history_resets_on_camera_motion_but_not_object_only_motion() {
        let translation = Vec3::new(0.0, 2.0, 8.0);
        let rotation = Quat::IDENTITY;
        let projection = Mat4::IDENTITY.to_cols_array();
        assert!(native_temporal_camera_history_requires_reset(
            None,
            None,
            None,
            translation,
            rotation,
            projection,
        ));
        assert!(!native_temporal_camera_history_requires_reset(
            Some(translation),
            Some(rotation),
            Some(projection),
            translation,
            rotation,
            projection,
        ));
        assert!(native_temporal_camera_history_requires_reset(
            Some(translation),
            Some(rotation),
            Some(projection),
            translation + Vec3::X * 0.01,
            rotation,
            projection,
        ));
        assert!(native_temporal_camera_history_requires_reset(
            Some(translation),
            Some(rotation),
            Some(projection),
            translation,
            Quat::from_rotation_y(0.01),
            projection,
        ));
        let mut changed_projection = projection;
        changed_projection[0] += 0.01;
        assert!(native_temporal_camera_history_requires_reset(
            Some(translation),
            Some(rotation),
            Some(projection),
            translation,
            rotation,
            changed_projection,
        ));
    }
}
