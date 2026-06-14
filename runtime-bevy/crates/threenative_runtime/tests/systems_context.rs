use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use threenative_loader::load_bundle;
use threenative_runtime::systems_context::{
    NativeSystemTimeSnapshot, build_system_context_snapshot,
    build_system_context_snapshot_with_events,
};

#[test]
fn systems_context_should_build_declared_query_snapshot() {
    let root = write_bundle("declared-query");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());

    assert_eq!(snapshot.entities.len(), 1);
    assert_eq!(snapshot.entities[0].id, "player");
    assert!(snapshot.entities[0].components.contains_key("Transform"));
    assert!(snapshot.entities[0].components.contains_key("Rotator"));
    assert!(!snapshot.entities[0].components.contains_key("Health"));
    assert_eq!(snapshot.input.actions.get("MoveForward"), Some(&true));
    assert_eq!(snapshot.input.axes.get("MoveX"), Some(&1.0));
    assert_eq!(snapshot.time.fixed_dt, 0.016);
}

#[test]
fn systems_context_should_include_bundle_and_queued_events() {
    let root = write_bundle("event-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot_with_events(
        &bundle,
        system,
        time(),
        BTreeMap::from([(
            "DamageEvent".to_owned(),
            vec![serde_json::json!({ "amount": 4 })],
        )]),
    );

    assert_eq!(
        snapshot.events.get("DamageEvent"),
        Some(&vec![
            serde_json::json!({ "amount": 2 }),
            serde_json::json!({ "amount": 4 }),
        ])
    );
}

#[test]
fn systems_context_should_include_resource_derived_states() {
    let root = write_bundle("state-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());

    assert_eq!(snapshot.states.get("Game"), Some(&Some("playing".to_owned())));
    assert_eq!(
        snapshot.states.get("Difficulty"),
        Some(&Some("danger".to_owned()))
    );
    assert_eq!(
        snapshot.states.get("Locomotion"),
        Some(&Some("airborne".to_owned()))
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
  "name": "systems-context",
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
  "events": {
    "DamageEvent": [{ "amount": 2 }]
  },
  "resources": {
    "GameState": { "difficulty": "danger", "locomotion": "airborne", "phase": "playing" }
  },
  "entities": [
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Rotator": { "speed": 2 },
        "Health": { "value": 100 }
      }
    },
    {
      "id": "camera",
      "components": {
        "Transform": { "position": [0, 2, 5], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Camera": { "kind": "perspective", "near": 0.1, "far": 100 }
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
  "lifecycle": {
    "replay": "fixed-trace",
    "state": "system-local-disallowed",
    "hotReload": "invalidate",
    "appStates": [
      { "id": "Game", "initial": "boot", "source": { "resource": "GameState", "field": "phase" }, "values": ["boot", "playing"] }
    ],
    "computedStates": [
      { "id": "Difficulty", "fallback": "safe", "source": { "resource": "GameState", "field": "difficulty" }, "values": ["safe", "danger"] }
    ],
    "substates": [
      { "id": "Locomotion", "parent": "Game", "parentValue": "playing", "fallback": "grounded", "source": { "resource": "GameState", "field": "locomotion" }, "values": ["grounded", "airborne"] }
    ]
  },
  "systems": [
    {
      "name": "rotate",
      "schedule": "update",
      "reads": ["Transform", "Rotator"],
      "writes": ["Transform"],
      "queries": [{ "with": ["Transform", "Rotator"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_rotate" }
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
        std::env::temp_dir().join(format!("tn-systems-context-{name}-{}", std::process::id()));
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
