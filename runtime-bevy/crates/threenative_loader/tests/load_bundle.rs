use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::{LoadError, load_bundle};

#[test]
fn should_load_cube_fixture_bundle() {
    let bundle = load_bundle(cube_fixture()).expect("cube fixture should load");

    assert_eq!(bundle.manifest.name, "cube-scene");
    assert!(
        bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "cube.main" && entity.components.mesh_renderer.is_some())
    );
    assert!(
        bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "camera.main" && entity.components.camera.is_some())
    );
    assert!(
        bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "light.key" && entity.components.light.is_some())
    );
}

#[test]
fn should_report_missing_bundle_path_with_source_path() {
    let root = std::env::temp_dir().join(format!(
        "tn-loader-missing-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos()
    ));

    let error = load_bundle(&root).expect_err("missing bundle path should fail");

    match error {
        LoadError::Read { path, .. } => {
            assert_eq!(path, root.display().to_string());
        }
        other => panic!("expected read error for missing bundle path, got {other:?}"),
    }
}

#[test]
fn should_reject_malicious_manifest_document_path() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "malicious",
          "requiredCapabilities": {},
          "entry": { "world": "../outside.ir.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );

    let error = load_bundle(&root).expect_err("malicious bundle should fail");

    match error {
        LoadError::InvalidBundlePath { path, message } => {
            assert_eq!(path, "../outside.ir.json");
            assert!(message.contains("parent"));
        }
        other => panic!("expected invalid path error, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_reject_malformed_generated_mesh_payloads() {
    let root = temp_bundle_dir();
    write_generated_mesh_bundle(&root);
    fs::write(root.join("mesh.position.bin"), [0_u8, 0, 0]).expect("short payload");

    let error = load_bundle(&root).expect_err("short generated mesh payload should fail");

    match error {
        LoadError::InvalidGeneratedMeshPayload { path, message } => {
            assert_eq!(path, "mesh.position.bin");
            assert!(message.contains("expected 12 bytes"));
        }
        other => panic!("expected generated mesh payload error, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_reject_long_generated_mesh_index_payload() {
    let root = temp_bundle_dir();
    write_generated_mesh_bundle(&root);
    fs::write(root.join("mesh.indices.bin"), [0_u8, 0, 1, 0, 2, 0, 3, 0])
        .expect("long index payload");

    let error = load_bundle(&root).expect_err("long generated mesh index payload should fail");

    match error {
        LoadError::InvalidGeneratedMeshPayload { path, message } => {
            assert_eq!(path, "mesh.indices.bin");
            assert!(message.contains("expected 6 bytes"));
        }
        other => panic!("expected generated mesh payload error, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_load_optional_audio_ir() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "audio",
          "requiredCapabilities": {},
          "entry": { "world": "world.ir.json", "audio": "audio.ir.json" },
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
        "audio.ir.json",
        r#"{ "schema": "threenative.audio", "version": "0.1.0", "music": [{ "id": "music.arena", "asset": "arena.music", "loop": true, "volume": 0.4 }], "oneShots": [] }"#,
    );

    let bundle = load_bundle(&root).expect("audio bundle should load");

    let audio = bundle.audio.expect("audio ir");
    assert_eq!(audio.music[0].asset, "arena.music");
    assert_eq!(audio.music[0].volume, Some(0.4));
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_load_optional_environment_scene_ir() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "environment",
          "requiredCapabilities": {},
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
        r#"{ "schema": "threenative.environment-scene", "version": "0.1.0", "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }, "sourceAssets": [], "instances": [] }"#,
    );

    let bundle = load_bundle(&root).expect("environment bundle should load");

    assert_eq!(
        bundle.environment_scene.expect("environment ir").path.id,
        "path.main"
    );
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

fn cube_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}

fn temp_bundle_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tn-audio-loader-{stamp}"));
    fs::create_dir_all(&path).expect("temp bundle dir should be created");
    path
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle json should be written");
}

fn write_minimal_bundle(root: &Path) {
    write_json(
        root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "minimal",
          "requiredCapabilities": {},
          "entry": { "world": "world.ir.json" },
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
}

fn write_generated_mesh_bundle(root: &Path) {
    write_minimal_bundle(root);
    write_json(
        root,
        "assets.manifest.json",
        r#"{
          "schema": "threenative.assets",
          "version": "0.1.0",
          "assets": [{
            "id": "mesh.custom",
            "kind": "mesh",
            "format": "generated",
            "primitive": "custom",
            "binaryAttributes": [{ "name": "position", "count": 1, "format": "float32", "itemSize": 3, "path": "mesh.position.bin" }],
            "binaryIndices": { "count": 3, "format": "uint16", "path": "mesh.indices.bin" }
          }]
        }"#,
    );
    fs::write(root.join("mesh.position.bin"), [0_u8; 12]).expect("position payload");
    fs::write(root.join("mesh.indices.bin"), [0_u8; 6]).expect("index payload");
}
