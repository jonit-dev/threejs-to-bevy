use std::{collections::HashMap, fs, path::Path};

use bevy::{gltf::GltfAssetLabel, prelude::*};
use serde_json::Value;
use threenative_loader::AssetIr;

pub const GRASS_COLOR_MAP_FIELD: &str = "grassColorMap";
pub const GRASS_NORMAL_MAP_FIELD: &str = "grassNormalMap";
pub const GRASS_ROUGHNESS_MAP_FIELD: &str = "grassRoughnessMap";
pub const GRASS_ROOT_COLOR_FIELD: &str = "grassRootColor";
const DEFAULT_GRASS_ROOT_COLOR: &str = "#6aa14f";
const GRASS_MODEL_FIELD: &str = "grassModel";
const TREE_LEAVES_MODEL_FIELD: &str = "treeLeavesModel";
const TREE_TRUNK_MODEL_FIELD: &str = "treeTrunkModel";

#[derive(Clone, Debug, Default)]
pub struct StylizedSourceAssets {
    pub grass_mesh: Option<Handle<Mesh>>,
    pub leaves_mesh: Option<Handle<Mesh>>,
    pub trunk_scene: Option<Handle<Scene>>,
}

impl StylizedSourceAssets {
    pub fn has_source_grass(&self) -> bool {
        self.grass_mesh.is_some()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct StylizedGrassMaterialPolicy {
    pub base_color: Color,
    pub base_color_texture_field: Option<&'static str>,
    pub normal_map_texture_field: Option<&'static str>,
    pub roughness: f32,
    pub roughness_texture_field: Option<&'static str>,
}

pub fn resolve_source_assets(
    component: &Value,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    bundle_path: &Path,
) -> StylizedSourceAssets {
    StylizedSourceAssets {
        trunk_scene: component_scene(
            component,
            TREE_TRUNK_MODEL_FIELD,
            assets_by_id,
            asset_server,
            bundle_path,
        ),
        leaves_mesh: component_primitive_mesh(
            component,
            TREE_LEAVES_MODEL_FIELD,
            assets_by_id,
            asset_server,
            bundle_path,
        ),
        grass_mesh: component_primitive_mesh(
            component,
            GRASS_MODEL_FIELD,
            assets_by_id,
            asset_server,
            bundle_path,
        ),
    }
}

pub fn grass_material_policy(
    component: &Value,
    source_assets: &StylizedSourceAssets,
) -> StylizedGrassMaterialPolicy {
    let base_color = json_color(component, GRASS_ROOT_COLOR_FIELD, DEFAULT_GRASS_ROOT_COLOR);
    if source_assets.has_source_grass() {
        return StylizedGrassMaterialPolicy {
            base_color: source_grass_native_color(base_color),
            base_color_texture_field: None,
            normal_map_texture_field: None,
            roughness: 0.85,
            roughness_texture_field: None,
        };
    }

    StylizedGrassMaterialPolicy {
        base_color,
        base_color_texture_field: Some(GRASS_COLOR_MAP_FIELD),
        normal_map_texture_field: Some(GRASS_NORMAL_MAP_FIELD),
        roughness: 0.74,
        roughness_texture_field: Some(GRASS_ROUGHNESS_MAP_FIELD),
    }
}

fn source_grass_native_color(color: Color) -> Color {
    let color = color.to_srgba();
    Color::srgb(
        (color.red * 0.93).clamp(0.0, 1.0),
        (color.green * 0.98).clamp(0.0, 1.0),
        (color.blue * 1.05).clamp(0.0, 1.0),
    )
}

fn component_scene(
    component: &Value,
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

fn component_primitive_mesh(
    component: &Value,
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

pub fn native_compatible_model_scene_path(asset: &AssetIr, bundle_path: &Path) -> Option<String> {
    let scene_path = model_scene_path(asset)?;
    if let Some(native_scene_path) = native_sidecar_scene_path(&scene_path) {
        let native_disk_path = bundle_path.join(&native_scene_path);
        if native_disk_path.exists()
            && !gltf_declares_unsupported_native_extension(&native_disk_path)
        {
            return Some(native_scene_path);
        }
    }
    compatible_scene_path(bundle_path, scene_path)
}

fn model_scene_path(asset: &AssetIr) -> Option<String> {
    if asset.kind != "model" || !matches!(asset.format.as_str(), "gltf" | "glb") {
        return None;
    }
    asset.path.clone()
}

fn native_sidecar_scene_path(scene_path: &str) -> Option<String> {
    let path = Path::new(scene_path);
    let file_name = path.file_name()?.to_str()?;
    let parent = path.parent()?.to_str()?.replace('\\', "/");
    Some(format!("{parent}/native/{file_name}"))
}

fn compatible_scene_path(bundle_path: &Path, scene_path: String) -> Option<String> {
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
    let Ok(value) = serde_json::from_str::<Value>(json) else {
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

fn json_array_contains(value: &Value, key: &str, needle: &str) -> bool {
    value
        .get(key)
        .and_then(|entry| entry.as_array())
        .is_some_and(|entries| entries.iter().any(|entry| entry.as_str() == Some(needle)))
}

fn json_color(value: &Value, key: &str, fallback: &str) -> Color {
    parse_hex_color(
        value
            .get(key)
            .and_then(|entry| entry.as_str())
            .unwrap_or(fallback),
    )
}

fn parse_hex_color(value: &str) -> Color {
    let stripped = value.trim_start_matches('#');
    if stripped.len() != 6 {
        return Color::WHITE;
    }
    let Ok(rgb) = u32::from_str_radix(stripped, 16) else {
        return Color::WHITE;
    };
    let r = ((rgb >> 16) & 0xff) as f32 / 255.0;
    let g = ((rgb >> 8) & 0xff) as f32 / 255.0;
    let b = (rgb & 0xff) as f32 / 255.0;
    Color::srgb(r, g, b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn grass_material_policy_uses_native_source_mesh_color_without_fallback_textures() {
        let component = serde_json::json!({
            "grassRootColor": "#123456",
            "grassColorMap": "tex.grass",
            "grassNormalMap": "tex.grass.normal"
        });
        let source_assets = StylizedSourceAssets {
            grass_mesh: Some(Handle::default()),
            ..Default::default()
        };

        let policy = grass_material_policy(&component, &source_assets);

        assert_srgba_close(policy.base_color, [0.06564706, 0.19984314, 0.35411763]);
        assert_eq!(policy.base_color_texture_field, None);
        assert_eq!(policy.normal_map_texture_field, None);
        assert_eq!(policy.roughness, 0.85);
        assert_eq!(policy.roughness_texture_field, None);
    }

    #[test]
    fn grass_material_policy_keeps_texture_slots_for_procedural_grass() {
        let component = serde_json::json!({});
        let policy = grass_material_policy(&component, &StylizedSourceAssets::default());

        assert_eq!(policy.base_color_texture_field, Some(GRASS_COLOR_MAP_FIELD));
        assert_eq!(
            policy.normal_map_texture_field,
            Some(GRASS_NORMAL_MAP_FIELD)
        );
        assert_eq!(policy.roughness, 0.74);
        assert_eq!(
            policy.roughness_texture_field,
            Some(GRASS_ROUGHNESS_MAP_FIELD)
        );
    }

    #[test]
    fn native_compatible_model_scene_path_prefers_native_sidecar() {
        let root = temp_bundle_root("tn-stylized-native-sidecar");
        std::fs::create_dir_all(root.join("assets/native")).expect("native asset dir");
        write_glb(
            &root.join("assets/tree.glb"),
            r#"{"asset":{"version":"2.0"},"scene":0,"scenes":[{}]}"#,
        );
        write_glb(
            &root.join("assets/native/tree.glb"),
            r#"{"asset":{"version":"2.0"},"scene":0,"scenes":[{}],"extras":{"native":true}}"#,
        );
        let asset = model_asset("assets/tree.glb");

        assert_eq!(
            native_compatible_model_scene_path(&asset, &root),
            Some("assets/native/tree.glb".to_string())
        );
    }

    #[test]
    fn native_compatible_model_scene_path_ignores_unsupported_native_sidecar() {
        let root = temp_bundle_root("tn-stylized-native-sidecar-unsupported");
        std::fs::create_dir_all(root.join("assets/native")).expect("native asset dir");
        write_glb(
            &root.join("assets/tree.glb"),
            r#"{"asset":{"version":"2.0"},"scene":0,"scenes":[{}]}"#,
        );
        write_glb(
            &root.join("assets/native/tree.glb"),
            r#"{"asset":{"version":"2.0"},"extensionsUsed":["KHR_draco_mesh_compression"],"scene":0,"scenes":[{}]}"#,
        );
        let asset = model_asset("assets/tree.glb");

        assert_eq!(
            native_compatible_model_scene_path(&asset, &root),
            Some("assets/tree.glb".to_string())
        );
    }

    fn model_asset(path: &str) -> AssetIr {
        serde_json::from_value(serde_json::json!({
            "id": "model.test",
            "kind": "model",
            "format": "glb",
            "path": path
        }))
        .expect("model asset should deserialize")
    }

    fn temp_bundle_root(prefix: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
        std::fs::create_dir_all(&root).expect("temp bundle root");
        root
    }

    fn write_glb(path: &Path, json: &str) {
        let padded_json_len = json.len().div_ceil(4) * 4;
        let total_len = 12 + 8 + padded_json_len;
        let mut bytes = Vec::with_capacity(total_len);
        bytes.extend_from_slice(b"glTF");
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&(total_len as u32).to_le_bytes());
        bytes.extend_from_slice(&(padded_json_len as u32).to_le_bytes());
        bytes.extend_from_slice(b"JSON");
        bytes.extend_from_slice(json.as_bytes());
        bytes.resize(total_len, b' ');
        std::fs::write(path, bytes).expect("glb fixture");
    }

    fn assert_srgba_close(color: Color, expected: [f32; 3]) {
        let color = color.to_srgba();
        assert!((color.red - expected[0]).abs() < 0.000001);
        assert!((color.green - expected[1]).abs() < 0.000001);
        assert!((color.blue - expected[2]).abs() < 0.000001);
    }
}
