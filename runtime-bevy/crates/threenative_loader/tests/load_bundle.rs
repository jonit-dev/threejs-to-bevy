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
