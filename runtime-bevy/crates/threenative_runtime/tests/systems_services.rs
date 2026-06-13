use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::json;
use threenative_loader::load_bundle;
use threenative_runtime::{
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot},
    systems_services::{
        NativeRaycastHit, NativeRaycastRequest, NativeRaycastResult, animation_play_payload,
        raycast_primitive,
    },
};

#[test]
fn systems_services_should_raycast_primitive_floor() {
    let root = write_bundle("raycast-floor");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let snapshot = build_system_context_snapshot(&bundle, system, time());

    let result = raycast_primitive(
        &snapshot,
        &NativeRaycastRequest {
            direction: [0.0, -1.0, 0.0],
            ignore: vec!["player".to_owned()],
            layers: Vec::new(),
            max_distance: 2.0,
            origin: [0.0, 1.0, 0.0],
        },
    );

    assert_eq!(
        result,
        NativeRaycastResult::Hit(NativeRaycastHit {
            distance: 0.95,
            entity: "floor".to_owned(),
            hit: true,
            normal: [0.0, 1.0, 0.0],
            point: [0.0, 0.05, 0.0],
        })
    );
    assert_eq!(
        serde_json::to_value(result).expect("raycast result should serialize"),
        json!({
            "distance": 0.95,
            "entity": "floor",
            "hit": true,
            "normal": [0.0, 1.0, 0.0],
            "point": [0.0, 0.05, 0.0],
        })
    );
}

#[test]
fn systems_services_should_log_animation_play_service_call() {
    assert_eq!(
        animation_play_payload("player", "run", json!({ "loop": true })),
        json!({
            "request": { "clip": "run", "entity": "player", "options": { "loop": true } },
            "result": { "accepted": true },
        })
    );
}

fn write_bundle(name: &str) -> PathBuf {
    let root = root(name);
    fs::create_dir_all(&root).expect("temp bundle should be created");
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-services",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [8, 0.1, 8] }
      }
    }
  ]
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "raycast",
      "schedule": "fixedUpdate",
      "reads": ["Transform", "Collider"],
      "writes": [],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "services": ["physics.raycast"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_raycast" }
    }
  ]
}"#,
    );
    write_common(&root);
    fs::write(
        root.join("scripts.bundle.js"),
        "export const systems = Object.freeze({});\n",
    )
    .expect("script bundle should be written");
    root
}

fn write_common(root: &Path) {
    write_json(
        root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[]}"#,
    );
    write_json(
        root,
        "materials.ir.json",
        r#"{"schema":"threenative.materials","version":"0.1.0","materials":[]}"#,
    );
    write_json(
        root,
        "target.profile.json",
        r#"{"schema":"threenative.target-profile","version":"0.1.0","targets":["desktop"]}"#,
    );
}

fn root(name: &str) -> PathBuf {
    let root =
        std::env::temp_dir().join(format!("tn-systems-services-{name}-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).expect("old temp bundle should be removed");
    }
    root
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}

fn time() -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta: 0.016,
        dt: 0.016,
        elapsed: 1.0,
        fixed_delta: 0.016,
        fixed_dt: 0.016,
        paused: false,
    }
}
