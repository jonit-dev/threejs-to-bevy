use serde_json::{json, Value};
use threenative_loader::{LoadedBundle, SystemIr};

use crate::systems_effects::{
    apply_system_effects, NativeSystemCommandEffect, NativeSystemEffects,
    NativeSystemResourceEffect,
};

pub fn trace_runtime_gameplay_host(bundle: &mut LoadedBundle) -> Value {
    let timer_system = system_by_name(bundle, "timerAndObserver");
    let spawn_system = system_by_name(bundle, "spawnRenderable");
    let remove_system = system_by_name(bundle, "removeRenderable");
    let mut command_flush = Vec::new();
    let mut local_values = vec![read_local_counter(bundle)];

    let timer = apply_system_effects(bundle, &timer_system, &timer_effects(), 1, 1)
        .expect("timer effects are declared");
    command_flush.extend(timer.entries.iter().map(entry_key));
    local_values.push(read_local_counter(bundle));

    let spawn = apply_system_effects(bundle, &spawn_system, &spawn_effects(), 2, 2)
        .expect("spawn effects are declared");
    command_flush.extend(spawn.entries.iter().map(entry_key));
    let spawned_renderer_handles = renderer_handles(bundle);
    local_values.push(read_local_counter(bundle));

    let teardown_order = command_flush.len() + 1;
    let remove = apply_system_effects(bundle, &remove_system, &remove_effects(), 3, 3)
        .expect("remove effects are declared");
    command_flush.extend(remove.entries.iter().map(entry_key));

    json!({
        "async": {
            "channels": channels(bundle),
            "timers": timers(bundle)
        },
        "boundaries": [
            boundary("TN_RUNTIME_DYNAMIC_PLUGIN_UNSUPPORTED", "Keep runtime plugins outside portable bundles or promote a bounded SDK declaration."),
            boundary("TN_RUNTIME_RAW_HANDLE_UNSUPPORTED", "Use portable entity, component, asset, and service identifiers instead of backend handles."),
            boundary("TN_RUNTIME_UNBOUNDED_ASYNC_UNSUPPORTED", "Use fixed-tick timers, fixed-trace channels, or target-specific adapters.")
        ],
        "diagnostics": diagnostics(),
        "eventWindows": [
            { "event": "DamageEvent", "framesVisible": [1, 2], "policy": "clear-after-post-update" },
            { "event": "Spawned", "framesVisible": [2, 3], "policy": "clear-after-post-update" },
            { "event": "TimerElapsed", "framesVisible": [1], "policy": "clear-after-post-update" }
        ],
        "hooks": [
            { "component": "Health", "entity": "runtime.enemy", "hook": "onAdd", "order": 1 },
            { "component": "Health", "entity": "runtime.enemy", "hook": "onInsert", "order": 2 },
            { "component": "Health", "entity": "runtime.enemy", "hook": "onRemove", "order": 3 }
        ],
        "lifecycle": {
            "appState": [
                { "from": "boot", "schedule": "update", "to": "playing" },
                { "from": "playing", "schedule": "postUpdate", "to": "settled" }
            ],
            "commandFlush": command_flush,
            "localState": [{ "key": "LocalCounter.value", "resetOnTeardown": true, "values": local_values }]
        },
        "observers": [{ "event": "DamageEvent", "route": ["target:player.weapon"], "status": "stopped" }],
        "reconciliation": {
            "finalRendererHandles": renderer_handles(bundle),
            "rendererTeardown": [{ "entity": "runtime.enemy", "order": teardown_order, "rendererHandle": "renderer:runtime.enemy", "removed": true }],
            "spawnedRendererHandles": spawned_renderer_handles
        },
        "schema": "threenative.runtime-gameplay-host",
        "version": "0.1.0"
    })
}

fn timer_effects() -> NativeSystemEffects {
    NativeSystemEffects {
        commands: vec![NativeSystemCommandEffect {
            command: "emitEvent".to_owned(),
            component: None,
            components: None,
            entity: Some(String::new()),
            event: Some("TimerElapsed".to_owned()),
            payload: Some(json!({ "id": "boundedTimer", "tick": 1 })),
            value: None,
            ..Default::default()
        }],
        events: Vec::new(),
        patches: Vec::new(),
        resources: vec![NativeSystemResourceEffect {
            resource: "LocalCounter".to_owned(),
            value: json!({ "value": 1 }),
        }],
        services: Vec::new(),
    }
}

fn spawn_effects() -> NativeSystemEffects {
    NativeSystemEffects {
        commands: vec![
            NativeSystemCommandEffect {
                command: "spawn".to_owned(),
                component: None,
                components: Some(json!({
                    "Health": { "current": 4, "max": 4 },
                    "MeshRenderer": { "material": "mat.spawned", "mesh": "primitive.box" },
                    "Transform": { "position": [2, 0, 0] }
                })),
                entity: Some("runtime.enemy".to_owned()),
                event: None,
                payload: None,
                value: None,
                ..Default::default()
            },
            NativeSystemCommandEffect {
                command: "emitEvent".to_owned(),
                component: None,
                components: None,
                entity: Some(String::new()),
                event: Some("Spawned".to_owned()),
                payload: Some(json!({ "entity": "runtime.enemy" })),
                value: None,
                ..Default::default()
            },
        ],
        events: Vec::new(),
        patches: Vec::new(),
        resources: vec![
            NativeSystemResourceEffect {
                resource: "GameState".to_owned(),
                value: json!({ "combat": "engaged", "phase": "playing" }),
            },
            NativeSystemResourceEffect {
                resource: "LocalCounter".to_owned(),
                value: json!({ "value": 2 }),
            },
        ],
        services: Vec::new(),
    }
}

fn remove_effects() -> NativeSystemEffects {
    NativeSystemEffects {
        commands: vec![
            NativeSystemCommandEffect {
                command: "removeComponent".to_owned(),
                component: Some("Health".to_owned()),
                components: None,
                entity: Some("runtime.enemy".to_owned()),
                event: None,
                payload: None,
                value: None,
                ..Default::default()
            },
            NativeSystemCommandEffect {
                command: "despawn".to_owned(),
                component: None,
                components: None,
                entity: Some("runtime.enemy".to_owned()),
                event: None,
                payload: None,
                value: None,
                ..Default::default()
            },
        ],
        events: Vec::new(),
        patches: Vec::new(),
        resources: vec![NativeSystemResourceEffect {
            resource: "GameState".to_owned(),
            value: json!({ "combat": "safe", "phase": "settled" }),
        }],
        services: Vec::new(),
    }
}

fn system_by_name(bundle: &LoadedBundle, name: &str) -> SystemIr {
    bundle
        .systems
        .as_ref()
        .and_then(|systems| systems.systems.iter().find(|system| system.name == name))
        .cloned()
        .unwrap_or_else(|| panic!("missing runtime gameplay host system '{name}'"))
}

fn renderer_handles(bundle: &LoadedBundle) -> Vec<String> {
    let mut handles = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.components.mesh_renderer.is_some())
        .map(|entity| format!("renderer:{}", entity.id))
        .collect::<Vec<_>>();
    handles.sort();
    handles
}

fn read_local_counter(bundle: &LoadedBundle) -> i64 {
    bundle
        .world
        .resources
        .get("LocalCounter")
        .and_then(|value| value.get("value"))
        .and_then(Value::as_i64)
        .unwrap_or(0)
}

fn channels(bundle: &LoadedBundle) -> Value {
    Value::Array(
        bundle
            .systems
            .as_ref()
            .map(|systems| {
                systems
                    .channels
                    .iter()
                    .map(|channel| {
                        json!({
                            "delivery": channel.delivery,
                            "event": channel.event,
                            "id": channel.id,
                            "status": "ready"
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
    )
}

fn timers(bundle: &LoadedBundle) -> Value {
    Value::Array(bundle.systems.as_ref().map(|systems| {
        systems.tasks.iter().map(|task| {
            let event = task.channel.as_ref()
                .and_then(|channel_id| systems.channels.iter().find(|channel| channel.id == *channel_id))
                .map(|channel| channel.event.clone())
                .unwrap_or_default();
            json!({ "event": event, "firedAtTick": 1, "id": task.id, "mode": task.mode, "status": "fired" })
        }).collect::<Vec<_>>()
    }).unwrap_or_default())
}

fn diagnostics() -> Value {
    json!([
        diagnostic(
            "TN_UNSUPPORTED_FEATURE_PROMISE",
            "systems.ir.json/runtime/unsupportedFeatures/promise"
        ),
        diagnostic(
            "TN_UNSUPPORTED_FEATURE_RAW_RUNTIME_HANDLE",
            "systems.ir.json/runtime/unsupportedFeatures/rawRuntimeHandle"
        ),
        diagnostic(
            "TN_UNSUPPORTED_FEATURE_RUNTIME_PLUGIN",
            "systems.ir.json/runtime/unsupportedFeatures/runtimePlugin"
        ),
        diagnostic(
            "TN_UNSUPPORTED_FEATURE_TIMER",
            "systems.ir.json/runtime/unsupportedFeatures/timer"
        ),
        diagnostic(
            "TN_UNSUPPORTED_FEATURE_WORKER",
            "systems.ir.json/runtime/unsupportedFeatures/worker"
        )
    ])
}

fn diagnostic(code: &str, path: &str) -> Value {
    json!({
        "code": code,
        "message": unsupported_message(code),
        "path": path,
        "severity": "error",
        "suggestion": "Remove the unsupported declaration or replace it with a portable SDK/IR declaration."
    })
}

fn unsupported_message(code: &str) -> String {
    let feature = code
        .trim_start_matches("TN_UNSUPPORTED_FEATURE_")
        .to_lowercase();
    format!(
        "Feature '{}' is outside the portable runtime scope.",
        feature.to_camel_case()
    )
}

trait CamelCase {
    fn to_camel_case(&self) -> String;
}

impl CamelCase for str {
    fn to_camel_case(&self) -> String {
        let mut output = String::new();
        let mut uppercase_next = false;
        for character in self.chars() {
            if character == '_' {
                uppercase_next = true;
            } else if uppercase_next {
                output.extend(character.to_uppercase());
                uppercase_next = false;
            } else {
                output.push(character);
            }
        }
        output
    }
}

fn boundary(code: &str, suggestion: &str) -> Value {
    json!({ "code": code, "status": "diagnostic-only", "suggestion": suggestion })
}

fn entry_key(entry: &crate::systems_effects::NativeSystemEffectLogEntry) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}",
        entry.schedule,
        entry.system,
        entry.kind,
        entry.command.as_deref().unwrap_or(""),
        entry.entity.as_deref().unwrap_or(""),
        entry.component.as_deref().unwrap_or(""),
        ""
    )
}
