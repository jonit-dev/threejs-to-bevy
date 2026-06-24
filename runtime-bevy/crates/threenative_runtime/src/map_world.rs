use std::{collections::HashMap, fs, path::Path};

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

use crate::assets::{load_texture_asset, texture_uv_transform};
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
pub const THREE_COMPAT_AMBIENT_BRIGHTNESS_PER_INTENSITY: f32 = 0.7;
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
    ensure_ambient_light_contract(world, bundle, camera_atmosphere);
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
            &bundle.bundle_path,
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

fn ensure_ambient_light_contract(
    world: &mut World,
    bundle: &LoadedBundle,
    camera_atmosphere: Option<&AtmosphereProfileIr>,
) {
    if camera_atmosphere.is_some() {
        return;
    }
    let has_authored_ambient = bundle.world.entities.iter().any(|entity| {
        entity
            .components
            .light
            .as_ref()
            .is_some_and(|light| light.kind == "ambient")
    });
    if !has_authored_ambient {
        world.insert_resource(AmbientLight {
            color: Color::WHITE,
            brightness: 0.0,
        });
    }
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
    if !world.contains_resource::<Assets<Scene>>() {
        world.init_resource::<Assets<Scene>>();
    }
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeRippleWaterMotion {
    pub base: Transform,
    pub speed: f32,
    pub strength: f32,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeGrassWindMotion {
    pub base: Transform,
    pub phase: f32,
    pub strength: f32,
}

pub fn animate_native_stylized_motion(
    time: Res<Time>,
    mut grass_query: Query<
        (&NativeGrassWindMotion, &mut Transform),
        Without<NativeRippleWaterMotion>,
    >,
    mut water_query: Query<(&NativeRippleWaterMotion, &mut Transform)>,
) {
    let elapsed = time.elapsed_seconds();
    for (motion, mut transform) in &mut grass_query {
        let gust = (elapsed * 2.4 + motion.phase).sin() * 0.12
            + (elapsed * 4.1 + motion.phase * 0.37).sin() * 0.04;
        let mut next = motion.base;
        next.rotation = motion.base.rotation * Quat::from_rotation_z(gust * motion.strength);
        *transform = next;
    }
    for (motion, mut transform) in &mut water_query {
        let wave = (elapsed * motion.speed * 2.8).sin() * motion.strength * 0.08;
        let mut next = motion.base;
        next.translation.y += wave;
        next.scale.x *= 1.0 + wave * 0.08;
        next.scale.z *= 1.0 - wave * 0.05;
        *transform = next;
    }
}

fn spawn_stylized_nature(
    world: &mut World,
    entity_id: &str,
    component: &serde_json::Value,
    assets_by_id: &HashMap<&str, &AssetIr>,
    transform: Transform,
    stable_id: ThreeNativeId,
    name: Name,
    bundle_path: &Path,
) -> Entity {
    let size = json_f32(component, "size", 34.0).max(0.1);
    let grass_count = json_usize(component, "grassCount", 4200);
    let tree_count = json_usize(component, "treeCount", 7);
    let path_width = json_f32(component, "pathWidth", 3.0).max(0.1);
    let wind_strength = json_f32(component, "windStrength", 0.35).max(0.0);
    let bark_color = json_color(component, "barkColor", "#684329");
    let leaf_color = json_color(component, "leafColor", "#4d973c");

    let asset_server = world.get_resource::<AssetServer>().cloned();
    let terrain_material = add_stylized_surface_material(
        world,
        Color::WHITE,
        0.88,
        false,
        stylized_texture_handle(
            component,
            "grassColorMap",
            assets_by_id,
            asset_server.as_ref(),
        ),
        stylized_texture_handle(
            component,
            "grassNormalMap",
            assets_by_id,
            asset_server.as_ref(),
        ),
    );
    let path_crack_material =
        world
            .resource_mut::<Assets<StandardMaterial>>()
            .add(StandardMaterial {
                base_color: Color::srgb(0.27, 0.16, 0.11),
                perceptual_roughness: 1.0,
                ..Default::default()
            });
    let path_pebble_material =
        world
            .resource_mut::<Assets<StandardMaterial>>()
            .add(StandardMaterial {
                base_color: Color::srgb(0.76, 0.49, 0.31),
                perceptual_roughness: 1.0,
                ..Default::default()
            });

    let grass_material = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::srgb(0.45, 0.68, 0.31),
            base_color_texture: stylized_texture_handle(
                component,
                "grassColorMap",
                assets_by_id,
                asset_server.as_ref(),
            ),
            normal_map_texture: stylized_texture_handle(
                component,
                "grassNormalMap",
                assets_by_id,
                asset_server.as_ref(),
            ),
            double_sided: true,
            perceptual_roughness: 0.74,
            ..Default::default()
        });
    let source_path_material = add_stylized_surface_material(
        world,
        Color::WHITE,
        0.9,
        false,
        stylized_texture_handle(
            component,
            "dirtColorMap",
            assets_by_id,
            asset_server.as_ref(),
        ),
        stylized_texture_handle(
            component,
            "dirtNormalMap",
            assets_by_id,
            asset_server.as_ref(),
        ),
    );
    let bark_material = add_stylized_tree_material(world, bark_color, false);
    let leaf_material = add_stylized_tree_material(world, leaf_color, true);
    let source_trunk_scene = stylized_component_scene(
        component,
        "treeTrunkModel",
        assets_by_id,
        asset_server.as_ref(),
        bundle_path,
    );
    let source_leaves_scene = stylized_component_scene(
        component,
        "treeLeavesModel",
        assets_by_id,
        asset_server.as_ref(),
        bundle_path,
    );
    let source_grass_mesh = stylized_component_primitive_mesh(
        component,
        "grassModel",
        assets_by_id,
        asset_server.as_ref(),
        bundle_path,
    );

    let sky_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Rectangle::new(size * 2.4, size * 1.1)));
    let cloud_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Sphere { radius: 1.0 }));
    let sky_material = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::WHITE,
            base_color_texture: texture_handle_by_id(
                "tex.stylizedScene.sky",
                assets_by_id,
                asset_server.as_ref(),
            ),
            unlit: true,
            double_sided: true,
            cull_mode: None,
            ..Default::default()
        });
    let cloud_material = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::srgba(0.95, 0.97, 0.96, 0.92),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            double_sided: true,
            cull_mode: None,
            ..Default::default()
        });
    let cloud_shadow_material =
        world
            .resource_mut::<Assets<StandardMaterial>>()
            .add(StandardMaterial {
                base_color: Color::srgba(0.68, 0.78, 0.82, 0.28),
                unlit: true,
                alpha_mode: AlphaMode::Blend,
                double_sided: true,
                cull_mode: None,
                ..Default::default()
            });

    let path_crack_mesh = add_cuboid_mesh(world, 0.48, 0.018, 0.032);
    let path_pebble_mesh = add_cuboid_mesh(world, 0.42, 0.045, 0.22);
    let terrain_mesh = add_source_masked_terrain_mesh(
        world,
        size,
        128,
        path_width,
        json_color(component, "groundColor", "#6aa14f"),
        json_color(component, "pathColor", "#9b6543"),
    );
    let source_path_mesh = add_source_path_ribbon_mesh(world, size, 120, path_width * 0.92);
    let grass_mesh = match source_grass_mesh {
        Some(mesh) => (mesh, true),
        None => (
            add_grass_blade_mesh(
                world,
                json_color(component, "grassRootColor", "#236c34"),
                json_color(component, "grassTipColor", "#a7df63"),
            ),
            false,
        ),
    };
    let trunk_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Cylinder::new(0.18, 1.45)));
    let leaf_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Sphere { radius: 1.0 }));

    let parent = world
        .spawn(SpatialBundle {
            transform,
            ..Default::default()
        })
        .insert((stable_id, name))
        .id();
    let mut children = Vec::new();

    children.push(
        world
            .spawn(PbrBundle {
                mesh: sky_mesh,
                material: sky_material,
                transform: Transform::from_xyz(0.0, size * 0.18, -size * 0.38),
                ..Default::default()
            })
            .insert((
                Name::new(format!("{entity_id}.stylized-soft-sky-gradient")),
                NotShadowCaster,
                NotShadowReceiver,
            ))
            .id(),
    );

    let cloud_groups = [
        (-8.5, size * 0.24, -size * 0.34, 0.82),
        (5.5, size * 0.27, -size * 0.35, 0.68),
    ];
    let cloud_puffs = [
        (0.0, 0.0, 0.0, 2.65, 0.74),
        (-1.55, -0.08, 0.05, 1.65, 0.55),
        (1.55, -0.02, 0.04, 1.85, 0.58),
        (-0.55, 0.34, 0.03, 1.35, 0.48),
        (0.85, 0.26, 0.02, 1.18, 0.42),
    ];
    for (cloud_index, (cx, cy, cz, group_scale)) in cloud_groups.iter().copied().enumerate() {
        for (puff_index, (px, py, pz, sx, sy)) in cloud_puffs.iter().copied().enumerate() {
            let transform =
                Transform::from_xyz(cx + px * group_scale, cy + py * group_scale, cz + pz)
                    .with_scale(Vec3::new(sx * group_scale, sy * group_scale, 0.12));
            children.push(
                world
                    .spawn(PbrBundle {
                        mesh: cloud_mesh.clone(),
                        material: cloud_material.clone(),
                        transform,
                        ..Default::default()
                    })
                    .insert((
                        Name::new(format!("{entity_id}.soft-cloud-{cloud_index}-{puff_index}")),
                        NotShadowCaster,
                        NotShadowReceiver,
                    ))
                    .id(),
            );
            if puff_index == 0 || puff_index == 2 {
                children.push(
                    world
                        .spawn(PbrBundle {
                            mesh: cloud_mesh.clone(),
                            material: cloud_shadow_material.clone(),
                            transform: Transform::from_xyz(
                                cx + px * group_scale + 0.08,
                                cy + py * group_scale - 0.18,
                                cz + pz - 0.02,
                            )
                            .with_scale(Vec3::new(
                                sx * group_scale * 0.95,
                                sy * group_scale * 0.48,
                                0.08,
                            )),
                            ..Default::default()
                        })
                        .insert((
                            Name::new(format!(
                                "{entity_id}.soft-cloud-shadow-{cloud_index}-{puff_index}"
                            )),
                            NotShadowCaster,
                            NotShadowReceiver,
                        ))
                        .id(),
                );
            }
        }
    }

    children.push(
        world
            .spawn(PbrBundle {
                mesh: terrain_mesh,
                material: terrain_material,
                transform: Transform::IDENTITY,
                ..Default::default()
            })
            .insert(Name::new(format!(
                "{entity_id}.stylized-rolling-grass-ground"
            )))
            .id(),
    );
    children.push(
        world
            .spawn(PbrBundle {
                mesh: source_path_mesh,
                material: source_path_material,
                transform: Transform::from_xyz(0.0, 0.045, 0.0),
                ..Default::default()
            })
            .insert(Name::new(format!("{entity_id}.source-dirt-path-ribbon")))
            .id(),
    );
    let mut path_random = Lcg::new(2401);
    for index in 0..96usize {
        let z = size / 2.0 - (index as f32 / 95.0) * size + (path_random.next() - 0.5) * 0.45;
        let center = stylized_path_center(z);
        let x = center + (path_random.next() - 0.5) * path_width * 0.72;
        let y = stylized_terrain_height(x, z) + 0.09;
        let yaw = path_random.next() * std::f32::consts::TAU;
        let sx = 0.75 + path_random.next() * 0.85;
        let sz = 0.7 + path_random.next() * 0.65;
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: path_pebble_mesh.clone(),
                    material: path_pebble_material.clone(),
                    transform: Transform::from_xyz(x, y, z)
                        .with_rotation(Quat::from_rotation_y(yaw))
                        .with_scale(Vec3::new(sx, 1.0, sz)),
                    ..Default::default()
                })
                .insert(Name::new(format!("{entity_id}.path-pebble-{index}")))
                .id(),
        );
        if index % 3 == 0 {
            let crack_x = x + (path_random.next() - 0.5) * 0.18;
            let crack_z = z + (path_random.next() - 0.5) * 0.18;
            children.push(
                world
                    .spawn(PbrBundle {
                        mesh: path_crack_mesh.clone(),
                        material: path_crack_material.clone(),
                        transform: Transform::from_xyz(crack_x, y + 0.018, crack_z)
                            .with_rotation(Quat::from_rotation_y(yaw + path_random.next() * 0.65))
                            .with_scale(Vec3::new(0.65 + path_random.next() * 0.55, 1.0, 0.7)),
                        ..Default::default()
                    })
                    .insert(Name::new(format!("{entity_id}.path-crack-{index}")))
                    .id(),
            );
        }
    }
    let mut random = Lcg::new(1337);
    let mut written = 0usize;
    let mut attempts = 0usize;
    while written < grass_count && attempts < grass_count * 4 {
        attempts += 1;
        let z_bias = random.next().powf(1.65);
        let z = size / 2.0 - z_bias * size;
        let x = (random.next() - 0.5) * size * (0.72 + z_bias * 0.32);
        let path_mask = stylized_source_path_mask(x, z, size, path_width);
        if path_mask > 0.14 + random.next() * 0.12 {
            continue;
        }
        let y = stylized_terrain_height(x, z) + 0.035;
        let pitch = (random.next() - 0.5) * 0.12;
        let yaw = random.next() * std::f32::consts::TAU;
        let roll = (random.next() - 0.5) * wind_strength;
        let foreground_boost = if z > 0.0 { 1.28 } else { 1.03 };
        let blade_scale = foreground_boost * (0.72 + random.next() * 1.02);
        let height_scale = blade_scale * (0.78 + random.next() * 0.62);
        let base_transform = Transform::from_xyz(x, y, z)
            .with_rotation(Quat::from_euler(EulerRot::XYZ, pitch, yaw, roll))
            .with_scale(Vec3::new(blade_scale, height_scale, blade_scale));
        let index = written;
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: grass_mesh.0.clone(),
                    material: grass_material.clone(),
                    transform: base_transform,
                    ..Default::default()
                })
                .insert((
                    Name::new(if grass_mesh.1 {
                        format!("{entity_id}.source-grass-{index}")
                    } else {
                        format!("{entity_id}.stylized-grass-{index}")
                    }),
                    NativeGrassWindMotion {
                        base: base_transform,
                        phase: random.next() * std::f32::consts::TAU + x * 0.17 + z * 0.11,
                        strength: wind_strength,
                    },
                ))
                .id(),
        );
        written += 1;
    }

    let tree_anchors = [
        (13.0, -13.0, 0.0, 1.0),
        (-13.0, -13.0, 2.1, 0.9),
        (-13.0, 13.0, 4.0, 1.1),
        (13.0, 13.0, 1.0, 0.95),
    ];
    for (index, (x, z, yaw, tree_scale)) in tree_anchors
        .iter()
        .copied()
        .take(tree_count.min(tree_anchors.len()))
        .enumerate()
    {
        let tree_parent = world
            .spawn(SpatialBundle {
                transform: Transform::from_xyz(x, stylized_terrain_height(x, z), z)
                    .with_rotation(Quat::from_rotation_y(yaw))
                    .with_scale(Vec3::splat(tree_scale)),
                ..Default::default()
            })
            .insert(Name::new(format!(
                "{entity_id}.rounded-stylized-tree-{index}"
            )))
            .id();
        let mut tree_children = Vec::new();
        if let Some(source_trunk_scene) = source_trunk_scene.as_ref() {
            tree_children.push(
                world
                    .spawn(SceneBundle {
                        scene: source_trunk_scene.clone(),
                        transform: Transform::from_scale(Vec3::splat(12.0)),
                        ..Default::default()
                    })
                    .insert(Name::new(format!("{entity_id}.tree-{index}.source-trunk")))
                    .id(),
            );
        } else {
            tree_children.push(
                world
                    .spawn(PbrBundle {
                        mesh: trunk_mesh.clone(),
                        material: bark_material.clone(),
                        transform: Transform::from_xyz(0.0, 3.6, 0.0)
                            .with_scale(Vec3::new(1.45, 5.0, 1.45)),
                        ..Default::default()
                    })
                    .insert(Name::new(format!("{entity_id}.tree-{index}.trunk")))
                    .id(),
            );
        }
        let source_leaf_offsets = [
            (-0.47, 7.59, 0.48, 0.0, 0.85),
            (-3.87, 6.79, -4.47, 1.3, 0.76),
            (-2.08, 10.5, 0.18, 2.5, 0.9),
        ];
        if let Some(source_leaves_scene) = source_leaves_scene.as_ref() {
            for (leaf_index, (lx, ly, lz, leaf_yaw, source_scale)) in
                source_leaf_offsets.iter().copied().enumerate()
            {
                tree_children.push(
                    world
                        .spawn(SceneBundle {
                            scene: source_leaves_scene.clone(),
                            transform: Transform::from_xyz(lx, ly, lz)
                                .with_rotation(Quat::from_rotation_y(leaf_yaw))
                                .with_scale(Vec3::splat(source_scale)),
                            ..Default::default()
                        })
                        .insert(Name::new(format!(
                            "{entity_id}.tree-{index}.source-leaves-{leaf_index}"
                        )))
                        .id(),
                );
            }
        } else {
            let canopy_offsets = [
                (-0.47, 7.35, 0.48, 0.0, Vec3::new(2.65, 1.85, 2.25)),
                (-3.35, 6.55, -3.75, 1.3, Vec3::new(2.2, 1.55, 1.95)),
                (-2.08, 9.55, 0.18, 2.5, Vec3::new(2.35, 1.72, 2.05)),
                (1.15, 7.05, -2.1, 0.7, Vec3::new(1.7, 1.28, 1.55)),
                (-1.65, 8.35, 2.35, 2.9, Vec3::new(1.55, 1.16, 1.42)),
                (-4.35, 7.55, -0.85, 1.9, Vec3::new(1.45, 1.05, 1.35)),
            ];
            for (leaf_index, (lx, ly, lz, leaf_yaw, scale)) in
                canopy_offsets.iter().copied().enumerate()
            {
                tree_children.push(
                    world
                        .spawn(PbrBundle {
                            mesh: leaf_mesh.clone(),
                            material: leaf_material.clone(),
                            transform: Transform::from_xyz(lx, ly, lz)
                                .with_rotation(Quat::from_rotation_y(leaf_yaw))
                                .with_scale(scale),
                            ..Default::default()
                        })
                        .insert(Name::new(format!(
                            "{entity_id}.tree-{index}.leaf-{leaf_index}"
                        )))
                        .id(),
                );
            }
        }
        world.entity_mut(tree_parent).push_children(&tree_children);
        children.push(tree_parent);
    }

    world.entity_mut(parent).push_children(&children);
    parent
}

fn stylized_path_center(z: f32) -> f32 {
    (z * 0.18).sin() * 1.35 + (z * 0.055 + 1.2).sin() * 0.9
}

fn stylized_terrain_height(x: f32, z: f32) -> f32 {
    let rise = (-z).max(0.0) * 0.055;
    rise + (x * 0.18 + z * 0.12).sin() * 0.12 + (z * 0.2).cos() * 0.08
}

fn add_stylized_surface_material(
    world: &mut World,
    color: Color,
    roughness: f32,
    double_sided: bool,
    base_color_texture: Option<Handle<Image>>,
    normal_map_texture: Option<Handle<Image>>,
) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            base_color_texture,
            normal_map_texture,
            double_sided,
            perceptual_roughness: roughness,
            ..Default::default()
        })
}

fn add_source_path_ribbon_mesh(
    world: &mut World,
    size: f32,
    segments: usize,
    width: f32,
) -> Handle<Mesh> {
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for zi in 0..=segments {
        let t = zi as f32 / segments as f32;
        let z = size / 2.0 - t * size;
        let center = stylized_path_center(z);
        let dz = 0.05;
        let tangent_x = stylized_path_center(z - dz) - stylized_path_center(z + dz);
        let tangent = Vec2::new(tangent_x, -2.0 * dz).normalize_or_zero();
        let normal = Vec2::new(-tangent.y, tangent.x);
        let left = Vec2::new(center, z) - normal * width * 0.5;
        let right = Vec2::new(center, z) + normal * width * 0.5;
        let left_y = stylized_terrain_height(left.x, left.y) + 0.035;
        let right_y = stylized_terrain_height(right.x, right.y) + 0.035;
        positions.push([left.x, left_y, left.y]);
        positions.push([right.x, right_y, right.y]);
        normals.extend([[0.0, 1.0, 0.0]; 2]);
        uvs.push([0.0, t * 7.0]);
        uvs.push([1.0, t * 7.0]);
    }
    for zi in 0..segments {
        let base = (zi * 2) as u32;
        indices.extend([base, base + 2, base + 1, base + 1, base + 2, base + 3]);
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn add_source_masked_terrain_mesh(
    world: &mut World,
    size: f32,
    segments: usize,
    path_width: f32,
    _grass_color: Color,
    dirt_color: Color,
) -> Handle<Mesh> {
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut colors: Vec<[f32; 4]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let dirt = color_to_rgb(dirt_color);
    let dark = [0.247, 0.545, 0.231];
    let mid = [0.369, 0.667, 0.271];
    let light = [0.475, 0.741, 0.306];
    let near_path_grass = [0.4, 0.655, 0.275];

    for zi in 0..=segments {
        let z = -size / 2.0 + (zi as f32 / segments as f32) * size;
        for xi in 0..=segments {
            let x = -size / 2.0 + (xi as f32 / segments as f32) * size;
            let path_mask = stylized_source_path_mask(x, z, size, path_width);
            let y = stylized_terrain_height(x, z) - path_mask * 0.25;
            positions.push([x, y, z]);
            normals.push([0.0, 1.0, 0.0]);
            uvs.push([
                xi as f32 / segments as f32,
                1.0 - zi as f32 / segments as f32,
            ]);

            let t = ((z + size / 2.0) / size).clamp(0.0, 1.0) * 0.55;
            let mut c = lerp_rgb(light, mid, t);
            let path_distance = (x - stylized_path_center(z)).abs();
            if path_distance < path_width * 1.8 {
                c = lerp_rgb(c, near_path_grass, 0.35);
            }
            c = lerp_rgb(c, dark, (-z / size).max(0.0) * 0.22);

            let breakup = 0.5 + 0.5 * (x * 1.7 + z * 0.9).sin() * (x * 0.6 - z * 1.2).sin();
            let adjusted_mask = (path_mask + (breakup - 0.5) * 0.18).clamp(0.0, 1.0);
            let dirt_weight = smoothstep(0.35, 0.55, adjusted_mask);
            let speckle = 0.5 + 0.5 * (x * 5.7 + z * 2.4).sin() * (x * 1.9 - z * 6.8).sin();
            let crack = smoothstep(0.76, 0.94, speckle) * smoothstep(0.2, 0.8, path_mask);
            let dirt_shaded = [
                dirt[0] * (0.86 - crack * 0.34),
                dirt[1] * (0.82 - crack * 0.30),
                dirt[2] * (0.78 - crack * 0.24),
            ];
            c = lerp_rgb(c, dirt_shaded, dirt_weight);
            colors.push([c[0], c[1], c[2], 1.0]);
        }
    }
    for zi in 0..segments {
        for xi in 0..segments {
            let a = (zi * (segments + 1) + xi) as u32;
            let row = (segments + 1) as u32;
            indices.extend([a, a + row, a + 1, a + 1, a + row, a + row + 1]);
        }
    }
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn stylized_source_path_mask(x: f32, z: f32, size: f32, path_width: f32) -> f32 {
    let vertical_center = (z * 0.18).sin() * 1.15 + (z * 0.055 + 1.2).sin() * 0.75;
    let vertical = 1.0
        - smoothstep(
            path_width * 0.42,
            path_width * 0.9,
            (x - vertical_center).abs(),
        );

    let horizontal_center = (x * 0.12 + 0.8).sin() * 1.1;
    let horizontal = 1.0
        - smoothstep(
            path_width * 0.34,
            path_width * 0.82,
            (z - horizontal_center).abs(),
        );

    let branch_center = -9.0 + ((x + size * 0.25) * 0.2).sin() * 1.1;
    let branch = 1.0
        - smoothstep(
            path_width * 0.24,
            path_width * 0.64,
            (z - branch_center).abs(),
        );
    let branch_gate =
        smoothstep(-size * 0.42, -size * 0.05, x) * (1.0 - smoothstep(size * 0.18, size * 0.42, x));

    let breakup = 0.5 + 0.5 * (x * 1.7 + z * 0.9).sin() * (x * 0.6 - z * 1.2).sin();
    let mask = vertical.max(horizontal).max(branch * branch_gate);
    (mask + (breakup - 0.5) * 0.16).clamp(0.0, 1.0)
}

fn smoothstep(edge0: f32, edge1: f32, value: f32) -> f32 {
    let x = ((value - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn color_to_rgb(color: Color) -> [f32; 3] {
    let color = color.to_srgba();
    [color.red, color.green, color.blue]
}

fn stylized_texture_handle(
    component: &serde_json::Value,
    key: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
) -> Option<Handle<Image>> {
    let asset_id = component.get(key)?.as_str()?;
    texture_handle_by_id(asset_id, assets_by_id, asset_server)
}

fn texture_handle_by_id(
    asset_id: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
) -> Option<Handle<Image>> {
    let asset = assets_by_id.get(asset_id)?;
    if asset.kind != "texture" {
        return None;
    }
    let path = asset.path.as_ref()?;
    Some(
        asset_server
            .map(|server| load_texture_asset(server, path))
            .unwrap_or_default(),
    )
}

fn stylized_component_scene(
    component: &serde_json::Value,
    key: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    bundle_path: &Path,
) -> Option<Handle<Scene>> {
    let asset_id = component.get(key)?.as_str()?;
    let asset = assets_by_id.get(asset_id)?;
    let scene_path = native_compatible_model_scene_path(asset, bundle_path)?;
    let asset_server = asset_server?;
    Some(asset_server.load(GltfAssetLabel::Scene(0).from_asset(scene_path)))
}

fn stylized_component_primitive_mesh(
    component: &serde_json::Value,
    key: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    bundle_path: &Path,
) -> Option<Handle<Mesh>> {
    let asset_id = component.get(key)?.as_str()?;
    let asset = assets_by_id.get(asset_id)?;
    let mesh_path = native_compatible_model_scene_path(asset, bundle_path)?;
    let asset_server = asset_server?;
    Some(
        asset_server.load(
            GltfAssetLabel::Primitive {
                mesh: 0,
                primitive: 0,
            }
            .from_asset(mesh_path),
        ),
    )
}

fn native_compatible_model_scene_path(asset: &AssetIr, bundle_path: &Path) -> Option<String> {
    let scene_path = model_scene_path(asset)?;
    let disk_path = bundle_path.join(&scene_path);
    if !disk_path.exists() || gltf_declares_unsupported_native_extension(&disk_path) {
        return None;
    }
    Some(scene_path)
}

fn gltf_declares_unsupported_native_extension(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return true;
    };
    let Some(json) = gltf_json_chunk(path, &bytes) else {
        return true;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return true;
    };
    json_array_contains(&value, "extensionsRequired", "KHR_draco_mesh_compression")
        || json_array_contains(&value, "extensionsUsed", "KHR_draco_mesh_compression")
        || json_array_contains(&value, "extensionsRequired", "EXT_texture_webp")
        || json_array_contains(&value, "extensionsUsed", "EXT_texture_webp")
}

fn gltf_json_chunk<'a>(path: &Path, bytes: &'a [u8]) -> Option<&'a str> {
    let extension = path.extension().and_then(|value| value.to_str());
    if matches!(extension, Some("gltf")) {
        return std::str::from_utf8(bytes).ok();
    }
    if !matches!(extension, Some("glb")) || bytes.len() < 20 || &bytes[0..4] != b"glTF" {
        return None;
    }
    let json_len = u32::from_le_bytes(bytes[12..16].try_into().ok()?) as usize;
    let chunk_type = u32::from_le_bytes(bytes[16..20].try_into().ok()?);
    if chunk_type != 0x4E4F_534A || bytes.len() < 20 + json_len {
        return None;
    }
    std::str::from_utf8(&bytes[20..20 + json_len]).ok()
}

fn json_array_contains(value: &serde_json::Value, key: &str, needle: &str) -> bool {
    value
        .get(key)
        .and_then(|entry| entry.as_array())
        .is_some_and(|entries| entries.iter().any(|entry| entry.as_str() == Some(needle)))
}

fn lerp_rgb(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    let t = t.clamp(0.0, 1.0);
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

fn add_grass_blade_mesh(world: &mut World, root_color: Color, tip_color: Color) -> Handle<Mesh> {
    let root = root_color.to_srgba();
    let tip = tip_color.to_srgba();
    let root_rgb = [root.red, root.green, root.blue, 1.0];
    let tip_dark = [tip.red * 0.85, tip.green * 0.85, tip.blue * 0.85, 1.0];
    let tip_rgb = [tip.red, tip.green, tip.blue, 1.0];
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut colors: Vec<[f32; 4]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    for blade in 0..7u32 {
        let angle = (blade as f32 / 7.0) * std::f32::consts::TAU;
        let ring = if blade == 0 {
            0.0
        } else {
            0.035 + (blade % 3) as f32 * 0.012
        };
        let height = 0.42 + (blade % 4) as f32 * 0.09;
        let width = 0.025 + (blade % 2) as f32 * 0.01;
        let bend = 0.055 + (blade % 3) as f32 * 0.035;
        let right = Vec2::new(angle.cos(), angle.sin()) * width;
        let bend_dir = Vec2::new(
            (angle + std::f32::consts::FRAC_PI_2).cos(),
            (angle + std::f32::consts::FRAC_PI_2).sin(),
        );
        let center = Vec2::new(angle.cos(), angle.sin()) * ring;
        let base = positions.len() as u32;
        positions.extend([
            [center.x - right.x, 0.0, center.y - right.y],
            [center.x + right.x, 0.0, center.y + right.y],
            [
                center.x + bend_dir.x * bend * 0.45,
                height * 0.58,
                center.y + bend_dir.y * bend * 0.45,
            ],
            [
                center.x + bend_dir.x * bend,
                height,
                center.y + bend_dir.y * bend,
            ],
        ]);
        normals.extend([[0.0, 0.35, 0.94]; 4]);
        colors.extend([root_rgb, root_rgb, tip_dark, tip_rgb]);
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3]);
        indices.extend([base + 2, base + 1, base, base + 3, base + 2, base]);
    }
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh.insert_indices(Indices::U32(indices));
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn add_cuboid_mesh(world: &mut World, x: f32, y: f32, z: f32) -> Handle<Mesh> {
    world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Cuboid::new(x, y, z)))
}

fn add_stylized_material(world: &mut World, color: Color) -> Handle<StandardMaterial> {
    add_stylized_tree_material(world, color, false)
}

fn add_stylized_tree_material(
    world: &mut World,
    color: Color,
    double_sided: bool,
) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            double_sided,
            perceptual_roughness: 0.9,
            ..Default::default()
        })
}

struct Lcg(u32);

impl Lcg {
    fn new(seed: u32) -> Self {
        Self(seed)
    }

    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        self.0 as f32 / u32::MAX as f32
    }
}

fn json_usize(value: &serde_json::Value, key: &str, fallback: usize) -> usize {
    value
        .get(key)
        .and_then(|item| item.as_u64())
        .map(|item| item as usize)
        .unwrap_or(fallback)
}

fn json_f32(value: &serde_json::Value, key: &str, fallback: f32) -> f32 {
    value
        .get(key)
        .and_then(|item| item.as_f64())
        .map(|item| item as f32)
        .filter(|item| item.is_finite())
        .unwrap_or(fallback)
}

fn json_color(value: &serde_json::Value, key: &str, fallback: &str) -> Color {
    color_from_hex(
        value
            .get(key)
            .and_then(|item| item.as_str())
            .unwrap_or(fallback),
    )
}

fn color_from_hex(hex: &str) -> Color {
    let trimmed = hex.trim_start_matches('#');
    if trimmed.len() == 6 {
        if let Ok(value) = u32::from_str_radix(trimmed, 16) {
            let r = ((value >> 16) & 0xff) as f32 / 255.0;
            let g = ((value >> 8) & 0xff) as f32 / 255.0;
            let b = (value & 0xff) as f32 / 255.0;
            return Color::srgb(r, g, b);
        }
    }
    Color::srgb(1.0, 1.0, 1.0)
}

fn spawn_stylized_sparkles(
    world: &mut World,
    entity_id: &str,
    component: &serde_json::Value,
    transform: Transform,
    stable_id: ThreeNativeId,
    name: Name,
) -> Entity {
    let count = json_usize(component, "count", 96);
    let radius = json_f32(component, "radius", 10.0).max(0.1);
    let height = json_f32(component, "height", 3.2).max(0.1);
    let size = json_f32(component, "size", 0.08).max(0.02);
    let color = json_color(component, "color", "#fff3a6");
    let secondary = json_color(component, "secondaryColor", "#89d7ff");
    let spark_mesh = add_cuboid_mesh(world, size, size, size);
    let primary_material = add_emissive_material(world, color);
    let secondary_material = add_emissive_material(world, secondary);
    let parent = world
        .spawn(SpatialBundle {
            transform,
            ..Default::default()
        })
        .insert((stable_id, name))
        .id();
    let mut children = Vec::new();
    let mut random = Lcg::new(json_usize(component, "seed", 4242) as u32);
    for index in 0..count {
        let angle = random.next() * std::f32::consts::TAU;
        let ring = random.next().sqrt() * radius;
        let material = if random.next() > 0.55 {
            secondary_material.clone()
        } else {
            primary_material.clone()
        };
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: spark_mesh.clone(),
                    material,
                    transform: Transform::from_xyz(
                        angle.cos() * ring,
                        0.45 + random.next() * height,
                        angle.sin() * ring,
                    ),
                    ..Default::default()
                })
                .insert(Name::new(format!("{entity_id}.stylized-sparkle-{index}")))
                .id(),
        );
    }
    world.entity_mut(parent).push_children(&children);
    parent
}

fn add_emissive_material(world: &mut World, color: Color) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            emissive: color.into(),
            perceptual_roughness: 0.5,
            ..Default::default()
        })
}

fn spawn_ripple_water(
    world: &mut World,
    entity_id: &str,
    component: &serde_json::Value,
    transform: Transform,
    stable_id: ThreeNativeId,
    name: Name,
) -> Entity {
    let size = json_f32(component, "size", 5.8).max(0.1);
    let color = json_color(component, "color", "#40c4df");
    let foam_color = json_color(component, "foamColor", "#d5fbff");
    let opacity = json_f32(component, "opacity", 0.78).clamp(0.05, 1.0);
    let basin_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(PrimitiveCircle::new(size * 0.56)));
    let water_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(PrimitiveCircle::new(size * 0.54)));
    let basin_material = add_stylized_material(world, Color::srgb(0.192, 0.31, 0.216));
    let water_material = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color.with_alpha(opacity),
            emissive: foam_color.into(),
            metallic: 0.0,
            perceptual_roughness: 0.18,
            alpha_mode: AlphaMode::Blend,
            ..Default::default()
        });
    let rim_material = add_stylized_material(world, Color::srgb(0.361, 0.553, 0.271));
    let rock_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Sphere { radius: 0.18 }));
    let parent = world
        .spawn(SpatialBundle {
            transform,
            ..Default::default()
        })
        .insert((stable_id, name))
        .id();
    let mut children = Vec::new();
    children.push(
        world
            .spawn(PbrBundle {
                mesh: basin_mesh,
                material: basin_material,
                transform: Transform::from_xyz(0.0, 0.018, 0.0)
                    .with_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2))
                    .with_scale(Vec3::new(1.25, 0.68, 1.0)),
                ..Default::default()
            })
            .insert(Name::new(format!("{entity_id}.pond-dark-underwater-bed")))
            .id(),
    );
    let water_transform = Transform::from_xyz(0.0, 0.085, 0.0)
        .with_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2))
        .with_scale(Vec3::new(1.25, 0.68, 1.0));
    children.push(
        world
            .spawn(PbrBundle {
                mesh: water_mesh,
                material: water_material,
                transform: water_transform,
                ..Default::default()
            })
            .insert((
                Name::new(format!("{entity_id}.borrowed-webgl-water-ripple-surface")),
                NativeRippleWaterMotion {
                    base: water_transform,
                    speed: json_f32(component, "speed", 0.95).max(0.0),
                    strength: json_f32(component, "waveStrength", 0.18).max(0.0),
                },
            ))
            .id(),
    );
    for index in 0..26 {
        let angle = (index as f32 / 26.0) * std::f32::consts::TAU;
        let radius_scale = 1.0 + (index % 4) as f32 * 0.194;
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: rock_mesh.clone(),
                    material: rim_material.clone(),
                    transform: Transform::from_xyz(
                        angle.cos() * size * 0.68,
                        0.13,
                        angle.sin() * size * 0.38,
                    )
                    .with_rotation(Quat::from_rotation_y(angle))
                    .with_scale(Vec3::new(
                        1.35 * radius_scale,
                        0.38 * radius_scale,
                        0.82 * radius_scale,
                    )),
                    ..Default::default()
                })
                .insert(Name::new(format!(
                    "{entity_id}.pond-grass-bank-rock-{index}"
                )))
                .id(),
        );
    }
    world.entity_mut(parent).push_children(&children);
    parent
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
    bundle_path: &Path,
) -> Result<Entity, MapError> {
    let transform = map_transform(entity);
    let name = Name::new(entity.id.clone());
    let stable_id = ThreeNativeId(entity.id.clone());

    if let Some(stylized_nature) = entity.components.extra.get("StylizedNature") {
        return Ok(spawn_stylized_nature(
            world,
            &entity.id,
            stylized_nature,
            assets_by_id,
            transform,
            stable_id,
            name,
            bundle_path,
        ));
    }
    if let Some(stylized_sparkles) = entity.components.extra.get("StylizedSparkles") {
        return Ok(spawn_stylized_sparkles(
            world,
            &entity.id,
            stylized_sparkles,
            transform,
            stable_id,
            name,
        ));
    }
    if let Some(ripple_water) = entity.components.extra.get("RippleWater") {
        return Ok(spawn_ripple_water(
            world,
            &entity.id,
            ripple_water,
            transform,
            stable_id,
            name,
        ));
    }

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
                brightness: light.intensity * THREE_COMPAT_AMBIENT_BRIGHTNESS_PER_INTENSITY,
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
            .map(|server| load_texture_asset(server, path))
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
