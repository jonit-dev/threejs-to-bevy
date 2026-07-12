use std::collections::BTreeMap;

use serde_json::{Value, json};
use threenative_loader::LoadedBundle;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeCountdownRuntimeState {
    entries: BTreeMap<String, NativeCountdownRuntimeEntry>,
}

#[derive(Clone, Debug, PartialEq)]
struct NativeCountdownRuntimeEntry {
    fired: bool,
    initialized: bool,
    restart_token: Option<Value>,
    running: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeCountdownObservation {
    pub countdown: String,
    pub event: String,
    pub fired: bool,
    pub tick: u64,
    pub value: f32,
}

pub fn step_bundle_countdowns(
    bundle: &mut LoadedBundle,
    fixed_delta: f32,
    tick: u64,
    runtime: &mut NativeCountdownRuntimeState,
) -> Vec<NativeCountdownObservation> {
    let delta = if fixed_delta.is_finite() && fixed_delta > 0.0 {
        fixed_delta
    } else {
        0.0
    };
    let declarations = bundle
        .systems
        .as_ref()
        .map(|systems| systems.countdowns.clone())
        .unwrap_or_default();
    let mut observations = Vec::new();
    for countdown in declarations {
        let Some(resource) = bundle
            .world
            .resources
            .get_mut(&countdown.resource)
            .and_then(Value::as_object_mut)
        else {
            continue;
        };
        let entry = runtime
            .entries
            .entry(countdown.id.clone())
            .or_insert_with(|| NativeCountdownRuntimeEntry {
                fired: false,
                initialized: false,
                restart_token: None,
                running: countdown.autostart != Some(false),
            });
        let restart_token = resource.get("restartToken").cloned();
        let restart = entry.initialized && entry.restart_token != restart_token;
        let running = resource
            .get("running")
            .and_then(Value::as_bool)
            .unwrap_or(countdown.autostart != Some(false));
        if restart || (!entry.running && running) {
            resource.insert(
                countdown.field.clone(),
                json!(start_value(&countdown.direction, countdown.limit)),
            );
            entry.fired = false;
        }
        entry.initialized = true;
        entry.restart_token = restart_token;
        entry.running = running;
        if !running {
            continue;
        }
        let current = resource
            .get(&countdown.field)
            .and_then(Value::as_f64)
            .map(|value| value as f32)
            .filter(|value| value.is_finite())
            .unwrap_or_else(|| start_value(&countdown.direction, countdown.limit));
        let value = if countdown.direction == "down" {
            (current - delta).clamp(0.0, countdown.limit)
        } else {
            (current + delta).clamp(0.0, countdown.limit)
        };
        let value = round(value);
        resource.insert(countdown.field.clone(), json!(value));
        let reached = if countdown.direction == "down" {
            value <= 0.0
        } else {
            value >= countdown.limit
        };
        let fired = reached && !entry.fired;
        if fired {
            entry.fired = true;
            append_event(
                bundle,
                &countdown.event,
                json!({
                    "countdown": countdown.id,
                    "direction": countdown.direction,
                    "field": countdown.field,
                    "limit": countdown.limit,
                    "resource": countdown.resource,
                    "value": value,
                }),
            );
        }
        observations.push(NativeCountdownObservation {
            countdown: countdown.id,
            event: countdown.event,
            fired,
            tick,
            value,
        });
    }
    observations
}

pub fn reset_countdowns(runtime: &mut NativeCountdownRuntimeState) {
    runtime.entries.clear();
}

fn append_event(bundle: &mut LoadedBundle, event: &str, payload: Value) {
    let queue = bundle
        .world
        .events
        .entry(event.to_owned())
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Value::Array(values) = queue {
        values.push(payload);
    } else {
        *queue = Value::Array(vec![payload]);
    }
}

fn start_value(direction: &str, limit: f32) -> f32 {
    if direction == "down" { limit } else { 0.0 }
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
