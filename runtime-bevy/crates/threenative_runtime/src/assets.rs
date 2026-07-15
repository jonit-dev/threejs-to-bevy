use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::Path,
};

use bevy::{
    asset::{AssetId, AssetPath},
    ecs::event::ManualEventReader,
    math::{Affine2, Vec2},
    prelude::*,
    render::{
        render_resource::{TextureFormat, TextureUsages},
        texture::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
    },
};
use image::{ImageBuffer, Rgba, Rgba32FImage, RgbaImage, imageops::FilterType};
use serde::Serialize;
use threenative_loader::{AssetIr, AssetsManifest, EnvironmentSceneIr, MaterialsIr};

#[derive(Debug, PartialEq)]
pub struct NativeAssetRef {
    pub id: String,
    pub path: String,
}

#[derive(Clone, Debug, Resource)]
pub struct TextureAssetControlsRegistry(pub HashMap<String, TextureAssetControls>);

#[derive(Clone, Debug)]
pub struct TextureAssetControls {
    pub mag_filter: Option<String>,
    pub min_filter: Option<String>,
    pub path: String,
    pub wrap_s: Option<String>,
    pub wrap_t: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetLoadTrace {
    pub barrier: NativeAssetLoadBarrierTrace,
    pub assets: Vec<NativeAssetLoadTraceAsset>,
    pub gltf_scenes: Vec<NativeGltfSceneTrace>,
    pub texture_delivery: Vec<NativeTextureDeliveryTrace>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetLoadBarrierTrace {
    pub id: &'static str,
    pub model_scene_count: usize,
    pub status: &'static str,
    pub total: usize,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetLoadTraceAsset {
    pub format: String,
    pub id: String,
    pub kind: String,
    pub load_index: usize,
    pub path: String,
    pub phase: &'static str,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGltfSceneTrace {
    pub asset: String,
    pub category: String,
    pub impostors: Vec<NativeLodImpostorTrace>,
    pub instance_ids: Vec<String>,
    pub lod_assets: Vec<String>,
    pub source_asset: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLodImpostorTrace {
    pub asset: String,
    pub material: String,
    pub mode: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTextureDeliveryTrace {
    pub fallback: String,
    pub format: String,
    pub id: String,
    pub selected_path: String,
    pub variants: Vec<NativeTextureVariantTrace>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTextureVariantTrace {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<bool>,
    pub format: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub targets: Option<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeProbeObservations {
    pub assets: BTreeMap<String, NativeRuntimeAssetObservation>,
    pub materials: BTreeMap<String, NativeRuntimeMaterialObservation>,
    pub textures: BTreeMap<String, NativeRuntimeTextureObservation>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeAssetObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animations: Option<Vec<String>>,
    pub loaded: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeMaterialObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_color_texture: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeTextureObservation {
    pub loaded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat: Option<[f32; 2]>,
}

pub fn native_runtime_probe_observations(
    assets: &AssetsManifest,
    materials: &MaterialsIr,
) -> NativeRuntimeProbeObservations {
    NativeRuntimeProbeObservations {
        assets: assets
            .assets
            .iter()
            .map(|asset| {
                (
                    asset.id.clone(),
                    NativeRuntimeAssetObservation {
                        animations: asset.animations.as_ref().map(|animations| {
                            let mut clips = animations
                                .iter()
                                .filter_map(|animation| animation.source_clip.clone())
                                .collect::<Vec<_>>();
                            clips.sort();
                            clips
                        }),
                        loaded: asset.path.as_ref().is_some_and(|path| !path.is_empty()),
                    },
                )
            })
            .collect(),
        materials: materials
            .materials
            .iter()
            .map(|material| {
                (
                    material.id.clone(),
                    NativeRuntimeMaterialObservation {
                        base_color_texture: material.base_color_texture.clone(),
                    },
                )
            })
            .collect(),
        textures: assets
            .assets
            .iter()
            .filter(|asset| asset.kind == "texture")
            .map(|asset| {
                (
                    asset.id.clone(),
                    NativeRuntimeTextureObservation {
                        loaded: asset.path.as_ref().is_some_and(|path| !path.is_empty()),
                        repeat: asset.repeat,
                    },
                )
            })
            .collect(),
    }
}

pub fn resolve_asset_manifest(manifest: &AssetsManifest) -> HashMap<String, NativeAssetRef> {
    manifest
        .assets
        .iter()
        .filter_map(resolve_asset)
        .map(|asset| (asset.id.clone(), asset))
        .collect()
}

pub fn build_texture_controls_registry(manifest: &AssetsManifest) -> TextureAssetControlsRegistry {
    build_texture_controls_registry_for_environment(manifest, None)
}

pub fn build_texture_controls_registry_for_environment(
    manifest: &AssetsManifest,
    environment: Option<&EnvironmentSceneIr>,
) -> TextureAssetControlsRegistry {
    let mut controls = manifest
        .assets
        .iter()
        .filter(|asset| asset.kind == "texture")
        .filter_map(|asset| {
            let path = asset.path.clone()?;
            Some((
                asset.id.clone(),
                TextureAssetControls {
                    mag_filter: asset.mag_filter.clone(),
                    min_filter: asset.min_filter.clone(),
                    path,
                    wrap_s: asset.wrap_s.clone(),
                    wrap_t: asset.wrap_t.clone(),
                },
            ))
        })
        .collect::<HashMap<_, _>>();

    if let Some(skybox_asset) = environment
        .and_then(|environment| environment.skybox.as_ref())
        .filter(|skybox| skybox.mode == "equirect")
        .and_then(|skybox| skybox.asset.as_deref())
        && let Some(control) = controls.get_mut(skybox_asset)
    {
        control.wrap_s = Some("clampToEdge".to_owned());
        control.wrap_t = Some("clampToEdge".to_owned());
    }

    TextureAssetControlsRegistry(controls)
}

pub fn apply_loaded_texture_controls(
    asset_server: Res<AssetServer>,
    controls: Res<TextureAssetControlsRegistry>,
    mut applied: Local<HashSet<AssetId<Image>>>,
    mut initialized: Local<bool>,
    events: Option<Res<Events<AssetEvent<Image>>>>,
    mut event_reader: Local<ManualEventReader<AssetEvent<Image>>>,
    mut images: ResMut<Assets<Image>>,
) {
    let mut changed = HashSet::new();
    if let Some(events) = events.as_deref() {
        for event in event_reader.read(events) {
            match event {
                AssetEvent::Added { id }
                | AssetEvent::Modified { id }
                | AssetEvent::LoadedWithDependencies { id } => {
                    changed.insert(*id);
                }
                AssetEvent::Removed { id } | AssetEvent::Unused { id } => {
                    applied.remove(id);
                }
            }
        }
    }
    for controls in controls.0.values() {
        let handle = load_texture_asset(&asset_server, &controls.path);
        let id = handle.id();
        if applied.contains(&id) && !changed.contains(&id) {
            continue;
        }
        let Some(image) = images.get_mut(&handle) else {
            continue;
        };
        apply_texture_sampler_controls(image, controls);
        applied.insert(id);
    }
    let pending_defaults = if *initialized {
        changed.into_iter().collect::<Vec<_>>()
    } else {
        *initialized = true;
        images.iter().map(|(id, _)| id).collect::<Vec<_>>()
    };
    for id in pending_defaults {
        if applied.contains(&id) {
            continue;
        }
        let Some(image) = images.get_mut(id) else {
            continue;
        };
        if !matches!(image.sampler, ImageSampler::Default)
            || image
                .texture_descriptor
                .usage
                .contains(TextureUsages::RENDER_ATTACHMENT)
        {
            continue;
        }
        apply_default_texture_quality(image);
        applied.insert(id);
    }
}

pub fn load_texture_asset(asset_server: &AssetServer, path: &str) -> Handle<Image> {
    asset_server.load(texture_asset_path(path))
}

pub fn texture_asset_path(path: &str) -> AssetPath<'static> {
    AssetPath::from_path(Path::new(path)).into_owned()
}

pub fn apply_texture_sampler_controls(image: &mut Image, controls: &TextureAssetControls) {
    let address_u = controls
        .wrap_s
        .as_deref()
        .map(map_address_mode)
        .unwrap_or(ImageAddressMode::Repeat);
    let address_v = controls
        .wrap_t
        .as_deref()
        .map(map_address_mode)
        .unwrap_or(ImageAddressMode::Repeat);
    let mag_filter = controls
        .mag_filter
        .as_deref()
        .map(map_filter_mode)
        .unwrap_or(ImageFilterMode::Linear);
    let min_filter = controls
        .min_filter
        .as_deref()
        .map(map_filter_mode)
        .unwrap_or(ImageFilterMode::Linear);
    let requests_mipmaps = controls
        .min_filter
        .as_deref()
        .is_some_and(texture_filter_requests_mipmaps);
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: address_u,
        address_mode_v: address_v,
        address_mode_w: address_u,
        mag_filter,
        min_filter,
        mipmap_filter: min_filter,
        anisotropy_clamp: if requests_mipmaps && matches!(min_filter, ImageFilterMode::Linear) {
            8
        } else {
            1
        },
        ..Default::default()
    });
    if requests_mipmaps {
        generate_rgba_mipmaps(image);
    }
}

pub fn apply_default_texture_quality(image: &mut Image) -> bool {
    if !matches!(image.sampler, ImageSampler::Default) {
        return false;
    }
    if image
        .texture_descriptor
        .usage
        .contains(TextureUsages::RENDER_ATTACHMENT)
    {
        return false;
    }
    generate_rgba_mipmaps(image);
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: ImageAddressMode::Repeat,
        address_mode_v: ImageAddressMode::Repeat,
        address_mode_w: ImageAddressMode::Repeat,
        mag_filter: ImageFilterMode::Linear,
        min_filter: ImageFilterMode::Linear,
        mipmap_filter: ImageFilterMode::Linear,
        anisotropy_clamp: if image.texture_descriptor.mip_level_count > 1 {
            8
        } else {
            1
        },
        ..Default::default()
    });
    true
}

pub fn texture_uv_transform(asset: &AssetIr) -> Affine2 {
    let repeat = asset.repeat.unwrap_or([1.0, 1.0]);
    let offset = asset.offset.unwrap_or([0.0, 0.0]);
    let rotation = asset.rotation.unwrap_or(0.0);
    let center = asset.center.unwrap_or([0.0, 0.0]);
    Affine2::from_translation(Vec2::new(-center[0], -center[1]))
        * Affine2::from_scale_angle_translation(
            Vec2::new(repeat[0], repeat[1]),
            rotation,
            Vec2::new(offset[0] + center[0], offset[1] + center[1]),
        )
}

fn resolve_asset(asset: &AssetIr) -> Option<NativeAssetRef> {
    asset.path.as_ref().map(|path| NativeAssetRef {
        id: asset.id.clone(),
        path: path.clone(),
    })
}

fn map_address_mode(value: &str) -> ImageAddressMode {
    match value {
        "clampToEdge" => ImageAddressMode::ClampToEdge,
        "mirroredRepeat" => ImageAddressMode::MirrorRepeat,
        _ => ImageAddressMode::Repeat,
    }
}

fn map_filter_mode(value: &str) -> ImageFilterMode {
    match value {
        "nearest" | "nearestMipmapNearest" | "nearestMipmapLinear" => ImageFilterMode::Nearest,
        _ => ImageFilterMode::Linear,
    }
}

fn texture_filter_requests_mipmaps(value: &str) -> bool {
    matches!(
        value,
        "linearMipmapLinear"
            | "linearMipmapNearest"
            | "nearestMipmapLinear"
            | "nearestMipmapNearest"
    )
}

fn generate_rgba_mipmaps(image: &mut Image) {
    if image.texture_descriptor.dimension != bevy::render::render_resource::TextureDimension::D2
        || image.texture_descriptor.size.depth_or_array_layers != 1
        || image.texture_descriptor.mip_level_count > 1
        || !matches!(
            image.texture_descriptor.format,
            TextureFormat::Rgba8Unorm | TextureFormat::Rgba8UnormSrgb
        )
    {
        return;
    }
    let width = image.texture_descriptor.size.width;
    let height = image.texture_descriptor.size.height;
    let expected_base_len = width as usize * height as usize * 4;
    if width <= 1 && height <= 1 || image.data.len() != expected_base_len {
        return;
    }
    if image.texture_descriptor.format == TextureFormat::Rgba8UnormSrgb {
        generate_srgb_rgba_mipmaps(image, width, height);
        return;
    }
    let Some(mut current) = RgbaImage::from_raw(width, height, image.data.clone()) else {
        return;
    };
    let mut mip_data = image.data.clone();
    let mut mip_count = 1;
    let mut mip_width = width;
    let mut mip_height = height;
    while mip_width > 1 || mip_height > 1 {
        mip_width = (mip_width / 2).max(1);
        mip_height = (mip_height / 2).max(1);
        current = image::imageops::resize(&current, mip_width, mip_height, FilterType::Triangle);
        mip_data.extend_from_slice(current.as_raw());
        mip_count += 1;
    }
    image.data = mip_data;
    image.texture_descriptor.mip_level_count = mip_count;
}

fn generate_srgb_rgba_mipmaps(image: &mut Image, width: u32, height: u32) {
    let Some(mut current) = linear_rgba_image_from_srgb_bytes(width, height, &image.data) else {
        return;
    };
    let mut mip_data = image.data.clone();
    let mut mip_count = 1;
    let mut mip_width = width;
    let mut mip_height = height;
    while mip_width > 1 || mip_height > 1 {
        mip_width = (mip_width / 2).max(1);
        mip_height = (mip_height / 2).max(1);
        current = image::imageops::resize(&current, mip_width, mip_height, FilterType::Triangle);
        mip_data.extend(srgb_bytes_from_linear_rgba_image(&current));
        mip_count += 1;
    }
    image.data = mip_data;
    image.texture_descriptor.mip_level_count = mip_count;
}

fn linear_rgba_image_from_srgb_bytes(width: u32, height: u32, data: &[u8]) -> Option<Rgba32FImage> {
    let pixels: Vec<Rgba<f32>> = data
        .chunks_exact(4)
        .map(|pixel| {
            Rgba([
                srgb_u8_to_linear(pixel[0]),
                srgb_u8_to_linear(pixel[1]),
                srgb_u8_to_linear(pixel[2]),
                f32::from(pixel[3]) / 255.0,
            ])
        })
        .collect();
    ImageBuffer::from_vec(
        width,
        height,
        pixels
            .into_iter()
            .flat_map(|pixel| pixel.0)
            .collect::<Vec<_>>(),
    )
}

fn srgb_bytes_from_linear_rgba_image(image: &Rgba32FImage) -> Vec<u8> {
    image
        .pixels()
        .flat_map(|pixel| {
            [
                linear_to_srgb_u8(pixel[0]),
                linear_to_srgb_u8(pixel[1]),
                linear_to_srgb_u8(pixel[2]),
                linear_alpha_to_u8(pixel[3]),
            ]
        })
        .collect()
}

fn srgb_u8_to_linear(value: u8) -> f32 {
    let normalized = f32::from(value) / 255.0;
    if normalized <= 0.04045 {
        normalized / 12.92
    } else {
        ((normalized + 0.055) / 1.055).powf(2.4)
    }
}

fn linear_to_srgb_u8(value: f32) -> u8 {
    let clamped = value.clamp(0.0, 1.0);
    let encoded = if clamped <= 0.0031308 {
        clamped * 12.92
    } else {
        1.055 * clamped.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0).round() as u8
}

fn linear_alpha_to_u8(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

pub fn trace_asset_load_synchronization(
    manifest: &AssetsManifest,
    environment_scene: Option<&EnvironmentSceneIr>,
) -> NativeAssetLoadTrace {
    let mut assets: Vec<_> = manifest
        .assets
        .iter()
        .filter_map(|asset| {
            asset.path.as_ref().map(|path| NativeAssetLoadTraceAsset {
                format: asset.format.clone(),
                id: asset.id.clone(),
                kind: asset.kind.clone(),
                load_index: 0,
                path: path.clone(),
                phase: "resolved",
            })
        })
        .collect();
    assets.sort_by(|left, right| left.id.cmp(&right.id));
    for (index, asset) in assets.iter_mut().enumerate() {
        asset.load_index = index;
    }
    let gltf_scenes = trace_gltf_scenes(environment_scene);
    NativeAssetLoadTrace {
        barrier: NativeAssetLoadBarrierTrace {
            id: "bundle.requiredAssets",
            model_scene_count: gltf_scenes.len(),
            status: "ready",
            total: assets.len(),
        },
        assets,
        gltf_scenes,
        texture_delivery: trace_texture_delivery(manifest),
    }
}

fn trace_texture_delivery(manifest: &AssetsManifest) -> Vec<NativeTextureDeliveryTrace> {
    let mut traces: Vec<_> = manifest
        .assets
        .iter()
        .filter(|asset| {
            asset.kind == "texture" && (asset.variants.is_some() || asset.fallback.is_some())
        })
        .filter_map(|asset| {
            let path = asset.path.as_ref()?;
            let mut variants: Vec<_> = asset
                .variants
                .as_ref()
                .map(|variants| {
                    variants
                        .iter()
                        .map(|variant| {
                            let mut targets = variant.targets.clone();
                            if let Some(targets) = targets.as_mut() {
                                targets.sort();
                            }
                            NativeTextureVariantTrace {
                                fallback: variant.fallback,
                                format: variant.format.clone(),
                                path: variant.path.clone(),
                                targets,
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            variants.sort_by(|left, right| left.path.cmp(&right.path));
            Some(NativeTextureDeliveryTrace {
                fallback: asset.fallback.clone().unwrap_or_else(|| asset.id.clone()),
                format: asset.format.clone(),
                id: asset.id.clone(),
                selected_path: path.clone(),
                variants,
            })
        })
        .collect();
    traces.sort_by(|left, right| left.id.cmp(&right.id));
    traces
}

fn trace_gltf_scenes(environment_scene: Option<&EnvironmentSceneIr>) -> Vec<NativeGltfSceneTrace> {
    let Some(scene) = environment_scene else {
        return Vec::new();
    };
    let mut scenes: Vec<_> = scene
        .source_assets
        .iter()
        .map(|source_asset| {
            let mut instance_ids: Vec<_> = scene
                .instances
                .iter()
                .filter(|instance| instance.source_asset == source_asset.id)
                .map(|instance| instance.id.clone())
                .collect();
            instance_ids.sort();
            let mut lod_assets: Vec<_> = source_asset
                .lod
                .iter()
                .map(|level| level.asset.clone())
                .collect();
            lod_assets.sort();
            let mut impostors: Vec<_> = source_asset
                .lod
                .iter()
                .filter_map(|level| {
                    level
                        .impostor
                        .as_ref()
                        .map(|impostor| NativeLodImpostorTrace {
                            asset: level.asset.clone(),
                            material: impostor.material.clone(),
                            mode: impostor.mode.clone(),
                        })
                })
                .collect();
            impostors.sort_by(|left, right| left.asset.cmp(&right.asset));
            NativeGltfSceneTrace {
                asset: source_asset.asset.clone(),
                category: source_asset.category.clone(),
                impostors,
                instance_ids,
                lod_assets,
                source_asset: source_asset.id.clone(),
            }
        })
        .collect();
    scenes.sort_by(|left, right| left.source_asset.cmp(&right.source_asset));
    scenes
}
