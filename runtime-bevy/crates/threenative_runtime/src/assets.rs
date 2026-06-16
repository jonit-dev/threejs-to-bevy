use std::collections::HashMap;

use bevy::{
    math::{Affine2, Vec2},
    prelude::*,
    render::texture::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
};
use threenative_loader::{AssetIr, AssetsManifest};

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
        let handle: Handle<Image> = asset_server.load(controls.path.clone());
        let Some(image) = images.get_mut(&handle) else {
            continue;
        };
        apply_texture_sampler_controls(image, controls);
    }
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
