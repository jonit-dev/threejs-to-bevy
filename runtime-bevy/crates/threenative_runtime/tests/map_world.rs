use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{asset::AssetPlugin, prelude::*, scene::ScenePlugin};
use serde_json::json;
use threenative_components::ThreeNativeId;
use threenative_loader::{WorldEntity, load_bundle};
use threenative_runtime::map_world::{
    STYLIZED_NATURE_RUNTIME_DEFAULTS, THREE_COMPAT_AMBIENT_BRIGHTNESS_PER_INTENSITY,
    THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY, map_bundle_into_world,
};

#[test]
fn should_spawn_stable_ids_for_cube_fixture() {
    let bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let ids = app
        .world_mut()
        .query::<&ThreeNativeId>()
        .iter(app.world())
        .map(|id| id.0.as_str())
        .collect::<Vec<_>>();

    assert!(ids.contains(&"cube.main"));
    assert!(ids.contains(&"camera.main"));
    assert!(ids.contains(&"light.key"));
}

#[test]
fn cube_fixture_directional_light_should_use_web_tuned_illuminance() {
    let bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app
        .world_mut()
        .query::<(&ThreeNativeId, Option<&DirectionalLight>)>();
    let light = query
        .iter(app.world())
        .find_map(|(stable_id, light)| (stable_id.0 == "light.key").then_some(light).flatten())
        .expect("cube key light should be spawned");

    assert!(
        (light.illuminance - (2.0 * THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY)).abs()
            < 0.01,
        "directional illuminance should match the web-tuned cube fixture constant"
    );
}

#[test]
fn untransformed_directional_light_should_use_three_default_direction() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    let entity = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "light.key")
        .expect("cube key light should exist");
    entity.components.transform = None;

    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<(&ThreeNativeId, &Transform)>();
    let transform = query
        .iter(app.world())
        .find_map(|(stable_id, transform)| (stable_id.0 == "light.key").then_some(transform))
        .expect("cube key light transform should be spawned");

    assert_eq!(transform.translation, Vec3::Y);
    assert!(
        transform.forward().dot(Vec3::NEG_Y) > 0.99,
        "untransformed directional lights should point from Three.js default +Y toward the origin"
    );
}

#[test]
fn cube_fixture_without_authored_ambient_should_disable_bevy_default_fill() {
    let bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let ambient = app.world().resource::<AmbientLight>();
    assert_eq!(ambient.color, Color::WHITE);
    assert!(
        ambient.brightness.abs() < 0.001,
        "missing ambient Light should not inherit Bevy default fill"
    );
}

#[test]
fn authored_ambient_light_should_drive_native_ambient_resource() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.world.entities.push(WorldEntity {
        id: "light.ambient".to_owned(),
        components: serde_json::from_value(json!({
            "Light": {
                "kind": "ambient",
                "color": "#88aaff",
                "intensity": 0.42
            }
        }))
        .expect("ambient light components should deserialize"),
    });
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let ambient = app.world().resource::<AmbientLight>();
    let color = ambient.color.to_srgba();
    assert!(
        (ambient.brightness - (0.42 * THREE_COMPAT_AMBIENT_BRIGHTNESS_PER_INTENSITY)).abs() < 0.001
    );
    assert!((color.red - 0x88 as f32 / 255.0).abs() < 0.01);
    assert!((color.green - 0xaa as f32 / 255.0).abs() < 0.01);
    assert!((color.blue - 1.0).abs() < 0.01);
}

#[test]
fn should_activate_only_declared_active_camera() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    let secondary = WorldEntity {
        id: "camera.ui".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "orthographic",
                "near": 0.1,
                "far": 100,
                "size": 4
            },
            "Transform": {
                "position": [0, 3, 5]
            }
        }))
        .expect("camera components should deserialize"),
    };
    bundle.world.entities.push(secondary);
    bundle
        .world
        .resources
        .insert("ActiveCamera".to_owned(), json!({ "entity": "camera.ui" }));
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<(&ThreeNativeId, &Camera)>();
    let cameras = query
        .iter(app.world())
        .map(|(id, camera)| (id.0.as_str(), camera.is_active))
        .collect::<Vec<_>>();

    assert!(cameras.contains(&("camera.main", false)));
    assert!(cameras.contains(&("camera.ui", true)));
}

#[test]
fn should_report_missing_material_with_stable_diagnostic_shape() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.materials.materials.clear();
    let mut app = App::new();

    let error = map_bundle_into_world(app.world_mut(), &bundle)
        .expect_err("missing material should fail mapping");

    assert_eq!(error.code(), "TN_BEVY_MATERIAL_REFERENCE_MISSING");
    assert_eq!(
        error.path(),
        "world.ir.json/entities/cube.main/components/MeshRenderer/material"
    );
    assert!(error.suggestion().contains("materials.ir.json"));
}

#[test]
fn should_report_missing_mesh_with_stable_diagnostic_shape() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.assets.assets.clear();
    let mut app = App::new();

    let error =
        map_bundle_into_world(app.world_mut(), &bundle).expect_err("missing mesh should fail");

    assert_eq!(error.code(), "TN_BEVY_MESH_REFERENCE_MISSING");
    assert_eq!(
        error.path(),
        "world.ir.json/entities/cube.main/components/MeshRenderer/mesh"
    );
    assert!(error.suggestion().contains("assets.manifest.json"));
}

#[test]
fn stylized_nature_runtime_defaults_should_match_shared_contract() {
    let contract_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/stylized-nature-contract.json");
    let contract: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(contract_path).expect("contract fixture should read"),
    )
    .expect("contract fixture should parse");
    let defaults = &contract["runtimeExpansionDefaults"];

    assert_eq!(
        defaults["fallbackGrassCount"].as_u64(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.fallback_grass_count as u64)
    );
    assert_eq!(
        defaults["treeCount"].as_u64(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.tree_count as u64)
    );
    assert_eq!(
        defaults["size"].as_f64(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.size as f64)
    );
    assert_eq!(
        defaults["pathWidth"].as_f64(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.path_width as f64)
    );
    assert!(
        (defaults["windStrength"]
            .as_f64()
            .expect("windStrength should be numeric")
            - STYLIZED_NATURE_RUNTIME_DEFAULTS.wind_strength as f64)
            .abs()
            < 0.000_001
    );
    assert_eq!(
        defaults["barkColor"].as_str(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.bark_color)
    );
    assert_eq!(
        defaults["leafColor"].as_str(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.leaf_color)
    );
    assert_eq!(
        defaults["nativeGroundColor"].as_str(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.native_ground_color)
    );
    assert_eq!(
        defaults["grassGeometryRootColor"].as_str(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.grass_geometry_root_color)
    );
    assert_eq!(
        defaults["grassGeometryTipColor"].as_str(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.grass_geometry_tip_color)
    );
    assert_eq!(
        defaults["grassMaterialColor"].as_str(),
        Some(STYLIZED_NATURE_RUNTIME_DEFAULTS.grass_material_color)
    );
}

#[test]
fn stylized_nature_should_use_native_compatible_source_assets() {
    let root = temp_bundle_root("tn-stylized-source-compatible");
    write_glb(
        &root.join("assets/trunk.glb"),
        r#"{"asset":{"version":"2.0"},"scene":0,"scenes":[{}]}"#,
    );
    write_glb(
        &root.join("assets/leaves.glb"),
        r#"{"asset":{"version":"2.0"},"scene":0,"scenes":[{}]}"#,
    );
    write_glb(
        &root.join("assets/grass.glb"),
        r#"{"asset":{"version":"2.0"},"scene":0,"scenes":[{}],"meshes":[{"primitives":[{}]}]}"#,
    );
    let mut bundle =
        stylized_source_bundle(&root, "model.trunk", "model.leaves", "model.grass", 32);
    bundle.assets.assets.push(
        serde_json::from_value(json!({
            "id": "tex.stylized-scene.sky",
            "kind": "texture",
            "format": "png",
            "path": "assets/sky.png"
        }))
        .expect("sky texture asset should deserialize"),
    );
    bundle.assets.assets.push(
        serde_json::from_value(json!({
            "id": "model.trunk",
            "kind": "model",
            "format": "glb",
            "path": "assets/trunk.glb"
        }))
        .expect("trunk asset should deserialize"),
    );
    bundle.assets.assets.push(
        serde_json::from_value(json!({
            "id": "model.leaves",
            "kind": "model",
            "format": "glb",
            "path": "assets/leaves.glb"
        }))
        .expect("leaves asset should deserialize"),
    );
    bundle.assets.assets.push(
        serde_json::from_value(json!({
            "id": "model.grass",
            "kind": "model",
            "format": "glb",
            "path": "assets/grass.glb"
        }))
        .expect("grass asset should deserialize"),
    );
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin {
            file_path: root.display().to_string(),
            ..Default::default()
        },
        ScenePlugin,
    ));
    app.init_asset::<Mesh>();
    app.init_asset::<Image>();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");
    let names = world_names(app.world_mut());

    assert!(names.iter().any(|name| name.contains("source-trunk")));
    assert!(names.iter().any(|name| name.contains("source-leaves")));
    assert!(names.iter().any(|name| name.contains("source-grass")));
    assert!(sky_material_has_texture(app.world_mut()));
    assert!(!names.iter().any(|name| name.ends_with(".tree-0.trunk")));
    assert!(!names.iter().any(|name| name.ends_with(".tree-0.leaf-0")));
    assert!(!names.iter().any(|name| name.contains("stylized-grass")));
    assert!(
        !names
            .iter()
            .any(|name| name.contains("soft-gradient-sky-card"))
    );
    assert!(
        !names
            .iter()
            .any(|name| name.contains("soft-stylized-cloud"))
    );
    assert!(!names.iter().any(|name| name.contains("path-pebble")));
    assert!(!names.iter().any(|name| name.contains("path-crack")));
    assert!(
        !names
            .iter()
            .any(|name| name.contains("source-dirt-path-ribbon"))
    );
}
#[test]
fn stylized_nature_should_keep_fallback_for_missing_or_unsupported_source_assets() {
    let root = temp_bundle_root("tn-stylized-source-unsupported");
    write_glb(
        &root.join("assets/trunk.glb"),
        r#"{"asset":{"version":"2.0"},"extensionsUsed":["KHR_draco_mesh_compression","EXT_texture_webp"],"extensionsRequired":["KHR_draco_mesh_compression","EXT_texture_webp"],"scene":0,"scenes":[{}]}"#,
    );
    write_glb(
        &root.join("assets/grass.glb"),
        r#"{"asset":{"version":"2.0"},"extensionsUsed":["KHR_draco_mesh_compression"],"extensionsRequired":["KHR_draco_mesh_compression"],"scene":0,"scenes":[{}],"meshes":[{"primitives":[{}]}]}"#,
    );
    let mut bundle = stylized_source_bundle(
        &root,
        "model.trunk",
        "model.missing-leaves",
        "model.grass",
        4,
    );
    bundle.assets.assets.push(
        serde_json::from_value(json!({
            "id": "model.trunk",
            "kind": "model",
            "format": "glb",
            "path": "assets/trunk.glb"
        }))
        .expect("trunk asset should deserialize"),
    );
    bundle.assets.assets.push(
        serde_json::from_value(json!({
            "id": "model.grass",
            "kind": "model",
            "format": "glb",
            "path": "assets/grass.glb"
        }))
        .expect("grass asset should deserialize"),
    );
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin {
            file_path: root.display().to_string(),
            ..Default::default()
        },
        ScenePlugin,
    ));
    app.init_asset::<Mesh>();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");
    let names = world_names(app.world_mut());

    assert!(!names.iter().any(|name| name.contains("source-trunk")));
    assert!(!names.iter().any(|name| name.contains("source-leaves")));
    assert!(!names.iter().any(|name| name.contains("source-grass")));
    assert!(names.iter().any(|name| name.ends_with(".tree-0.trunk")));
    assert!(names.iter().any(|name| name.ends_with(".tree-0.leaf-0")));
    assert!(names.iter().any(|name| name.contains("stylized-grass")));
}

fn cube_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}

fn stylized_source_bundle(
    root: &std::path::Path,
    trunk_asset: &str,
    leaves_asset: &str,
    grass_asset: &str,
    grass_count: usize,
) -> threenative_loader::LoadedBundle {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.bundle_path = root.to_path_buf();
    bundle.assets.assets.clear();
    bundle.world.entities.clear();
    bundle.world.resources.clear();
    bundle.world.entities.push(WorldEntity {
        id: "stylized.nature".to_owned(),
        components: serde_json::from_value(json!({
            "StylizedNature": {
                "treeTrunkModel": trunk_asset,
                "treeLeavesModel": leaves_asset,
                "grassModel": grass_asset,
                "treeCount": 1,
                "grassCount": grass_count,
                "size": 8
            }
        }))
        .expect("stylized nature components should deserialize"),
    });
    bundle
}

fn world_names(world: &mut World) -> Vec<String> {
    let mut query = world.query::<&Name>();
    query
        .iter(world)
        .map(|name| name.as_str().to_owned())
        .collect()
}

fn sky_material_has_texture(world: &mut World) -> bool {
    let sky_materials = {
        let mut query = world.query::<(&Name, &Handle<StandardMaterial>)>();
        query
            .iter(world)
            .filter(|(name, _)| name.as_str().contains("stylized-soft-sky-gradient"))
            .map(|(_, handle)| handle.clone())
            .collect::<Vec<_>>()
    };
    let materials = world.resource::<Assets<StandardMaterial>>();
    sky_materials.iter().any(|handle| {
        materials
            .get(handle)
            .and_then(|material| material.base_color_texture.as_ref())
            .is_some()
    })
}

fn temp_bundle_root(prefix: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "{}-{}",
        prefix,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(root.join("assets")).expect("temporary asset dir should be created");
    root
}

fn write_glb(path: &std::path::Path, json: &str) {
    let mut json_bytes = json.as_bytes().to_vec();
    while !json_bytes.len().is_multiple_of(4) {
        json_bytes.push(b' ');
    }
    let total_len = 12 + 8 + json_bytes.len();
    let mut bytes = Vec::with_capacity(total_len);
    bytes.extend_from_slice(b"glTF");
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&(total_len as u32).to_le_bytes());
    bytes.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&0x4E4F_534Au32.to_le_bytes());
    bytes.extend_from_slice(&json_bytes);
    fs::write(path, bytes).expect("glb fixture should be written");
}
