use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use threenative_loader::{
    CameraComponent, ColliderComponent, EntityComponents, HierarchyComponent, LightComponent,
    LoadedBundle, MeshRendererComponent, PatrolComponent, RigidBodyComponent,
    StateMachineComponent, SystemCommandIr, SystemIr, TransformComponent, VisibilityComponent,
    WorldEntity, WorldTextComponent,
};

use crate::systems_context::component_value;

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct NativeSystemEffects {
    #[serde(default)]
    pub commands: Vec<NativeSystemCommandEffect>,
    #[serde(default)]
    pub events: Vec<NativeSystemEventEffect>,
    #[serde(default)]
    pub observations: Vec<NativeSystemResourceObservationEffect>,
    #[serde(default)]
    pub patches: Vec<NativeSystemPatchEffect>,
    #[serde(default)]
    pub resources: Vec<NativeSystemResourceEffect>,
    #[serde(default)]
    pub schedules: Vec<NativeSystemScheduleEffect>,
    #[serde(default)]
    pub services: Vec<NativeSystemServiceEffect>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemPatchEffect {
    pub component: String,
    pub entity: String,
    #[serde(default)]
    pub operation: Option<String>,
    pub value: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemEventEffect {
    pub event: String,
    pub payload: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemResourceEffect {
    pub resource: String,
    pub value: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemResourceObservationEffect {
    pub kind: String,
    pub resource: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemScheduleEffect {
    #[serde(rename = "delayTicks")]
    pub delay_ticks: u32,
    pub id: String,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct NativeSystemCommandEffect {
    pub child: Option<String>,
    pub command: String,
    pub component: Option<String>,
    pub components: Option<Value>,
    pub entity: Option<String>,
    pub event: Option<String>,
    pub parent: Option<String>,
    pub payload: Option<Value>,
    pub prefab: Option<String>,
    pub prefix: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    pub value: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemServiceEffect {
    pub payload: Value,
    pub service: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeSystemEffectDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: String,
    pub severity: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRuntimeWriteInput {
    pub disposition: Option<String>,
    pub new_value: Value,
    pub old_value: Option<Value>,
    pub path: String,
    pub schedule: Option<String>,
    pub system: Option<String>,
    pub target_id: String,
    pub target_kind: String,
    pub tick: u64,
    pub writer: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeWriteObservation {
    pub disposition: String,
    pub fingerprint: String,
    pub new_fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline_value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_fingerprint: Option<String>,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    pub target_id: String,
    pub target_kind: String,
    pub tick: u64,
    pub writer: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeRuntimeWriteLedger {
    active: BTreeMap<String, NativeRuntimeWriteObservation>,
    current_tick: Option<u64>,
    observations: Vec<NativeRuntimeWriteObservation>,
}

impl NativeRuntimeWriteLedger {
    pub fn reset(&mut self) {
        self.active.clear();
        self.current_tick = None;
        self.observations.clear();
    }

    pub fn begin_tick(&mut self, tick: u64) {
        if self.current_tick != Some(tick) {
            self.current_tick = Some(tick);
            self.active.clear();
        }
    }

    pub fn record(&mut self, input: NativeRuntimeWriteInput) -> NativeRuntimeWriteObservation {
        self.begin_tick(input.tick);
        let key = format!("{}:{}:{}", input.target_kind, input.target_id, input.path);
        let previous = self.active.get(&key);
        let previous_target = self.active.values().find(|candidate| {
            candidate.target_kind == input.target_kind && candidate.target_id == input.target_id
        });
        let disposition = input
            .disposition
            .clone()
            .unwrap_or_else(|| classify_native_write(previous, previous_target, &input));
        let fingerprint = native_value_fingerprint(&input.new_value);
        let observation = NativeRuntimeWriteObservation {
            disposition,
            fingerprint: fingerprint.clone(),
            new_fingerprint: fingerprint,
            inline_value: native_inline_value(&input.new_value),
            old_fingerprint: input.old_value.as_ref().map(native_value_fingerprint),
            path: input.path,
            schedule: input.schedule,
            system: input.system,
            target_id: input.target_id,
            target_kind: input.target_kind,
            tick: input.tick,
            writer: input.writer,
        };
        self.observations.push(observation.clone());
        self.active.insert(key, observation.clone());
        if self.observations.len() > 2000 {
            let overflow = self.observations.len() - 2000;
            self.observations.drain(0..overflow);
        }
        observation
    }

    pub fn observations(&self) -> Vec<NativeRuntimeWriteObservation> {
        let mut observations = self.observations.clone();
        observations.sort_by(|left, right| {
            (
                left.tick,
                left.target_kind.as_str(),
                left.target_id.as_str(),
                left.path.as_str(),
                left.writer.as_str(),
                left.schedule.as_deref().unwrap_or(""),
                left.system.as_deref().unwrap_or(""),
                left.disposition.as_str(),
                left.fingerprint.as_str(),
            )
                .cmp(&(
                    right.tick,
                    right.target_kind.as_str(),
                    right.target_id.as_str(),
                    right.path.as_str(),
                    right.writer.as_str(),
                    right.schedule.as_deref().unwrap_or(""),
                    right.system.as_deref().unwrap_or(""),
                    right.disposition.as_str(),
                    right.fingerprint.as_str(),
                ))
        });
        observations
    }

    pub fn diagnostics(&self, tick: u64) -> Vec<NativeSystemEffectDiagnostic> {
        conflict_diagnostics(&self.observations, Some(tick))
    }

    pub fn diagnostics_all(&self) -> Vec<NativeSystemEffectDiagnostic> {
        conflict_diagnostics(&self.observations, None)
    }
}

fn conflict_diagnostics(
    observations: &[NativeRuntimeWriteObservation],
    tick: Option<u64>,
) -> Vec<NativeSystemEffectDiagnostic> {
    let mut seen = BTreeSet::new();
    observations
        .iter()
        .filter(|observation| {
            observation.disposition == "conflict"
                && tick.is_none_or(|tick| observation.tick == tick)
        })
        .map(|observation| conflict_diagnostic(observation, observations))
        .filter(|diagnostic| seen.insert((diagnostic.path.clone(), diagnostic.message.clone())))
        .collect()
}

fn conflict_diagnostic(
    observation: &NativeRuntimeWriteObservation,
    observations: &[NativeRuntimeWriteObservation],
) -> NativeSystemEffectDiagnostic {
    let candidates = observations
        .iter()
        .filter(|candidate| {
            candidate.tick == observation.tick
                && candidate.target_kind == observation.target_kind
                && candidate.target_id == observation.target_id
                && candidate.path == observation.path
        })
        .collect::<Vec<_>>();
    let writers = candidates
        .iter()
        .map(|candidate| {
            format!(
                "{}{}",
                candidate.writer,
                candidate
                    .system
                    .as_deref()
                    .map(|system| format!(" ({system})"))
                    .unwrap_or_default()
            )
        })
        .collect::<BTreeSet<_>>();
    let writer_text = if writers.is_empty() {
        observation.writer.clone()
    } else {
        writers.into_iter().collect::<Vec<_>>().join(" and ")
    };
    let winning = candidates
        .last()
        .map(|candidate| {
            format!(
                "{}{}",
                candidate.writer,
                candidate
                    .system
                    .as_deref()
                    .map(|system| format!(" ({system})"))
                    .unwrap_or_default()
            )
        })
        .unwrap_or_else(|| observation.writer.clone());
    let path = format!(
        "{}/{}/{}",
        observation.target_kind, observation.target_id, observation.path
    );
    NativeSystemEffectDiagnostic {
        code: "TN_RUNTIME_WRITE_CONFLICT",
        message: format!(
            "Runtime write conflict: {} '{}' field '{}' was written by {} in fixed tick {}; winning write: {}.",
            observation.target_kind,
            observation.target_id,
            observation.path,
            writer_text,
            observation.tick,
            winning,
        ),
        path,
        severity: "warning",
        suggestion: Some("Choose one authoritative owner for this transform field, or move the write into an explicit ordered composition step; the later write currently wins.".to_owned()),
    }
}

fn classify_native_write(
    previous: Option<&NativeRuntimeWriteObservation>,
    previous_target: Option<&NativeRuntimeWriteObservation>,
    input: &NativeRuntimeWriteInput,
) -> String {
    if previous.is_none()
        && input.target_kind == "resource"
        && previous_target.is_some_and(|candidate| candidate.path != input.path)
    {
        return "composed".to_owned();
    }
    let Some(previous) = previous else {
        return "accepted".to_owned();
    };
    if input.target_kind == "resource" && previous.path != input.path {
        return "composed".to_owned();
    }
    if is_transform_path(&input.path)
        && previous.writer != input.writer
        && is_transform_writer_pair(&previous.writer, &input.writer)
    {
        return "conflict".to_owned();
    }
    "overwritten".to_owned()
}

fn is_transform_path(path: &str) -> bool {
    path == "Transform" || path.starts_with("Transform/")
}

fn is_transform_writer_pair(left: &str, right: &str) -> bool {
    (left == "physics" && right == "script") || (left == "script" && right == "physics")
}

fn native_value_fingerprint(value: &Value) -> String {
    let mut hash = 2_166_136_261_u32;
    for byte in canonical_runtime_write_value(value).as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("fnv1a:{hash:08x}")
}

fn native_inline_value(value: &Value) -> Option<Value> {
    match value {
        Value::Bool(_) | Value::Number(_) | Value::String(_) => Some(value.clone()),
        Value::Array(values)
            if values.len() <= 4
                && values
                    .iter()
                    .all(|value| value.as_f64().is_some_and(f64::is_finite)) =>
        {
            Some(value.clone())
        }
        _ => None,
    }
}

fn canonical_runtime_write_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(value) => format!("boolean:{value}"),
        Value::Number(value) => {
            let mut text = value.to_string();
            if text == "-0" || text == "-0.0" {
                text = "0".to_owned();
            } else if text.ends_with(".0") {
                text.truncate(text.len() - 2);
            }
            text
        }
        Value::String(value) => format!(
            "string:{}",
            serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_owned())
        ),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(canonical_runtime_write_value)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort();
            format!(
                "{{{}}}",
                keys.into_iter()
                    .map(|key| format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_owned()),
                        canonical_runtime_write_value(&values[key])
                    ))
                    .collect::<Vec<_>>()
                    .join(","),
            )
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeSystemEffectLog {
    pub entries: Vec<NativeSystemEffectLogEntry>,
    pub schema: &'static str,
    pub version: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeSystemEffectsApplied {
    pub log: NativeSystemEffectLog,
    pub transform_patches: BTreeSet<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeSystemEffectLogEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    pub frame: u32,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
    #[serde(rename = "reconciliation", skip_serializing_if = "Option::is_none")]
    pub reconciliation: Option<NativeSystemEffectReconciliation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    pub schedule: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
    pub system: String,
    pub tick: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct NativeSystemEffectReconciliation {
    pub code: &'static str,
    pub status: &'static str,
}

pub fn apply_system_effects(
    bundle: &mut LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
) -> Result<NativeSystemEffectLog, Vec<NativeSystemEffectDiagnostic>> {
    apply_system_effects_with_report(bundle, system, effects, frame, tick)
        .map(|applied| applied.log)
}

pub fn apply_system_effects_with_report(
    bundle: &mut LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
) -> Result<NativeSystemEffectsApplied, Vec<NativeSystemEffectDiagnostic>> {
    apply_system_effects_with_report_and_ledger(bundle, system, effects, frame, tick, None)
}

pub fn apply_system_effects_with_report_and_ledger(
    bundle: &mut LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
    write_ledger: Option<&mut NativeRuntimeWriteLedger>,
) -> Result<NativeSystemEffectsApplied, Vec<NativeSystemEffectDiagnostic>> {
    apply_system_effects_with_report_and_ledger_and_writer(
        bundle,
        system,
        effects,
        frame,
        tick,
        write_ledger,
        "script",
    )
}

pub fn apply_system_effects_with_report_and_ledger_and_writer(
    bundle: &mut LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
    write_ledger: Option<&mut NativeRuntimeWriteLedger>,
    writer: &str,
) -> Result<NativeSystemEffectsApplied, Vec<NativeSystemEffectDiagnostic>> {
    let diagnostics = validate_system_effects(system, effects);
    let log = native_effect_log(system, effects, frame, tick);
    if let Some(ledger) = write_ledger {
        record_system_writes(
            bundle,
            system,
            effects,
            u64::from(tick),
            !diagnostics.is_empty(),
            ledger,
            writer,
        );
    }
    if !diagnostics.is_empty() {
        return Err(diagnostics);
    }
    let transform_patches = transform_patches_for_effects(effects);

    for event in &effects.events {
        apply_event(bundle, event);
    }
    for patch in &effects.patches {
        apply_patch(bundle, patch);
    }
    for command in &effects.commands {
        apply_command(bundle, command);
    }
    for resource in &effects.resources {
        apply_resource(bundle, resource);
    }
    for service in &effects.services {
        apply_physics_body_service(bundle, service);
    }

    Ok(NativeSystemEffectsApplied {
        log,
        transform_patches,
    })
}

pub fn record_initial_runtime_writes(
    bundle: &LoadedBundle,
    tick: u64,
    ledger: &mut NativeRuntimeWriteLedger,
) {
    for entity in &bundle.world.entities {
        for (component, value) in entity.components.values() {
            record_value_fields(
                ledger,
                NativeWriteTarget::component(&component, &entity.id, None, &value),
                NativeWriteContext::initial(tick),
            );
        }
    }
    for (resource, value) in &bundle.world.resources {
        record_value_fields(
            ledger,
            NativeWriteTarget::resource(resource, None, value),
            NativeWriteContext::initial(tick),
        );
    }
}

fn record_system_writes(
    bundle: &LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    tick: u64,
    dropped: bool,
    ledger: &mut NativeRuntimeWriteLedger,
    writer: &str,
) {
    for patch in &effects.patches {
        let current = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == patch.entity)
            .and_then(|entity| component_value(&entity.components, &patch.component));
        record_value_fields(
            ledger,
            NativeWriteTarget::component(
                &patch.component,
                &patch.entity,
                current.as_ref(),
                &patch.value,
            ),
            NativeWriteContext::system(system, tick, writer, dropped),
        );
    }
    for command in &effects.commands {
        let (Some(component), Some(entity), Some(value)) = (
            command.component.as_deref(),
            command.entity.as_deref(),
            command.value.as_ref().or(command.components.as_ref()),
        ) else {
            continue;
        };
        let current = bundle
            .world
            .entities
            .iter()
            .find(|candidate| candidate.id == entity)
            .and_then(|candidate| component_value(&candidate.components, component));
        record_value_fields(
            ledger,
            NativeWriteTarget::component(component, entity, current.as_ref(), value),
            NativeWriteContext::system(system, tick, writer, dropped),
        );
    }
    for resource in &effects.resources {
        let current = bundle.world.resources.get(&resource.resource);
        record_value_fields(
            ledger,
            NativeWriteTarget::resource(&resource.resource, current, &resource.value),
            NativeWriteContext::system(system, tick, writer, dropped),
        );
    }
}

struct NativeWriteTarget<'a> {
    component: &'a str,
    id: &'a str,
    kind: &'static str,
    old_value: Option<&'a Value>,
    value: &'a Value,
}

impl<'a> NativeWriteTarget<'a> {
    fn component(
        component: &'a str,
        id: &'a str,
        old: Option<&'a Value>,
        value: &'a Value,
    ) -> Self {
        Self {
            component,
            id,
            kind: "component",
            old_value: old,
            value,
        }
    }

    fn resource(id: &'a str, old: Option<&'a Value>, value: &'a Value) -> Self {
        Self {
            component: "",
            id,
            kind: "resource",
            old_value: old,
            value,
        }
    }
}

struct NativeWriteContext<'a> {
    dropped: bool,
    schedule: Option<&'a str>,
    system_name: Option<&'a str>,
    tick: u64,
    writer: &'a str,
}

impl<'a> NativeWriteContext<'a> {
    fn initial(tick: u64) -> Self {
        Self {
            dropped: false,
            schedule: Some("startup"),
            system_name: Some("initial-ir"),
            tick,
            writer: "initial-ir",
        }
    }

    fn system(system: &'a SystemIr, tick: u64, writer: &'a str, dropped: bool) -> Self {
        Self {
            dropped,
            schedule: Some(&system.schedule),
            system_name: Some(&system.name),
            tick,
            writer,
        }
    }
}

fn record_value_fields(
    ledger: &mut NativeRuntimeWriteLedger,
    target: NativeWriteTarget<'_>,
    context: NativeWriteContext<'_>,
) {
    for field in value_fields(target.value) {
        let old_field = target.old_value.and_then(|value| {
            value
                .as_object()
                .and_then(|object| object.get(&field))
                .cloned()
        });
        let new_field = target
            .value
            .as_object()
            .and_then(|object| object.get(&field))
            .cloned()
            .unwrap_or_else(|| target.value.clone());
        ledger.record(NativeRuntimeWriteInput {
            disposition: context.dropped.then(|| "dropped".to_owned()),
            new_value: new_field,
            old_value: old_field,
            path: if target.component.is_empty() {
                field
            } else {
                format!("{}/{field}", target.component)
            },
            schedule: context.schedule.map(str::to_owned),
            system: context.system_name.map(str::to_owned),
            target_id: target.id.to_owned(),
            target_kind: target.kind.to_owned(),
            tick: context.tick,
            writer: context.writer.to_owned(),
        });
    }
}

fn value_fields(value: &Value) -> Vec<String> {
    value
        .as_object()
        .map(|object| object.keys().cloned().collect())
        .unwrap_or_else(|| vec!["$".to_owned()])
}

pub fn validate_system_effects(
    system: &SystemIr,
    effects: &NativeSystemEffects,
) -> Vec<NativeSystemEffectDiagnostic> {
    let mut diagnostics = Vec::new();
    for command in &effects.commands {
        if !declares_command(system, command) {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_COMMAND_UNDECLARED",
                system,
                &format!("commands/{}", command.command),
                format!(
                    "System '{}' emitted undeclared command '{}'.",
                    system.name, command.command
                ),
            ));
        }
    }
    for patch in &effects.patches {
        if !system
            .writes
            .iter()
            .any(|component| component == &patch.component)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_WRITE_UNDECLARED",
                system,
                &format!("writes/{}", patch.component),
                format!(
                    "System '{}' patched undeclared component '{}'.",
                    system.name, patch.component
                ),
            ));
        }
    }
    for event in &effects.events {
        if !system
            .event_writes
            .iter()
            .any(|declared| declared == &event.event)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_EVENT_WRITE_UNDECLARED",
                system,
                &format!("eventWrites/{}", event.event),
                format!(
                    "System '{}' emitted undeclared event '{}'.",
                    system.name, event.event
                ),
            ));
        }
    }
    for resource in &effects.resources {
        if !system
            .resource_writes
            .iter()
            .any(|declared| declared == &resource.resource)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_RESOURCE_WRITE_UNDECLARED",
                system,
                &format!("resourceWrites/{}", resource.resource),
                format!(
                    "System '{}' wrote undeclared resource '{}'.",
                    system.name, resource.resource
                ),
            ));
        }
    }
    for service in &effects.services {
        if !system
            .services
            .iter()
            .any(|declared| declared == &service.service)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_SERVICE_UNDECLARED",
                system,
                &format!("services/{}", service.service),
                format!(
                    "System '{}' called undeclared service '{}'.",
                    system.name, service.service
                ),
            ));
        }
    }
    diagnostics
}

fn declares_command(system: &SystemIr, command: &NativeSystemCommandEffect) -> bool {
    system
        .commands
        .iter()
        .chain(
            system
                .delayed_commands
                .iter()
                .map(|declaration| &declaration.command),
        )
        .any(|declared| match declared {
            SystemCommandIr::AddComponent { component, entity } => {
                command.command == "addComponent"
                    && command.component.as_ref() == Some(component)
                    && command.entity.as_ref() == Some(entity)
            }
            SystemCommandIr::Despawn { entity } => {
                command.command == "despawn" && command.entity.as_ref() == Some(entity)
            }
            SystemCommandIr::EmitEvent { event } => {
                command.command == "emitEvent" && command.event.as_ref() == Some(event)
            }
            SystemCommandIr::Instantiate { prefab, prefix } => {
                command.command == "instantiate"
                    && command.prefab.as_ref() == Some(prefab)
                    && command.prefix.as_ref() == Some(prefix)
            }
            SystemCommandIr::RemoveComponent { component, entity } => {
                command.command == "removeComponent"
                    && command.component.as_ref() == Some(component)
                    && command.entity.as_ref() == Some(entity)
            }
            SystemCommandIr::SetParent { child, parent } => {
                command.command == "setParent"
                    && command.child.as_ref() == Some(child)
                    && command.parent.as_ref() == Some(parent)
            }
            SystemCommandIr::ClearParent { child } => {
                command.command == "clearParent" && command.child.as_ref() == Some(child)
            }
            SystemCommandIr::SetComponent { component, entity } => {
                command.command == "setComponent"
                    && command.component.as_ref() == Some(component)
                    && command.entity.as_ref() == Some(entity)
            }
            SystemCommandIr::Spawn { components, entity } => {
                command.command == "spawn"
                    && command.entity.as_ref() == Some(entity)
                    && command
                        .components
                        .as_ref()
                        .and_then(Value::as_object)
                        .map(|values| {
                            values
                                .keys()
                                .all(|component| components.contains(component))
                        })
                        .unwrap_or(true)
            }
            SystemCommandIr::Tween { entity, property } => {
                command.command == "tween"
                    && command.entity.as_ref() == Some(entity)
                    && command
                        .value
                        .as_ref()
                        .and_then(|value| value.get("property"))
                        .and_then(Value::as_str)
                        == Some(property)
            }
            SystemCommandIr::WorldText { entity } => {
                command.command == "worldText" && command.entity.as_ref() == Some(entity)
            }
        })
}

fn transform_patches_for_effects(effects: &NativeSystemEffects) -> BTreeSet<String> {
    let mut entity_ids = effects
        .patches
        .iter()
        .filter(|patch| patch.component == "Transform")
        .map(|patch| patch.entity.clone())
        .collect::<BTreeSet<_>>();
    for command in &effects.commands {
        if matches!(command.command.as_str(), "addComponent" | "setComponent")
            && command.component.as_deref() == Some("Transform")
            && let Some(entity) = command.entity.as_ref()
        {
            entity_ids.insert(entity.clone());
        }
    }
    entity_ids
}

pub fn native_effect_log(
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
) -> NativeSystemEffectLog {
    let mut entries = Vec::new();
    for event in &effects.events {
        entries.push(NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: Some(event.event.clone()),
            frame,
            kind: "event".to_owned(),
            payload: Some(event.payload.clone()),
            reconciliation: None,
            resource: None,
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: None,
        });
    }
    for patch in &effects.patches {
        entries.push(NativeSystemEffectLogEntry {
            command: Some("setComponent".to_owned()),
            component: Some(patch.component.clone()),
            entity: Some(patch.entity.clone()),
            event: None,
            frame,
            kind: "patch".to_owned(),
            payload: None,
            reconciliation: live_reconciliation_for_component(&patch.component),
            resource: None,
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: Some(patch.value.clone()),
        });
    }
    for command in &effects.commands {
        entries.push(NativeSystemEffectLogEntry {
            command: Some(command.command.clone()),
            component: command.component.clone(),
            entity: command.entity.clone(),
            event: command.event.clone(),
            frame,
            kind: "command".to_owned(),
            payload: command.payload.clone(),
            reconciliation: live_reconciliation_for_command(command),
            resource: None,
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: command.value.clone().or_else(|| command.components.clone()),
        });
    }
    for resource in &effects.resources {
        entries.push(NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: None,
            frame,
            kind: "resource".to_owned(),
            payload: None,
            reconciliation: None,
            resource: Some(resource.resource.clone()),
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: Some(resource.value.clone()),
        });
    }
    for service in &effects.services {
        entries.push(NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: None,
            frame,
            kind: "service".to_owned(),
            payload: Some(service.payload.clone()),
            reconciliation: None,
            resource: None,
            schedule: system.schedule.clone(),
            service: Some(service.service.clone()),
            system: system.name.clone(),
            tick,
            value: None,
        });
    }
    entries.sort_by_key(effect_log_key);
    NativeSystemEffectLog {
        entries,
        schema: "threenative.web-system-effects",
        version: 1,
    }
}

fn live_reconciliation_for_command(
    command: &NativeSystemCommandEffect,
) -> Option<NativeSystemEffectReconciliation> {
    matches!(
        command.command.as_str(),
        "spawn"
            | "despawn"
            | "instantiate"
            | "setParent"
            | "clearParent"
            | "addComponent"
            | "setComponent"
            | "removeComponent"
            | "worldText"
    )
    .then_some(NativeSystemEffectReconciliation {
        code: "TN_BEVY_LIVE_RECONCILIATION_REQUIRED",
        status: "required",
    })
}

fn live_reconciliation_for_component(component: &str) -> Option<NativeSystemEffectReconciliation> {
    matches!(
        component,
        "Camera"
            | "Collider"
            | "Hierarchy"
            | "Light"
            | "MeshRenderer"
            | "RenderLayers"
            | "RigidBody"
            | "Visibility"
            | "WorldText"
    )
    .then_some(NativeSystemEffectReconciliation {
        code: "TN_BEVY_LIVE_RECONCILIATION_REQUIRED",
        status: "required",
    })
}

fn apply_patch(bundle: &mut LoadedBundle, patch: &NativeSystemPatchEffect) {
    let Some(entity) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == patch.entity)
    else {
        return;
    };

    if patch.operation.as_deref() == Some("set") {
        apply_component_value(
            &mut entity.components,
            &patch.component,
            patch.value.clone(),
        );
        return;
    }

    if patch.component == "Transform" {
        let existing = entity
            .components
            .transform
            .get_or_insert(TransformComponent {
                position: None,
                rotation: None,
                scale: None,
            });
        if let Some(position) = read_vec3(&patch.value, "position") {
            existing.position = Some(position);
        }
        if let Some(rotation) = read_vec4(&patch.value, "rotation") {
            existing.rotation = Some(rotation);
        }
        if let Some(scale) = read_vec3(&patch.value, "scale") {
            existing.scale = Some(scale);
        }
        return;
    }

    if patch.component == "MeshRenderer" {
        patch_mesh_renderer(&mut entity.components, &patch.value);
        return;
    }

    patch_component_value(
        &mut entity.components,
        &patch.component,
        patch.value.clone(),
    );
}

fn apply_command(bundle: &mut LoadedBundle, command: &NativeSystemCommandEffect) {
    match command.command.as_str() {
        "spawn" => apply_spawn_command(bundle, command),
        "worldText" => apply_world_text_command(bundle, command),
        "tween" => {}
        "instantiate" => apply_instantiate_command(bundle, command),
        "despawn" => {
            let Some(entity_id) = command.entity.as_ref() else {
                return;
            };
            bundle
                .world
                .entities
                .retain(|entity| entity.id != *entity_id);
        }
        "setParent" => {
            let (Some(child), Some(parent)) = (command.child.as_ref(), command.parent.as_ref())
            else {
                return;
            };
            set_parent(bundle, child, parent);
        }
        "clearParent" => {
            let Some(child) = command.child.as_ref() else {
                return;
            };
            clear_parent(bundle, child);
        }
        "addComponent" | "setComponent" => {
            let (Some(entity_id), Some(component), Some(value)) = (
                command.entity.as_ref(),
                command.component.as_ref(),
                command.value.as_ref(),
            ) else {
                return;
            };
            let Some(entity) = bundle
                .world
                .entities
                .iter_mut()
                .find(|entity| entity.id == *entity_id)
            else {
                return;
            };
            apply_component_value(&mut entity.components, component, value.clone());
        }
        "removeComponent" => {
            let (Some(entity_id), Some(component)) =
                (command.entity.as_ref(), command.component.as_ref())
            else {
                return;
            };
            let Some(entity) = bundle
                .world
                .entities
                .iter_mut()
                .find(|entity| entity.id == *entity_id)
            else {
                return;
            };
            remove_component(&mut entity.components, component);
        }
        "emitEvent" => {
            let (Some(event), Some(payload)) = (command.event.as_ref(), command.payload.as_ref())
            else {
                return;
            };
            apply_event(
                bundle,
                &NativeSystemEventEffect {
                    event: event.clone(),
                    payload: payload.clone(),
                },
            );
        }
        _ => {}
    }
}

fn apply_event(bundle: &mut LoadedBundle, event: &NativeSystemEventEffect) {
    let queue = bundle
        .world
        .events
        .entry(event.event.clone())
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Value::Array(values) = queue {
        values.push(event.payload.clone());
    } else {
        *queue = Value::Array(vec![event.payload.clone()]);
    }
}

fn apply_resource(bundle: &mut LoadedBundle, resource: &NativeSystemResourceEffect) {
    bundle
        .world
        .resources
        .insert(resource.resource.clone(), resource.value.clone());
}

fn apply_physics_body_service(bundle: &mut LoadedBundle, service: &NativeSystemServiceEffect) {
    if !matches!(
        service.service.as_str(),
        "physics.addForce"
            | "physics.addTorque"
            | "physics.applyAngularImpulse"
            | "physics.applyImpulse"
            | "physics.setAngularVelocity"
            | "physics.setLinearVelocity"
    ) {
        return;
    }
    let Some(request) = service.payload.get("request") else {
        return;
    };
    let Some(entity_id) = request.get("entity").and_then(Value::as_str) else {
        return;
    };
    let Some(value) = request.get("value").and_then(physics_service_vector) else {
        return;
    };
    let fixed_delta = request
        .get("fixedDelta")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value as f32)
        .unwrap_or(1.0 / 60.0);
    let Some(entity) = bundle
        .world
        .entities
        .iter_mut()
        .find(|candidate| candidate.id == entity_id)
    else {
        return;
    };
    let collider = entity.components.collider.clone();
    let Some(body) = entity.components.rigid_body.as_mut() else {
        return;
    };
    if body.kind != "dynamic" {
        return;
    }
    let mass = body
        .mass
        .or_else(|| {
            body.inverse_mass
                .filter(|value| *value > 0.0)
                .map(|value| 1.0 / value)
        })
        .unwrap_or(1.0)
        .max(0.000_001);
    match service.service.as_str() {
        "physics.setLinearVelocity" => body.velocity = Some(value),
        "physics.applyImpulse" => {
            body.velocity = Some(add_scaled_vector(body.velocity, value, 1.0 / mass));
        }
        "physics.addForce" => {
            body.velocity = Some(add_scaled_vector(body.velocity, value, fixed_delta / mass));
        }
        "physics.setAngularVelocity" => body.angular_velocity = Some(value),
        "physics.applyAngularImpulse" | "physics.addTorque" => {
            let inertia = physics_angular_inertia(collider.as_ref(), mass);
            let scale = if service.service == "physics.addTorque" {
                fixed_delta
            } else {
                1.0
            };
            let current = body.angular_velocity.unwrap_or([0.0; 3]);
            body.angular_velocity = Some([
                current[0] + value[0] * scale / inertia[0],
                current[1] + value[1] * scale / inertia[1],
                current[2] + value[2] * scale / inertia[2],
            ]);
        }
        _ => {}
    }
}

fn physics_service_vector(value: &Value) -> Option<[f32; 3]> {
    let values = value.as_array()?;
    if values.len() != 3 {
        return None;
    }
    let values = values
        .iter()
        .map(Value::as_f64)
        .collect::<Option<Vec<_>>>()?;
    if !values.iter().all(|value| value.is_finite()) {
        return None;
    }
    Some([values[0] as f32, values[1] as f32, values[2] as f32])
}

fn add_scaled_vector(current: Option<[f32; 3]>, value: [f32; 3], scale: f32) -> [f32; 3] {
    let current = current.unwrap_or([0.0; 3]);
    [
        current[0] + value[0] * scale,
        current[1] + value[1] * scale,
        current[2] + value[2] * scale,
    ]
}

fn physics_angular_inertia(collider: Option<&ColliderComponent>, mass: f32) -> [f32; 3] {
    if let Some(ColliderComponent {
        kind,
        size: Some([x, y, z]),
        ..
    }) = collider
        && kind == "box"
    {
        return [
            (mass * (y * y + z * z) / 12.0).max(0.000_001),
            (mass * (x * x + z * z) / 12.0).max(0.000_001),
            (mass * (x * x + y * y) / 12.0).max(0.000_001),
        ];
    }
    let radius = collider.and_then(|collider| collider.radius).unwrap_or(0.5);
    let inertia = (0.4 * mass * radius * radius).max(0.000_001);
    [inertia; 3]
}

fn apply_component_value(components: &mut EntityComponents, component: &str, value: Value) {
    if component == "Transform" {
        components.transform = serde_json::from_value::<TransformComponent>(value).ok();
        return;
    }

    if component == "MeshRenderer" {
        components.mesh_renderer = read_mesh_renderer(&value);
        return;
    }

    if component == "Camera" {
        components.camera = serde_json::from_value::<CameraComponent>(value).ok();
        return;
    }

    if component == "Collider" {
        components.collider = serde_json::from_value::<ColliderComponent>(value).ok();
        return;
    }

    if component == "Hierarchy" {
        components.hierarchy = Some(HierarchyComponent {
            parent: value
                .get("parent")
                .and_then(Value::as_str)
                .map(str::to_owned),
        });
        return;
    }

    if component == "Light" {
        components.light = serde_json::from_value::<LightComponent>(value).ok();
        return;
    }

    if component == "RigidBody" {
        components.rigid_body = serde_json::from_value::<RigidBodyComponent>(value).ok();
        return;
    }

    if component == "Patrol" {
        components.patrol = serde_json::from_value::<PatrolComponent>(value).ok();
        return;
    }

    if component == "StateMachine" {
        components.state_machine = serde_json::from_value::<StateMachineComponent>(value).ok();
        return;
    }

    if component == "Visibility" {
        components.visibility = serde_json::from_value::<VisibilityComponent>(value).ok();
        return;
    }

    if component == "WorldText" {
        components.world_text = serde_json::from_value::<WorldTextComponent>(value).ok();
        return;
    }

    components.extra.insert(component.to_owned(), value);
}

fn patch_component_value(components: &mut EntityComponents, component: &str, value: Value) {
    match component {
        "Camera" | "Collider" | "Hierarchy" | "Light" | "Patrol" | "RigidBody" | "StateMachine"
        | "Visibility" | "WorldText" => {
            let merged = component_value(components, component)
                .map(|existing| merge_object_patch(existing, &value))
                .unwrap_or(value);
            apply_component_value(components, component, merged);
        }
        other => {
            components.extra.insert(other.to_owned(), value);
        }
    }
}

fn patch_mesh_renderer(components: &mut EntityComponents, value: &Value) {
    if let Some(existing) = components.mesh_renderer.as_mut() {
        if let Some(cast_shadow) = value.get("castShadow").and_then(Value::as_bool) {
            existing.cast_shadow = Some(cast_shadow);
        }
        if let Some(mesh) = value.get("mesh").and_then(Value::as_str) {
            existing.mesh = Some(mesh.to_owned());
        }
        if let Some(material) = value.get("material").and_then(Value::as_str) {
            existing.material = material.to_owned();
        }
        if let Some(receive_shadow) = value.get("receiveShadow").and_then(Value::as_bool) {
            existing.receive_shadow = Some(receive_shadow);
        }
        if let Some(visible) = value.get("visible").and_then(Value::as_bool) {
            existing.visible = Some(visible);
        }
        return;
    }
    components.mesh_renderer = read_mesh_renderer(value);
}

fn merge_object_patch(mut existing: Value, patch: &Value) -> Value {
    let (Some(existing), Some(patch)) = (existing.as_object_mut(), patch.as_object()) else {
        return patch.clone();
    };
    for (key, value) in patch {
        existing.insert(key.clone(), value.clone());
    }
    Value::Object(existing.clone())
}

fn set_parent(bundle: &mut LoadedBundle, child_id: &str, parent_id: &str) {
    if child_id == parent_id || would_create_hierarchy_cycle(bundle, child_id, parent_id) {
        return;
    }
    if !bundle
        .world
        .entities
        .iter()
        .any(|entity| entity.id == parent_id)
    {
        return;
    }
    let Some(child) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == child_id)
    else {
        return;
    };
    let hierarchy = child
        .components
        .hierarchy
        .get_or_insert(HierarchyComponent { parent: None });
    hierarchy.parent = Some(parent_id.to_owned());
}

fn clear_parent(bundle: &mut LoadedBundle, child_id: &str) {
    let Some(child) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == child_id)
    else {
        return;
    };
    let hierarchy = child
        .components
        .hierarchy
        .get_or_insert(HierarchyComponent { parent: None });
    hierarchy.parent = None;
}

fn would_create_hierarchy_cycle(bundle: &LoadedBundle, child_id: &str, parent_id: &str) -> bool {
    let mut current = Some(parent_id);
    let mut visited = std::collections::BTreeSet::new();
    while let Some(entity_id) = current {
        if entity_id == child_id || !visited.insert(entity_id.to_owned()) {
            return true;
        }
        current = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == entity_id)
            .and_then(|entity| entity.components.hierarchy.as_ref())
            .and_then(|hierarchy| hierarchy.parent.as_deref());
    }
    false
}

fn read_mesh_renderer(value: &Value) -> Option<MeshRendererComponent> {
    serde_json::from_value(value.clone()).ok()
}

fn remove_component(components: &mut EntityComponents, component: &str) {
    match component {
        "Camera" => components.camera = None,
        "Collider" => components.collider = None,
        "Hierarchy" => components.hierarchy = None,
        "Light" => components.light = None,
        "MeshRenderer" => components.mesh_renderer = None,
        "RigidBody" => components.rigid_body = None,
        "Patrol" => components.patrol = None,
        "StateMachine" => components.state_machine = None,
        "Transform" => components.transform = None,
        "Visibility" => components.visibility = None,
        "WorldText" => components.world_text = None,
        other => {
            components.extra.remove(other);
        }
    }
}

fn effect_log_key(entry: &NativeSystemEffectLogEntry) -> String {
    format!(
        "{:012}\0{:012}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}",
        entry.frame,
        entry.tick,
        entry.schedule,
        entry.system,
        entry.kind,
        entry.command.as_deref().unwrap_or(""),
        entry.entity.as_deref().unwrap_or(""),
        entry.component.as_deref().unwrap_or(""),
        entry.event.as_deref().unwrap_or(""),
        entry.resource.as_deref().unwrap_or(""),
        entry.service.as_deref().unwrap_or(""),
        serde_json::to_string(
            entry
                .payload
                .as_ref()
                .or(entry.value.as_ref())
                .unwrap_or(&Value::Null)
        )
        .unwrap_or_else(|_| "null".to_owned())
    )
}

fn read_vec3(value: &Value, field: &str) -> Option<[f32; 3]> {
    let values = value.get(field)?.as_array()?;
    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
    ])
}

fn read_vec4(value: &Value, field: &str) -> Option<[f32; 4]> {
    let values = value.get(field)?.as_array()?;
    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
        values.get(3)?.as_f64()? as f32,
    ])
}

fn effect_diagnostic(
    code: &'static str,
    system: &SystemIr,
    path: &str,
    message: String,
) -> NativeSystemEffectDiagnostic {
    NativeSystemEffectDiagnostic {
        code,
        message,
        path: format!("systems.ir.json/systems/{}/{}", system.name, path),
        severity: "error",
        suggestion: None,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;
    use threenative_loader::load_bundle;

    use super::*;

    #[test]
    fn applies_physics_body_commands_with_mass_and_inertia() {
        let mut bundle = load_runtime_gameplay_host_bundle();
        let player = bundle
            .world
            .entities
            .iter_mut()
            .find(|entity| entity.id == "player")
            .expect("fixture should include player");
        player.components.collider = serde_json::from_value(json!({
            "kind": "box",
            "size": [2, 2, 2]
        }))
        .ok();
        player.components.rigid_body = serde_json::from_value(json!({
            "angularVelocity": [0, 0, 0],
            "kind": "dynamic",
            "mass": 2,
            "velocity": [0, 0, 0]
        }))
        .ok();

        for (service, value) in [
            ("physics.addForce", json!([2, 0, 0])),
            ("physics.applyImpulse", json!([2, 0, 0])),
            ("physics.addTorque", json!([0, 2, 0])),
            ("physics.applyAngularImpulse", json!([0, 0, 2])),
            ("physics.setLinearVelocity", json!([4, 5, 6])),
            ("physics.setAngularVelocity", json!([1, 2, 3])),
        ] {
            apply_physics_body_service(
                &mut bundle,
                &NativeSystemServiceEffect {
                    payload: json!({
                        "request": {
                            "entity": "player",
                            "fixedDelta": 0.25,
                            "value": value
                        },
                        "result": {}
                    }),
                    service: service.to_owned(),
                },
            );
        }

        let body = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "player")
            .and_then(|entity| entity.components.rigid_body.as_ref())
            .expect("body should remain present");
        assert_eq!(body.velocity, Some([4.0, 5.0, 6.0]));
        assert_eq!(body.angular_velocity, Some([1.0, 2.0, 3.0]));
    }

    #[test]
    fn rejects_undeclared_mixed_effects_before_applying_any_mutation() {
        let mut bundle = load_runtime_gameplay_host_bundle();
        let system = system_by_name(&bundle, "spawnRenderable");

        let result = apply_system_effects(
            &mut bundle,
            &system,
            &NativeSystemEffects {
                commands: vec![NativeSystemCommandEffect {
                    command: "spawn".to_owned(),
                    components: Some(json!({ "Transform": { "position": [0, 1, 0] } })),
                    entity: Some("marker".to_owned()),
                    ..Default::default()
                }],
                events: vec![NativeSystemEventEffect {
                    event: "TimerElapsed".to_owned(),
                    payload: json!({ "tick": 1 }),
                }],
                observations: Vec::new(),
                patches: vec![NativeSystemPatchEffect {
                    component: "Visibility".to_owned(),
                    entity: "player".to_owned(),
                    operation: None,
                    value: json!({ "visible": false }),
                }],
                resources: vec![NativeSystemResourceEffect {
                    resource: "Score".to_owned(),
                    value: json!({ "value": 2 }),
                }],
                schedules: Vec::new(),
                services: vec![NativeSystemServiceEffect {
                    payload: json!({ "request": {}, "result": { "hit": false } }),
                    service: "physics.raycast".to_owned(),
                }],
            },
            0,
            0,
        );

        let diagnostics = result.expect_err("undeclared effects should be rejected");
        let mut codes = diagnostics
            .iter()
            .map(|diagnostic| diagnostic.code)
            .collect::<Vec<_>>();
        codes.sort();
        assert_eq!(
            codes,
            vec![
                "TN_BEVY_SYSTEM_COMMAND_UNDECLARED",
                "TN_BEVY_SYSTEM_EVENT_WRITE_UNDECLARED",
                "TN_BEVY_SYSTEM_RESOURCE_WRITE_UNDECLARED",
                "TN_BEVY_SYSTEM_SERVICE_UNDECLARED",
                "TN_BEVY_SYSTEM_WRITE_UNDECLARED",
            ]
        );
        assert!(
            bundle
                .world
                .entities
                .iter()
                .all(|entity| entity.id != "marker")
        );
        assert_eq!(
            bundle
                .world
                .resources
                .get("GameState")
                .and_then(|value| value.get("phase"))
                .and_then(Value::as_str),
            Some("boot")
        );
        assert!(!bundle.world.resources.contains_key("Score"));
        assert!(!bundle.world.events.contains_key("TimerElapsed"));
        let player = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "player")
            .expect("fixture should include player");
        assert!(!player.components.extra.contains_key("Visibility"));
    }

    #[test]
    fn produces_canonical_effect_log_ordering() {
        let mut bundle = load_runtime_gameplay_host_bundle();
        let system = system_by_name(&bundle, "spawnRenderable");

        let log = apply_system_effects(
            &mut bundle,
            &system,
            &NativeSystemEffects {
                commands: vec![NativeSystemCommandEffect {
                    command: "spawn".to_owned(),
                    components: Some(json!({ "Transform": { "position": [0, 1, 0] } })),
                    entity: Some("runtime.enemy".to_owned()),
                    ..Default::default()
                }],
                events: vec![NativeSystemEventEffect {
                    event: "Spawned".to_owned(),
                    payload: json!({ "entity": "runtime.enemy" }),
                }],
                observations: Vec::new(),
                patches: vec![NativeSystemPatchEffect {
                    component: "Transform".to_owned(),
                    entity: "player".to_owned(),
                    operation: None,
                    value: json!({ "position": [1, 0, 0] }),
                }],
                resources: vec![NativeSystemResourceEffect {
                    resource: "GameState".to_owned(),
                    value: json!({ "combat": "engaged", "phase": "playing" }),
                }],
                schedules: Vec::new(),
                services: Vec::new(),
            },
            3,
            4,
        )
        .expect("declared effects should apply");

        assert_eq!(
            log.entries
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["command", "event", "patch", "resource"]
        );
    }

    #[test]
    fn classifies_native_write_composition_and_transform_conflicts() {
        let mut ledger = NativeRuntimeWriteLedger::default();
        let input = |writer: &str, system: &str, target: &str, path: &str, value: Value| {
            NativeRuntimeWriteInput {
                disposition: None,
                new_value: value,
                old_value: None,
                path: path.to_owned(),
                schedule: Some("fixedUpdate".to_owned()),
                system: Some(system.to_owned()),
                target_id: target.to_owned(),
                target_kind: "component".to_owned(),
                tick: 3,
                writer: writer.to_owned(),
            }
        };

        ledger.record(input(
            "physics",
            "physics",
            "player",
            "Transform/position",
            json!([1, 0, 0]),
        ));
        let conflict = ledger.record(input(
            "script",
            "movePlayer",
            "player",
            "Transform/position",
            json!([2, 0, 0]),
        ));
        assert_eq!(conflict.disposition, "conflict");
        assert_eq!(
            ledger
                .diagnostics(3)
                .first()
                .map(|diagnostic| diagnostic.code),
            Some("TN_RUNTIME_WRITE_CONFLICT")
        );

        let mut resources = NativeRuntimeWriteLedger::default();
        let mut score = input("script", "score", "Score", "points", json!(1));
        score.target_kind = "resource".to_owned();
        resources.record(score);
        let mut lives = input("script", "score", "Score", "lives", json!(2));
        lives.target_kind = "resource".to_owned();
        assert_eq!(resources.record(lives).disposition, "composed");
    }

    fn load_runtime_gameplay_host_bundle() -> threenative_loader::LoadedBundle {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        load_bundle(
            repo_root.join("packages/ir/fixtures/conformance/runtime-gameplay-host/game.bundle"),
        )
        .expect("runtime gameplay host fixture should load")
    }

    fn system_by_name(bundle: &threenative_loader::LoadedBundle, name: &str) -> SystemIr {
        bundle
            .systems
            .as_ref()
            .and_then(|systems| systems.systems.iter().find(|system| system.name == name))
            .cloned()
            .unwrap_or_else(|| panic!("missing fixture system '{name}'"))
    }
}

fn apply_spawn_command(bundle: &mut LoadedBundle, command: &NativeSystemCommandEffect) {
    let Some(entity_id) = command.entity.as_ref() else {
        return;
    };
    if bundle
        .world
        .entities
        .iter()
        .any(|entity| entity.id == *entity_id)
    {
        return;
    }
    let mut components = EntityComponents::default();
    if let Some(values) = command.components.as_ref().and_then(Value::as_object) {
        for (component, value) in values {
            apply_component_value(&mut components, component, value.clone());
        }
    }
    bundle.world.entities.push(WorldEntity {
        id: entity_id.clone(),
        components,
        tags: command.tags.clone().unwrap_or_default(),
    });
}

fn apply_world_text_command(bundle: &mut LoadedBundle, command: &NativeSystemCommandEffect) {
    let Some(entity_id) = command.entity.as_ref() else {
        return;
    };
    if bundle
        .world
        .entities
        .iter()
        .any(|entity| entity.id == *entity_id)
    {
        return;
    }
    let Some(value) = command.value.as_ref() else {
        return;
    };
    let Some(world_text) = serde_json::from_value::<WorldTextComponent>(value.clone()).ok() else {
        return;
    };
    bundle.world.entities.push(WorldEntity {
        id: entity_id.clone(),
        components: EntityComponents {
            world_text: Some(world_text),
            ..EntityComponents::default()
        },
        tags: Vec::new(),
    });
}

fn apply_instantiate_command(bundle: &mut LoadedBundle, command: &NativeSystemCommandEffect) {
    let (Some(prefab_id), Some(prefix)) = (command.prefab.as_ref(), command.prefix.as_ref()) else {
        return;
    };
    let Some(prefabs) = bundle.prefabs.as_ref() else {
        return;
    };
    let Some(prefab) = prefabs
        .prefabs
        .iter()
        .find(|candidate| candidate.id == *prefab_id)
    else {
        return;
    };
    for template in &prefab.entities {
        let id = format!("{prefix}.{}", template.id);
        if bundle.world.entities.iter().any(|entity| entity.id == id) {
            continue;
        }
        let mut components = template.components.clone();
        if let Some(hierarchy) = components.hierarchy.as_mut()
            && let Some(parent) = hierarchy.parent.as_ref()
        {
            hierarchy.parent = Some(format!("{prefix}.{parent}"));
        }
        bundle.world.entities.push(WorldEntity {
            id,
            components,
            tags: template.tags.clone(),
        });
    }
}
