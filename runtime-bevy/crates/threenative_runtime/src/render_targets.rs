use std::collections::HashMap;

use bevy::{
    prelude::*,
    render::{
        camera::RenderTarget,
        render_asset::RenderAssetUsages,
        render_resource::{Extent3d, TextureDimension, TextureFormat, TextureUsages},
        texture::Image,
    },
};
use threenative_loader::{AssetIr, CameraComponent, LoadedBundle};

#[derive(Clone, Debug, Resource)]
pub struct NativeRenderTargetRegistry {
    pub images: HashMap<String, Handle<Image>>,
}

impl Default for NativeRenderTargetRegistry {
    fn default() -> Self {
        Self {
            images: HashMap::new(),
        }
    }
}

#[derive(Clone, Component, Debug)]
pub struct NativeCustomProjection(pub [f32; 16]);

pub fn allocate_render_targets(
    world: &mut World,
    bundle: &LoadedBundle,
) -> NativeRenderTargetRegistry {
    let mut images = world.resource_mut::<Assets<Image>>();
    let mut registry = NativeRenderTargetRegistry::default();
    for asset in &bundle.assets.assets {
        if asset.kind != "render-target" || asset.usage.as_deref() != Some("color") {
            continue;
        }
        let width = asset.width.unwrap_or(256.0).max(1.0) as u32;
        let height = asset.height.unwrap_or(256.0).max(1.0) as u32;
        let format = match asset.format.as_str() {
            "rgba16f" => TextureFormat::Rgba16Float,
            _ => TextureFormat::Rgba8UnormSrgb,
        };
        let size = Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        };
        let mut image = Image::new_fill(
            size,
            TextureDimension::D2,
            &[0, 0, 0, 255],
            format,
            RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
        );
        image.texture_descriptor.usage = TextureUsages::RENDER_ATTACHMENT
            | TextureUsages::TEXTURE_BINDING
            | TextureUsages::COPY_SRC;
        let handle = images.add(image);
        registry.images.insert(asset.id.clone(), handle);
    }
    world.insert_resource(registry.clone());
    registry
}

pub fn camera_render_target(
    camera: &CameraComponent,
    registry: &NativeRenderTargetRegistry,
) -> Option<RenderTarget> {
    let target = camera.target.as_ref()?;
    if target.kind != "texture" {
        return None;
    }
    let asset_id = target.asset.as_ref()?;
    registry
        .images
        .get(asset_id)
        .map(|handle| RenderTarget::Image(handle.clone()))
}

pub fn render_target_descriptor(asset: &AssetIr) -> Option<(u32, u32, TextureFormat)> {
    if asset.kind != "render-target" {
        return None;
    }
    let width = asset.width.unwrap_or(256.0).max(1.0) as u32;
    let height = asset.height.unwrap_or(256.0).max(1.0) as u32;
    let format = match asset.format.as_str() {
        "rgba16f" => TextureFormat::Rgba16Float,
        _ => TextureFormat::Rgba8UnormSrgb,
    };
    Some((width, height, format))
}

pub fn list_screenshot_exports(bundle: &LoadedBundle) -> Vec<ScreenshotExportDeclaration> {
    let mut exports = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            let camera = entity.components.camera.as_ref()?;
            let output = camera.output.as_ref()?;
            let path = output.path.as_ref()?;
            Some(ScreenshotExportDeclaration {
                camera_id: entity.id.clone(),
                format: output.format.clone().unwrap_or_else(|| "png".to_owned()),
                height: output.height,
                path: path.clone(),
                width: output.width,
            })
        })
        .collect::<Vec<_>>();
    exports.sort_by(|left, right| left.camera_id.cmp(&right.camera_id));
    exports
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScreenshotExportDeclaration {
    pub camera_id: String,
    pub format: String,
    pub height: Option<u32>,
    pub path: String,
    pub width: Option<u32>,
}
