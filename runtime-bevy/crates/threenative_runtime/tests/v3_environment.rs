use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{gltf::GltfPlugin, prelude::*, render::mesh::VertexAttributeValues, scene::ScenePlugin};
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::{
    environment::{apply_environment_bookmark, map_environment_into_world, observe_environment},
    map_world::map_bundle_into_world,
};

#[test]
fn v3_environment_should_load_bookmarked_bundle() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "v3-environment",
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write_json(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write_json(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    write_json(
        &root,
        "environment.scene.json",
        r#"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "terrain": {
            "id": "terrain.forest",
            "heightMode": "controlPoints",
            "controlPoints": [[0, 0.4, 0], [4, -0.2, 4]],
            "bounds": { "min": [-5, 0, -5], "max": [5, 0, 5] }
          },
          "path": { "id": "path.main", "points": [[0, 0, 3], [0, 0, -3]], "width": 2 },
          "sourceAssets": [{ "id": "env.Tree", "asset": "model.env.Tree", "category": "tree" }],
          "instances": [{ "id": "tree.hero", "sourceAsset": "env.Tree", "position": [2, 0, 0], "scale": [1.2, 1.2, 1.2], "kind": "hero", "tags": ["tree"] }],
          "bookmarks": [{ "id": "bookmark.entry", "position": [0, 1.7, 4], "yaw": 180, "pitch": -5, "expectedTags": [] }]
        }"#,
    );

    let bundle = load_bundle(&root).expect("v3 environment bundle should load");
    let observation =
        observe_environment(&bundle).expect("v3 environment observation should exist");

    assert_eq!(observation.bookmark_ids, vec!["bookmark.entry"]);
    assert_eq!(observation.terrain_id.as_deref(), Some("terrain.forest"));
    assert_eq!(observation.hero_placement_ids, vec!["tree.hero"]);

    let mut app = App::new();
    map_environment_into_world(app.world_mut(), &bundle);
    let ids = app
        .world_mut()
        .query::<&ThreeNativeId>()
        .iter(app.world())
        .map(|id| id.0.as_str())
        .collect::<Vec<_>>();
    assert!(ids.contains(&"terrain:terrain.forest"));
    assert!(ids.contains(&"path:path.main:0"));
    assert!(ids.contains(&"environment:tree.hero"));

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn control_point_terrain_should_spawn_non_flat_mesh() {
    let root = temp_bundle_dir();
    write_v3_bundle_with_model_asset(&root);

    let bundle = load_bundle(&root).expect("v3 environment bundle should load");
    let mut app = App::new();
    map_environment_into_world(app.world_mut(), &bundle);

    let terrain_mesh_handle = app
        .world_mut()
        .query::<(&ThreeNativeId, &Handle<Mesh>)>()
        .iter(app.world())
        .find_map(|(id, handle)| (id.0 == "terrain:terrain.forest").then_some(handle.clone()))
        .expect("terrain mesh handle should exist");
    let meshes = app.world().resource::<Assets<Mesh>>();
    let terrain_mesh = meshes
        .get(&terrain_mesh_handle)
        .expect("terrain mesh asset should exist");
    let positions = match terrain_mesh.attribute(Mesh::ATTRIBUTE_POSITION) {
        Some(VertexAttributeValues::Float32x3(positions)) => positions,
        other => panic!("expected terrain position attribute, got {other:?}"),
    };
    let min_y = positions
        .iter()
        .map(|position| position[1])
        .fold(f32::INFINITY, f32::min);
    let max_y = positions
        .iter()
        .map(|position| position[1])
        .fold(f32::NEG_INFINITY, f32::max);

    assert!(
        positions.len() > 4,
        "control-point terrain should be subdivided instead of using a cuboid"
    );
    assert!(
        max_y - min_y > 0.01,
        "control-point terrain should have visible height variation, min={min_y}, max={max_y}"
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn path_should_spawn_flat_surface_mesh() {
    let root = temp_bundle_dir();
    write_v3_bundle_with_model_asset(&root);

    let bundle = load_bundle(&root).expect("v3 environment bundle should load");
    let mut app = App::new();
    map_environment_into_world(app.world_mut(), &bundle);

    let path_mesh_handle = app
        .world_mut()
        .query::<(&ThreeNativeId, &Handle<Mesh>)>()
        .iter(app.world())
        .find_map(|(id, handle)| (id.0 == "path:path.main:0").then_some(handle.clone()))
        .expect("path mesh handle should exist");
    let meshes = app.world().resource::<Assets<Mesh>>();
    let path_mesh = meshes
        .get(&path_mesh_handle)
        .expect("path mesh asset should exist");
    let positions = match path_mesh.attribute(Mesh::ATTRIBUTE_POSITION) {
        Some(VertexAttributeValues::Float32x3(positions)) => positions,
        other => panic!("expected path position attribute, got {other:?}"),
    };

    assert_eq!(positions.len(), 4, "path should be a flat surface, not a cuboid");
    assert!(
        positions
            .iter()
            .all(|position| position[1].abs() < f32::EPSILON),
        "path surface vertices should all share the same local Y plane"
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn app_from_bundle_should_spawn_environment_gltf_scenes_when_asset_server_is_available() {
    let root = temp_bundle_dir();
    write_v3_bundle_with_model_asset(&root);

    let bundle = load_bundle(&root).expect("v3 environment bundle should load");
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin {
            file_path: root.display().to_string(),
            ..Default::default()
        },
        ScenePlugin,
        GltfPlugin::default(),
    ));
    app.finish();
    app.cleanup();
    map_environment_into_world(app.world_mut(), &bundle);
    let scene_roots = app
        .world_mut()
        .query::<(&ThreeNativeId, &Handle<Scene>, &Transform)>()
        .iter(app.world())
        .map(|(id, _scene, transform)| (id.0.clone(), transform.translation, transform.scale))
        .collect::<Vec<_>>();

    assert!(
        scene_roots
            .iter()
            .any(|(id, translation, scale)| id == "environment:tree.hero"
                && translation.x == 2.0
                && translation.z == 0.0
                && *scale == Vec3::splat(1.2)),
        "expected tree.hero to be spawned as a Bevy SceneBundle from the GLTF asset, got {scene_roots:?}",
    );

    let placeholder_count = app
        .world_mut()
        .query::<(&ThreeNativeId, &Handle<Mesh>)>()
        .iter(app.world())
        .filter(|(id, _mesh)| id.0 == "environment:tree.hero")
        .count();
    assert_eq!(
        placeholder_count, 0,
        "GLTF-backed environment instances should not also spawn cuboid placeholders"
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn environment_bookmark_should_move_native_camera() {
    let root = temp_bundle_dir();
    write_v3_bundle_with_camera_bookmark(&root);

    let bundle = load_bundle(&root).expect("v3 camera bookmark bundle should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("world should map");

    assert!(apply_environment_bookmark(
        app.world_mut(),
        &bundle,
        "bookmark.entry"
    ));

    let transform = app
        .world_mut()
        .query::<(&ThreeNativeId, &Transform)>()
        .iter(app.world())
        .find_map(|(id, transform)| (id.0 == "camera.firstPerson").then_some(*transform))
        .expect("camera transform should exist");
    assert_eq!(transform.translation, Vec3::new(0.0, 1.7, 7.0));

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

fn write_v3_bundle_with_model_asset(root: &Path) {
    write_json(
        root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "v3-environment",
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write_json(
        root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [{ "id": "model.env.Tree", "kind": "model", "format": "gltf", "path": "assets/environment/Tree.gltf" }] }"#,
    );
    write_json(
        root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write_json(
        root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    write_json(
        root,
        "environment.scene.json",
        r#"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "terrain": {
            "id": "terrain.forest",
            "heightMode": "controlPoints",
            "controlPoints": [[0, 0.4, 0], [4, -0.2, 4]],
            "bounds": { "min": [-5, 0, -5], "max": [5, 0, 5] }
          },
          "path": { "id": "path.main", "points": [[0, 0, 3], [0, 0, -3]], "width": 2 },
          "sourceAssets": [{ "id": "env.Tree", "asset": "model.env.Tree", "category": "tree" }],
          "instances": [{ "id": "tree.hero", "sourceAsset": "env.Tree", "position": [2, 0, 0], "scale": [1.2, 1.2, 1.2], "kind": "hero", "tags": ["tree"] }],
          "bookmarks": [{ "id": "bookmark.entry", "position": [0, 1.7, 4], "yaw": 180, "pitch": -5, "expectedTags": [] }]
        }"#,
    );
}

fn write_v3_bundle_with_camera_bookmark(root: &Path) {
    write_json(
        root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "v3-environment",
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        root,
        "world.ir.json",
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [{
            "id": "camera.firstPerson",
            "components": {
              "Camera": { "kind": "perspective", "near": 0.05, "far": 180, "fovY": 62 },
              "Transform": { "position": [9, 9, 9], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
            }
          }]
        }"#,
    );
    write_json(
        root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write_json(
        root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write_json(
        root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    write_json(
        root,
        "environment.scene.json",
        r#"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "controller": {
            "camera": "camera.firstPerson",
            "height": 1.7,
            "maxSpeed": 4.5,
            "acceleration": 18,
            "sensitivity": 0.0025,
            "pointerLock": "required",
            "pitch": { "min": -75, "max": 75 },
            "input": { "forward": "MoveForward", "backward": "MoveBackward", "left": "MoveLeft", "right": "MoveRight", "lookX": "LookX", "lookY": "LookY" }
          },
          "terrain": { "id": "terrain.forest", "heightMode": "flat", "bounds": { "min": [-5, 0, -5], "max": [5, 0, 5] } },
          "path": { "id": "path.main", "points": [[0, 0, 3], [0, 0, -3]], "width": 2 },
          "sourceAssets": [],
          "instances": [],
          "bookmarks": [{ "id": "bookmark.entry", "position": [0, 1.7, 7], "yaw": 180, "pitch": -4, "expectedTags": [] }]
        }"#,
    );
}

fn temp_bundle_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tn-v3-environment-loader-{stamp}"));
    fs::create_dir_all(&path).expect("temp bundle dir should be created");
    path
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle json should be written");
}
