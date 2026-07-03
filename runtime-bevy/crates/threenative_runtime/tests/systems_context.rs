use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use threenative_loader::load_bundle;
use threenative_runtime::{
    input::{NativeInputState, map_keyboard_event},
    systems_context::{
        NativeSystemTimeSnapshot, build_system_context_snapshot,
        build_system_context_snapshot_with_events,
        build_system_context_snapshot_with_events_and_input,
    },
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
    assert_eq!(snapshot.input.actions.get("MoveForward"), None);
    assert_eq!(snapshot.input.axes.get("MoveX"), None);
    assert_eq!(snapshot.time.fixed_dt, 0.016);
}

#[test]
fn systems_context_should_include_union_of_declared_query_matches() {
    let root = write_multi_query_bundle("multi-query-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());
    let entities = snapshot
        .entities
        .iter()
        .map(|entity| entity.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(entities, vec!["obstacle", "player"]);
    let obstacle = snapshot
        .entities
        .iter()
        .find(|entity| entity.id == "obstacle")
        .expect("obstacle query match should be present");
    assert!(obstacle.components.contains_key("Obstacle"));
    assert!(obstacle.components.contains_key("Transform"));
    assert!(!obstacle.components.contains_key("RunnerBody"));
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
fn systems_context_should_use_captured_native_input_when_provided() {
    let root = write_bundle("captured-input-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let input = bundle.input.as_ref().expect("input should load");
    let mut state = NativeInputState::default();
    map_keyboard_event(input, "KeyD", true, &mut state);

    let snapshot = build_system_context_snapshot_with_events_and_input(
        &bundle,
        system,
        time(),
        BTreeMap::new(),
        Some(&state),
    );

    assert_eq!(snapshot.input.actions.get("MoveForward"), None);
    assert_eq!(snapshot.input.axes.get("MoveX"), Some(&1.0));
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

    assert_eq!(
        snapshot.states.get("Game"),
        Some(&Some("playing".to_owned()))
    );
    assert_eq!(
        snapshot.states.get("Difficulty"),
        Some(&Some("danger".to_owned()))
    );
    assert_eq!(
        snapshot.states.get("Locomotion"),
        Some(&Some("airborne".to_owned()))
    );
}

#[test]
fn systems_context_should_include_observer_propagation_routes() {
    let root = write_bundle("observer-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());
    let route = snapshot
        .observer_routes
        .get("DamageEvent")
        .and_then(|routes| routes.get("weapon"))
        .expect("observer route should be present");

    assert_eq!(route.len(), 3);
    assert_eq!(route[0].entity, "weapon");
    assert_eq!(route[0].phase, "target");
    assert_eq!(route[1].entity, "player");
    assert_eq!(route[1].phase, "bubble");
    assert_eq!(route[2].entity, "root");
    assert_eq!(route[2].phase, "bubble");
}

#[test]
fn systems_context_should_include_component_hook_observations() {
    let root = write_bundle("component-hook-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());
    let hooks = snapshot
        .component_hooks
        .get("Health")
        .expect("component hook observations should be present");

    assert_eq!(hooks.len(), 2);
    assert_eq!(hooks[0].component, "Health");
    assert_eq!(hooks[0].entity, "player");
    assert_eq!(hooks[0].hook, "onAdd");
    assert_eq!(hooks[1].component, "Health");
    assert_eq!(hooks[1].entity, "player");
    assert_eq!(hooks[1].hook, "onInsert");
}

#[test]
fn systems_context_should_include_component_reflection_types() {
    let root = write_bundle("component-reflection-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());
    let types = snapshot.component_types.components;

    assert_eq!(types.len(), 1);
    assert_eq!(types[0].id, "Health");
    assert_eq!(types[0].fields.len(), 2);
    assert_eq!(types[0].fields[0].name, "current");
    assert_eq!(types[0].fields[0].kind, "number");
    assert!(types[0].fields[0].required);
    assert_eq!(types[0].fields[1].name, "max");
    assert_eq!(types[0].fields[1].default, Some(serde_json::json!(100)));
}

#[test]
fn systems_context_should_include_fixed_trace_tasks_and_channels() {
    let root = write_bundle("task-channel-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());

    assert_eq!(
        snapshot.channel_events.get("damage"),
        Some(&"DamageEvent".to_owned())
    );
    assert_eq!(snapshot.tasks.len(), 1);
    assert_eq!(snapshot.tasks[0].id, "damageHandoff");
    assert_eq!(snapshot.tasks[0].mode, "fixed-trace");
    assert_eq!(snapshot.tasks[0].schedule, "update");
    assert_eq!(snapshot.tasks[0].channel.as_deref(), Some("damage"));
}

#[test]
fn systems_context_should_include_plugin_composition_metadata() {
    let root = write_bundle("plugin-context");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];

    let snapshot = build_system_context_snapshot(&bundle, system, time());

    assert_eq!(snapshot.plugins.len(), 1);
    assert_eq!(snapshot.plugins[0].id, "core");
    assert_eq!(snapshot.plugins[0].systems, vec!["rotate".to_owned()]);
    assert_eq!(snapshot.plugin_groups.len(), 1);
    assert_eq!(snapshot.plugin_groups[0].id, "gameplay");
    assert_eq!(snapshot.plugin_groups[0].plugins, vec!["core".to_owned()]);
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
  "files": {
    "assets": "assets.manifest.json",
    "componentSchemas": "schemas/components.schema.json",
    "input": "input.ir.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    );
    fs::create_dir_all(root.join("schemas")).expect("schemas directory should be created");
    write_json(
        &root,
        "schemas/components.schema.json",
        r#"{
  "schema": "threenative.component-schemas",
  "version": "0.1.0",
  "schemas": {
    "Health": {
      "fields": {
        "current": { "kind": "number", "required": true },
        "max": { "kind": "number", "required": false, "default": 100 }
      }
    }
  }
}"#,
    );
    write_json(
        &root,
        "input.ir.json",
        r#"{
  "schema": "threenative.input",
  "version": "0.1.0",
  "actions": [
    { "id": "MoveForward", "bindings": [{ "device": "keyboard", "code": "KeyW" }] }
  ],
  "axes": [
    {
      "id": "MoveX",
      "negative": [{ "device": "keyboard", "code": "KeyA" }],
      "positive": [{ "device": "keyboard", "code": "KeyD" }],
      "value": { "device": "pointer", "axis": "deltaX" }
    }
  ]
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
      "id": "root",
      "components": {}
    },
    {
      "id": "player",
      "components": {
        "Hierarchy": { "parent": "root" },
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Rotator": { "speed": 2 },
        "Health": { "value": 100 }
      }
    },
    {
      "id": "weapon",
      "components": {
        "Hierarchy": { "parent": "player" }
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
  "componentHooks": [
    {
      "component": "Health",
      "hooks": ["onAdd", "onInsert"]
    }
  ],
  "observers": [
    {
      "event": "DamageEvent",
      "propagation": "target-ancestors",
      "phases": ["target", "bubble"]
    }
  ],
  "channels": [
    {
      "id": "damage",
      "event": "DamageEvent",
      "delivery": "fixed-trace"
    }
  ],
  "tasks": [
    {
      "id": "damageHandoff",
      "schedule": "update",
      "mode": "fixed-trace",
      "channel": "damage"
    }
  ],
  "plugins": [
    {
      "id": "core",
      "systems": ["rotate"]
    }
  ],
  "pluginGroups": [
    {
      "id": "gameplay",
      "plugins": ["core"]
    }
  ],
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

fn write_multi_query_bundle(name: &str) -> PathBuf {
    let root = root(name);
    fs::create_dir_all(&root).expect("temp bundle should be created");
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "multi-query-context",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json" },
  "files": {
    "assets": "assets.manifest.json",
    "componentSchemas": "schemas/components.schema.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    );
    fs::create_dir_all(root.join("schemas")).expect("schemas directory should be created");
    write_json(
        &root,
        "schemas/components.schema.json",
        r#"{
  "schema": "threenative.component-schemas",
  "version": "0.1.0",
  "schemas": {
    "Obstacle": { "fields": { "z": { "kind": "number", "required": true } } },
    "RunnerBody": { "fields": { "z": { "kind": "number", "required": true } } }
  }
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "events": {},
  "resources": {},
  "entities": [
    {
      "id": "obstacle",
      "components": {
        "Obstacle": { "z": -8 },
        "Transform": { "position": [0, 0, -8], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    },
    {
      "id": "player",
      "components": {
        "RunnerBody": { "z": 2.5 },
        "Transform": { "position": [0, 0, 2.5], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    },
    {
      "id": "decoration",
      "components": {
        "Transform": { "position": [3, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
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
      "name": "runner",
      "schedule": "fixedUpdate",
      "reads": ["Obstacle", "RunnerBody", "Transform"],
      "writes": ["Obstacle", "RunnerBody", "Transform"],
      "queries": [
        { "with": ["RunnerBody"], "without": [] },
        { "with": ["Obstacle"], "without": [] }
      ],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": [],
      "services": []
    }
  ]
}"#,
    );
    write_common(&root);
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
