use std::collections::HashMap;

use bevy::{
    animation::graph::AnimationGraph,
    core_pipeline::{
        bloom::{BloomPrefilterSettings, BloomSettings},
        experimental::taa::TemporalAntiAliasBundle,
        fxaa::Fxaa,
        smaa::SmaaSettings,
        tonemapping::Tonemapping,
    },
    gltf::GltfAssetLabel,
    math::primitives::{
        Annulus, Capsule3d, Circle as PrimitiveCircle, Cone, ConicalFrustum, Cuboid, Cylinder,
        Extrusion, Rectangle, RegularPolygon, Sphere, Torus,
    },
    pbr::{FogFalloff, FogSettings, NotShadowCaster, NotShadowReceiver},
    prelude::*,
    render::{
        alpha::AlphaMode,
        camera::{Exposure, ScalingMode},
        mesh::{Indices, MeshVertexAttribute, PrimitiveTopology, VertexAttributeValues},
        render_asset::RenderAssetUsages,
        render_resource::VertexFormat,
        view::ColorGrading,
    },
};
use serde_json::Value;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    AnimationGraphIr, AnimationGraphTransitionIr, AssetIr, AtmosphereProfileIr, ColorIr,
    LoadedBundle, MaterialIr, RuntimeConfigIr, WorldEntity,
};

use crate::assets::texture_uv_transform;
use crate::cameras::{
    NativeRenderLayerMap, active_camera_ids, apply_camera_components, build_render_layer_map,
    camera_order, render_layers_for_names,
};
use crate::render_targets::{
    NativeCustomProjection, NativeRenderTargetRegistry, allocate_render_targets,
    camera_render_target,
};
use crate::rendering::spawn_rendered_particles;

// ThreeNative lights are authored in Three.js-style scalar units. Bevy stores
// physically named units and multiplies lighting by camera Exposure, so the
// native adapter uses neutral camera exposure and keeps non-atmosphere
// directional intensity close to Three's authored scalar.
pub const THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY: f32 = 1.0;
// Environment bundles duplicate authored lights in world.ir.json and atmosphere;
// keep the world directional contribution low so it stacks with atmosphere sun.
const THREE_COMPAT_ENVIRONMENT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY: f32 = 1.7;
const THREE_COMPAT_POINT_LUMENS_PER_CANDELA: f32 = std::f32::consts::TAU * 2.0 * (90.0 / 1.7);
const THREE_COMPAT_DEFAULT_RANGE: f32 = 1_000.0;
const THREE_COMPAT_DEFAULT_CAMERA_EV100: f32 = -0.263_034_4;

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeMaterialPolicy {
    pub blend_mode: Option<String>,
    pub depth_test: Option<bool>,
    pub depth_write: Option<bool>,
    pub extension_preset: Option<String>,
    pub render_order: i32,
    pub specular_texture: Option<String>,
    pub unsupported_blend_diagnostic: Option<String>,
}

#[derive(Resource, Default)]
pub struct NativeMaterialHandles(pub HashMap<String, Handle<StandardMaterial>>);

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeEmissiveBloomPolicy {
    pub enabled: bool,
    pub intensity: f32,
    pub material_id: String,
    pub threshold: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeEmissiveBloomObservation {
    pub contribution: f32,
    pub emissive_intensity: f32,
    pub enabled: bool,
    pub entity_id: String,
    pub exceeds_threshold: bool,
    pub material_id: String,
    pub material_intensity: f32,
    pub threshold: f32,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeAnimationPlayback {
    pub active_state: Option<String>,
    pub asset: String,
    pub clip: String,
    pub loop_: bool,
    pub source_clip: String,
    pub speed: f32,
    pub time_seconds: f32,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeAnimationSceneBinding {
    pub clip: Handle<AnimationClip>,
    pub loop_: bool,
    pub speed: f32,
}

#[derive(Debug, Error)]
pub enum MapError {
    #[error("entity '{entity_id}' references missing mesh '{mesh_id}'")]
    MissingMesh { entity_id: String, mesh_id: String },
    #[error("entity '{entity_id}' references missing material '{material_id}'")]
    MissingMaterial {
        entity_id: String,
        material_id: String,
    },
}

impl MapError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingMesh { .. } => "TN_BEVY_MESH_REFERENCE_MISSING",
            Self::MissingMaterial { .. } => "TN_BEVY_MATERIAL_REFERENCE_MISSING",
        }
    }

    pub fn path(&self) -> String {
        match self {
            Self::MissingMesh { entity_id, .. } => {
                format!("world.ir.json/entities/{entity_id}/components/MeshRenderer/mesh")
            }
            Self::MissingMaterial { entity_id, .. } => {
                format!("world.ir.json/entities/{entity_id}/components/MeshRenderer/material")
            }
        }
    }

    pub fn suggestion(&self) -> String {
        match self {
            Self::MissingMesh { mesh_id, .. } => {
                format!(
                    "Add mesh asset '{mesh_id}' to assets.manifest.json or update the MeshRenderer mesh reference."
                )
            }
            Self::MissingMaterial { material_id, .. } => {
                format!(
                    "Add material '{material_id}' to materials.ir.json or update the MeshRenderer material reference."
                )
            }
        }
    }
}

pub fn map_bundle_into_world(world: &mut World, bundle: &LoadedBundle) -> Result<(), MapError> {
    ensure_asset_resources(world);
    apply_runtime_config(world, bundle.runtime_config.as_ref());
    let camera_atmosphere = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active);
    let camera_color_management = camera_atmosphere.map(|profile| &profile.color_management);
    let bloom_settings = bloom_settings_for_runtime(bundle.runtime_config.as_ref());
    let layer_map = build_render_layer_map(bundle);
    world.insert_resource(layer_map.clone());
    let render_target_registry = allocate_render_targets(world, bundle);
    let active_cameras = active_camera_ids(bundle);
    let active_camera_set = active_cameras
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();
    let fallback_active = active_camera_id(bundle);

    let assets_by_id = bundle
        .assets
        .assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<HashMap<_, _>>();
    let materials_by_id = bundle
        .materials
        .materials
        .iter()
        .map(|material| (material.id.as_str(), material))
        .collect::<HashMap<_, _>>();
    let mut material_handles = NativeMaterialHandles::default();
    world.insert_resource(crate::assets::build_texture_controls_registry(
        &bundle.assets,
    ));

    let mut entities_by_id = HashMap::new();
    for entity in &bundle.world.entities {
        let bevy_entity = spawn_entity(
            world,
            entity,
            &assets_by_id,
            &materials_by_id,
            &layer_map,
            &active_camera_set,
            fallback_active.as_deref(),
            camera_color_management,
            camera_atmosphere,
            bloom_settings.as_ref(),
            bundle.runtime_config.as_ref(),
            &render_target_registry,
            &mut material_handles,
        )?;
        entities_by_id.insert(entity.id.as_str(), bevy_entity);
    }
    world.insert_resource(material_handles);

    for entity in &bundle.world.entities {
        let Some(parent_id) = entity
            .components
            .hierarchy
            .as_ref()
            .and_then(|hierarchy| hierarchy.parent.as_deref())
        else {
            continue;
        };
        if let (Some(child), Some(parent)) = (
            entities_by_id.get(entity.id.as_str()),
            entities_by_id.get(parent_id),
        ) {
            world.entity_mut(*parent).push_children(&[*child]);
        }
    }
    spawn_rendered_particles(world, bundle, 1.0);

    Ok(())
}

fn apply_runtime_config(world: &mut World, config: Option<&RuntimeConfigIr>) {
    let msaa = match config
        .and_then(|config| config.renderer.as_ref())
        .map(|renderer| renderer.antialias.as_str())
    {
        Some("none") => Msaa::Off,
        Some("msaa2") => Msaa::Sample2,
        Some("msaa8") => Msaa::Sample8,
        Some("fxaa" | "taa" | "smaa") => Msaa::Off,
        _ => Msaa::Sample4,
    };
    world.insert_resource(msaa);
}

fn insert_camera_antialias(spawned: &mut EntityWorldMut, config: Option<&RuntimeConfigIr>) {
    let Some(mode) = config
        .and_then(|config| config.renderer.as_ref())
        .map(|renderer| renderer.antialias.as_str())
    else {
        return;
    };
    match mode {
        "fxaa" => {
            spawned.insert(Fxaa::default());
        }
        "taa" => {
            spawned.insert(TemporalAntiAliasBundle::default());
        }
        "smaa" => {
            spawned.insert(SmaaSettings::default());
        }
        _ => {}
    }
}

fn bloom_settings_for_runtime(config: Option<&RuntimeConfigIr>) -> Option<BloomSettings> {
    let bloom = config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.bloom.as_ref())?;
    if !bloom.enabled {
        return None;
    }
    Some(BloomSettings {
        intensity: bloom.intensity,
        prefilter_settings: BloomPrefilterSettings {
            threshold: bloom.threshold,
            ..Default::default()
        },
        ..Default::default()
    })
}

fn active_camera_id(bundle: &LoadedBundle) -> Option<String> {
    bundle
        .world
        .resources
        .get("ActiveCamera")
        .and_then(|value| value.get("entity"))
        .and_then(|value| value.as_str())
        .map(str::to_owned)
}

pub fn advance_native_animation_playback(world: &mut World, fixed_delta: f32) {
    let mut query = world.query::<&mut NativeAnimationPlayback>();
    for mut playback in query.iter_mut(world) {
        playback.time_seconds += fixed_delta * playback.speed;
    }
}

pub fn trace_native_emissive_bloom(world: &mut World) -> Vec<NativeEmissiveBloomObservation> {
    let entries = {
        let mut query = world.query::<(
            &ThreeNativeId,
            &Handle<StandardMaterial>,
            &NativeEmissiveBloomPolicy,
        )>();
        query
            .iter(world)
            .map(|(id, handle, policy)| (id.0.clone(), handle.clone(), policy.clone()))
            .collect::<Vec<_>>()
    };
    let Some(materials) = world.get_resource::<Assets<StandardMaterial>>() else {
        return Vec::new();
    };
    let mut observations = entries
        .into_iter()
        .filter_map(|(entity_id, handle, policy)| {
            let material = materials.get(&handle)?;
            let luminance = emissive_luminance(material);
            let contribution = if policy.enabled {
                luminance * policy.intensity
            } else {
                0.0
            };
            Some(NativeEmissiveBloomObservation {
                contribution: round_trace_value(contribution),
                emissive_intensity: round_trace_value(luminance),
                enabled: policy.enabled,
                entity_id,
                exceeds_threshold: contribution >= policy.threshold,
                material_id: policy.material_id.clone(),
                material_intensity: policy.intensity,
                threshold: policy.threshold,
            })
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.entity_id.cmp(&right.entity_id));
    observations
}

fn ensure_asset_resources(world: &mut World) {
    if !world.contains_resource::<Assets<Mesh>>() {
        world.init_resource::<Assets<Mesh>>();
    }
    if !world.contains_resource::<Assets<Image>>() {
        world.init_resource::<Assets<Image>>();
    }
    if !world.contains_resource::<Assets<StandardMaterial>>() {
        world.init_resource::<Assets<StandardMaterial>>();
    }
    if !world.contains_resource::<Assets<AnimationGraph>>() {
        world.init_resource::<Assets<AnimationGraph>>();
    }
}

fn spawn_entity(
    world: &mut World,
    entity: &WorldEntity,
    assets_by_id: &HashMap<&str, &AssetIr>,
    materials_by_id: &HashMap<&str, &MaterialIr>,
    layer_map: &NativeRenderLayerMap,
    active_cameras: &std::collections::HashSet<&str>,
    fallback_active_camera: Option<&str>,
    camera_color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
    camera_atmosphere: Option<&AtmosphereProfileIr>,
    bloom_settings: Option<&BloomSettings>,
    runtime_config: Option<&RuntimeConfigIr>,
    render_target_registry: &NativeRenderTargetRegistry,
    material_handles: &mut NativeMaterialHandles,
) -> Result<Entity, MapError> {
    let transform = map_transform(entity);
    let name = Name::new(entity.id.clone());
    let stable_id = ThreeNativeId(entity.id.clone());

    if let Some(renderer) = &entity.components.mesh_renderer {
        let asset =
            assets_by_id
                .get(renderer.mesh.as_str())
                .ok_or_else(|| MapError::MissingMesh {
                    entity_id: entity.id.clone(),
                    mesh_id: renderer.mesh.clone(),
                })?;
        let material = materials_by_id
            .get(renderer.material.as_str())
            .ok_or_else(|| MapError::MissingMaterial {
                entity_id: entity.id.clone(),
                material_id: renderer.material.clone(),
            })?;
        let asset_server = world.get_resource::<AssetServer>().cloned();
        if let Some(scene_path) = model_scene_path(asset) {
            if let Some(asset_server) = asset_server.as_ref() {
                let scene =
                    asset_server.load(GltfAssetLabel::Scene(0).from_asset(scene_path.clone()));
                let playback = animation_playback(asset);
                let scene_binding = playback.as_ref().and_then(|playback| {
                    world.contains_resource::<Assets<AnimationClip>>().then(|| {
                        NativeAnimationSceneBinding {
                            clip: asset_server.load(
                                GltfAssetLabel::Animation(animation_clip_index(asset, playback))
                                    .from_asset(scene_path.clone()),
                            ),
                            loop_: playback.loop_,
                            speed: playback.speed,
                        }
                    })
                });
                let mut spawned = world.spawn(SceneBundle {
                    scene,
                    transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                });
                spawned.insert((stable_id, name));
                insert_shadow_markers(&mut spawned, renderer);
                if let Some(layers) = entity.components.render_layers.as_ref() {
                    spawned.insert(render_layers_for_names(layer_map, &layers.layers));
                }
                if let Some(binding) = scene_binding {
                    spawned.insert(binding);
                }
                if let Some(playback) = playback {
                    spawned.insert(playback);
                }
                return Ok(spawned.id());
            }
        }
        let mesh = add_mesh(world, asset);
        let policy = material_policy(material);
        let material_handle = add_material(
            world,
            material,
            assets_by_id,
            asset_server.as_ref(),
            render_target_registry,
        );
        material_handles
            .0
            .entry(material.id.clone())
            .or_insert_with(|| material_handle.clone());
        let mut spawned = world.spawn(PbrBundle {
            mesh,
            material: material_handle,
            transform,
            visibility: map_visibility(entity),
            ..Default::default()
        });
        spawned.insert((stable_id, name));
        spawned.insert(policy);
        if let Some(policy) = emissive_bloom_policy(material) {
            spawned.insert(policy);
        }
        insert_shadow_markers(&mut spawned, renderer);
        if let Some(layers) = entity.components.render_layers.as_ref() {
            spawned.insert(render_layers_for_names(layer_map, &layers.layers));
        }
        if let Some(playback) = animation_playback(asset) {
            spawned.insert(playback);
        }
        return Ok(spawned.id());
    }

    if let Some(camera) = &entity.components.camera {
        let projection = if camera.kind == "orthographic" {
            Projection::Orthographic(OrthographicProjection {
                far: camera.far,
                near: camera.near,
                scaling_mode: ScalingMode::FixedVertical(camera.size.unwrap_or(1.0)),
                ..Default::default()
            })
        } else {
            Projection::Perspective(PerspectiveProjection {
                fov: camera.fov_y.unwrap_or(60.0).to_radians(),
                near: camera.near,
                far: camera.far,
                ..Default::default()
            })
        };
        let mut spawned = world.spawn(Camera3dBundle {
            color_grading: color_grading_for_profile(camera_color_management),
            exposure: exposure_for_profile(camera_color_management),
            projection,
            tonemapping: tonemapping_for_profile(camera_color_management),
            transform,
            ..Default::default()
        });
        if let Some(fog) = fog_settings_for_profile(camera_atmosphere) {
            spawned.insert(fog);
        }
        let is_active = if active_cameras.is_empty() {
            fallback_active_camera.map_or(true, |id| id == entity.id)
        } else {
            active_cameras.contains(entity.id.as_str())
        };
        apply_camera_components(
            camera,
            &mut spawned,
            layer_map,
            camera_order(camera),
            is_active,
            UVec2::new(1280, 720),
            camera_render_target(camera, render_target_registry),
        );
        if let Some(mut camera_component) = spawned.get_mut::<Camera>() {
            camera_component.hdr = camera_color_management.is_some();
        }
        if let Some(projection) = camera.projection.as_ref() {
            if projection.kind == "matrix" {
                if let Some(matrix) = projection.matrix.as_ref() {
                    if matrix.len() == 16 {
                        let values: [f32; 16] = matrix.clone().try_into().unwrap_or([0.0; 16]);
                        spawned.insert(NativeCustomProjection(values));
                    }
                }
            }
        }
        spawned.insert((stable_id, name, map_visibility(entity)));
        if let Some(bloom_settings) = bloom_settings {
            spawned.insert(bloom_settings.clone());
        }
        insert_camera_antialias(&mut spawned, runtime_config);
        return Ok(spawned.id());
    }

    if let Some(light) = &entity.components.light {
        if camera_atmosphere.is_some() && matches!(light.kind.as_str(), "ambient" | "directional") {
            return Ok(world
                .spawn(SpatialBundle {
                    transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "directional" {
            let mut light_transform = transform;
            light_transform.look_at(Vec3::ZERO, Vec3::Y);
            return Ok(world
                .spawn(DirectionalLightBundle {
                    directional_light: DirectionalLight {
                        color: color_to_bevy(&light.color),
                        illuminance: directional_illuminance(
                            light.intensity,
                            camera_color_management,
                            camera_atmosphere,
                        ),
                        shadow_depth_bias: light
                            .shadow_bias
                            .unwrap_or(DirectionalLight::DEFAULT_SHADOW_DEPTH_BIAS),
                        shadow_normal_bias: light
                            .shadow_normal_bias
                            .unwrap_or(DirectionalLight::DEFAULT_SHADOW_NORMAL_BIAS),
                        shadows_enabled: false,
                        ..Default::default()
                    },
                    transform: light_transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "point" {
            return Ok(world
                .spawn(PointLightBundle {
                    point_light: PointLight {
                        color: color_to_bevy(&light.color),
                        intensity: point_lumens(light.intensity, camera_color_management),
                        range: light.range.unwrap_or(THREE_COMPAT_DEFAULT_RANGE),
                        shadow_depth_bias: light
                            .shadow_bias
                            .unwrap_or(PointLight::DEFAULT_SHADOW_DEPTH_BIAS),
                        shadow_normal_bias: light
                            .shadow_normal_bias
                            .unwrap_or(PointLight::DEFAULT_SHADOW_NORMAL_BIAS),
                        ..Default::default()
                    },
                    transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "spot" {
            return Ok(world
                .spawn(SpotLightBundle {
                    spot_light: SpotLight {
                        color: color_to_bevy(&light.color),
                        intensity: point_lumens(light.intensity, camera_color_management),
                        outer_angle: light.angle.unwrap_or(std::f32::consts::FRAC_PI_4),
                        range: light.range.unwrap_or(THREE_COMPAT_DEFAULT_RANGE),
                        shadow_depth_bias: light
                            .shadow_bias
                            .unwrap_or(SpotLight::DEFAULT_SHADOW_DEPTH_BIAS),
                        shadow_normal_bias: light
                            .shadow_normal_bias
                            .unwrap_or(SpotLight::DEFAULT_SHADOW_NORMAL_BIAS),
                        ..Default::default()
                    },
                    transform,
                    visibility: map_visibility(entity),
                    ..Default::default()
                })
                .insert((stable_id, name))
                .id());
        }
        if light.kind == "ambient" {
            world.insert_resource(AmbientLight {
                color: color_to_bevy(&light.color),
                brightness: light.intensity,
            });
        }
    }

    Ok(world
        .spawn(SpatialBundle {
            transform,
            visibility: map_visibility(entity),
            ..Default::default()
        })
        .insert((stable_id, name))
        .id())
}

fn insert_shadow_markers(
    spawned: &mut EntityWorldMut<'_>,
    renderer: &threenative_loader::MeshRendererComponent,
) {
    if renderer.cast_shadow != Some(true) {
        spawned.insert(NotShadowCaster);
    }
    if renderer.receive_shadow != Some(true) {
        spawned.insert(NotShadowReceiver);
    }
}

fn model_scene_path(asset: &AssetIr) -> Option<String> {
    if asset.kind != "model" || !matches!(asset.format.as_str(), "gltf" | "glb") {
        return None;
    }
    asset.path.clone()
}

pub fn bind_native_animation_players(
    mut commands: Commands,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    bindings: Query<&NativeAnimationSceneBinding>,
    parents: Query<&Parent>,
    mut players: Query<(Entity, &mut AnimationPlayer), Added<AnimationPlayer>>,
) {
    for (entity, mut player) in &mut players {
        let Some(binding) = ancestor_animation_binding(entity, &parents, &bindings) else {
            continue;
        };
        let (graph, animation) = AnimationGraph::from_clip(binding.clip.clone());
        let active = player.play(animation);
        active.set_speed(binding.speed);
        if binding.loop_ {
            active.repeat();
        }
        commands.entity(entity).insert(graphs.add(graph));
    }
}

fn ancestor_animation_binding<'a>(
    entity: Entity,
    parents: &Query<&Parent>,
    bindings: &'a Query<&NativeAnimationSceneBinding>,
) -> Option<&'a NativeAnimationSceneBinding> {
    let mut current = entity;
    loop {
        if let Ok(binding) = bindings.get(current) {
            return Some(binding);
        }
        let Ok(parent) = parents.get(current) else {
            return None;
        };
        current = parent.get();
    }
}

fn color_grading_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> ColorGrading {
    let mut grading = ColorGrading::default();
    if color_management.is_some() {
        grading.global.exposure = 0.0;
    }
    grading
}

fn fog_settings_for_profile(profile: Option<&AtmosphereProfileIr>) -> Option<FogSettings> {
    let fog = profile?.fog.as_ref().filter(|fog| fog.enabled)?;
    let falloff = match fog.mode.as_str() {
        "linear" => {
            let start = fog.near.unwrap_or(0.0).max(0.0);
            FogFalloff::Linear {
                start,
                end: fog.far.unwrap_or(1_000.0).max(start + 0.001),
            }
        }
        // Three.js `FogExp2` uses squared exponential falloff; match Bevy's
        // `FogFalloff::ExponentialSquared`, not linear `Exponential`.
        "exponential" => FogFalloff::ExponentialSquared {
            density: fog.density.unwrap_or(0.0).max(0.0),
        },
        _ => return None,
    };
    Some(FogSettings {
        color: color_to_bevy(&fog.color),
        falloff,
        ..Default::default()
    })
}

fn exposure_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> Exposure {
    let Some(color_management) = color_management else {
        return Exposure {
            ev100: THREE_COMPAT_DEFAULT_CAMERA_EV100,
        };
    };
    let exposure = color_management.exposure.max(0.001);
    Exposure {
        ev100: -(1.2 * exposure).log2(),
    }
}

fn tonemapping_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> Tonemapping {
    match color_management.map(|profile| profile.tone_mapping.as_str()) {
        Some("aces") => Tonemapping::AcesFitted,
        Some("none") => Tonemapping::None,
        None => Tonemapping::None,
        _ => Tonemapping::default(),
    }
}

fn camera_exposure_value(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> f32 {
    color_management
        .map(|profile| profile.exposure)
        .unwrap_or(1.0)
        .max(0.001)
}

fn directional_illuminance(
    intensity: f32,
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
    atmosphere: Option<&AtmosphereProfileIr>,
) -> f32 {
    intensity / camera_exposure_value(color_management)
        * directional_illuminance_per_intensity(atmosphere)
}

fn directional_illuminance_per_intensity(atmosphere: Option<&AtmosphereProfileIr>) -> f32 {
    if atmosphere.is_some_and(|profile| profile.active) {
        THREE_COMPAT_ENVIRONMENT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY
    } else {
        THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY
    }
}

fn point_lumens(
    intensity: f32,
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> f32 {
    intensity / camera_exposure_value(color_management) * THREE_COMPAT_POINT_LUMENS_PER_CANDELA
}

fn add_mesh(world: &mut World, asset: &AssetIr) -> Handle<Mesh> {
    let mesh = match asset.primitive.as_deref() {
        Some("custom") => custom_mesh(asset),
        Some("sphere") => Mesh::from(Sphere {
            radius: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
        }),
        Some("cylinder") => Mesh::from(Cylinder::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("capsule") => Mesh::from(Capsule3d::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("cone") => Mesh::from(Cone {
            radius: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            height: asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        }),
        Some("conicalFrustum") => Mesh::from(ConicalFrustum {
            radius_top: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.25),
            radius_bottom: asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(0.5),
            height: asset
                .size
                .as_ref()
                .and_then(|size| size.get(2))
                .copied()
                .unwrap_or(1.0),
        }),
        Some("torus") => Mesh::from(Torus::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("circle") => Mesh::from(PrimitiveCircle::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
        )),
        Some("annulus") => Mesh::from(Annulus::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("regularPolygon") => Mesh::from(RegularPolygon::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(6.0) as usize,
        )),
        Some("extrudedRectangle") => {
            let width = asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(1.0);
            let height = asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0);
            let depth = asset
                .size
                .as_ref()
                .and_then(|size| size.get(2))
                .copied()
                .unwrap_or(1.0);
            Mesh::from(Extrusion::new(Rectangle::new(width, height), depth))
        }
        Some("plane") => {
            let width = asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(1.0);
            let height = asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0);
            Mesh::from(Rectangle::new(width, height))
        }
        _ => {
            let size = asset.size.as_deref().unwrap_or(&[1.0, 1.0, 1.0]);
            Mesh::from(Cuboid::new(
                size.first().copied().unwrap_or(1.0),
                size.get(1).copied().unwrap_or(1.0),
                size.get(2).copied().unwrap_or(1.0),
            ))
        }
    };
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn animation_playback(asset: &AssetIr) -> Option<NativeAnimationPlayback> {
    if asset.kind != "model" {
        return None;
    }
    let animations = asset.animations.as_deref()?;
    let clip_id = active_animation_clip_id(asset.animation_graph.as_ref(), animations)?;
    let clip = animations
        .iter()
        .find(|candidate| candidate.id == clip_id)
        .or_else(|| animations.first())?;
    Some(NativeAnimationPlayback {
        active_state: active_animation_state(asset.animation_graph.as_ref()),
        asset: asset.id.clone(),
        clip: clip.id.clone(),
        loop_: clip.loop_.unwrap_or(true),
        source_clip: clip.source_clip.clone().unwrap_or_else(|| clip.id.clone()),
        speed: clip.speed.unwrap_or(1.0),
        time_seconds: 0.0,
    })
}

fn animation_clip_index(asset: &AssetIr, playback: &NativeAnimationPlayback) -> usize {
    asset
        .animations
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .position(|clip| {
            clip.source_clip.as_deref().unwrap_or(clip.id.as_str()) == playback.source_clip
                || clip.id == playback.clip
        })
        .unwrap_or(0)
}

fn active_animation_clip_id(
    graph: Option<&AnimationGraphIr>,
    animations: &[threenative_loader::AnimationClipIr],
) -> Option<String> {
    let Some(graph) = graph else {
        return animations.first().map(|clip| clip.id.clone());
    };
    let active_state = active_animation_state(Some(graph))?;
    graph
        .states
        .iter()
        .find(|state| state.id == active_state)
        .map(|state| state.clip.clone())
        .or_else(|| animations.first().map(|clip| clip.id.clone()))
}

fn active_animation_state(graph: Option<&AnimationGraphIr>) -> Option<String> {
    let graph = graph?;
    let transition = graph
        .transitions
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|transition| {
            transition.from == graph.initial_state && animation_condition_matches(transition, graph)
        });
    Some(
        transition.map_or(graph.initial_state.clone(), |transition| {
            transition.to.clone()
        }),
    )
}

fn animation_condition_matches(
    transition: &AnimationGraphTransitionIr,
    graph: &AnimationGraphIr,
) -> bool {
    let value = graph
        .parameters
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|parameter| parameter.id == transition.when.parameter)
        .and_then(|parameter| parameter.default.clone())
        .unwrap_or_else(|| Value::from(false));
    if transition
        .when
        .equals
        .as_ref()
        .is_some_and(|expected| expected != &value)
    {
        return false;
    }
    if transition.when.greater_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual <= threshold as f64)
    }) {
        return false;
    }
    if transition.when.less_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual >= threshold as f64)
    }) {
        return false;
    }
    true
}

fn custom_mesh(asset: &AssetIr) -> Mesh {
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    for attribute in asset.attributes.as_deref().unwrap_or(&[]) {
        match attribute.name.as_str() {
            "position" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_POSITION,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "normal" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_NORMAL,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "uv" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_UV_0,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "uv1" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_UV_1,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "color" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_COLOR,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            name => {
                let item_size = attribute.item_size;
                let leaked_name = Box::leak(
                    format!("Vertex_{}", name.replace("custom:", "Custom_")).into_boxed_str(),
                );
                mesh.insert_attribute(
                    MeshVertexAttribute::new(
                        leaked_name,
                        custom_attribute_id(name),
                        vertex_format(item_size),
                    ),
                    attribute_values(item_size, &attribute.values),
                );
            }
        }
    }
    if let Some(indices) = asset.indices.as_ref() {
        mesh.insert_indices(Indices::U32(indices.clone()));
    }
    mesh
}

fn attribute_values(item_size: usize, values: &[f32]) -> VertexAttributeValues {
    match item_size {
        1 => VertexAttributeValues::Float32(values.to_vec()),
        2 => VertexAttributeValues::Float32x2(
            values
                .chunks_exact(2)
                .map(|chunk| [chunk[0], chunk[1]])
                .collect(),
        ),
        3 => VertexAttributeValues::Float32x3(
            values
                .chunks_exact(3)
                .map(|chunk| [chunk[0], chunk[1], chunk[2]])
                .collect(),
        ),
        _ => VertexAttributeValues::Float32x4(
            values
                .chunks_exact(4)
                .map(|chunk| [chunk[0], chunk[1], chunk[2], chunk[3]])
                .collect(),
        ),
    }
}

fn vertex_format(item_size: usize) -> VertexFormat {
    match item_size {
        1 => VertexFormat::Float32,
        2 => VertexFormat::Float32x2,
        3 => VertexFormat::Float32x3,
        _ => VertexFormat::Float32x4,
    }
}

fn custom_attribute_id(name: &str) -> usize {
    name.as_bytes().iter().fold(100_000usize, |hash, byte| {
        hash.wrapping_mul(16_777_619) ^ (*byte as usize)
    })
}

fn map_visibility(entity: &WorldEntity) -> Visibility {
    if entity
        .components
        .visibility
        .as_ref()
        .is_some_and(|visibility| !visibility.visible)
        || entity
            .components
            .mesh_renderer
            .as_ref()
            .and_then(|renderer| renderer.visible)
            .is_some_and(|visible| !visible)
    {
        Visibility::Hidden
    } else {
        Visibility::Inherited
    }
}

fn add_material(
    world: &mut World,
    material: &MaterialIr,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    render_target_registry: &NativeRenderTargetRegistry,
) -> Handle<StandardMaterial> {
    let unlit_color_display = uses_unlit_emissive_display(material);
    let base_texture_asset = material
        .base_color_texture
        .as_deref()
        .and_then(|asset_id| assets_by_id.get(asset_id).copied());
    let uv_transform = base_texture_asset
        .map(texture_uv_transform)
        .unwrap_or_default();
    let extended = material.kind == "extended";
    let mut standard = StandardMaterial {
        alpha_mode: alpha_mode(material),
        base_color: color_with_opacity(&material.color, opacity_for_material(material)),
        base_color_texture: texture_handle(
            material.base_color_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        clearcoat: material.clearcoat.unwrap_or(0.0),
        clearcoat_perceptual_roughness: material.clearcoat_roughness.unwrap_or(0.0),
        clearcoat_roughness_texture: texture_handle(
            material.clearcoat_roughness_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        clearcoat_texture: texture_handle(
            material.clearcoat_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        double_sided: material
            .extension
            .as_ref()
            .and_then(|extension| extension.double_sided)
            .unwrap_or(false),
        emissive: if unlit_color_display {
            LinearRgba::BLACK
        } else {
            emissive_color(material)
        },
        emissive_texture: texture_handle(
            material.emissive_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        metallic: material.metalness.unwrap_or(0.0),
        metallic_roughness_texture: texture_handle(
            material.metallic_roughness_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        normal_map_texture: texture_handle(
            material.normal_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        occlusion_texture: texture_handle(
            material.occlusion_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        perceptual_roughness: material.roughness.unwrap_or(1.0),
        reflectance: material.specular_intensity.unwrap_or(0.5),
        specular_transmission: material.transmission.unwrap_or(0.0),
        specular_transmission_texture: texture_handle(
            material.transmission_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        unlit: extended || unlit_color_display,
        uv_transform,
        ..Default::default()
    };
    if extended {
        standard.metallic = 0.0;
        standard.perceptual_roughness = 1.0;
        standard.reflectance = 0.0;
    }
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(standard)
}

fn material_policy(material: &MaterialIr) -> NativeMaterialPolicy {
    let unsupported_blend_diagnostic = match material.blend_mode.as_deref() {
        Some("normal") | None => None,
        Some(mode) => Some(format!(
            "TN_BEVY_MATERIAL_BLEND_MODE_UNSUPPORTED: Bevy 0.14 cannot map blendMode '{mode}' with matching semantics."
        )),
    };
    NativeMaterialPolicy {
        blend_mode: material.blend_mode.clone(),
        depth_test: material.depth_test,
        depth_write: material.depth_write,
        extension_preset: material
            .extension
            .as_ref()
            .map(|extension| extension.preset.clone()),
        render_order: material.render_order.unwrap_or(0),
        specular_texture: material.specular_texture.clone(),
        unsupported_blend_diagnostic,
    }
}

fn emissive_bloom_policy(material: &MaterialIr) -> Option<NativeEmissiveBloomPolicy> {
    let bloom = material.emissive_bloom.as_ref()?;
    Some(NativeEmissiveBloomPolicy {
        enabled: bloom.enabled,
        intensity: bloom.intensity,
        material_id: material.id.clone(),
        threshold: bloom.threshold,
    })
}

fn alpha_mode(material: &MaterialIr) -> AlphaMode {
    match material.alpha_mode.as_deref() {
        Some("mask") => AlphaMode::Mask(material.alpha_cutoff.unwrap_or(0.5)),
        Some("blend") => AlphaMode::Blend,
        _ => AlphaMode::Opaque,
    }
}

fn opacity_for_material(material: &MaterialIr) -> f32 {
    let opacity = material.opacity.unwrap_or(1.0);
    if material.kind == "extended" && material.alpha_mode.as_deref() == Some("blend") {
        return opacity.powf(1.9);
    }
    opacity
}

fn emissive_color(material: &MaterialIr) -> LinearRgba {
    let Some(color) = material.emissive.as_ref() else {
        return LinearRgba::BLACK;
    };
    let linear = color_to_bevy(color).to_linear();
    linear * material.emissive_intensity.unwrap_or(1.0)
}

fn uses_unlit_emissive_display(material: &MaterialIr) -> bool {
    material.emissive.is_some()
        && material.emissive_bloom.is_none()
        && material.metalness.unwrap_or(0.0) <= 0.0
        && material.roughness.unwrap_or(1.0) >= 0.99
}

fn texture_handle(
    asset_id: Option<&str>,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    render_target_registry: &NativeRenderTargetRegistry,
) -> Option<Handle<Image>> {
    let asset_id = asset_id?;
    if let Some(handle) = render_target_registry.images.get(asset_id) {
        return Some(handle.clone());
    }
    let asset = assets_by_id.get(asset_id)?;
    if asset.kind != "texture" {
        return None;
    }
    let path = asset.path.as_ref()?;
    Some(
        asset_server
            .map(|server| server.load(path.clone()))
            .unwrap_or_default(),
    )
}

fn map_transform(entity: &WorldEntity) -> Transform {
    let mut transform = Transform::default();
    if let Some(source) = &entity.components.transform {
        if let Some(position) = source.position {
            transform.translation = Vec3::new(position[0], position[1], position[2]);
        }
        if let Some(rotation) = source.rotation {
            transform.rotation =
                Quat::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
        }
        if let Some(scale) = source.scale {
            transform.scale = Vec3::new(scale[0], scale[1], scale[2]);
        }
    }
    transform
}

fn color_to_bevy(color: &ColorIr) -> Color {
    match color {
        ColorIr::Hex(hex) => {
            let trimmed = hex.trim_start_matches('#');
            if trimmed.len() != 6 {
                return Color::WHITE;
            }
            let Ok(value) = u32::from_str_radix(trimmed, 16) else {
                return Color::WHITE;
            };
            let red = ((value >> 16) & 0xff) as f32 / 255.0;
            let green = ((value >> 8) & 0xff) as f32 / 255.0;
            let blue = (value & 0xff) as f32 / 255.0;
            Color::srgb(red, green, blue)
        }
        ColorIr::Rgb(rgb) => Color::srgb(rgb[0], rgb[1], rgb[2]),
    }
}

fn color_with_opacity(color: &ColorIr, opacity: f32) -> Color {
    let srgba = color_to_bevy(color).to_srgba();
    Color::srgba(srgba.red, srgba.green, srgba.blue, opacity)
}

fn emissive_luminance(material: &StandardMaterial) -> f32 {
    let color = material.emissive;
    color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722
}

fn round_trace_value(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
