use std::{collections::HashMap, path::Path};

use bevy::{
    asset::AssetPath,
    math::{Affine2, Vec2},
    prelude::*,
    render::texture::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
};
use serde::Serialize;
use threenative_loader::{AssetIr, AssetsManifest, EnvironmentSceneIr};

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
    pub instance_ids: Vec<String>,
    pub lod_assets: Vec<String>,
    pub source_asset: String,
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
    let controls = manifest
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
        .collect();
    TextureAssetControlsRegistry(controls)
}

pub fn apply_loaded_texture_controls(
    asset_server: Res<AssetServer>,
    controls: Res<TextureAssetControlsRegistry>,
    mut images: ResMut<Assets<Image>>,
) {
    for controls in controls.0.values() {
        let handle = load_texture_asset(&asset_server, &controls.path);
        let Some(image) = images.get_mut(&handle) else {
            continue;
        };
        apply_texture_sampler_controls(image, controls);
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
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: address_u,
        address_mode_v: address_v,
        address_mode_w: address_u,
        mag_filter,
        min_filter,
        mipmap_filter: min_filter,
        ..Default::default()
    });
}

pub fn texture_uv_transform(asset: &AssetIr) -> Affine2 {
    let repeat = asset.repeat.unwrap_or([1.0, 1.0]);
    let offset = asset.offset.unwrap_or([0.0, 0.0]);
    let rotation = asset.rotation.unwrap_or(0.0);
    let center = asset.center.unwrap_or([0.0, 0.0]);
    let centered = Affine2::from_translation(Vec2::new(-center[0], -center[1]))
        * Affine2::from_scale_angle_translation(
            Vec2::new(repeat[0], repeat[1]),
            rotation,
            Vec2::new(offset[0] + center[0], offset[1] + center[1]),
        );
    centered
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
    }
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
            NativeGltfSceneTrace {
                asset: source_asset.asset.clone(),
                category: source_asset.category.clone(),
                instance_ids,
                lod_assets,
                source_asset: source_asset.id.clone(),
            }
        })
        .collect();
    scenes.sort_by(|left, right| left.source_asset.cmp(&right.source_asset));
    scenes
}
