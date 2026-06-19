use std::{
    fs,
    path::{Path, PathBuf},
};

use threenative_loader::load_bundle;
use threenative_runtime::{
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot},
    systems_host::{
        diagnose_native_system_host, ensure_native_system_host_supported, run_native_systems_once,
        unsupported_native_system_host_diagnostic,
    },
};

#[test]
fn systems_host_should_call_quickjs_system_export() {
    let root = write_bundle("call-export", "system_movePlayer");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let system = bundle
        .systems
        .as_ref()
        .and_then(|systems| systems.systems.first())
        .expect("system should exist");
    let snapshot = build_system_context_snapshot(&bundle, system, time());
    assert_eq!(snapshot.entities.len(), 1);
    assert_eq!(snapshot.entities[0].id, "player");
    assert!(snapshot.entities[0].components.contains_key("Transform"));
    assert_eq!(
        snapshot.default_query["with"],
        serde_json::json!(["Transform"])
    );
    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    let transform = bundle.world.entities[0]
        .components
        .transform
        .as_ref()
        .expect("transform should still exist");
    assert_eq!(transform.position, Some([0.016, 0.0, 0.0]));
    assert_eq!(run.logs[0].schema, "threenative.web-system-effects");
    assert_eq!(run.logs[0].entries[0].kind, "patch");
    assert_eq!(run.logs[0].entries[0].system, "movePlayer");
}

#[test]
fn systems_host_should_pass_time_resource_to_quickjs_system() {
    let root = write_bundle("time-context", "system_movePlayer");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    let transform = bundle.world.entities[0]
        .components
        .transform
        .as_ref()
        .expect("transform should still exist");
    assert_eq!(transform.position, Some([0.016, 0.0, 0.0]));
}

#[test]
fn systems_host_should_apply_declared_resource_write() {
    let root = write_resource_bundle("resource-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");
    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&serde_json::json!({ "value": 3 }))
    );
    assert_eq!(run.logs[0].entries[0].kind, "resource");
    assert_eq!(run.logs[0].entries[0].resource.as_deref(), Some("Score"));
    assert_eq!(
        run.logs[0].entries[0].value,
        Some(serde_json::json!({ "value": 3 }))
    );
}

#[test]
fn systems_host_should_expose_mesh_picking_service() {
    let root = write_picking_bundle("picking-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");
    assert_eq!(
        bundle.world.resources.get("PickReport"),
        Some(&serde_json::json!({ "entity": "crate", "hit": true }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| entry.kind == "service" && entry.service.as_deref() == Some("picking.mesh"))
        .expect("picking service call should be logged");
    assert_eq!(service_entry.kind, "service");
    assert_eq!(service_entry.service.as_deref(), Some("picking.mesh"));
}

#[test]
fn systems_host_should_expose_pointer_ray_service() {
    let root = write_picking_bundle("pointer-ray-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PickReport"),
        Some(&serde_json::json!({ "entity": "crate", "hit": true }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(service_names, vec!["picking.mesh", "picking.pointerRay"]);
}

#[test]
fn systems_host_should_expose_asset_lookup_and_load_service() {
    let root = write_asset_service_bundle("asset-service-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AssetReport"),
        Some(&serde_json::json!({
            "first": "mesh.crate",
            "loaded": true,
            "missing": "missing",
            "total": 1
        }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| entry.kind == "service" && entry.service.as_deref() == Some("assets.load"))
        .expect("asset load service call should be logged");
    assert_eq!(service_entry.service.as_deref(), Some("assets.load"));
}

#[test]
fn systems_host_should_expose_character_move_service() {
    let root = write_character_service_bundle("character-move-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("CharacterReport"),
        Some(&serde_json::json!({
            "entity": "player",
            "grounded": true,
            "ground": "floor",
            "resolved": [1, 0.55, 0]
        }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| entry.kind == "service" && entry.service.as_deref() == Some("character.move"))
        .expect("character move service call should be logged");
    assert_eq!(service_entry.service.as_deref(), Some("character.move"));
}

#[test]
fn systems_host_should_expose_audio_facade() {
    let root = write_audio_facade_service_bundle("audio-facade-context");
    let mut bundle = load_bundle(&root).expect("audio facade bundle should load");
    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AudioReport"),
        Some(&serde_json::json!({
            "playbackId": "sound.hit#1",
            "playStatus": "playing",
            "stopStatus": "stopped"
        }))
    );
    let service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    assert_eq!(service_names, vec!["audio.play", "audio.stop"]);
}

#[test]
fn systems_host_should_expose_persistence_and_settings_facades() {
    let root = write_persistence_settings_bundle("persistence-settings-context");
    let mut bundle = load_bundle(&root).expect("persistence settings bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PersistenceReport"),
        Some(&serde_json::json!({
            "difficulty": "hard",
            "loadedScore": 7,
            "saved": true,
            "slots": ["slot.auto"],
            "volume": 0.5
        }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(
        service_names,
        vec![
            "persistence.listSlots",
            "persistence.load",
            "persistence.save",
            "settings.get",
            "settings.get",
            "settings.set",
        ]
    );
}

#[test]
fn systems_host_should_expose_retained_ui_facade() {
    let root = write_ui_facade_bundle("ui-facade-context");
    let mut bundle = load_bundle(&root).expect("ui facade bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("UiReport"),
        Some(&serde_json::json!({
            "action": "StartGame",
            "disabled": true,
            "focused": true,
            "previousFocus": "play",
            "value": 0.75
        }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(
        service_names,
        vec![
            "ui.activate",
            "ui.focus",
            "ui.read",
            "ui.read",
            "ui.setDisabled",
            "ui.setValue",
        ]
    );
}

#[test]
fn systems_host_should_expose_animation_query_and_stop_services() {
    let root = write_animation_control_service_bundle("animation-control-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AnimationReport"),
        Some(&serde_json::json!({
            "active": true,
            "clip": "run",
            "entity": "player",
            "postStopActive": false,
            "postStopReason": "requested",
            "stopped": true
        }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(
        service_names,
        vec![
            "animation.play",
            "animation.query",
            "animation.query",
            "animation.stop"
        ]
    );
}

#[test]
fn should_stop_animation_state_when_stop_service_is_called() {
    let root = write_animation_control_service_bundle("animation-control-stop-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");
    let post_stop_query = run.logs[0]
        .entries
        .iter()
        .filter(|entry| {
            entry.kind == "service" && entry.service.as_deref() == Some("animation.query")
        })
        .filter_map(|entry| entry.payload.as_ref())
        .filter_map(|payload| payload.get("result"))
        .find(|result| {
            result.get("active") == Some(&serde_json::json!(false))
                && result.get("stopReason") == Some(&serde_json::json!("requested"))
        })
        .expect("post-stop query result should be logged");

    assert_eq!(
        post_stop_query,
        &serde_json::json!({
            "active": false,
            "activeState": "run",
            "clip": "run",
            "entity": "player",
            "loop": true,
            "normalizedTime": 0,
            "sourceClip": "run",
            "speed": 1.5,
            "stopped": true,
            "stopReason": "requested",
            "timeSeconds": 0
        })
    );
}

#[test]
fn systems_host_should_expose_seeded_random_helpers() {
    let root = write_random_bundle("random-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    let first = bundle
        .world
        .resources
        .get("RandomReport")
        .expect("random report should be written")
        .clone();
    let mut second_bundle = load_bundle(&root).expect("scripted bundle should load again");
    run_native_systems_once(&mut second_bundle, time()).expect("system should run again");
    assert_eq!(
        second_bundle.world.resources.get("RandomReport"),
        Some(&first)
    );
}

#[test]
fn systems_host_should_expose_timer_helpers() {
    let root = write_timer_bundle("timer-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("TimerReport"),
        Some(&serde_json::json!({
            "done": true,
            "elapsed": 1.5,
            "progress": 0.75,
            "ready": false,
            "remaining": 0.5
        }))
    );
}

#[test]
fn systems_host_should_apply_query_metadata() {
    let root = write_query_metadata_bundle("query-metadata-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("QueryReport"),
        Some(&serde_json::json!({ "ids": ["player"] }))
    );
}

#[test]
fn systems_host_should_run_startup_before_update() {
    let root = write_startup_bundle("startup-order");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("systems should run");

    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&serde_json::json!({ "value": 6 }))
    );
    assert_eq!(run.logs.len(), 2);
    assert_eq!(run.logs[0].entries[0].system, "bootScore");
    assert_eq!(run.logs[0].entries[0].schedule, "startup");
    assert_eq!(run.logs[1].entries[0].system, "score");
    assert_eq!(run.logs[1].entries[0].schedule, "update");
}

#[test]
fn systems_host_should_run_systems_using_ordering_constraints() {
    let root = write_ordering_bundle("ordering-constraints");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("systems should run");

    assert_eq!(
        bundle.world.resources.get("Order"),
        Some(&serde_json::json!({ "values": ["collectInput", "applyDamage", "score"] }))
    );
    assert_eq!(run.logs.len(), 3);
    assert_eq!(run.logs[0].entries[0].system, "collectInput");
    assert_eq!(run.logs[1].entries[0].system, "applyDamage");
    assert_eq!(run.logs[2].entries[0].system, "score");
}

#[test]
fn systems_host_should_reconcile_spawned_entities_events_and_resources_across_schedules() {
    let root = write_gameplay_host_bundle("gameplay-host");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("systems should run");

    assert!(
        bundle
            .world
            .entities
            .iter()
            .all(|entity| entity.id != "marker")
    );
    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&serde_json::json!({ "events": 2, "health": 1 }))
    );
    assert_eq!(
        bundle.world.events.get("Spawned"),
        Some(&serde_json::json!([{ "via": "direct" }, { "via": "command" }]))
    );
}

#[test]
fn systems_host_should_expose_fixed_trace_tasks_and_channels() {
    let root = write_task_channel_bundle("task-channel");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.events.get("LifecycleEvent"),
        Some(&serde_json::json!([
            { "phase": "seed" },
            { "phase": "next", "taskChannel": "lifecycle", "taskCount": 1 }
        ]))
    );
    assert_eq!(run.logs[0].entries[0].kind, "event");
    assert_eq!(
        run.logs[0].entries[0].payload,
        Some(serde_json::json!({ "phase": "next", "taskChannel": "lifecycle", "taskCount": 1 }))
    );
}

#[test]
fn systems_host_should_expose_plugin_composition_metadata() {
    let root = write_plugin_bundle("plugin-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PluginReport"),
        Some(&serde_json::json!({
            "group": "gameplay",
            "hasCore": true,
            "pluginCount": 1,
            "systemCount": 1
        }))
    );
}

#[test]
fn systems_host_should_reject_missing_export() {
    let root = write_bundle("missing-export", "missing_export");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let error =
        run_native_systems_once(&mut bundle, time()).expect_err("missing export should fail");

    assert_eq!(error.code, "TN_BEVY_SYSTEM_EXPORT_MISSING");
    assert!(error.message.contains("movePlayer"));
    assert!(error.message.contains("missing_export"));
}

#[test]
fn systems_host_should_allow_bundle_without_script_host() {
    let root = write_bundle_without_scripts("without-scripts");
    let bundle = load_bundle(&root).expect("bundle should load");

    assert!(diagnose_native_system_host(&bundle).is_empty());
    ensure_native_system_host_supported(&bundle).expect("bundle without scripts should run");
}

#[test]
fn systems_host_should_keep_unsupported_diagnostic_for_unavailable_builds() {
    let diagnostic = unsupported_native_system_host_diagnostic("movePlayer");

    assert_eq!(diagnostic.code, "TN_BEVY_SYSTEM_HOST_UNSUPPORTED");
    assert_eq!(diagnostic.severity, "error");
    assert_eq!(diagnostic.system_id.as_deref(), Some("movePlayer"));
    assert!(diagnostic.message.contains("QuickJS host"));
}

fn write_startup_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Score": { "value": 3 }
  }
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
      "name": "score",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_score" }
    },
    {
      "name": "bootScore",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_bootScore" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_bootScore = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 1 });
};
const system_score = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 2 });
};
export const systemIds = Object.freeze({ "system_bootScore": "bootScore", "system_score": "score" });
export const systems = Object.freeze({ "system_bootScore": system_bootScore, "system_score": system_score });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_resource_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Score": { "value": 1 }
  }
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
      "name": "score",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_score" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_score = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 2 });
};
export const systemIds = Object.freeze({ "system_score": "score" });
export const systems = Object.freeze({ "system_score": system_score });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_ordering_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Order": { "values": [] }
  }
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
      "name": "score",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Order"],
      "resourceWrites": ["Order"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_score" }
    },
    {
      "name": "applyDamage",
      "schedule": "update",
      "after": ["collectInput"],
      "before": ["score"],
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Order"],
      "resourceWrites": ["Order"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_applyDamage" }
    },
    {
      "name": "collectInput",
      "schedule": "update",
      "before": ["applyDamage"],
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Order"],
      "resourceWrites": ["Order"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_collectInput" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const append = (ctx, value) => {
  const order = ctx.resources.get("Order");
  ctx.resources.set("Order", { values: [...order.values, value] });
};
const system_score = (ctx) => append(ctx, "score");
const system_applyDamage = (ctx) => append(ctx, "applyDamage");
const system_collectInput = (ctx) => append(ctx, "collectInput");
export const systems = Object.freeze({
  "system_score": system_score,
  "system_applyDamage": system_applyDamage,
  "system_collectInput": system_collectInput
});
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_picking_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[
  { "id": "mesh.crate", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] }
]}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "camera.main",
      "components": {
        "Transform": { "position": [0, 0, 4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Camera": { "kind": "perspective", "fovY": 60, "near": 0.1, "far": 100 }
      }
    },
    {
      "id": "crate",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "MeshRenderer": { "mesh": "mesh.crate", "material": "mat.crate" }
      }
    }
  ],
  "resources": {
    "ActiveCamera": { "entity": "camera.main" },
    "PickReport": { "hit": false }
  }
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
      "name": "pick",
      "schedule": "update",
      "reads": ["Transform", "MeshRenderer", "Camera"],
      "writes": [],
      "queries": [
        { "with": ["Transform", "MeshRenderer"], "without": [] },
        { "with": ["Camera"], "without": [] }
      ],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": ["PickReport"],
      "services": ["picking.mesh", "picking.pointerRay"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_pick" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_pick = (ctx) => {
  const ray = ctx.picking.pointerRay({ pointer: [0.5, 0.5] });
  const result = ray.hit ? ctx.picking.mesh(ray) : { hit: false };
  ctx.resources.set("PickReport", { hit: result.hit, entity: result.hit ? result.entity : null });
};
export const systemIds = Object.freeze({ "system_pick": "pick" });
export const systems = Object.freeze({ "system_pick": system_pick });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_asset_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[
  { "id": "mesh.crate", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] }
]}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "AssetReport": {}
  }
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
      "name": "reportAssets",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["AssetReport"],
      "resourceWrites": ["AssetReport"],
      "services": ["assets.load"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportAssets" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportAssets = (ctx) => {
  const list = ctx.assets.list();
  const ready = ctx.assets.load("mesh.crate");
  const missing = ctx.assets.load("mesh.missing");
  ctx.resources.set("AssetReport", {
    first: ctx.assets.get("mesh.crate").id,
    loaded: ready.accepted && ready.asset.id === "mesh.crate",
    missing: missing.status,
    total: list.length
  });
};
export const systemIds = Object.freeze({ "system_reportAssets": "reportAssets" });
export const systems = Object.freeze({ "system_reportAssets": system_reportAssets });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_character_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "floor",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [8, 0.1, 8], "layer": "world", "mask": ["player"] },
        "RigidBody": { "kind": "static" }
      }
    },
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [0.5, 1, 0.5], "layer": "player", "mask": ["world"] },
        "RigidBody": { "kind": "kinematic" },
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2,
          "stepOffset": 0.25
        }
      }
    }
  ],
  "resources": {
    "CharacterReport": {}
  }
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
      "name": "moveCharacter",
      "schedule": "update",
      "reads": ["Transform", "Collider", "RigidBody", "CharacterController"],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["CharacterReport"],
      "resourceWrites": ["CharacterReport"],
      "services": ["character.move"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_moveCharacter" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_moveCharacter = (ctx) => {
  const result = ctx.character.move("player", { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 0.5 });
  const rounded = result.resolved.map((value) => Number(value.toFixed(6)));
  ctx.resources.set("CharacterReport", {
    entity: result.entity,
    grounded: result.grounded,
    ground: result.groundEntity,
    resolved: rounded
  });
};
export const systemIds = Object.freeze({ "system_moveCharacter": "moveCharacter" });
export const systems = Object.freeze({ "system_moveCharacter": system_moveCharacter });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_audio_facade_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "audio-facade",
  "requiredCapabilities": {},
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json",
    "scripts": "scripts.bundle.js",
    "audio": "audio.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    { "id": "hit.sound", "kind": "audio", "format": "wav", "path": "assets/hit.wav" }
  ]
}"#,
    );
    fs::create_dir_all(root.join("assets")).expect("assets dir should exist");
    fs::write(root.join("assets/hit.wav"), b"").expect("audio asset should exist");
    write_json(
        &root,
        "audio.ir.json",
        r#"{
  "schema": "threenative.audio",
  "version": "0.1.0",
  "music": [],
  "oneShots": [{ "id": "sound.hit", "asset": "hit.sound", "event": "DamageEvent", "volume": 0.75 }]
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": { "AudioReport": {} }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "scriptAudio": [{ "id": "sound.hit" }],
  "systems": [
    {
      "name": "audioFacade",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["AudioReport"],
      "resourceWrites": ["AudioReport"],
      "services": ["audio.play", "audio.stop"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_audioFacade" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_audioFacade = (ctx) => {
  const play = ctx.audio.play("sound.hit", { entity: "player" });
  const stop = ctx.audio.stop(play.playbackId);
  ctx.resources.set("AudioReport", {
    playbackId: play.playbackId,
    playStatus: play.status,
    stopStatus: stop.status
  });
};
export const systemIds = Object.freeze({ "system_audioFacade": "audioFacade" });
export const systems = Object.freeze({ "system_audioFacade": system_audioFacade });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_animation_control_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
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
  ],
  "resources": {
    "AnimationReport": {}
  }
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
      "name": "animationControls",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["AnimationReport"],
      "resourceWrites": ["AnimationReport"],
      "services": ["animation.play", "animation.query", "animation.stop"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_animationControls" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_animationControls = (ctx) => {
  ctx.animation.play("player", "run", { durationSeconds: 2, loop: true, speed: 1.5 });
  const query = ctx.animation.query("player", "run");
  const stop = ctx.animation.stop("player");
  const postStop = ctx.animation.query("player", "run");
  ctx.resources.set("AnimationReport", {
    active: query.active,
    clip: query.clip,
    entity: query.entity,
    postStopActive: postStop.active,
    postStopReason: postStop.stopReason,
    stopped: stop.stopped
  });
};
export const systemIds = Object.freeze({ "system_animationControls": "animationControls" });
export const systems = Object.freeze({ "system_animationControls": system_animationControls });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_random_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Random": { "seed": "arena-1" },
    "RandomReport": {}
  }
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
      "name": "reportRandom",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Random", "RandomReport"],
      "resourceWrites": ["RandomReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportRandom" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportRandom = (ctx) => {
  ctx.resources.set("RandomReport", {
    float: ctx.random.float(),
    range: ctx.random.range(10, 20),
    int: ctx.random.int(1, 6),
    bool: ctx.random.bool(0.75),
    pick: ctx.random.pick(["a", "b", "c"])
  });
};
export const systemIds = Object.freeze({ "system_reportRandom": "reportRandom" });
export const systems = Object.freeze({ "system_reportRandom": system_reportRandom });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_timer_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "TimerReport": {}
  }
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
      "name": "reportTimers",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["TimerReport"],
      "resourceWrites": ["TimerReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportTimers" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportTimers = (ctx) => {
  ctx.resources.set("TimerReport", {
    done: ctx.timers.done(-0.5, 1.25),
    elapsed: ctx.timers.elapsed(-0.5),
    progress: ctx.timers.progress(-0.5, 2),
    ready: ctx.timers.ready(0.25, 1),
    remaining: ctx.timers.remaining(-0.5, 2)
  });
};
export const systemIds = Object.freeze({ "system_reportTimers": "reportTimers" });
export const systems = Object.freeze({ "system_reportTimers": system_reportTimers });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_query_metadata_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "enemy.b", "components": { "Transform": { "position": [0, 0, 0] } } },
    { "id": "enemy.a", "components": { "Transform": { "position": [0, 0, 0] }, "Health": { "current": 1 } } },
    { "id": "player", "components": { "Transform": { "position": [0, 0, 0] } } },
    { "id": "enemy.c", "components": { "Transform": { "position": [0, 0, 0] } } }
  ],
  "resources": {
    "__changed": { "entities": { "enemy.b": ["Transform"], "player": ["Transform"] } },
    "QueryReport": {}
  }
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
      "name": "reportQuery",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": [],
      "queries": [
        { "with": ["Transform"], "without": ["Health"], "changed": ["Transform"], "orderBy": "id", "offset": 1, "limit": 1 }
      ],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["QueryReport"],
      "resourceWrites": ["QueryReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportQuery" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportQuery = (ctx) => {
  ctx.resources.set("QueryReport", { ids: ctx.query().map((entity) => entity.id) });
};
export const systemIds = Object.freeze({ "system_reportQuery": "reportQuery" });
export const systems = Object.freeze({ "system_reportQuery": system_reportQuery });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_gameplay_host_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Score": { "value": 0 }
  },
  "events": {
    "Spawned": []
  }
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
      "name": "seedMarker",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [
        { "kind": "spawn", "entity": "marker", "components": ["Health"] },
        { "kind": "emitEvent", "event": "Spawned" }
      ],
      "eventReads": [],
      "eventWrites": ["Spawned"],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_seedMarker" }
    },
    {
      "name": "consumeMarker",
      "schedule": "update",
      "reads": ["Health"],
      "writes": [],
      "queries": [{ "with": ["Health"], "without": [] }],
      "commands": [
        { "kind": "despawn", "entity": "marker" }
      ],
      "eventReads": ["Spawned"],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_consumeMarker" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_seedMarker = (ctx) => {
  ctx.commands.spawn("marker", { Health: { current: 1 } });
  ctx.events.emit("Spawned", { via: "direct" });
  ctx.commands.emitEvent("Spawned", { via: "command" });
};
const system_consumeMarker = (ctx) => {
  const marker = ctx.query({ with: ["Health"], without: [] })[0];
  ctx.resources.set("Score", {
    events: ctx.events.read("Spawned").length,
    health: marker.get("Health").current
  });
  ctx.commands.despawn(marker.id);
};
export const systemIds = Object.freeze({ "system_seedMarker": "seedMarker", "system_consumeMarker": "consumeMarker" });
export const systems = Object.freeze({ "system_seedMarker": system_seedMarker, "system_consumeMarker": system_consumeMarker });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_task_channel_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "events": {
    "LifecycleEvent": [{ "phase": "seed" }]
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "channels": [
    { "id": "lifecycle", "event": "LifecycleEvent", "delivery": "fixed-trace" }
  ],
  "tasks": [
    { "id": "lifecycleHandoff", "schedule": "update", "mode": "fixed-trace", "channel": "lifecycle" }
  ],
  "systems": [
    {
      "name": "channelHandoff",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": ["LifecycleEvent"],
      "eventWrites": ["LifecycleEvent"],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_channelHandoff" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_channelHandoff = (ctx) => {
  const task = ctx.tasks.list()[0];
  ctx.channels.send("lifecycle", {
    phase: "next",
    taskChannel: ctx.tasks.channel("lifecycleHandoff"),
    taskCount: ctx.channels.read(task.channel).length
  });
};
export const systemIds = Object.freeze({ "system_channelHandoff": "channelHandoff" });
export const systems = Object.freeze({ "system_channelHandoff": system_channelHandoff });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_plugin_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "PluginReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "plugins": [
    { "id": "core", "systems": ["reportPlugins"] }
  ],
  "pluginGroups": [
    { "id": "gameplay", "plugins": ["core"] }
  ],
  "systems": [
    {
      "name": "reportPlugins",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["PluginReport"],
      "resourceWrites": ["PluginReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportPlugins" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportPlugins = (ctx) => {
  const group = ctx.plugins.group("gameplay");
  const plugin = ctx.plugins.list()[0];
  ctx.resources.set("PluginReport", {
    group: group.id,
    hasCore: ctx.plugins.has("core"),
    pluginCount: group.plugins.length,
    systemCount: plugin.systems.length
  });
};
export const systemIds = Object.freeze({ "system_reportPlugins": "reportPlugins" });
export const systems = Object.freeze({ "system_reportPlugins": system_reportPlugins });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_persistence_settings_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "persistence-settings",
  "requiredCapabilities": {},
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json",
    "scripts": "scripts.bundle.js",
    "localData": "local-data.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "localData": "local-data.ir.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    );
    write_json(
        &root,
        "local-data.ir.json",
        r#"{
  "schema": "threenative.local-data",
  "version": "0.1.0",
  "resources": [{ "id": "Score", "schema": { "kind": "object", "fields": { "value": "number" } } }],
  "components": [],
  "settings": [
    { "key": "volume", "kind": "number", "group": "audio", "defaultValue": 0.5, "min": 0, "max": 1 },
    { "key": "difficulty", "kind": "enum", "group": "game", "defaultValue": "normal", "enumValues": ["normal", "hard"] }
  ],
  "saveSlots": [{ "id": "slot.auto", "schemaVersion": 1, "appVersion": "0.1.0" }]
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "resources": { "Score": { "value": 7 } },
  "entities": []
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
      "name": "reportPersistence",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["PersistenceReport"],
      "services": ["persistence.listSlots", "persistence.save", "persistence.load", "settings.set", "settings.get"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportPersistence" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportPersistence = (ctx) => {
  const slots = ctx.persistence.listSlots();
  const saved = ctx.persistence.save("slot.auto");
  const loaded = ctx.persistence.load("slot.auto");
  ctx.settings.set("difficulty", "hard");
  ctx.resources.set("PersistenceReport", {
    difficulty: ctx.settings.get("difficulty"),
    loadedScore: loaded.record.resources.Score.value,
    saved: saved.accepted,
    slots,
    volume: ctx.settings.get("volume")
  });
};
export const systemIds = Object.freeze({ "system_reportPersistence": "reportPersistence" });
export const systems = Object.freeze({ "system_reportPersistence": system_reportPersistence });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_ui_facade_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "ui-facade",
  "requiredCapabilities": {},
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json",
    "scripts": "scripts.bundle.js",
    "ui": "ui.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json",
    "ui": "ui.ir.json"
  }
}"#,
    );
    write_json(
        &root,
        "ui.ir.json",
        r#"{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "focusOrder": ["play", "settings.volume"],
  "root": {
    "id": "root",
    "kind": "column",
    "children": [
      { "id": "play", "kind": "button", "label": "Play", "action": "StartGame" },
      { "id": "settings.volume", "kind": "bar", "value": 0.5, "focusable": true }
    ]
  }
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{"schema":"threenative.world","version":"0.1.0","entities":[]}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportUi",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": ["UiReport"],
      "services": ["ui.activate", "ui.focus", "ui.read", "ui.setDisabled", "ui.setValue"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportUi" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportUi = (ctx) => {
  const focus = ctx.ui.focus("settings.volume");
  const activated = ctx.ui.activate("play");
  ctx.ui.setValue("settings.volume", 0.75);
  const value = ctx.ui.read("settings.volume");
  ctx.ui.setDisabled("settings.volume", true);
  const disabled = ctx.ui.read("settings.volume");
  ctx.resources.set("UiReport", {
    action: activated.action,
    disabled: disabled.disabled,
    focused: value.focused,
    previousFocus: focus.previous,
    value: value.value
  });
};
export const systemIds = Object.freeze({ "system_reportUi": "reportUi" });
export const systems = Object.freeze({ "system_reportUi": system_reportUi });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_bundle(name: &str, export_name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
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
        &format!(
            r#"{{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {{
      "name": "movePlayer",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": ["Transform"],
      "queries": [{{ "with": ["Transform"], "without": [] }}],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": {{ "bundle": "scripts.bundle.js", "exportName": "{export_name}" }}
    }}
  ]
}}"#,
        ),
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const Transform = Object.freeze({ name: "Transform" });
const system_movePlayer = (ctx) => {
  const entity = ctx.query()[0];
  const transform = entity.get(Transform);
  entity.patch(Transform, { position: [transform.position[0] + ctx.time.fixedDt, 0, 0] });
};
export const systemIds = Object.freeze({ "system_movePlayer": "movePlayer" });
export const systems = Object.freeze({ "system_movePlayer": system_movePlayer });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_bundle_without_scripts(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, false);
    write_json(
        &root,
        "world.ir.json",
        r#"{"schema":"threenative.world","version":"0.1.0","entities":[]}"#,
    );
    root
}

fn write_base_bundle(root: &Path, with_scripts: bool) {
    fs::create_dir_all(root).expect("temp bundle should be created");
    write_json(
        root,
        "manifest.json",
        if with_scripts {
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-host",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#
        } else {
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-host",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#
        },
    );
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
    let root = std::env::temp_dir().join(format!("tn-systems-host-{name}-{}", std::process::id()));
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
