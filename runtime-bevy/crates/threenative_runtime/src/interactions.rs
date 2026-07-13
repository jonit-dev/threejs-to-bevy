use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::{InteractionIr, LoadedBundle};
use crate::systems_effects::{NativeRuntimeWriteInput, NativeRuntimeWriteLedger};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeInteractionRuntimeState {
    once: BTreeSet<String>,
    once_per_target: BTreeSet<String>,
    cooldowns: BTreeMap<String, u64>,
    completed: BTreeSet<String>,
    flow_states: BTreeMap<String, String>,
    pub traces: Vec<NativeInteractionTrace>,
    pub truncated: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeInteractionTrace {
    pub tick: u64,
    pub interaction: String,
    pub source: String,
    pub target: String,
    pub detector: String,
    pub gate: String,
    pub effects: Vec<String>,
    pub completion: bool,
}

pub fn step_bundle_interactions(bundle: &mut LoadedBundle, tick: u64, sensor_events: &[Value], state: &mut NativeInteractionRuntimeState, mut presentation: Option<&mut crate::presentation::NativePresentationRuntimeState>, mut write_ledger: Option<&mut NativeRuntimeWriteLedger>) -> Vec<NativeInteractionTrace> {
    let Some(document) = bundle.interactions.as_ref() else { return Vec::new() };
    let declarations = document.interactions.clone();
    let mut candidates = declarations.iter().flat_map(|item| candidates(bundle, item, sensor_events)).collect::<Vec<_>>();
    candidates.sort_by(|a, b| a.0.id.cmp(&b.0.id).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    let mut traces = Vec::new();
    for (interaction, source, target) in candidates {
        if !bundle.world.entities.iter().any(|entity| entity.id == source) || !bundle.world.entities.iter().any(|entity| entity.id == target) || !interaction.when.iter().all(|predicate| predicate_passes(bundle, predicate, &source, &target)) { continue }
        let passed = gate_passes(bundle, &interaction, &source, &target, tick, state);
        if !passed {
            push_trace(state, &mut traces, NativeInteractionTrace { tick, interaction: interaction.id, source, target, detector: kind(&interaction.detector), gate: "blocked".into(), effects: vec![], completion: false });
            continue;
        }
        let mut effect_names = apply_effects(bundle, &interaction.effects, &source, &target, state, presentation.as_deref_mut(), write_ledger.as_deref_mut(), tick, &interaction.id);
        if effect_names.len() == interaction.effects.len() { mark_gate(&interaction, &target, tick, state); }
        let completion = interaction.complete.as_ref().is_some_and(|complete| {
            !state.completed.contains(&interaction.id) && complete.get("when").is_some_and(|predicate| predicate_passes(bundle, predicate, &source, &target))
        });
        if completion {
            if let Some(completion_effects) = interaction.complete.as_ref().and_then(|value| value.get("effects")).and_then(Value::as_array) {
                effect_names.extend(apply_effects(bundle, completion_effects, &source, &target, state, presentation.as_deref_mut(), write_ledger.as_deref_mut(), tick, &interaction.id));
            }
            let event = interaction.complete.as_ref().and_then(|value| value.get("event")).and_then(Value::as_str).unwrap_or_default();
            append_event(bundle, event, json!({}));
            state.completed.insert(interaction.id.clone());
        }
        push_trace(state, &mut traces, NativeInteractionTrace { tick, interaction: interaction.id, source, target, detector: kind(&interaction.detector), gate: "passed".into(), effects: effect_names, completion });
    }
    traces
}

fn candidates(bundle: &LoadedBundle, interaction: &InteractionIr, sensors: &[Value]) -> Vec<(InteractionIr, String, String)> {
    let sources = select(bundle, interaction.detector.get("source")); let targets = select(bundle, interaction.detector.get("target")); let detector_kind = kind(&interaction.detector);
    let mut output = Vec::new();
    for source in sources { for target in &targets { if *target == source { continue } let matched = match detector_kind.as_str() {
            "distance2d" | "distance3d" => distance(bundle, &source, target, detector_kind == "distance2d") <= interaction.detector.get("radius").and_then(Value::as_f64).unwrap_or(0.0),
            "overlap" => distance(bundle, &source, target, false) <= 1.0,
            "sensor-enter" | "sensor-exit" => {
                let sensor_match = sensors.iter().any(|event| event.get("phase").and_then(Value::as_str) == Some(if detector_kind == "sensor-enter" { "enter" } else { "exit" }) && ((event.get("sensor").and_then(Value::as_str) == Some(&source) && array_has(event.get("occupants"), target)) || (event.get("sensor").and_then(Value::as_str) == Some(target) && array_has(event.get("occupants"), &source))));
                sensor_match || interaction.detector.get("fallback").is_some_and(|fallback| distance(bundle, &source, target, fallback.get("kind").and_then(Value::as_str) == Some("distance2d")) <= fallback.get("radius").and_then(Value::as_f64).unwrap_or(0.0))
            },
            "event" | "ray-hit" => interaction.detector.get("event").and_then(Value::as_str).and_then(|event| bundle.world.events.get(event)).is_some_and(|payloads| event_pairs(payloads, &source, target)),
            _ => false,
        }; if matched { output.push((interaction.clone(), source.clone(), target.clone())); } } }
    output
}

fn apply_effects(bundle: &mut LoadedBundle, effects: &[Value], source: &str, target: &str, state: &mut NativeInteractionRuntimeState, mut presentation: Option<&mut crate::presentation::NativePresentationRuntimeState>, mut ledger: Option<&mut NativeRuntimeWriteLedger>, tick: u64, interaction: &str) -> Vec<String> {
    let mut names = Vec::new();
    for effect in effects { let effect_kind = kind(effect); let applied = match effect_kind.as_str() {
        "addResource" | "setResource" => { let resource = string(effect, "resource"); let field = string(effect, "field"); let current = bundle.world.resources.entry(resource.clone()).or_insert_with(|| json!({})); let old = current.get(&field).cloned(); let value = if effect_kind == "addResource" { current.get(&field).and_then(Value::as_f64).unwrap_or(0.0) + effect.get("value").and_then(Value::as_f64).unwrap_or(0.0) } else { effect.get("value").and_then(Value::as_f64).unwrap_or(0.0) }; current[&field] = json!(value); record_write(ledger.as_deref_mut(), tick, interaction, "resource", &resource, &field, old, json!(value)); true },
        "patchComponent" => { let id = target_id(effect.get("target"), source, target); let component = string(effect, "component"); bundle.world.entities.iter_mut().find(|entity| entity.id == id).is_some_and(|entity| { let current = entity.components.extra.entry(component).or_insert_with(|| json!({})); if let Some(patch) = effect.get("patch").and_then(Value::as_object) { for (key, value) in patch { current[key] = value.clone(); } } true }) },
        "emitEvent" => { append_event(bundle, &string(effect, "event"), effect.get("payload").cloned().unwrap_or_else(|| json!({}))); true },
        "despawn" => { let id = target_id(effect.get("target"), source, target); let before = bundle.world.entities.len(); bundle.world.entities.retain(|entity| entity.id != id); let applied = bundle.world.entities.len() != before; if applied { record_write(ledger.as_deref_mut(), tick, interaction, "state", &id, "lifecycle", Some(json!("live")), json!("despawned")); } applied },
        "setTransform" => { let id = target_id(effect.get("target"), source, target); bundle.world.entities.iter_mut().find(|entity| entity.id == id).is_some_and(|entity| { if let Some(transform) = entity.components.transform.as_mut() { if let Some(position) = vec3(effect.get("position")) { transform.position = Some(position); } if let Some(scale) = vec3(effect.get("scale")) { transform.scale = Some(scale); } } true }) },
        "feedbackPreset" => { let preset_id = string(effect, "preset"); let preset = bundle.systems.as_ref().and_then(|systems| systems.feedback_presets.iter().find(|preset| preset.get("id").and_then(Value::as_str) == Some(&preset_id))); if let (Some(preset), Some(presentation)) = (preset, presentation.as_deref_mut()) { presentation.play_feedback_preset(preset); } preset.is_some() },
        "requestFlowTransition" => apply_flow_transition(bundle, effect, state),
        "instantiate" => instantiate(bundle, effect, ledger.as_deref_mut(), tick, interaction),
        _ => false,
    }; if applied { names.push(effect_kind); } }
    names
}

fn instantiate(bundle: &mut LoadedBundle, effect: &Value, mut ledger: Option<&mut NativeRuntimeWriteLedger>, tick: u64, interaction: &str) -> bool {
    let prefab_id = string(effect, "prefab"); let prefix = string(effect, "prefix");
    let Some(prefab) = bundle.prefabs.as_ref().and_then(|prefabs| prefabs.prefabs.iter().find(|prefab| prefab.id == prefab_id)).cloned() else { return false };
    let mut applied = false;
    for template in prefab.entities { let id = format!("{prefix}.{}", template.id); if bundle.world.entities.iter().any(|entity| entity.id == id) { continue } let mut components = template.components; if let Some(hierarchy) = components.hierarchy.as_mut() { if let Some(parent) = hierarchy.parent.as_ref() { hierarchy.parent = Some(format!("{prefix}.{parent}")); } } bundle.world.entities.push(threenative_loader::WorldEntity { id: id.clone(), components, tags: template.tags }); record_write(ledger.as_deref_mut(), tick, interaction, "state", &id, "lifecycle", None, json!("spawned")); applied = true; }
    applied
}

fn record_write(ledger: Option<&mut NativeRuntimeWriteLedger>, tick: u64, interaction: &str, target_kind: &str, target_id: &str, path: &str, old_value: Option<Value>, new_value: Value) { if let Some(ledger) = ledger { ledger.record(NativeRuntimeWriteInput { disposition: None, new_value, old_value, path: path.into(), schedule: Some("fixedUpdate".into()), system: Some(format!("interaction:{interaction}")), target_id: target_id.into(), target_kind: target_kind.into(), tick, writer: "interaction".into() }); } }

fn apply_flow_transition(bundle: &mut LoadedBundle, effect: &Value, state: &mut NativeInteractionRuntimeState) -> bool {
    let flow_id = string(effect, "flow"); let transition_id = string(effect, "transition");
    let Some(flow) = bundle.game_flow.as_ref().and_then(|document| document.flows.iter().find(|flow| flow.id == flow_id)).cloned() else { return false };
    let Some(transition) = flow.transitions.iter().find(|transition| transition.id == transition_id).cloned() else { return false };
    let current = state.flow_states.get(&flow_id).cloned().unwrap_or(flow.initial);
    if transition.from != current || transition.actions.iter().any(|action| action.kind != "emitEvent" && action.kind != "setResource") { return false }
    for action in transition.actions { if action.kind == "emitEvent" { if let Some(event) = action.event { append_event(bundle, &event, json!({})); } } else if let Some(resource) = action.resource { bundle.world.resources.insert(resource, action.value.unwrap_or(Value::Null)); } }
    state.flow_states.insert(flow_id, transition.to); true
}

fn gate_passes(bundle: &LoadedBundle, interaction: &InteractionIr, source: &str, target: &str, tick: u64, state: &NativeInteractionRuntimeState) -> bool { match kind(&interaction.gate).as_str() { "once" => !state.once.contains(&interaction.id), "once-per-target" => !state.once_per_target.contains(&format!("{}\0{}", interaction.id, target)), "cooldown" => tick >= *state.cooldowns.get(&interaction.id).unwrap_or(&0), "equals" => interaction.gate.get("predicate").is_some_and(|predicate| predicate_passes(bundle, predicate, source, target)), _ => false } }
fn mark_gate(interaction: &InteractionIr, target: &str, tick: u64, state: &mut NativeInteractionRuntimeState) { match kind(&interaction.gate).as_str() { "once" => { state.once.insert(interaction.id.clone()); }, "once-per-target" => { state.once_per_target.insert(format!("{}\0{}", interaction.id, target)); }, "cooldown" => { state.cooldowns.insert(interaction.id.clone(), tick + interaction.gate.get("ticks").and_then(Value::as_u64).unwrap_or(1)); }, _ => {} } }
fn predicate_passes(bundle: &LoadedBundle, value: &Value, source: &str, target: &str) -> bool { let field = string(value, "field"); let actual = if let Some(resource) = value.get("resource").and_then(Value::as_str) { bundle.world.resources.get(resource).and_then(|item| item.get(&field)) } else { let id = target_id(value.get("target"), source, target); let component = string(value, "component"); bundle.world.entities.iter().find(|entity| entity.id == id).and_then(|entity| entity.components.extra.get(&component)).and_then(|item| item.get(&field)) }; if let Some(gte) = value.get("gte").and_then(Value::as_f64) { return actual.and_then(Value::as_f64).unwrap_or(0.0) >= gte } actual == value.get("equals") }
fn select(bundle: &LoadedBundle, selector: Option<&Value>) -> Vec<String> { let Some(selector) = selector else { return vec![] }; let mut ids = bundle.world.entities.iter().filter(|entity| selector.get("entity").and_then(Value::as_str).is_some_and(|id| id == entity.id) || selector.get("withTag").and_then(Value::as_str).is_some_and(|tag| entity.tags.iter().any(|item| item == tag)) || selector.get("withComponent").and_then(Value::as_str).is_some_and(|component| entity.components.values().iter().any(|(name, _)| name == component))).map(|entity| entity.id.clone()).collect::<Vec<_>>(); ids.sort(); ids }
fn distance(bundle: &LoadedBundle, a: &str, b: &str, flat: bool) -> f64 { let p = |id: &str| bundle.world.entities.iter().find(|entity| entity.id == id).and_then(|entity| entity.components.transform.as_ref()).and_then(|transform| transform.position).unwrap_or([0.0; 3]); let a = p(a); let b = p(b); let y = if flat { 0.0 } else { (a[1] - b[1]) as f64 }; (((a[0]-b[0]) as f64).powi(2) + y.powi(2) + ((a[2]-b[2]) as f64).powi(2)).sqrt() }
fn append_event(bundle: &mut LoadedBundle, event: &str, payload: Value) { if event.is_empty() { return } let entry = bundle.world.events.entry(event.to_owned()).or_insert_with(|| json!([])); if !entry.is_array() { *entry = json!([entry.clone()]); } entry.as_array_mut().expect("event queue").push(payload); }
fn event_pairs(value: &Value, source: &str, target: &str) -> bool { let values = value.as_array().map(Vec::as_slice).unwrap_or(std::slice::from_ref(value)); values.iter().any(|item| item.get("target").and_then(Value::as_str) == Some(target) && item.get("source").and_then(Value::as_str).is_none_or(|id| id == source)) }
fn target_id(value: Option<&Value>, source: &str, target: &str) -> String { match value.and_then(Value::as_str) { Some("source") => source.into(), Some("detected") => target.into(), _ => value.and_then(|item| item.get("entity")).and_then(Value::as_str).unwrap_or(target).into() } }
fn kind(value: &Value) -> String { string(value, "kind") } fn string(value: &Value, field: &str) -> String { value.get(field).and_then(Value::as_str).unwrap_or_default().to_owned() }
fn array_has(value: Option<&Value>, id: &str) -> bool { value.and_then(Value::as_array).is_some_and(|items| items.iter().any(|item| item.as_str() == Some(id))) }
fn vec3(value: Option<&Value>) -> Option<[f32; 3]> { let value = value?.as_array()?; Some([value.first()?.as_f64()? as f32, value.get(1)?.as_f64()? as f32, value.get(2)?.as_f64()? as f32]) }
fn push_trace(state: &mut NativeInteractionRuntimeState, output: &mut Vec<NativeInteractionTrace>, trace: NativeInteractionTrace) { output.push(trace.clone()); if state.traces.len() < 512 { state.traces.push(trace); } else { state.truncated += 1; } }
