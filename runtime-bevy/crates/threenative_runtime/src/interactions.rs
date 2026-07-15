use std::collections::{BTreeMap, BTreeSet};

use crate::systems_effects::{NativeRuntimeWriteInput, NativeRuntimeWriteLedger};
use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::{InteractionIr, LoadedBundle};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeInteractionRuntimeState {
    once: BTreeSet<String>,
    once_per_target: BTreeSet<String>,
    cooldowns: BTreeMap<String, u64>,
    completed: BTreeSet<String>,
    flow_states: BTreeMap<String, String>,
    pub traces: Vec<NativeInteractionTrace>,
    pub truncated: u64,
    pub diagnostics: Vec<NativeInteractionDiagnostic>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeInteractionDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: String,
    pub severity: &'static str,
    pub suggestion: String,
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

#[derive(Clone, Copy)]
struct InteractionEffectContext<'a> {
    source: &'a str,
    target: &'a str,
    tick: u64,
    interaction: &'a str,
}

pub fn step_bundle_interactions(
    bundle: &mut LoadedBundle,
    tick: u64,
    sensor_events: &[Value],
    state: &mut NativeInteractionRuntimeState,
    mut presentation: Option<&mut crate::presentation::NativePresentationRuntimeState>,
    mut write_ledger: Option<&mut NativeRuntimeWriteLedger>,
) -> Vec<NativeInteractionTrace> {
    let Some(document) = bundle.interactions.as_ref() else {
        return Vec::new();
    };
    let declarations = document.interactions.clone();
    let mut candidates = declarations
        .iter()
        .flat_map(|item| candidates(bundle, item, sensor_events))
        .collect::<Vec<_>>();
    candidates.sort_by(|a, b| a.0.id.cmp(&b.0.id).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    let mut traces = Vec::new();
    for (interaction, source, target) in candidates {
        if !bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == source)
            || !bundle
                .world
                .entities
                .iter()
                .any(|entity| entity.id == target)
            || !interaction
                .when
                .iter()
                .all(|predicate| predicate_passes(bundle, predicate, &source, &target))
        {
            continue;
        }
        let passed = gate_passes(bundle, &interaction, &source, &target, tick, state);
        if !passed {
            push_trace(
                state,
                &mut traces,
                NativeInteractionTrace {
                    tick,
                    interaction: interaction.id,
                    source,
                    target,
                    detector: kind(&interaction.detector),
                    gate: "blocked".into(),
                    effects: vec![],
                    completion: false,
                },
            );
            continue;
        }
        let effect_context = InteractionEffectContext {
            source: &source,
            target: &target,
            tick,
            interaction: &interaction.id,
        };
        let mut effect_names = apply_effects(
            bundle,
            &interaction.effects,
            state,
            presentation.as_deref_mut(),
            write_ledger.as_deref_mut(),
            effect_context,
        );
        let fully_applied = effect_names.len() == interaction.effects.len();
        if fully_applied {
            mark_gate(&interaction, &target, tick, state);
        }
        let completion = interaction.complete.as_ref().is_some_and(|complete| {
            fully_applied
                && !state.completed.contains(&interaction.id)
                && complete
                    .get("when")
                    .is_some_and(|predicate| predicate_passes(bundle, predicate, &source, &target))
        });
        if completion {
            if let Some(completion_effects) = interaction
                .complete
                .as_ref()
                .and_then(|value| value.get("effects"))
                .and_then(Value::as_array)
            {
                effect_names.extend(apply_effects(
                    bundle,
                    completion_effects,
                    state,
                    presentation.as_deref_mut(),
                    write_ledger.as_deref_mut(),
                    effect_context,
                ));
            }
            let event = interaction
                .complete
                .as_ref()
                .and_then(|value| value.get("event"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            append_event(bundle, event, json!({}));
            state.completed.insert(interaction.id.clone());
        }
        push_trace(
            state,
            &mut traces,
            NativeInteractionTrace {
                tick,
                interaction: interaction.id,
                source,
                target,
                detector: kind(&interaction.detector),
                gate: "passed".into(),
                effects: effect_names,
                completion,
            },
        );
    }
    traces
}

fn candidates(
    bundle: &LoadedBundle,
    interaction: &InteractionIr,
    sensors: &[Value],
) -> Vec<(InteractionIr, String, String)> {
    let sources = select(bundle, interaction.detector.get("source"));
    let targets = select(bundle, interaction.detector.get("target"));
    let detector_kind = kind(&interaction.detector);
    let mut output = Vec::new();
    for source in sources {
        for target in &targets {
            if *target == source {
                continue;
            }
            let matched = match detector_kind.as_str() {
                "distance2d" | "distance3d" => {
                    distance(bundle, &source, target, detector_kind == "distance2d")
                        <= interaction
                            .detector
                            .get("radius")
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0)
                }
                "overlap" => overlaps(bundle, &source, target),
                "sensor-enter" | "sensor-exit" => {
                    let phase = if detector_kind == "sensor-enter" {
                        "enter"
                    } else {
                        "exit"
                    };
                    let sensor_match = sensors
                        .iter()
                        .any(|event| sensor_event_matches(event, phase, &source, target));
                    sensor_match
                        || interaction
                            .detector
                            .get("fallback")
                            .is_some_and(|fallback| {
                                distance(
                                    bundle,
                                    &source,
                                    target,
                                    fallback.get("kind").and_then(Value::as_str)
                                        == Some("distance2d"),
                                ) <= fallback
                                    .get("radius")
                                    .and_then(Value::as_f64)
                                    .unwrap_or(0.0)
                            })
                }
                "event" | "ray-hit" => interaction
                    .detector
                    .get("event")
                    .and_then(Value::as_str)
                    .and_then(|event| bundle.world.events.get(event))
                    .is_some_and(|payloads| event_pairs(payloads, &source, target)),
                _ => false,
            };
            if matched {
                output.push((interaction.clone(), source.clone(), target.clone()));
            }
        }
    }
    output
}

fn apply_effects(
    bundle: &mut LoadedBundle,
    effects: &[Value],
    state: &mut NativeInteractionRuntimeState,
    mut presentation: Option<&mut crate::presentation::NativePresentationRuntimeState>,
    mut ledger: Option<&mut NativeRuntimeWriteLedger>,
    context: InteractionEffectContext<'_>,
) -> Vec<String> {
    let mut names = Vec::new();
    for (effect_index, effect) in effects.iter().enumerate() {
        let effect_kind = kind(effect);
        let applied = match effect_kind.as_str() {
            "addResource" | "setResource" => {
                apply_resource_effect(bundle, effect, &effect_kind, ledger.as_deref_mut(), context);
                true
            }
            "patchComponent" => {
                let id = target_id(effect.get("target"), context.source, context.target);
                let component = string(effect, "component");
                let Some(patch) = effect.get("patch").and_then(Value::as_object) else {
                    continue;
                };
                let result = bundle
                    .world
                    .entities
                    .iter_mut()
                    .find(|entity| entity.id == id)
                    .map(|entity| entity.components.patch(&component, patch));
                if let Some(Ok(changes)) = result {
                    for change in changes {
                        record_write(
                            ledger.as_deref_mut(),
                            context.tick,
                            context.interaction,
                            "component",
                            &id,
                            &format!("{component}/{}", change.field),
                            change.old_value,
                            change.new_value,
                        );
                    }
                    true
                } else {
                    let message = match result {
                        Some(Err(error)) => error.to_string(),
                        None => format!("target entity '{id}' is unavailable"),
                        Some(Ok(_)) => unreachable!("successful patch handled above"),
                    };
                    let diagnostic = NativeInteractionDiagnostic {
                        code: "TN_INTERACTION_COMPONENT_PATCH_INVALID",
                        message: format!(
                            "Interaction '{}' could not patch component '{component}' on entity '{id}': {message}.",
                            context.interaction
                        ),
                        path: format!(
                            "interactions/{}/effects/{effect_index}",
                            context.interaction
                        ),
                        severity: "error",
                        suggestion: format!(
                            "Patch only declared fields with values matching the '{component}' component shape."
                        ),
                    };
                    if state.diagnostics.len() < 512 {
                        state.diagnostics.push(diagnostic);
                    }
                    false
                }
            }
            "emitEvent" => {
                append_event(
                    bundle,
                    &string(effect, "event"),
                    effect.get("payload").cloned().unwrap_or_else(|| json!({})),
                );
                true
            }
            "despawn" => {
                let id = target_id(effect.get("target"), context.source, context.target);
                let before = bundle.world.entities.len();
                bundle.world.entities.retain(|entity| entity.id != id);
                let applied = bundle.world.entities.len() != before;
                if applied {
                    record_write(
                        ledger.as_deref_mut(),
                        context.tick,
                        context.interaction,
                        "state",
                        &id,
                        "lifecycle",
                        Some(json!("live")),
                        json!("despawned"),
                    );
                }
                applied
            }
            "setTransform" => {
                let id = target_id(effect.get("target"), context.source, context.target);
                apply_transform_effect(
                    bundle,
                    effect,
                    &id,
                    ledger.as_deref_mut(),
                    context.tick,
                    context.interaction,
                )
            }
            "feedbackPreset" => apply_feedback_preset(bundle, effect, presentation.as_deref_mut()),
            "requestFlowTransition" => apply_flow_transition(bundle, effect, state),
            "instantiate" => instantiate(
                bundle,
                effect,
                ledger.as_deref_mut(),
                context.tick,
                context.interaction,
            ),
            _ => false,
        };
        if applied {
            names.push(effect_kind);
        }
    }
    names
}

fn apply_feedback_preset(
    bundle: &LoadedBundle,
    effect: &Value,
    presentation: Option<&mut crate::presentation::NativePresentationRuntimeState>,
) -> bool {
    let preset_id = string(effect, "preset");
    let preset = bundle.systems.as_ref().and_then(|systems| {
        systems
            .feedback_presets
            .iter()
            .find(|preset| preset.get("id").and_then(Value::as_str) == Some(&preset_id))
    });
    if let (Some(preset), Some(presentation)) = (preset, presentation) {
        presentation.play_feedback_preset(preset);
    }
    preset.is_some()
}

fn apply_resource_effect(
    bundle: &mut LoadedBundle,
    effect: &Value,
    effect_kind: &str,
    ledger: Option<&mut NativeRuntimeWriteLedger>,
    context: InteractionEffectContext<'_>,
) {
    let resource = string(effect, "resource");
    let field = string(effect, "field");
    let current = bundle
        .world
        .resources
        .entry(resource.clone())
        .or_insert_with(|| json!({}));
    let old = current.get(&field).cloned();
    let value = if effect_kind == "addResource" {
        current.get(&field).and_then(Value::as_f64).unwrap_or(0.0)
            + effect.get("value").and_then(Value::as_f64).unwrap_or(0.0)
    } else {
        effect.get("value").and_then(Value::as_f64).unwrap_or(0.0)
    };
    current[&field] = json!(value);
    record_write(
        ledger,
        context.tick,
        context.interaction,
        "resource",
        &resource,
        &field,
        old,
        json!(value),
    );
}

fn sensor_event_matches(event: &Value, phase: &str, source: &str, target: &str) -> bool {
    event.get("phase").and_then(Value::as_str) == Some(phase)
        && ((event.get("sensor").and_then(Value::as_str) == Some(source)
            && array_has(event.get("occupants"), target))
            || (event.get("sensor").and_then(Value::as_str) == Some(target)
                && array_has(event.get("occupants"), source)))
}

fn apply_transform_effect(
    bundle: &mut LoadedBundle,
    effect: &Value,
    id: &str,
    mut ledger: Option<&mut NativeRuntimeWriteLedger>,
    tick: u64,
    interaction: &str,
) -> bool {
    let (Ok(position), Ok(rotation), Ok(scale)) = (
        optional_vec3(effect, "position"),
        optional_vec4(effect, "rotation"),
        optional_vec3(effect, "scale"),
    ) else {
        return false;
    };
    if position.is_none() && rotation.is_none() && scale.is_none() {
        return false;
    }
    let Some(transform) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == id)
        .and_then(|entity| entity.components.transform.as_mut())
    else {
        return false;
    };

    let old_position = transform.position;
    let old_rotation = transform.rotation;
    let old_scale = transform.scale;
    if let Some(value) = position {
        transform.position = Some(value);
    }
    if let Some(value) = rotation {
        transform.rotation = Some(value);
    }
    if let Some(value) = scale {
        transform.scale = Some(value);
    }

    if transform.position != old_position {
        record_write(
            ledger.as_deref_mut(),
            tick,
            interaction,
            "component",
            id,
            "Transform/position",
            old_position.map(|value| json!(value)),
            json!(transform.position),
        );
    }
    if transform.rotation != old_rotation {
        record_write(
            ledger.as_deref_mut(),
            tick,
            interaction,
            "component",
            id,
            "Transform/rotation",
            old_rotation.map(|value| json!(value)),
            json!(transform.rotation),
        );
    }
    if transform.scale != old_scale {
        record_write(
            ledger,
            tick,
            interaction,
            "component",
            id,
            "Transform/scale",
            old_scale.map(|value| json!(value)),
            json!(transform.scale),
        );
    }
    true
}

fn instantiate(
    bundle: &mut LoadedBundle,
    effect: &Value,
    mut ledger: Option<&mut NativeRuntimeWriteLedger>,
    tick: u64,
    interaction: &str,
) -> bool {
    let prefab_id = string(effect, "prefab");
    let prefix = string(effect, "prefix");
    let Some(prefab) = bundle
        .prefabs
        .as_ref()
        .and_then(|prefabs| prefabs.prefabs.iter().find(|prefab| prefab.id == prefab_id))
        .cloned()
    else {
        return false;
    };
    let mut applied = false;
    for template in prefab.entities {
        let id = format!("{prefix}.{}", template.id);
        if bundle.world.entities.iter().any(|entity| entity.id == id) {
            continue;
        }
        let mut components = template.components;
        if let Some(hierarchy) = components.hierarchy.as_mut()
            && let Some(parent) = hierarchy.parent.as_ref()
        {
            hierarchy.parent = Some(format!("{prefix}.{parent}"));
        }
        bundle.world.entities.push(threenative_loader::WorldEntity {
            id: id.clone(),
            components,
            tags: template.tags,
        });
        record_write(
            ledger.as_deref_mut(),
            tick,
            interaction,
            "state",
            &id,
            "lifecycle",
            None,
            json!("spawned"),
        );
        applied = true;
    }
    applied
}

fn record_write(
    ledger: Option<&mut NativeRuntimeWriteLedger>,
    tick: u64,
    interaction: &str,
    target_kind: &str,
    target_id: &str,
    path: &str,
    old_value: Option<Value>,
    new_value: Value,
) {
    if let Some(ledger) = ledger {
        ledger.record(NativeRuntimeWriteInput {
            disposition: None,
            new_value,
            old_value,
            path: path.into(),
            schedule: Some("fixedUpdate".into()),
            system: Some(format!("interaction:{interaction}")),
            target_id: target_id.into(),
            target_kind: target_kind.into(),
            tick,
            writer: "interaction".into(),
        });
    }
}

fn apply_flow_transition(
    bundle: &mut LoadedBundle,
    effect: &Value,
    state: &mut NativeInteractionRuntimeState,
) -> bool {
    let flow_id = string(effect, "flow");
    let transition_id = string(effect, "transition");
    let Some(flow) = bundle
        .game_flow
        .as_ref()
        .and_then(|document| document.flows.iter().find(|flow| flow.id == flow_id))
        .cloned()
    else {
        return false;
    };
    let Some(transition) = flow
        .transitions
        .iter()
        .find(|transition| transition.id == transition_id)
        .cloned()
    else {
        return false;
    };
    let current = state
        .flow_states
        .get(&flow_id)
        .cloned()
        .unwrap_or(flow.initial);
    if transition.from != current
        || transition
            .actions
            .iter()
            .any(|action| action.kind != "emitEvent" && action.kind != "setResource")
    {
        return false;
    }
    for action in transition.actions {
        if action.kind == "emitEvent" {
            if let Some(event) = action.event {
                append_event(bundle, &event, json!({}));
            }
        } else if let Some(resource) = action.resource {
            bundle
                .world
                .resources
                .insert(resource, action.value.unwrap_or(Value::Null));
        }
    }
    state.flow_states.insert(flow_id, transition.to);
    true
}

fn gate_passes(
    bundle: &LoadedBundle,
    interaction: &InteractionIr,
    source: &str,
    target: &str,
    tick: u64,
    state: &NativeInteractionRuntimeState,
) -> bool {
    match kind(&interaction.gate).as_str() {
        "once" => !state.once.contains(&interaction.id),
        "once-per-target" => !state
            .once_per_target
            .contains(&format!("{}\0{}", interaction.id, target)),
        "cooldown" => tick >= *state.cooldowns.get(&interaction.id).unwrap_or(&0),
        "equals" => interaction
            .gate
            .get("predicate")
            .is_some_and(|predicate| predicate_passes(bundle, predicate, source, target)),
        _ => false,
    }
}
fn mark_gate(
    interaction: &InteractionIr,
    target: &str,
    tick: u64,
    state: &mut NativeInteractionRuntimeState,
) {
    match kind(&interaction.gate).as_str() {
        "once" => {
            state.once.insert(interaction.id.clone());
        }
        "once-per-target" => {
            state
                .once_per_target
                .insert(format!("{}\0{}", interaction.id, target));
        }
        "cooldown" => {
            state.cooldowns.insert(
                interaction.id.clone(),
                tick + interaction
                    .gate
                    .get("ticks")
                    .and_then(Value::as_u64)
                    .unwrap_or(1),
            );
        }
        _ => {}
    }
}
fn predicate_passes(bundle: &LoadedBundle, value: &Value, source: &str, target: &str) -> bool {
    let field = string(value, "field");
    let actual = if let Some(resource) = value.get("resource").and_then(Value::as_str) {
        bundle
            .world
            .resources
            .get(resource)
            .and_then(|item| item.get(&field))
            .cloned()
    } else {
        let id = target_id(value.get("target"), source, target);
        let component = string(value, "component");
        bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == id)
            .and_then(|entity| entity.components.value(&component))
            .and_then(|item| item.get(&field).cloned())
    };
    if let Some(gte) = value.get("gte").and_then(Value::as_f64) {
        return actual.as_ref().and_then(Value::as_f64).unwrap_or(0.0) >= gte;
    }
    actual.as_ref() == value.get("equals")
}
fn select(bundle: &LoadedBundle, selector: Option<&Value>) -> Vec<String> {
    let Some(selector) = selector else {
        return vec![];
    };
    let mut ids = bundle
        .world
        .entities
        .iter()
        .filter(|entity| {
            selector
                .get("entity")
                .and_then(Value::as_str)
                .is_some_and(|id| id == entity.id)
                || selector
                    .get("withTag")
                    .and_then(Value::as_str)
                    .is_some_and(|tag| entity.tags.iter().any(|item| item == tag))
                || selector
                    .get("withComponent")
                    .and_then(Value::as_str)
                    .is_some_and(|component| {
                        entity
                            .components
                            .values()
                            .iter()
                            .any(|(name, _)| name == component)
                    })
        })
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    ids.sort();
    ids
}
fn distance(bundle: &LoadedBundle, a: &str, b: &str, flat: bool) -> f64 {
    let p = |id: &str| {
        bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == id)
            .and_then(|entity| entity.components.transform.as_ref())
            .and_then(|transform| transform.position)
            .unwrap_or([0.0; 3])
    };
    let a = p(a);
    let b = p(b);
    let y = if flat { 0.0 } else { (a[1] - b[1]) as f64 };
    (((a[0] - b[0]) as f64).powi(2) + y.powi(2) + ((a[2] - b[2]) as f64).powi(2)).sqrt()
}

fn overlaps(bundle: &LoadedBundle, a: &str, b: &str) -> bool {
    let bounds = |id: &str| {
        bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == id)
            .map(|entity| {
                let position = entity
                    .components
                    .transform
                    .as_ref()
                    .and_then(|transform| transform.position)
                    .unwrap_or([0.0; 3]);
                let size = entity
                    .components
                    .collider
                    .as_ref()
                    .and_then(|collider| collider.size)
                    .unwrap_or([1.0; 3]);
                (position, size.map(|value| value as f64 / 2.0))
            })
    };
    let (Some((a_position, a_extents)), Some((b_position, b_extents))) = (bounds(a), bounds(b))
    else {
        return false;
    };
    (0..3).all(|axis| {
        (a_position[axis] as f64 - b_position[axis] as f64).abs()
            <= a_extents[axis] + b_extents[axis]
    })
}
fn append_event(bundle: &mut LoadedBundle, event: &str, payload: Value) {
    if event.is_empty() {
        return;
    }
    let entry = bundle
        .world
        .events
        .entry(event.to_owned())
        .or_insert_with(|| json!([]));
    if !entry.is_array() {
        *entry = json!([entry.clone()]);
    }
    entry.as_array_mut().expect("event queue").push(payload);
}
fn event_pairs(value: &Value, source: &str, target: &str) -> bool {
    let values = value
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(std::slice::from_ref(value));
    values.iter().any(|item| {
        item.get("target").and_then(Value::as_str) == Some(target)
            && item
                .get("source")
                .and_then(Value::as_str)
                .is_none_or(|id| id == source)
    })
}
fn target_id(value: Option<&Value>, source: &str, target: &str) -> String {
    match value.and_then(Value::as_str) {
        Some("source") => source.into(),
        Some("detected") => target.into(),
        _ => value
            .and_then(|item| item.get("entity"))
            .and_then(Value::as_str)
            .unwrap_or(target)
            .into(),
    }
}
fn kind(value: &Value) -> String {
    string(value, "kind")
}
fn string(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}
fn array_has(value: Option<&Value>, id: &str) -> bool {
    value
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(id)))
}
fn optional_vec3(value: &Value, field: &str) -> Result<Option<[f32; 3]>, ()> {
    let Some(value) = value.get(field) else {
        return Ok(None);
    };
    let values = value
        .as_array()
        .filter(|values| values.len() == 3)
        .ok_or(())?;
    let parsed = [
        number_at(values, 0)?,
        number_at(values, 1)?,
        number_at(values, 2)?,
    ];
    Ok(Some(parsed))
}

fn optional_vec4(value: &Value, field: &str) -> Result<Option<[f32; 4]>, ()> {
    let Some(value) = value.get(field) else {
        return Ok(None);
    };
    let values = value
        .as_array()
        .filter(|values| values.len() == 4)
        .ok_or(())?;
    let parsed = [
        number_at(values, 0)?,
        number_at(values, 1)?,
        number_at(values, 2)?,
        number_at(values, 3)?,
    ];
    Ok(Some(parsed))
}

fn number_at(values: &[Value], index: usize) -> Result<f32, ()> {
    let value = values.get(index).and_then(Value::as_f64).ok_or(())? as f32;
    value.is_finite().then_some(value).ok_or(())
}
fn push_trace(
    state: &mut NativeInteractionRuntimeState,
    output: &mut Vec<NativeInteractionTrace>,
    trace: NativeInteractionTrace,
) {
    output.push(trace.clone());
    if state.traces.len() < 512 {
        state.traces.push(trace);
    } else {
        state.truncated += 1;
    }
}
