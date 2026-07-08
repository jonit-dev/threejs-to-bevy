use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::{LoadError, load_bundle};

static TEMP_BUNDLE_COUNTER: AtomicU64 = AtomicU64::new(0);

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
fn should_load_kinematic_mover_component() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "world.ir.json",
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            {
              "id": "hazard",
              "components": {
                "KinematicMover": { "direction": [1, 0, 0], "mode": "sine", "radius": 2, "speed": 2 },
                "RigidBody": { "kind": "kinematic" },
                "Transform": { "position": [1, 0, 2] }
              }
            }
          ]
        }"#,
    );

    let bundle = load_bundle(&root).expect("kinematic mover bundle should load");
    let mover = bundle.world.entities[0]
        .components
        .kinematic_mover
        .as_ref()
        .expect("kinematic mover should deserialize");

    assert_eq!(mover.mode, "sine");
    assert_eq!(mover.direction, Some([1.0, 0.0, 0.0]));
    assert_eq!(mover.radius, Some(2.0));
    assert_eq!(mover.speed, 2.0);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_load_spawner_component() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "world.ir.json",
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            {
              "id": "spawner",
              "components": {
                "Spawner": {
                  "area": { "shape": "box", "size": [4, 0, 2] },
                  "enabled": true,
                  "jitterSeed": 7,
                  "maxAlive": 4,
                  "maxTotal": 8,
                  "mode": "wave",
                  "prefab": "prefab.enemy",
                  "waveSize": 2
                }
              }
            }
          ]
        }"#,
    );

    let bundle = load_bundle(&root).expect("spawner bundle should load");
    let spawner = bundle.world.entities[0]
        .components
        .spawner
        .as_ref()
        .expect("spawner should deserialize");

    assert_eq!(spawner.mode, "wave");
    assert_eq!(spawner.prefab, "prefab.enemy");
    assert_eq!(spawner.enabled, true);
    assert_eq!(spawner.wave_size, Some(2));
    assert_eq!(spawner.max_alive, Some(4));

    fs::remove_dir_all(root).expect("temp bundle should be removed");
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
fn should_reject_stale_target_profile_schema() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.targetProfile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );

    let error = load_bundle(&root).expect_err("stale target profile schema should fail");

    match error {
        LoadError::UnsupportedVersion { schema, version } => {
            assert_eq!(schema, "threenative.targetProfile");
            assert_eq!(version, "0.1.0");
        }
        other => panic!("expected unsupported target profile schema error, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_reject_unsupported_target_profile_target() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["web", "bevy"] }"#,
    );

    let error = load_bundle(&root).expect_err("unsupported target profile target should fail");

    match error {
        LoadError::UnsupportedTargetProfileTarget { path, target } => {
            assert_eq!(path, "target.profile.json/targets/1");
            assert_eq!(target, "bevy");
        }
        other => panic!("expected unsupported target profile target error, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_reject_cloud_account_storage_capability() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_manifest_with_required_capabilities(
        &root,
        r#"{ "storage": ["local-data", "account-storage"] }"#,
    );

    let error = load_bundle(&root).expect_err("cloud storage capability should fail");

    match error {
        LoadError::UnsupportedCapability {
            path,
            capability,
            code,
            ..
        } => {
            assert_eq!(path, "manifest.json/requiredCapabilities/storage");
            assert_eq!(capability, "account-storage");
            assert_eq!(code, "TN_IR_CLOUD_STORAGE_UNSUPPORTED");
        }
        other => panic!("expected unsupported cloud storage capability, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_reject_2d_tile_workflow_capability() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_manifest_with_required_capabilities(&root, r#"{ "authoring": ["tilemap"] }"#);

    let error = load_bundle(&root).expect_err("2d workflow capability should fail");

    match error {
        LoadError::UnsupportedCapability {
            path,
            capability,
            code,
            ..
        } => {
            assert_eq!(path, "manifest.json/requiredCapabilities/authoring");
            assert_eq!(capability, "tilemap");
            assert_eq!(code, "TN_IR_2D_WORKFLOW_UNSUPPORTED");
        }
        other => panic!("expected unsupported 2d workflow capability, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_reject_direct_bevy_authoring_capability() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_manifest_with_required_capabilities(&root, r#"{ "authoring": ["runtime.bevy.system"] }"#);

    let error = load_bundle(&root).expect_err("direct Bevy capability should fail");

    match error {
        LoadError::UnsupportedCapability {
            path,
            capability,
            code,
            ..
        } => {
            assert_eq!(path, "manifest.json/requiredCapabilities/authoring");
            assert_eq!(capability, "runtime.bevy.system");
            assert_eq!(code, "TN_IR_NATIVE_AUTHORING_UNSUPPORTED");
        }
        other => panic!("expected unsupported direct Bevy capability, got {other:?}"),
    }
    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn should_load_prefab_template_mesh_renderer_without_mesh() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "prefab-template",
          "requiredCapabilities": {},
          "entry": { "world": "world.ir.json", "prefabs": "prefabs.ir.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "prefabs": "prefabs.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        &root,
        "prefabs.ir.json",
        r#"{
          "schema": "threenative.prefabs",
          "version": "0.1.0",
          "prefabs": [{
            "id": "prefab.player",
            "root": "player",
            "entities": [{
              "id": "player",
              "components": { "MeshRenderer": { "material": "mat.player" } }
            }]
          }]
        }"#,
    );

    let bundle =
        load_bundle(&root).expect("prefab template with material-only MeshRenderer should load");
    let renderer = bundle
        .prefabs
        .as_ref()
        .and_then(|prefabs| prefabs.prefabs.first())
        .and_then(|prefab| prefab.entities.first())
        .and_then(|entity| entity.components.mesh_renderer.as_ref())
        .expect("prefab template MeshRenderer should deserialize");

    assert_eq!(renderer.material, "mat.player");
    assert_eq!(renderer.mesh, None);
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

#[test]
fn should_load_optional_gltf_scene_metadata() {
    let root = temp_bundle_dir();
    write_minimal_bundle(&root);
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "gltf-fidelity",
          "requiredCapabilities": {},
          "entry": { "world": "world.ir.json" },
          "files": {
            "assets": "assets.manifest.json",
            "gltfScene": "gltf.scene.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        &root,
        "gltf.scene.json",
        r#"{
          "schema": "threenative.gltf-scene",
          "version": "0.1.0",
          "assets": [{
            "assetId": "model.hero",
            "customAttributes": [],
            "materials": [{ "material": "material:HeroVisor", "extensions": [{ "extension": "KHR_materials_clearcoat", "path": "/materials/0/extensions/KHR_materials_clearcoat", "properties": ["clearcoatFactor"], "status": "promoted" }], "textureTransforms": [] }],
            "morphTargets": [{ "mesh": "mesh:Face", "path": "/meshes/0/extras/targetNames/0", "source": "mesh.extras.targetNames", "target": "Smile" }],
            "nodes": []
          }]
        }"#,
    );

    let bundle = load_bundle(&root).expect("bundle should load gltf metadata");
    let gltf_scene = bundle.gltf_scene.expect("gltf scene metadata");

    assert_eq!(gltf_scene.assets[0].asset_id, "model.hero");
    assert_eq!(
        gltf_scene.assets[0].materials[0]["material"],
        "material:HeroVisor"
    );
    assert_eq!(gltf_scene.assets[0].morph_targets[0]["target"], "Smile");
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
    let counter = TEMP_BUNDLE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let process = std::process::id();
    let path = std::env::temp_dir().join(format!("tn-audio-loader-{process}-{stamp}-{counter}"));
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

fn write_manifest_with_required_capabilities(root: &Path, required_capabilities: &str) {
    write_json(
        root,
        "manifest.json",
        &format!(
            r#"{{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "boundary-test",
          "requiredCapabilities": {required_capabilities},
          "entry": {{ "world": "world.ir.json" }},
          "files": {{
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }}
        }}"#
        ),
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
