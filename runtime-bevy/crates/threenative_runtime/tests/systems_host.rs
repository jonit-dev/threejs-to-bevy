use std::{
    fs,
    path::{Path, PathBuf},
};

use threenative_loader::load_bundle;
use threenative_runtime::{
    systems_context::NativeSystemTimeSnapshot,
    systems_host::{
        diagnose_native_system_host, ensure_native_system_host_supported, run_native_systems_once,
        unsupported_native_system_host_diagnostic,
    },
};

#[test]
fn systems_host_should_call_quickjs_system_export() {
    let root = write_bundle("call-export", "system_movePlayer");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

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
