use std::{
    collections::{BTreeSet, HashMap, HashSet},
    path::Path,
};

use bevy::{
    animation::graph::AnimationGraph,
    asset::{Handle, load_internal_asset},
    core_pipeline::{
        bloom::{BloomCompositeMode, BloomPrefilterSettings, BloomSettings},
        dof::{DepthOfFieldMode, DepthOfFieldSettings},
        experimental::taa::TemporalAntiAliasBundle,
        fxaa::Fxaa,
        prepass::{DepthPrepass, NormalPrepass},
        smaa::SmaaSettings,
        tonemapping::Tonemapping,
    },
    gltf::{Gltf, GltfAssetLabel},
    math::{
        Affine2,
        primitives::{
            Annulus, Capsule3d, Circle as PrimitiveCircle, Cone, ConicalFrustum, Cuboid, Cylinder,
            Extrusion, Rectangle, RegularPolygon, Sphere, Torus,
        },
    },
    pbr::{
        DefaultOpaqueRendererMethod, DirectionalLightShadowMap, FogFalloff, FogSettings, Material,
        MaterialMeshBundle, MaterialPlugin, NotShadowCaster, NotShadowReceiver,
        ScreenSpaceAmbientOcclusionBundle, ScreenSpaceAmbientOcclusionQualityLevel,
        ScreenSpaceAmbientOcclusionSettings, ScreenSpaceReflectionsBundle,
        ScreenSpaceReflectionsSettings, ShadowFilteringMethod,
    },
    prelude::*,
    reflect::TypePath,
    render::{
        alpha::AlphaMode,
        camera::{CameraMainTextureUsages, ClearColorConfig, Exposure, RenderTarget, ScalingMode},
        extract_resource::ExtractResource,
        mesh::{Indices, MeshVertexAttribute, PrimitiveTopology, VertexAttributeValues},
        render_asset::RenderAssetUsages,
        render_resource::{
            AsBindGroup, Extent3d, Face, Shader, ShaderRef, TextureDimension, TextureFormat,
            TextureUsages, VertexFormat,
        },
        view::{ColorGrading, visibility::RenderLayers},
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
use crate::mesh_lod::{NativeMeshLod, NativeMeshLodLevel};
use crate::motion_blur_postprocess::NativeTemporalMotionBlur;
use crate::render_targets::{
    NativeCustomProjection, NativeRenderTargetRegistry, allocate_render_targets,
    camera_render_target,
};
use crate::rendering::contact_shadows::refresh_native_contact_shadow_pipelines;
use crate::rendering::{
    NativeBakedProbeLightingApplied, NativeEnvironmentMapHandles, native_volumetric_fog_settings,
    spawn_rendered_particles,
};
use crate::stylized_nature::{grass_material_policy, resolve_source_assets};
use crate::world_mapping::attach_entity_hierarchy;

// ThreeNative lights are authored in Three.js-style scalar units. Bevy stores
// physically named units and multiplies lighting by camera Exposure, so the
// native adapter uses neutral camera exposure and keeps non-atmosphere
// directional intensity close to Three's authored scalar.
pub const THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY: f32 = 1.0;
pub const THREE_COMPAT_AMBIENT_BRIGHTNESS_PER_INTENSITY: f32 = 1.0;
// Environment bundles duplicate authored lights in world.ir.json and atmosphere;
// keep the world directional contribution low so it stacks with atmosphere sun.
const THREE_COMPAT_ENVIRONMENT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY: f32 = 1.7;
const THREE_COMPAT_POINT_LUMENS_PER_CANDELA: f32 = 1.0;
const THREE_COMPAT_DEFAULT_RANGE: f32 = 1_000.0;
// ThreeNative authored exposure is a renderer-level scalar, so the default
// native camera stays at neutral EV100 and explicit mappings own compensation.
const THREE_COMPAT_DEFAULT_CAMERA_EV100: f32 = 0.0;
const THREE_COMPAT_SKY_DOME_RADIUS: f32 = 72.0;
const THREE_COMPAT_EMISSIVE_INTENSITY_SCALE: f32 = 1.0;
const THREE_COMPAT_DEFAULT_IMPLICIT_DIELECTRIC_REFLECTANCE: f32 = 0.5;
const THREE_COMPAT_SSR_SMOOTH_MATERIAL_METALNESS_LIMIT: f32 = 0.2;
// Match the web SSR thin-surface calibration. Bevy's default 0.25 treats the
// authored centimeter-scale puddles as thick volumes and produces misses or
// detached reflection blobs.
const THREE_COMPAT_SSR_THICKNESS: f32 = 0.02;
// Authored grading is already expressed in the shared adapter contract. Extra
// native-only saturation/contrast multipliers clipped blue from dark mids and
// made the hero room read as an orange poster rather than the web image.
const THREE_COMPAT_COLOR_GRADING_SATURATION_SCALE: f32 = 0.85;
const THREE_COMPAT_COLOR_GRADING_CONTRAST_SCALE: f32 = 1.0;
const THREE_COMPAT_ACES_EXPOSURE_SCALE: f32 = 1.2;
const THREE_COMPAT_LINEAR_EXPOSURE_SCALE: f32 = 1.0;
const THREE_COMPAT_FOG_EXP2_DENSITY_SCALE: f32 = 0.65;
const THREE_COMPAT_EMISSIVE_MASK_LAYER: usize = 63;
const THREE_COMPAT_EMISSIVE_MASK_WIDTH: u32 = 1280;
const THREE_COMPAT_EMISSIVE_MASK_HEIGHT: u32 = 720;
const THREE_COMPAT_SOURCE_TERRAIN_BAKE_SEGMENTS: usize = 1024;
const THREE_COMPAT_LEAF_ALPHA_CUTOFF: f32 = 0.01;

pub struct StylizedNatureRuntimeDefaults {
    pub bark_color: &'static str,
    pub fallback_grass_count: usize,
    pub grass_geometry_root_color: &'static str,
    pub grass_geometry_tip_color: &'static str,
    pub grass_material_color: &'static str,
    pub leaf_color: &'static str,
    pub native_ground_color: &'static str,
    pub path_width: f32,
    pub size: f32,
    pub tree_count: usize,
    pub wind_strength: f32,
}

pub const STYLIZED_NATURE_RUNTIME_DEFAULTS: StylizedNatureRuntimeDefaults =
    StylizedNatureRuntimeDefaults {
        bark_color: "#684329",
        fallback_grass_count: 4200,
        grass_geometry_root_color: "#236c34",
        grass_geometry_tip_color: "#a7df63",
        grass_material_color: "#6aa14f",
        leaf_color: "#4d973c",
        native_ground_color: "#6aa14f",
        path_width: 3.0,
        size: 34.0,
        tree_count: 7,
        wind_strength: 0.35,
    };

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

#[derive(Resource, Default)]
pub struct NativeMeshHandles(pub HashMap<String, Handle<Mesh>>);

#[derive(Resource, Default)]
pub struct NativeShaderMaterialHandles(pub HashMap<String, Handle<NativePortableShaderMaterial>>);

#[derive(Clone, Debug, PartialEq)]
pub struct NativeShaderBindingMetadata {
    pub binding: usize,
    pub kind: String,
    pub name: String,
    pub type_: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeShaderMaterialMetadata {
    pub fragment_outputs: Vec<String>,
    pub language: String,
    pub material_id: String,
    pub textures: Vec<String>,
    pub uniforms: Vec<String>,
    pub wgsl_entry_points: Vec<String>,
    pub binding_layout: Vec<NativeShaderBindingMetadata>,
}

#[derive(Resource, Default)]
pub struct NativeShaderMaterialRegistry(pub HashMap<String, NativeShaderMaterialMetadata>);

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeShaderMaterialInstance {
    pub binding_layout: Vec<NativeShaderBindingMetadata>,
    pub fragment_outputs: Vec<String>,
    pub language: String,
    pub material_id: String,
    pub render_path: String,
    pub textures: Vec<String>,
    pub uniforms: Vec<String>,
    pub wgsl_entry_points: Vec<String>,
}

const NATIVE_PORTABLE_SHADER_MATERIAL_HANDLE: Handle<Shader> =
    Handle::weak_from_u128(3159543545182177583);

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct NativePortableShaderMaterial {
    #[uniform(0)]
    pub base_color: LinearRgba,
    #[texture(1)]
    #[sampler(2)]
    pub base_color_texture: Option<Handle<Image>>,
    #[uniform(3)]
    pub displacement_amount: f32,
    pub alpha_mode: AlphaMode,
    pub alpha_cutoff: Option<f32>,
    pub uses_vertex_displacement: bool,
    pub material_id: String,
}

impl Material for NativePortableShaderMaterial {
    fn vertex_shader() -> ShaderRef {
        NATIVE_PORTABLE_SHADER_MATERIAL_HANDLE.into()
    }

    fn fragment_shader() -> ShaderRef {
        NATIVE_PORTABLE_SHADER_MATERIAL_HANDLE.into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        self.alpha_mode
    }
}

pub struct NativePortableShaderMaterialPlugin;

impl Plugin for NativePortableShaderMaterialPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            NATIVE_PORTABLE_SHADER_MATERIAL_HANDLE,
            "native_portable_shader_material.wgsl",
            Shader::from_wgsl
        );
        app.add_plugins(MaterialPlugin::<NativePortableShaderMaterial>::default());
    }
}

#[derive(Default, Resource)]
pub struct NativeMappedWorldEntityIds(pub BTreeSet<String>);

#[derive(Default, Resource)]
pub struct NativeMappedWorldEntitySignatures(pub HashMap<String, String>);

pub fn native_engine_component_signature(entity: &WorldEntity) -> String {
    format!(
        "camera={:?}|collider={:?}|contact_shadows={:?}|hierarchy={:?}|light={:?}|mesh={:?}|layers={:?}|body={:?}|visibility={:?}|world_text={:?}",
        entity.components.camera,
        entity.components.collider,
        entity.components.contact_shadows,
        entity.components.hierarchy,
        entity.components.light,
        entity.components.mesh_renderer,
        entity.components.render_layers,
        entity.components.rigid_body,
        entity.components.visibility,
        entity.components.world_text,
    )
}

pub struct NativeWorldEntitySpawnContext<'a> {
    active_cameras: HashSet<String>,
    assets_by_id: HashMap<&'a str, &'a AssetIr>,
    bloom_settings: Option<BloomSettings>,
    camera_atmosphere: Option<&'a AtmosphereProfileIr>,
    camera_color_management: Option<&'a threenative_loader::AtmosphereColorManagementIr>,
    default_camera_clear_color: Option<Color>,
    fallback_active_camera: Option<String>,
    layer_map: NativeRenderLayerMap,
    materials_by_id: HashMap<&'a str, &'a MaterialIr>,
    render_target_registry: NativeRenderTargetRegistry,
    runtime_color_grading: Option<&'a threenative_loader::RuntimeRendererColorGradingConfig>,
    runtime_config: Option<&'a RuntimeConfigIr>,
}

#[derive(Clone, Debug, ExtractResource, Resource)]
pub struct NativeEmissiveMarkerMask {
    pub image: Handle<Image>,
    pub layer: usize,
    pub height: u32,
    pub width: u32,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeEnvironmentSkyDome {
    pub asset: String,
    pub mode: String,
}

const NATIVE_EQUIRECT_SKY_SHADER_HANDLE: Handle<Shader> =
    Handle::weak_from_u128(2311841668702425331);

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct NativeEquirectSkyMaterial {
    #[texture(0)]
    #[sampler(1)]
    pub texture: Handle<Image>,
}

impl Material for NativeEquirectSkyMaterial {
    fn fragment_shader() -> ShaderRef {
        NATIVE_EQUIRECT_SKY_SHADER_HANDLE.into()
    }
}

pub struct NativeEquirectSkyMaterialPlugin;

impl Plugin for NativeEquirectSkyMaterialPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            NATIVE_EQUIRECT_SKY_SHADER_HANDLE,
            "native_equirect_sky.wgsl",
            Shader::from_wgsl
        );
        app.add_plugins(MaterialPlugin::<NativeEquirectSkyMaterial>::default());
    }
}

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
    pub asset: String,
    pub clip_speeds: HashMap<String, f32>,
    pub gltf: Handle<Gltf>,
    pub clip: Handle<AnimationClip>,
    pub loop_: bool,
    pub speed: f32,
    pub source_clip: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeAnimationServiceCommand {
    pub active_state: Option<String>,
    pub clip: String,
    pub entity: String,
    pub loop_: bool,
    pub source_clip: String,
    pub speed: f32,
}

#[derive(Debug, Default, Resource)]
pub struct NativeAnimationServiceQueue {
    pub commands: Vec<NativeAnimationServiceCommand>,
}

#[derive(Debug, Error)]
pub enum MapError {
    #[error("entity '{entity_id}' references missing mesh '{mesh_id}'")]
    MissingMesh { entity_id: String, mesh_id: String },
    #[error("entity '{entity_id}' LOD level {level_index} references missing mesh '{mesh_id}'")]
    MissingLodMesh {
        entity_id: String,
        level_index: usize,
        mesh_id: String,
    },
    #[error("entity '{entity_id}' LOD level {level_index} has invalid threshold {min_distance}")]
    InvalidLodThreshold {
        entity_id: String,
        level_index: usize,
        min_distance: f64,
    },
    #[error("entity '{entity_id}' references missing material '{material_id}'")]
    MissingMaterial {
        entity_id: String,
        material_id: String,
    },
    #[error("material '{material_id}' uses web-only kind 'unlit'")]
    UnsupportedUnlitMaterial { material_id: String },
}

impl MapError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingMesh { .. } => "TN_BEVY_MESH_REFERENCE_MISSING",
            Self::MissingLodMesh { .. } => "TN_BEVY_MESH_LOD_REFERENCE_MISSING",
            Self::InvalidLodThreshold { .. } => "TN_BEVY_MESH_LOD_THRESHOLD_INVALID",
            Self::MissingMaterial { .. } => "TN_BEVY_MATERIAL_REFERENCE_MISSING",
            Self::UnsupportedUnlitMaterial { .. } => "TN_BEVY_MATERIAL_UNLIT_UNSUPPORTED",
        }
    }

    pub fn path(&self) -> String {
        match self {
            Self::MissingMesh { entity_id, .. } => {
                format!("world.ir.json/entities/{entity_id}/components/MeshRenderer/mesh")
            }
            Self::MissingLodMesh {
                entity_id,
                level_index,
                ..
            }
            | Self::InvalidLodThreshold {
                entity_id,
                level_index,
                ..
            } => format!(
                "world.ir.json/entities/{entity_id}/components/MeshRenderer/lod/levels/{level_index}/{}",
                if matches!(self, Self::MissingLodMesh { .. }) {
                    "mesh"
                } else {
                    "minDistance"
                }
            ),
            Self::MissingMaterial { entity_id, .. } => {
                format!("world.ir.json/entities/{entity_id}/components/MeshRenderer/material")
            }
            Self::UnsupportedUnlitMaterial { material_id } => {
                format!("materials.ir.json/materials/{material_id}/kind")
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
            Self::MissingLodMesh { mesh_id, .. } => format!(
                "Add mesh asset '{mesh_id}' to assets.manifest.json or update the MeshRenderer LOD mesh reference."
            ),
            Self::InvalidLodThreshold { .. } => {
                "Use a finite positive LOD minDistance in strictly increasing order.".to_owned()
            }
            Self::MissingMaterial { material_id, .. } => {
                format!(
                    "Add material '{material_id}' to materials.ir.json or update the MeshRenderer material reference."
                )
            }
            Self::UnsupportedUnlitMaterial { .. } => {
                "Use 'standard' for native targets or freeze-gate this project to web until native unlit parity is promoted.".to_owned()
            }
        }
    }
}

pub fn map_bundle_into_world(world: &mut World, bundle: &LoadedBundle) -> Result<(), MapError> {
    if let Some(material) = bundle
        .materials
        .materials
        .iter()
        .find(|material| material.kind == "unlit")
    {
        return Err(MapError::UnsupportedUnlitMaterial {
            material_id: material.id.clone(),
        });
    }
    let spawn_context = prepare_world_entity_spawn_context(world, bundle);
    let mut material_handles = NativeMaterialHandles::default();
    let mut shader_material_handles = NativeShaderMaterialHandles::default();

    let mut entities_by_id = HashMap::new();
    for entity in &bundle.world.entities {
        let bevy_entity = spawn_world_entity(
            world,
            entity,
            &spawn_context,
            &mut material_handles,
            &mut shader_material_handles,
            bundle,
        )?;
        entities_by_id.insert(entity.id.as_str(), bevy_entity);
    }
    world.insert_resource(material_handles);
    world.insert_resource(shader_material_handles);
    world.insert_resource(shader_material_registry(bundle));

    spawn_environment_sky_dome(world, bundle, &spawn_context.assets_by_id);

    attach_entity_hierarchy(world, bundle, &entities_by_id);
    refresh_native_contact_shadow_pipelines(world);
    spawn_rendered_particles(world, bundle, 1.0);
    world.insert_resource(NativeMappedWorldEntityIds(
        bundle
            .world
            .entities
            .iter()
            .map(|entity| entity.id.clone())
            .collect(),
    ));
    world.insert_resource(NativeMappedWorldEntitySignatures(
        bundle
            .world
            .entities
            .iter()
            .map(|entity| (entity.id.clone(), native_engine_component_signature(entity)))
            .collect(),
    ));

    Ok(())
}

fn shader_material_registry(bundle: &LoadedBundle) -> NativeShaderMaterialRegistry {
    let mut registry = HashMap::new();
    for material in &bundle.materials.materials {
        if material.kind != "shader" {
            continue;
        }
        let uniforms = material
            .uniforms
            .as_ref()
            .map(|values| {
                let mut values = values
                    .iter()
                    .map(|uniform| (uniform.name.clone(), uniform.type_.clone()))
                    .collect::<Vec<_>>();
                values.sort_by(|left, right| left.0.cmp(&right.0));
                values
            })
            .unwrap_or_default();
        let textures = material
            .textures
            .as_ref()
            .map(|values| {
                let mut values = values
                    .iter()
                    .map(|texture| texture.name.clone())
                    .collect::<Vec<_>>();
                values.sort();
                values
            })
            .unwrap_or_default();
        let mut binding_layout = Vec::new();
        for (index, (name, type_)) in uniforms.iter().enumerate() {
            binding_layout.push(NativeShaderBindingMetadata {
                binding: index,
                kind: "uniform".to_owned(),
                name: name.clone(),
                type_: type_.clone(),
            });
        }
        for (index, name) in textures.iter().enumerate() {
            binding_layout.push(NativeShaderBindingMetadata {
                binding: uniforms.len() + index,
                kind: "sampler2d".to_owned(),
                name: name.clone(),
                type_: "texture2d".to_owned(),
            });
        }
        let mut fragment_outputs = material.outputs.clone().unwrap_or_default();
        if fragment_outputs.is_empty() {
            fragment_outputs = material
                .program
                .as_ref()
                .and_then(|program| program.fragment.get("outputs"))
                .and_then(|outputs| outputs.as_object())
                .map(|outputs| outputs.keys().cloned().collect())
                .unwrap_or_default();
        }
        fragment_outputs.sort();
        registry.insert(
            material.id.clone(),
            NativeShaderMaterialMetadata {
                binding_layout,
                fragment_outputs,
                language: material
                    .program
                    .as_ref()
                    .map(|program| program.language.clone())
                    .unwrap_or_else(|| "threenative-shader-v1".to_owned()),
                material_id: material.id.clone(),
                textures,
                uniforms: uniforms.into_iter().map(|(name, _)| name).collect(),
                wgsl_entry_points: vec!["vertex_main".to_owned(), "fragment_main".to_owned()],
            },
        );
    }
    NativeShaderMaterialRegistry(registry)
}

pub fn prepare_world_entity_spawn_context<'a>(
    world: &mut World,
    bundle: &'a LoadedBundle,
) -> NativeWorldEntitySpawnContext<'a> {
    ensure_asset_resources(world);
    world.init_resource::<NativeMeshHandles>();
    apply_runtime_config(world, bundle.runtime_config.as_ref());
    let camera_atmosphere = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active);
    ensure_ambient_light_contract(world, bundle, camera_atmosphere);
    let layer_map = build_render_layer_map(bundle);
    world.insert_resource(layer_map.clone());
    if bundle
        .materials
        .materials
        .iter()
        .any(uses_emissive_marker_mask)
    {
        ensure_emissive_marker_mask(world);
    }
    world.insert_resource(
        crate::assets::build_texture_controls_registry_for_environment(
            &bundle.assets,
            bundle.environment_scene.as_ref(),
        ),
    );
    NativeWorldEntitySpawnContext {
        active_cameras: active_camera_ids(bundle).into_iter().collect(),
        assets_by_id: bundle
            .assets
            .assets
            .iter()
            .map(|asset| (asset.id.as_str(), asset))
            .collect(),
        bloom_settings: bloom_settings_for_runtime(bundle.runtime_config.as_ref()),
        camera_atmosphere,
        camera_color_management: camera_atmosphere.map(|profile| &profile.color_management),
        default_camera_clear_color: world.get_resource::<ClearColor>().map(|clear| clear.0),
        fallback_active_camera: active_camera_id(bundle),
        layer_map,
        materials_by_id: bundle
            .materials
            .materials
            .iter()
            .map(|material| (material.id.as_str(), material))
            .collect(),
        render_target_registry: allocate_render_targets(world, bundle),
        runtime_color_grading: bundle
            .runtime_config
            .as_ref()
            .and_then(|config| config.renderer.as_ref())
            .and_then(|renderer| renderer.color_grading.as_ref()),
        runtime_config: bundle.runtime_config.as_ref(),
    }
}

pub fn spawn_world_entity(
    world: &mut World,
    entity: &WorldEntity,
    context: &NativeWorldEntitySpawnContext<'_>,
    material_handles: &mut NativeMaterialHandles,
    shader_material_handles: &mut NativeShaderMaterialHandles,
    bundle: &LoadedBundle,
) -> Result<Entity, MapError> {
    spawn_entity(
        world,
        entity,
        &mut EntitySpawnResources {
            bundle_path: &bundle.bundle_path,
            context,
            material_handles,
            shader_material_handles,
        },
    )
}

fn spawn_environment_sky_dome(
    world: &mut World,
    bundle: &LoadedBundle,
    assets_by_id: &HashMap<&str, &AssetIr>,
) {
    let Some(skybox) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.skybox.as_ref())
        .filter(|skybox| skybox.mode == "equirect")
    else {
        return;
    };
    let Some(asset_id) = skybox.asset.as_deref() else {
        return;
    };
    let Some(asset) = assets_by_id.get(asset_id) else {
        return;
    };
    let Some(path) = asset.path.as_ref() else {
        return;
    };
    let Some(asset_server) = world.get_resource::<AssetServer>().cloned() else {
        return;
    };
    let texture = load_texture_asset(&asset_server, path);
    let mesh = sky_dome_mesh(THREE_COMPAT_SKY_DOME_RADIUS);
    let mesh = world.resource_mut::<Assets<Mesh>>().add(mesh);
    let transform =
        Transform::from_translation(active_camera_translation(world, bundle).unwrap_or(Vec3::ZERO));
    let material = world
        .resource_mut::<Assets<NativeEquirectSkyMaterial>>()
        .add(NativeEquirectSkyMaterial { texture });
    world.spawn((
        MaterialMeshBundle {
            mesh,
            material,
            transform,
            ..Default::default()
        },
        Name::new("threenative.environment.skybox.equirect"),
        NativeEnvironmentSkyDome {
            asset: asset_id.to_owned(),
            mode: skybox.mode.clone(),
        },
        NotShadowCaster,
        NotShadowReceiver,
    ));
}

fn active_camera_translation(world: &mut World, bundle: &LoadedBundle) -> Option<Vec3> {
    let active_camera_id = active_camera_id(bundle)?;
    let mut query = world.query::<(&ThreeNativeId, &Transform)>();
    query
        .iter(world)
        .find_map(|(id, transform)| (id.0 == active_camera_id).then_some(transform.translation))
}

fn sky_dome_mesh(radius: f32) -> Mesh {
    // Three.js samples equirectangular backgrounds per pixel from the view
    // direction. The native adapter uses a dome mesh, so keep the segments high
    // enough that UV interpolation does not visibly warp cloud bands.
    let columns = 256usize;
    let rows = 128usize;
    let mut positions = Vec::with_capacity((columns + 1) * (rows + 1));
    let mut normals = Vec::with_capacity((columns + 1) * (rows + 1));
    let mut uvs = Vec::with_capacity((columns + 1) * (rows + 1));
    for row in 0..=rows {
        let v = row as f32 / rows as f32;
        let theta = v * std::f32::consts::PI;
        let y = theta.cos();
        let r = theta.sin();
        for column in 0..=columns {
            let equirect_u = column as f32 / columns as f32;
            let longitude = (equirect_u - 0.5) * std::f32::consts::TAU;
            let x = r * longitude.cos();
            let z = r * longitude.sin();
            positions.push([x * radius, y * radius, z * radius]);
            normals.push([-x, -y, -z]);
            uvs.push([equirect_u, v]);
        }
    }
    let mut indices = Vec::with_capacity(columns * rows * 6);
    let stride = columns + 1;
    for row in 0..rows {
        for column in 0..columns {
            let a = (row * stride + column) as u32;
            let b = a + 1;
            let c = ((row + 1) * stride + column) as u32;
            let d = c + 1;
            indices.extend_from_slice(&[a, c, b, b, c, d]);
        }
    }
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    mesh
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
    let shadow_quality = native_render_look_shadow_quality(config);
    world.insert_resource(DirectionalLightShadowMap {
        size: native_shadow_map_size(shadow_quality) as usize,
    });
    if config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.screen_space_reflections.as_ref())
        .is_some_and(|ssr| ssr.enabled)
    {
        world.insert_resource(DefaultOpaqueRendererMethod::deferred());
    }
}

fn native_render_look_shadow_quality(config: Option<&RuntimeConfigIr>) -> Option<&str> {
    let render_look = config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.render_look.as_ref())?;
    Some(
        render_look
            .overrides
            .as_ref()
            .and_then(|overrides| overrides.shadow_quality.as_deref())
            .unwrap_or(match render_look.profile.as_str() {
                "balanced" | "cinematic" => "high",
                "stylized" | "parity" => "medium",
                _ => "medium",
            }),
    )
}

fn native_shadow_map_size(quality: Option<&str>) -> u32 {
    match quality {
        Some("high") => 2048,
        Some("medium") | None => 1024,
        _ => 512,
    }
}

fn insert_camera_shadow_profile(spawned: &mut EntityWorldMut, config: Option<&RuntimeConfigIr>) {
    let Some(quality) = native_render_look_shadow_quality(config) else {
        return;
    };
    spawned.insert(match quality {
        "high" => ShadowFilteringMethod::Gaussian,
        _ => ShadowFilteringMethod::Hardware2x2,
    });
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
    if !has_authored_ambient && !world.contains_resource::<NativeBakedProbeLightingApplied>() {
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

fn insert_camera_ambient_occlusion(spawned: &mut EntityWorldMut, config: Option<&RuntimeConfigIr>) {
    let Some(renderer) = config.and_then(|config| config.renderer.as_ref()) else {
        return;
    };
    let ambient_occlusion = renderer
        .ambient_occlusion
        .as_ref()
        .filter(|ambient_occlusion| ambient_occlusion.enabled);
    let Some(quality) = ambient_occlusion.map(|feature| feature.quality.as_str()) else {
        return;
    };
    spawned.insert(ScreenSpaceAmbientOcclusionBundle {
        settings: ScreenSpaceAmbientOcclusionSettings {
            quality_level: ambient_occlusion_quality_level(quality),
        },
        depth_prepass: DepthPrepass,
        normal_prepass: NormalPrepass,
    });
}

fn insert_camera_ssgi_prepasses(spawned: &mut EntityWorldMut, config: Option<&RuntimeConfigIr>) {
    let enabled = config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.screen_space_global_illumination.as_ref())
        .is_some_and(|ssgi| ssgi.enabled);
    if enabled {
        spawned.insert((DepthPrepass, NormalPrepass));
    }
}

fn ambient_occlusion_quality_level(quality: &str) -> ScreenSpaceAmbientOcclusionQualityLevel {
    match quality {
        "low" => ScreenSpaceAmbientOcclusionQualityLevel::Low,
        "medium" => ScreenSpaceAmbientOcclusionQualityLevel::Medium,
        "high" => ScreenSpaceAmbientOcclusionQualityLevel::High,
        _ => ScreenSpaceAmbientOcclusionQualityLevel::Medium,
    }
}

fn ambient_occlusion_intensity_approximation(config: Option<&RuntimeConfigIr>) -> f32 {
    let Some(ambient_occlusion) = config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.ambient_occlusion.as_ref())
        .filter(|ambient_occlusion| ambient_occlusion.enabled)
    else {
        return 1.0;
    };
    (1.0 - (ambient_occlusion.intensity - 1.35) * 0.05).clamp(0.9, 1.05)
}

fn bloom_settings_for_runtime(config: Option<&RuntimeConfigIr>) -> Option<BloomSettings> {
    let renderer = config.and_then(|config| config.renderer.as_ref())?;
    let (enabled, intensity, threshold) = if let Some(bloom) = renderer.bloom.as_ref() {
        (bloom.enabled, bloom.intensity, bloom.threshold)
    } else if let Some(render_look) = renderer
        .render_look
        .as_ref()
        .filter(|render_look| native_render_look_has_bloom(render_look.profile.as_str()))
    {
        (
            true,
            render_look
                .overrides
                .as_ref()
                .and_then(|overrides| overrides.bloom_intensity)
                .unwrap_or_else(|| {
                    native_render_look_bloom_intensity(render_look.profile.as_str())
                }),
            0.85,
        )
    } else {
        return None;
    };
    if !enabled || intensity <= 0.0 {
        return None;
    }
    Some(BloomSettings {
        composite_mode: BloomCompositeMode::Additive,
        intensity: native_bloom_intensity(intensity),
        prefilter_settings: BloomPrefilterSettings {
            threshold,
            threshold_softness: 0.32,
        },
        ..Default::default()
    })
}

fn native_bloom_intensity(intensity: f32) -> f32 {
    // Match the web UnrealBloomPass anchor: authored intensity 1.0 maps to a
    // 0.2-strength halo before the shared threshold/softness controls.
    intensity * 0.2
}

fn native_render_look_has_bloom(profile: &str) -> bool {
    matches!(profile, "balanced" | "cinematic" | "stylized")
}

fn native_render_look_bloom_intensity(profile: &str) -> f32 {
    match profile {
        "cinematic" => 0.45,
        "stylized" => 0.3,
        "balanced" => 0.25,
        _ => 0.0,
    }
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

pub fn advance_native_animation_playback_time(
    time: Res<Time>,
    mut playback: Query<&mut NativeAnimationPlayback>,
) {
    let delta = time.delta_seconds();
    for mut item in &mut playback {
        let speed = item.speed;
        item.time_seconds += delta * speed;
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
    if !world.contains_resource::<Assets<NativePortableShaderMaterial>>() {
        world.init_resource::<Assets<NativePortableShaderMaterial>>();
    }
    if !world.contains_resource::<Assets<AnimationGraph>>() {
        world.init_resource::<Assets<AnimationGraph>>();
    }
    if !world.contains_resource::<Assets<Scene>>() {
        world.init_resource::<Assets<Scene>>();
    }
}

fn ensure_emissive_marker_mask(world: &mut World) {
    if world.contains_resource::<NativeEmissiveMarkerMask>() {
        return;
    }
    let mut image = Image::new_fill(
        Extent3d {
            width: THREE_COMPAT_EMISSIVE_MASK_WIDTH,
            height: THREE_COMPAT_EMISSIVE_MASK_HEIGHT,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[0, 0, 0, 255],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    image.texture_descriptor.usage =
        TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_SRC;
    let handle = world.resource_mut::<Assets<Image>>().add(image);
    world.insert_resource(NativeEmissiveMarkerMask {
        image: handle,
        layer: THREE_COMPAT_EMISSIVE_MASK_LAYER,
        height: THREE_COMPAT_EMISSIVE_MASK_HEIGHT,
        width: THREE_COMPAT_EMISSIVE_MASK_WIDTH,
    });
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
    pub base_euler: Vec3,
    pub phase: f32,
    pub strength: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Resource)]
pub struct NativeStylizedMotionTimeOverride(pub f32);

pub fn animate_native_stylized_motion(
    time: Res<Time>,
    time_override: Option<Res<NativeStylizedMotionTimeOverride>>,
    mut grass_query: Query<
        (&NativeGrassWindMotion, &mut Transform),
        Without<NativeRippleWaterMotion>,
    >,
    mut water_query: Query<(&NativeRippleWaterMotion, &mut Transform)>,
) {
    let elapsed = time_override
        .as_deref()
        .map(|override_time| override_time.0)
        .unwrap_or_else(|| time.elapsed_seconds());
    for (motion, mut transform) in &mut grass_query {
        let gust = (elapsed * 2.4 + motion.phase).sin() * 0.16
            + (elapsed * 4.1 + motion.phase * 0.37).sin() * 0.055;
        let mut next = motion.base;
        next.rotation = Quat::from_euler(
            EulerRot::XYZ,
            motion.base_euler.x + gust * 0.22,
            motion.base_euler.y,
            motion.base_euler.z + gust * motion.strength,
        );
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

include!("map_world/physics.rs");
#[cfg(test)]
mod texture_sidecar_tests {
    use super::native_texture_sidecar_path;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn native_texture_sidecar_path_supports_png_sources() {
        let root = temp_root("tn-native-texture-sidecar-png");
        let sidecar = root.join("assets/native/leaves-alpha-map.png");
        fs::create_dir_all(sidecar.parent().expect("sidecar parent")).expect("sidecar dir");
        fs::write(&sidecar, b"png").expect("sidecar fixture");

        assert_eq!(
            native_texture_sidecar_path("assets/leaves-alpha-map.png", &root),
            Some("assets/native/leaves-alpha-map.png".to_owned())
        );
    }

    fn temp_root(prefix: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "{}-{}",
            prefix,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("temp root");
        root
    }
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
        let normal = Vec3::new(-bend_dir.x, 0.35, -bend_dir.y)
            .normalize_or_zero()
            .to_array();
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
        normals.extend([normal; 4]);
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
    add_stylized_tree_material(world, color, false, None, 0.9)
}

fn add_stylized_tree_material(
    world: &mut World,
    color: Color,
    double_sided: bool,
    base_color_texture: Option<Handle<Image>>,
    roughness: f32,
) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            base_color_texture,
            double_sided,
            cull_mode: if double_sided { None } else { Some(Face::Back) },
            alpha_mode: if double_sided {
                AlphaMode::Mask(THREE_COMPAT_LEAF_ALPHA_CUTOFF)
            } else {
                AlphaMode::Opaque
            },
            perceptual_roughness: roughness,
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
        self.0 as f32 / (u32::MAX as f32 + 1.0)
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
    if trimmed.len() == 6
        && let Ok(value) = u32::from_str_radix(trimmed, 16)
    {
        let r = ((value >> 16) & 0xff) as f32 / 255.0;
        let g = ((value >> 8) & 0xff) as f32 / 255.0;
        let b = (value & 0xff) as f32 / 255.0;
        return Color::srgb(r, g, b);
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

fn spawn_ocean_water(
    world: &mut World,
    entity_id: &str,
    component: &serde_json::Value,
    transform: Transform,
    stable_id: ThreeNativeId,
    name: Name,
) -> Entity {
    let size = json_f32(component, "size", 4000.0).max(1.0);
    let color = json_color(component, "color", "#1d5d76");
    let mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Rectangle::new(size, size)));
    let material = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            metallic: 0.08,
            perceptual_roughness: 0.16,
            ..Default::default()
        });
    let parent = world
        .spawn(SpatialBundle {
            transform,
            ..Default::default()
        })
        .insert((stable_id, name))
        .id();
    let surface = world
        .spawn(PbrBundle {
            mesh,
            material,
            transform: Transform::from_rotation(Quat::from_rotation_x(
                -std::f32::consts::FRAC_PI_2,
            )),
            ..Default::default()
        })
        .insert(Name::new(format!("{entity_id}.ocean-water-surface")))
        .id();
    world.entity_mut(parent).push_children(&[surface]);
    parent
}

include!("map_world/entities.rs");
include!("map_world/rendering.rs");

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use bevy::prelude::{App, Assets, Mesh};
    use image::{Rgba, RgbaImage};
    use threenative_loader::AssetIr;

    use super::{
        Lcg, MapError, NativeMeshHandles, RuntimeConfigIr, SampledImage, StylizedSourceGroundMaps,
        ambient_occlusion_intensity_approximation, native_mesh_lod, resolve_mesh_handle,
    };

    #[test]
    fn ambient_occlusion_intensity_should_approximate_native_strength_monotonically() {
        let config = |intensity| {
            serde_json::from_value::<RuntimeConfigIr>(serde_json::json!({
                "schema": "threenative.runtime-config",
                "version": "0.1.0",
                "renderer": {
                    "antialias": "none",
                    "ambientOcclusion": {
                        "enabled": true,
                        "mode": "screen-space",
                        "radius": 3,
                        "intensity": intensity,
                        "quality": "medium"
                    }
                },
                "time": { "fixedDelta": 0.016666666666666666, "paused": false },
                "window": { "height": 720, "width": 1280 }
            }))
            .expect("runtime config should deserialize")
        };
        let low = config(0.5);
        let anchor = config(1.35);
        let high = config(2.5);

        assert!(
            ambient_occlusion_intensity_approximation(Some(&low))
                > ambient_occlusion_intensity_approximation(Some(&anchor))
        );
        assert_eq!(
            ambient_occlusion_intensity_approximation(Some(&anchor)),
            1.0
        );
        assert!(
            ambient_occlusion_intensity_approximation(Some(&high))
                < ambient_occlusion_intensity_approximation(Some(&anchor))
        );
    }

    #[test]
    fn sampled_image_should_match_three_uv_vertical_orientation() {
        let mut rgba = RgbaImage::new(2, 2);
        rgba.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        rgba.put_pixel(0, 1, Rgba([0, 0, 255, 255]));
        let image = SampledImage {
            rgba,
            width: 2,
            height: 2,
        };

        let bottom_left = image.sample_rgb_repeat(0.0, 0.0);
        let top_left = image.sample_rgb_repeat(0.0, 0.999);

        assert!(bottom_left[2] > 0.99);
        assert!(top_left[0] > 0.99);
    }

    #[test]
    fn source_ground_noise_should_clamp_like_three_shader() {
        let mut rgba = RgbaImage::new(2, 2);
        for y in 0..2 {
            rgba.put_pixel(0, y, Rgba([0, 0, 0, 255]));
            rgba.put_pixel(1, y, Rgba([255, 255, 255, 255]));
        }
        let maps = StylizedSourceGroundMaps {
            grass_color: None,
            dirt_color: None,
            dirt_ao: None,
            dirt_height: None,
            noise: Some(SampledImage {
                rgba,
                width: 2,
                height: 2,
            }),
            path_mask: None,
        };

        assert!(maps.edge_noise(0.75, 0.5) > 0.99);
    }

    #[test]
    fn lcg_should_match_web_seeded_random_sequence() {
        let mut random = Lcg::new(1337);
        let expected = [
            0.754_225_55,
            0.549_500_94,
            0.274_493_87,
            0.158_748_12,
            0.449_464,
        ];

        for value in expected {
            assert!((random.next() - value).abs() < 0.000_001);
        }
    }

    #[test]
    fn unlit_material_error_should_expose_stable_native_diagnostic() {
        let error = MapError::UnsupportedUnlitMaterial {
            material_id: "mat.backdrop".to_owned(),
        };

        assert_eq!(error.code(), "TN_BEVY_MATERIAL_UNLIT_UNSUPPORTED");
        assert_eq!(
            error.path(),
            "materials.ir.json/materials/mat.backdrop/kind"
        );
        assert!(error.suggestion().contains("freeze-gate"));
    }

    #[test]
    fn mesh_registry_should_resolve_each_asset_id_once() {
        let mut app = App::new();
        app.init_resource::<Assets<Mesh>>();
        app.init_resource::<NativeMeshHandles>();
        let base: AssetIr = serde_json::from_value(serde_json::json!({
            "id": "mesh.hero",
            "kind": "mesh",
            "format": "generated",
            "primitive": "box",
            "size": [1, 1, 1]
        }))
        .expect("base mesh asset should deserialize");
        let variant_one: AssetIr = serde_json::from_value(serde_json::json!({
            "id": "mesh.hero.lod.1",
            "kind": "mesh",
            "format": "generated",
            "primitive": "box",
            "size": [0.5, 0.5, 0.5]
        }))
        .expect("LOD1 mesh asset should deserialize");
        let variant_two: AssetIr = serde_json::from_value(serde_json::json!({
            "id": "mesh.hero.lod.2",
            "kind": "mesh",
            "format": "generated",
            "primitive": "box",
            "size": [0.25, 0.25, 0.25]
        }))
        .expect("LOD2 mesh asset should deserialize");
        let renderer = serde_json::from_value(serde_json::json!({
            "material": "mat.hero",
            "mesh": "mesh.hero",
            "lod": { "levels": [
                { "mesh": "mesh.hero.lod.1", "minDistance": 10.0000000001 },
                { "mesh": "mesh.hero.lod.2", "minDistance": 20.0000000002 }
            ] }
        }))
        .expect("LOD renderer should deserialize");
        let assets_by_id = HashMap::from([
            (base.id.as_str(), &base),
            (variant_one.id.as_str(), &variant_one),
            (variant_two.id.as_str(), &variant_two),
        ]);

        let first_base = resolve_mesh_handle(app.world_mut(), &base);
        let second_base = resolve_mesh_handle(app.world_mut(), &base);
        let mapped = native_mesh_lod(
            app.world_mut(),
            "hero",
            &renderer,
            &assets_by_id,
            "mesh.hero",
            &first_base,
        )
        .expect("LOD should map")
        .expect("renderer should contain LOD");
        let second_variant_one = resolve_mesh_handle(app.world_mut(), &variant_one);
        let second_variant_two = resolve_mesh_handle(app.world_mut(), &variant_two);

        assert_eq!(first_base.id(), second_base.id());
        assert_eq!(mapped.base_handle.id(), first_base.id());
        assert_eq!(mapped.levels.len(), 2);
        assert_eq!(mapped.levels[0].handle.id(), second_variant_one.id());
        assert_eq!(mapped.levels[1].handle.id(), second_variant_two.id());
        assert_eq!(mapped.levels[0].min_distance, 10.0000000001);
        assert_eq!(mapped.levels[1].min_distance, 20.0000000002);
        assert_ne!(first_base.id(), mapped.levels[0].handle.id());
        assert_ne!(mapped.levels[0].handle.id(), mapped.levels[1].handle.id());
        assert_eq!(app.world().resource::<Assets<Mesh>>().len(), 3);
        assert_eq!(app.world().resource::<NativeMeshHandles>().0.len(), 3);
    }

    #[test]
    fn mesh_lod_mapping_errors_should_expose_exact_native_diagnostics() {
        let mut app = App::new();
        app.init_resource::<Assets<Mesh>>();
        app.init_resource::<NativeMeshHandles>();
        let base_handle = bevy::prelude::Handle::weak_from_u128(1);
        let missing_renderer = serde_json::from_value(serde_json::json!({
            "material": "mat.hero",
            "mesh": "mesh.hero",
            "lod": { "levels": [{ "mesh": "mesh.hero.lod.1", "minDistance": 10 }] }
        }))
        .expect("renderer should deserialize");
        let missing = native_mesh_lod(
            app.world_mut(),
            "hero",
            &missing_renderer,
            &HashMap::new(),
            "mesh.hero",
            &base_handle,
        )
        .expect_err("missing LOD mesh should fail mapping");
        assert_eq!(missing.code(), "TN_BEVY_MESH_LOD_REFERENCE_MISSING");
        assert_eq!(
            missing.path(),
            "world.ir.json/entities/hero/components/MeshRenderer/lod/levels/0/mesh"
        );
        assert!(missing.suggestion().contains("mesh.hero.lod.1"));

        let invalid_renderer = serde_json::from_value(serde_json::json!({
            "material": "mat.hero",
            "mesh": "mesh.hero",
            "lod": { "levels": [{ "mesh": "mesh.hero.lod.1", "minDistance": -1 }] }
        }))
        .expect("renderer should deserialize");
        let invalid = native_mesh_lod(
            app.world_mut(),
            "hero",
            &invalid_renderer,
            &HashMap::new(),
            "mesh.hero",
            &base_handle,
        )
        .expect_err("invalid threshold should fail mapping");
        assert_eq!(invalid.code(), "TN_BEVY_MESH_LOD_THRESHOLD_INVALID");
        assert_eq!(
            invalid.path(),
            "world.ir.json/entities/hero/components/MeshRenderer/lod/levels/0/minDistance"
        );
        assert!(invalid.suggestion().contains("strictly increasing"));
    }
}
