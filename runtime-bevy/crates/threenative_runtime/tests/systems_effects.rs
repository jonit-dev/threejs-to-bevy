use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::json;
use threenative_loader::{SystemCommandIr, load_bundle};
use threenative_runtime::scene_manager::apply_scene_service_effects;
use threenative_runtime::systems_effects::{
    NativeSystemCommandEffect, NativeSystemEffects, NativeSystemEventEffect,
    NativeSystemPatchEffect, NativeSystemResourceEffect, NativeSystemServiceEffect,
    apply_system_effects,
};

#[test]
fn systems_effects_should_apply_declared_transform_patch() {
    let root = write_bundle("apply-transform");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    let effects = NativeSystemEffects {
        patches: vec![NativeSystemPatchEffect {
            entity: "player".to_owned(),
            component: "Transform".to_owned(),
            value: json!({ "position": [2, 3, 4] }),
        }],
        ..Default::default()
    };

    let log = apply_system_effects(&mut bundle, &system, &effects, 7, 11)
        .expect("declared effect should apply");

    let transform = bundle.world.entities[0]
        .components
        .transform
        .as_ref()
        .expect("transform should still exist");
    assert_eq!(transform.position, Some([2.0, 3.0, 4.0]));
    assert_eq!(log.schema, "threenative.web-system-effects");
    assert_eq!(log.entries[0].frame, 7);
    assert_eq!(log.entries[0].tick, 11);
}

#[test]
fn systems_effects_should_reject_undeclared_write() {
    let root = write_bundle("reject-write");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    let effects = NativeSystemEffects {
        patches: vec![NativeSystemPatchEffect {
            entity: "player".to_owned(),
            component: "Health".to_owned(),
            value: json!({ "value": 99 }),
        }],
        ..Default::default()
    };

    let diagnostics =
        apply_system_effects(&mut bundle, &system, &effects, 1, 1).expect_err("write should fail");

    assert_eq!(diagnostics[0].code, "TN_BEVY_SYSTEM_WRITE_UNDECLARED");
    assert!(diagnostics[0].message.contains("movePlayer"));
    assert!(diagnostics[0].message.contains("Health"));
}

#[test]
fn systems_effects_should_apply_declared_custom_component_patch() {
    let root = write_bundle("apply-custom-component");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let mut system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    system.writes.push("Health".to_owned());
    let effects = NativeSystemEffects {
        patches: vec![NativeSystemPatchEffect {
            entity: "player".to_owned(),
            component: "Health".to_owned(),
            value: json!({ "value": 75, "max": 100 }),
        }],
        ..Default::default()
    };

    let log = apply_system_effects(&mut bundle, &system, &effects, 4, 5)
        .expect("declared custom component effect should apply");

    assert_eq!(
        bundle.world.entities[0].components.extra.get("Health"),
        Some(&json!({ "value": 75, "max": 100 }))
    );
    assert_eq!(log.entries[0].kind, "patch");
    assert_eq!(log.entries[0].component.as_deref(), Some("Health"));
    assert_eq!(log.entries[0].frame, 4);
    assert_eq!(log.entries[0].tick, 5);
}

#[test]
fn systems_effects_should_log_declared_event_write() {
    let root = write_bundle("apply-event");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let mut system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    system.event_writes.push("PlayerMoved".to_owned());
    let effects = NativeSystemEffects {
        events: vec![NativeSystemEventEffect {
            event: "PlayerMoved".to_owned(),
            payload: json!({ "entity": "player", "distance": 1.5 }),
        }],
        ..Default::default()
    };

    let log =
        apply_system_effects(&mut bundle, &system, &effects, 8, 13).expect("event should log");

    assert_eq!(log.schema, "threenative.web-system-effects");
    assert_eq!(log.entries[0].kind, "event");
    assert_eq!(log.entries[0].event.as_deref(), Some("PlayerMoved"));
    assert_eq!(
        log.entries[0].payload,
        Some(json!({ "entity": "player", "distance": 1.5 }))
    );
    assert_eq!(log.entries[0].frame, 8);
    assert_eq!(log.entries[0].tick, 13);
    assert_eq!(
        bundle.world.events.get("PlayerMoved"),
        Some(&json!([{ "entity": "player", "distance": 1.5 }]))
    );
}

#[test]
fn systems_effects_should_apply_command_buffer_event_write() {
    let root = write_bundle("apply-command-event");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let mut system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    system.commands = vec![SystemCommandIr::EmitEvent {
        event: "Spawned".to_owned(),
    }];
    let effects = NativeSystemEffects {
        commands: vec![NativeSystemCommandEffect {
            command: "emitEvent".to_owned(),
            component: None,
            components: None,
            entity: None,
            event: Some("Spawned".to_owned()),
            payload: Some(json!({ "entity": "marker" })),
            value: None,
        }],
        ..Default::default()
    };

    apply_system_effects(&mut bundle, &system, &effects, 1, 1)
        .expect("declared command event should apply");

    assert_eq!(
        bundle.world.events.get("Spawned"),
        Some(&json!([{ "entity": "marker" }]))
    );
}

#[test]
fn systems_effects_should_reject_undeclared_service_call() {
    let root = write_bundle("reject-service");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    let effects = NativeSystemEffects {
        services: vec![NativeSystemServiceEffect {
            service: "physics.raycast".to_owned(),
            payload: json!({
                "request": { "origin": [0, 1, 0], "direction": [0, -1, 0], "maxDistance": 2 },
                "result": { "hit": false }
            }),
        }],
        ..Default::default()
    };

    let diagnostics = apply_system_effects(&mut bundle, &system, &effects, 1, 1)
        .expect_err("undeclared service should fail");

    assert_eq!(diagnostics[0].code, "TN_BEVY_SYSTEM_SERVICE_UNDECLARED");
    assert_eq!(
        diagnostics[0].path,
        "systems.ir.json/systems/movePlayer/services/physics.raycast"
    );
    assert!(diagnostics[0].message.contains("movePlayer"));
    assert!(diagnostics[0].message.contains("physics.raycast"));
}

#[test]
fn systems_effects_should_apply_scene_change_effect() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/scene-lifecycle/game.bundle");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let scenes = bundle.scenes.as_ref().expect("scenes should load").clone();
    let mut system = bundle
        .systems
        .take()
        .and_then(|systems| systems.systems.into_iter().next())
        .unwrap_or_else(|| threenative_loader::SystemIr {
            after: Vec::new(),
            before: Vec::new(),
            commands: Vec::new(),
            event_reads: Vec::new(),
            event_writes: Vec::new(),
            name: "menuActions".to_owned(),
            queries: Vec::new(),
            reads: Vec::new(),
            resource_reads: Vec::new(),
            resource_writes: Vec::new(),
            schedule: "update".to_owned(),
            script: None,
            services: Vec::new(),
            writes: Vec::new(),
        });
    system.services.push("scene.change".to_owned());
    let effects = NativeSystemEffects {
        services: vec![NativeSystemServiceEffect {
            service: "scene.change".to_owned(),
            payload: json!({
                "request": { "scene": "level" },
                "result": { "accepted": true, "operation": "change", "scene": "level" }
            }),
        }],
        ..Default::default()
    };

    apply_system_effects(&mut bundle, &system, &effects, 1, 1)
        .expect("declared scene service should validate");
    let state = apply_scene_service_effects(&scenes, &effects);

    assert_eq!(state.active_scene, "level");
    assert_eq!(
        state.trace.last().map(|event| event.scene.as_str()),
        Some("level")
    );
}

#[test]
fn systems_effects_should_apply_declared_resource_write() {
    let root = write_bundle("apply-resource");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    bundle
        .world
        .resources
        .insert("Score".to_owned(), json!({ "value": 1 }));
    let mut system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    system.resource_writes.push("Score".to_owned());
    let effects = NativeSystemEffects {
        resources: vec![NativeSystemResourceEffect {
            resource: "Score".to_owned(),
            value: json!({ "value": 2 }),
        }],
        ..Default::default()
    };

    let log = apply_system_effects(&mut bundle, &system, &effects, 9, 14)
        .expect("declared resource write should apply");

    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&json!({ "value": 2 }))
    );
    assert_eq!(log.entries[0].kind, "resource");
    assert_eq!(log.entries[0].resource.as_deref(), Some("Score"));
    assert_eq!(log.entries[0].value, Some(json!({ "value": 2 })));
    assert_eq!(log.entries[0].frame, 9);
    assert_eq!(log.entries[0].tick, 14);
}

#[test]
fn systems_effects_should_reject_undeclared_resource_write() {
    let root = write_bundle("reject-resource");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    bundle
        .world
        .resources
        .insert("Score".to_owned(), json!({ "value": 1 }));
    let system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    let effects = NativeSystemEffects {
        resources: vec![NativeSystemResourceEffect {
            resource: "Score".to_owned(),
            value: json!({ "value": 2 }),
        }],
        ..Default::default()
    };

    let diagnostics = apply_system_effects(&mut bundle, &system, &effects, 1, 1)
        .expect_err("undeclared resource write should fail");

    assert_eq!(
        diagnostics[0].code,
        "TN_BEVY_SYSTEM_RESOURCE_WRITE_UNDECLARED"
    );
    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&json!({ "value": 1 }))
    );
}

#[test]
fn systems_effects_should_apply_declared_command() {
    let root = write_bundle("apply-command");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let mut system = bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0]
        .clone();
    system.commands = vec![SystemCommandIr::Despawn {
        entity: "player".to_owned(),
    }];
    let effects = NativeSystemEffects {
        commands: vec![NativeSystemCommandEffect {
            command: "despawn".to_owned(),
            component: None,
            components: None,
            entity: Some("player".to_owned()),
            event: None,
            payload: None,
            value: None,
        }],
        ..Default::default()
    };

    apply_system_effects(&mut bundle, &system, &effects, 1, 1)
        .expect("declared command should apply");

    assert!(bundle.world.entities.is_empty());
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
  "name": "systems-effects",
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
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
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
      "name": "movePlayer",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": ["Transform"],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_movePlayer" }
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
        std::env::temp_dir().join(format!("tn-systems-effects-{name}-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).expect("old temp bundle should be removed");
    }
    root
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
