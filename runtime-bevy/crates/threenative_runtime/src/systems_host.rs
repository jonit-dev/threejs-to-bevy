use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    time::SystemTime,
};

use quickjs_rusty::Context;
use serde::Serialize;
use serde_json::{Value, json};
use thiserror::Error;
use threenative_loader::{LoadedBundle, SystemCommandIr, SystemDelayedCommandIr, SystemIr, TransformComponent};

use crate::{
    component_diff::ComponentDiffCache,
    input::NativeInputState,
    systems_context::{
        NativeSystemTimeSnapshot, build_system_context_snapshot_with_events_input_and_diff,
    },
    systems_effects::{
        NativeSystemEffectLog, NativeSystemEffects, apply_system_effects_with_report,
    },
    systems_host_bridge::BRIDGE_SOURCE,
    transform_interpolation::{TransformSample, interpolate_transform},
};

const MAX_FIXED_STEPS_PER_FRAME: f32 = 5.0;

thread_local! {
    static SCRIPT_HOST: RefCell<Option<NativeScriptHost>> = const { RefCell::new(None) };
}

struct NativeScriptHost {
    context: Context,
    modified: Option<SystemTime>,
    script_path: PathBuf,
    size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemsHostDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub severity: &'static str,
    pub system_id: Option<String>,
}

#[derive(Debug, Error)]
#[error("{code}: {message}")]
pub struct SystemsHostError {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Default)]
pub struct NativeSystemsHostRun {
    pub logs: Vec<NativeSystemEffectLog>,
    pub resource_observations: Vec<NativeResourceObservation>,
    pub transform_patches: BTreeSet<String>,
}

#[derive(bevy::prelude::Resource, Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourceObservationState {
    pub declared: Vec<String>,
    pub observations: Vec<NativeResourceObservation>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourceObservation {
    pub frame: u32,
    pub kind: String,
    pub resource: String,
    pub schedule: String,
    pub system: String,
    pub tick: u32,
}

pub fn native_declared_system_resources(bundle: &LoadedBundle) -> Vec<String> {
    let mut resources = BTreeSet::new();
    if let Some(systems) = bundle.systems.as_ref() {
        for system in &systems.systems {
            resources.extend(system.resource_reads.iter().cloned());
            resources.extend(system.resource_writes.iter().cloned());
        }
    }
    resources.into_iter().collect()
}

#[derive(bevy::prelude::Resource, Debug, Clone, PartialEq)]
pub struct NativeGameLoopState {
    pub accumulator: f32,
    pub delayed_commands: Vec<NativeDelayedCommand>,
    pub delayed_command_observations: Vec<NativeDelayedCommandObservation>,
    pub elapsed: f32,
    pub fixed_transform_current: BTreeMap<String, TransformSample>,
    pub fixed_transform_entities: BTreeSet<String>,
    pub fixed_transform_previous: BTreeMap<String, TransformSample>,
    pub frame: u64,
    pub kinematic_mover_origins: BTreeMap<String, [f32; 3]>,
    pub paused: bool,
    pub script_posed_entities: BTreeSet<String>,
    pub startup_complete: bool,
    pub tick: u64,
}

impl NativeGameLoopState {
    pub fn new(paused: bool) -> Self {
        Self {
            accumulator: 0.0,
            delayed_commands: Vec::new(),
            delayed_command_observations: Vec::new(),
            elapsed: 0.0,
            fixed_transform_current: BTreeMap::new(),
            fixed_transform_entities: BTreeSet::new(),
            fixed_transform_previous: BTreeMap::new(),
            frame: 0,
            kinematic_mover_origins: BTreeMap::new(),
            paused,
            script_posed_entities: BTreeSet::new(),
            startup_complete: false,
            tick: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeDelayedCommand {
    pub cancel_policy: String,
    pub command: SystemCommandIr,
    pub delay_ticks: u32,
    pub enqueued_tick: u64,
    pub id: String,
    pub ownership_id: String,
    pub ownership_kind: String,
    pub remaining_ticks: u32,
    pub schedule: String,
    pub system_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeDelayedCommandObservation {
    pub delay_ticks: u32,
    pub id: String,
    pub remaining_ticks: u32,
    pub status: String,
    pub system: String,
    pub tick: u64,
}

impl Default for NativeGameLoopState {
    fn default() -> Self {
        Self::new(false)
    }
}

#[derive(Debug, Clone)]
pub struct NativeGameLoopRunOptions<'a> {
    pub delta: f32,
    pub fixed_delta: f32,
    pub input: Option<&'a NativeInputState>,
    pub paused: bool,
}

pub fn diagnose_native_system_host(bundle: &LoadedBundle) -> Vec<SystemsHostDiagnostic> {
    let mut diagnostics = Vec::new();
    if bundle.manifest.entry.scripts.is_none() {
        return diagnostics;
    }

    let Some(systems_ir) = bundle.systems.as_ref() else {
        diagnostics.push(SystemsHostDiagnostic {
            code: "TN_BEVY_SYSTEMS_IR_MISSING",
            message: "Bundle references scripts.bundle.js but does not include systems.ir.json."
                .to_owned(),
            severity: "error",
            system_id: None,
        });
        return diagnostics;
    };

    for system in &systems_ir.systems {
        let Some(script) = system.script.as_ref() else {
            diagnostics.push(SystemsHostDiagnostic {
                code: "TN_BEVY_SYSTEM_SCRIPT_MISSING",
                message: format!(
                    "System '{}' is present in systems.ir.json but does not declare a script export.",
                    system.name
                ),
                severity: "error",
                system_id: Some(system.name.clone()),
            });
            continue;
        };

        if Some(script.bundle.as_str()) != bundle.manifest.entry.scripts.as_deref() {
            diagnostics.push(SystemsHostDiagnostic {
                code: "TN_BEVY_SYSTEM_SCRIPT_BUNDLE_MISMATCH",
                message: format!(
                    "System '{}' references script bundle '{}' but manifest entry is '{}'.",
                    system.name,
                    script.bundle,
                    bundle.manifest.entry.scripts.as_deref().unwrap_or("<none>")
                ),
                severity: "error",
                system_id: Some(system.name.clone()),
            });
        }
    }

    diagnostics
}

pub fn ensure_native_system_host_supported(bundle: &LoadedBundle) -> Result<(), SystemsHostError> {
    let Some(diagnostic) = diagnose_native_system_host(bundle).into_iter().next() else {
        return Ok(());
    };

    Err(SystemsHostError {
        code: diagnostic.code,
        message: diagnostic.message,
    })
}

pub fn unsupported_native_system_host_diagnostic(
    system_id: impl Into<String>,
) -> SystemsHostDiagnostic {
    let system_id = system_id.into();
    SystemsHostDiagnostic {
        code: "TN_BEVY_SYSTEM_HOST_UNSUPPORTED",
        message: format!(
            "Native TypeScript system hosting is unavailable for system '{system_id}' in this build; enable the QuickJS host or use web preview."
        ),
        severity: "error",
        system_id: Some(system_id),
    }
}

pub fn run_native_systems_once(
    bundle: &mut LoadedBundle,
    time: NativeSystemTimeSnapshot,
) -> Result<NativeSystemsHostRun, SystemsHostError> {
    run_native_systems_once_with_input(bundle, time, None)
}

pub fn run_native_systems_once_with_input(
    bundle: &mut LoadedBundle,
    time: NativeSystemTimeSnapshot,
    input: Option<&NativeInputState>,
) -> Result<NativeSystemsHostRun, SystemsHostError> {
    let schedules = ["startup", "fixedUpdate", "update", "postUpdate"];
    run_native_system_schedules(bundle, &schedules, time, input)
}

pub fn run_native_systems_frame_with_input(
    bundle: &mut LoadedBundle,
    state: &mut NativeGameLoopState,
    options: NativeGameLoopRunOptions<'_>,
    mut step_physics: impl FnMut(&mut LoadedBundle, f32, &BTreeSet<String>),
) -> Result<NativeSystemsHostRun, SystemsHostError> {
    if options.fixed_delta <= 0.0 {
        return Err(host_error(
            "TN_BEVY_SYSTEM_FIXED_DELTA_INVALID",
            format!(
                "Native game loop fixed_delta must be greater than zero, got {}.",
                options.fixed_delta
            ),
        ));
    }

    state.paused = options.paused;
    state.elapsed += options.delta;

    let mut run = NativeSystemsHostRun::default();
    if !state.paused {
        state.accumulator += options.delta;
        state.accumulator = state
            .accumulator
            .min(options.fixed_delta * MAX_FIXED_STEPS_PER_FRAME);

        if !state.startup_complete {
            let time = loop_time_snapshot(0.0, state.elapsed, options.fixed_delta, state.paused);
            let startup_run = run_native_system_schedules_with_state(
                bundle,
                &["startup"],
                time,
                options.input,
                state.frame as u32,
                state.tick,
                Some((
                    &mut state.delayed_commands,
                    &mut state.delayed_command_observations,
                )),
            )?;
            state
                .script_posed_entities
                .extend(startup_run.transform_patches.iter().cloned());
            run.transform_patches
                .extend(startup_run.transform_patches.iter().cloned());
            run.logs.extend(startup_run.logs);
            state.startup_complete = true;
        }

        while state.accumulator >= options.fixed_delta {
            let before_fixed = snapshot_bundle_transforms(bundle);
            let mover_observations = crate::kinematic_mover::step_bundle_kinematic_movers(
                bundle,
                state.elapsed,
                &mut state.kinematic_mover_origins,
            );
            state.script_posed_entities.extend(
                mover_observations
                    .iter()
                    .map(|observation| observation.entity.clone()),
            );
            step_physics(bundle, options.fixed_delta, &state.script_posed_entities);
            state.script_posed_entities.clear();
            let time = loop_time_snapshot(
                options.fixed_delta,
                state.elapsed,
                options.fixed_delta,
                state.paused,
            );
            let fixed_run = run_native_system_schedules_with_state(
                bundle,
                &["fixedUpdate"],
                time,
                options.input,
                state.frame as u32,
                state.tick,
                Some((
                    &mut state.delayed_commands,
                    &mut state.delayed_command_observations,
                )),
            )?;
            state
                .script_posed_entities
                .extend(fixed_run.transform_patches.iter().cloned());
            run.transform_patches
                .extend(fixed_run.transform_patches.iter().cloned());
            run.logs.extend(fixed_run.logs);
            record_fixed_transform_step(state, before_fixed, snapshot_bundle_transforms(bundle));
            state.tick += 1;
            state.accumulator -= options.fixed_delta;
        }

        let raw_before_variable = snapshot_bundle_transforms(bundle);
        let overlaid_entities = overlay_interpolated_fixed_transforms(
            bundle,
            state,
            interpolation_alpha(state, options.fixed_delta),
        );
        let before_variable = snapshot_bundle_transforms(bundle);
        let variable_time = loop_time_snapshot(
            options.delta,
            state.elapsed,
            options.fixed_delta,
            state.paused,
        );
        let variable_run = run_native_system_schedules_with_state(
            bundle,
            &["update", "postUpdate"],
            variable_time,
            options.input,
            state.frame as u32,
            state.tick,
            Some((
                &mut state.delayed_commands,
                &mut state.delayed_command_observations,
            )),
        )?;
        state
            .script_posed_entities
            .extend(variable_run.transform_patches.iter().cloned());
        run.transform_patches
            .extend(variable_run.transform_patches.iter().cloned());
        run.logs.extend(variable_run.logs);
        let after_variable = snapshot_bundle_transforms(bundle);
        restore_unwritten_fixed_transforms(
            bundle,
            &raw_before_variable,
            &before_variable,
            &after_variable,
            &overlaid_entities,
        );
        remove_variable_transform_writes(state, before_variable, after_variable);
    }
    state.frame += 1;

    Ok(run)
}

fn record_fixed_transform_step(
    state: &mut NativeGameLoopState,
    before: BTreeMap<String, TransformSample>,
    after: BTreeMap<String, TransformSample>,
) {
    state.fixed_transform_previous = before.clone();
    state.fixed_transform_current = after.clone();
    state.fixed_transform_entities = changed_transform_entities(&before, &after);
}

fn remove_variable_transform_writes(
    state: &mut NativeGameLoopState,
    before: BTreeMap<String, TransformSample>,
    after: BTreeMap<String, TransformSample>,
) {
    for id in changed_transform_entities(&before, &after) {
        state.fixed_transform_entities.remove(&id);
    }
}

fn snapshot_bundle_transforms(bundle: &LoadedBundle) -> BTreeMap<String, TransformSample> {
    bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            entity
                .components
                .transform
                .as_ref()
                .map(|transform| (entity.id.clone(), transform_sample(transform)))
        })
        .collect()
}

fn overlay_interpolated_fixed_transforms(
    bundle: &mut LoadedBundle,
    state: &NativeGameLoopState,
    alpha: f32,
) -> BTreeSet<String> {
    let mut overlaid = BTreeSet::new();
    if state.fixed_transform_entities.is_empty() {
        return overlaid;
    }
    for entity in &mut bundle.world.entities {
        if !state.fixed_transform_entities.contains(&entity.id) {
            continue;
        }
        let Some(previous) = state.fixed_transform_previous.get(&entity.id) else {
            continue;
        };
        let Some(current) = state.fixed_transform_current.get(&entity.id) else {
            continue;
        };
        let transform = entity
            .components
            .transform
            .get_or_insert_with(default_transform_component);
        apply_transform_sample(transform, interpolate_transform(*previous, *current, alpha));
        overlaid.insert(entity.id.clone());
    }
    overlaid
}

fn restore_unwritten_fixed_transforms(
    bundle: &mut LoadedBundle,
    raw_before_variable: &BTreeMap<String, TransformSample>,
    before_variable: &BTreeMap<String, TransformSample>,
    after_variable: &BTreeMap<String, TransformSample>,
    overlaid_entities: &BTreeSet<String>,
) {
    if overlaid_entities.is_empty() {
        return;
    }
    let variable_writes = changed_transform_entities(before_variable, after_variable);
    for entity in &mut bundle.world.entities {
        if !overlaid_entities.contains(&entity.id) || variable_writes.contains(&entity.id) {
            continue;
        }
        let Some(sample) = raw_before_variable.get(&entity.id) else {
            continue;
        };
        let transform = entity
            .components
            .transform
            .get_or_insert_with(default_transform_component);
        apply_transform_sample(transform, *sample);
    }
}

fn interpolation_alpha(state: &NativeGameLoopState, fixed_delta: f32) -> f32 {
    if fixed_delta <= 0.0 {
        0.0
    } else {
        (state.accumulator / fixed_delta).clamp(0.0, 1.0)
    }
}

fn default_transform_component() -> TransformComponent {
    TransformComponent {
        position: Some([0.0, 0.0, 0.0]),
        rotation: Some([0.0, 0.0, 0.0, 1.0]),
        scale: Some([1.0, 1.0, 1.0]),
    }
}

fn apply_transform_sample(transform: &mut TransformComponent, sample: TransformSample) {
    transform.position = Some(sample.position);
    transform.rotation = Some(sample.rotation);
    transform.scale = Some(sample.scale);
}

fn transform_sample(transform: &TransformComponent) -> TransformSample {
    TransformSample {
        position: transform.position.unwrap_or([0.0, 0.0, 0.0]),
        rotation: transform.rotation.unwrap_or([0.0, 0.0, 0.0, 1.0]),
        scale: transform.scale.unwrap_or([1.0, 1.0, 1.0]),
    }
}

fn changed_transform_entities(
    before: &BTreeMap<String, TransformSample>,
    after: &BTreeMap<String, TransformSample>,
) -> BTreeSet<String> {
    before
        .keys()
        .chain(after.keys())
        .filter(|id| before.get(*id) != after.get(*id))
        .cloned()
        .collect()
}

fn run_native_system_schedules(
    bundle: &mut LoadedBundle,
    schedules: &[&str],
    time: NativeSystemTimeSnapshot,
    input: Option<&NativeInputState>,
) -> Result<NativeSystemsHostRun, SystemsHostError> {
    run_native_system_schedules_with_state(bundle, schedules, time, input, 1, 1, None)
}

fn run_native_system_schedules_with_state(
    bundle: &mut LoadedBundle,
    schedules: &[&str],
    time: NativeSystemTimeSnapshot,
    input: Option<&NativeInputState>,
    frame: u32,
    tick: u64,
    mut delayed_state: Option<(
        &mut Vec<NativeDelayedCommand>,
        &mut Vec<NativeDelayedCommandObservation>,
    )>,
) -> Result<NativeSystemsHostRun, SystemsHostError> {
    ensure_native_system_host_supported(bundle)?;
    if bundle.manifest.entry.scripts.is_none() {
        return Ok(NativeSystemsHostRun::default());
    }

    let systems = bundle
        .systems
        .as_ref()
        .map(|systems| systems.systems.as_slice())
        .unwrap_or(&[])
        .to_vec();
    if systems.is_empty() {
        return Ok(NativeSystemsHostRun::default());
    }

    let script_path = bundle
        .manifest
        .entry
        .scripts
        .as_ref()
        .map(|entry| bundle.bundle_path.join(entry))
        .ok_or_else(|| {
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_MISSING",
                "Bundle does not reference scripts.bundle.js.",
            )
        })?;
    let mut logs = Vec::new();
    let mut resource_observations = Vec::new();
    let mut transform_patches = BTreeSet::new();
    let mut diff_cache = ComponentDiffCache::default();

    with_script_host(&script_path, |context| {
        for schedule in schedules {
            let scheduled_systems = ordered_systems_for_schedule(&systems, schedule);
            let tracked_components = scheduled_systems
                .iter()
                .flat_map(|system| system.queries.iter())
                .flat_map(|query| query.changed.iter())
                .cloned()
                .collect::<Vec<_>>();
            diff_cache.begin_schedule_stage(bundle, &tracked_components);
            for system in scheduled_systems {
                let mut system_observations = declared_resource_load_observations(bundle, system);
                let effects = call_system_export(
                    context,
                    bundle,
                    system,
                    time.clone(),
                    BTreeMap::new(),
                    input,
                    Some(&diff_cache),
                )?;
                system_observations.extend(native_resource_observations(system, &effects));
                if let Some((pending, observations)) = delayed_state.as_mut() {
                    enqueue_native_delayed_commands(pending, observations, system, &effects, tick);
                }
                let applied = apply_system_effects_with_report(bundle, system, &effects, frame, tick as u32)
                    .map_err(|diagnostics| {
                        let first = diagnostics
                            .into_iter()
                            .next()
                            .expect("invalid effects should include diagnostics");
                        host_error(first.code, first.message)
                    })?;
                logs.push(applied.log);
                resource_observations.extend(system_observations);
                transform_patches.extend(applied.transform_patches);
            }
            if *schedule == "fixedUpdate"
                && let Some((pending, observations)) = delayed_state.as_mut()
            {
                let ready = advance_native_delayed_commands(bundle, pending, observations, tick);
                for command in ready {
                    let Some(system) = systems
                        .iter()
                        .find(|candidate| candidate.name == command.system_name)
                    else {
                        continue;
                    };
                    let effects = NativeSystemEffects {
                        commands: vec![native_command_effect(&command.command)],
                        events: Vec::new(),
                        observations: Vec::new(),
                        patches: Vec::new(),
                        resources: Vec::new(),
                        schedules: Vec::new(),
                        services: Vec::new(),
                    };
                    let applied = apply_system_effects_with_report(
                        bundle,
                        system,
                        &effects,
                        frame,
                        tick as u32,
                    )
                    .map_err(|diagnostics| {
                        let first = diagnostics
                            .into_iter()
                            .next()
                            .expect("invalid delayed effects should include diagnostics");
                        host_error(first.code, first.message)
                    })?;
                    logs.push(applied.log);
                    transform_patches.extend(applied.transform_patches);
                }
            }
        }
        Ok(())
    })?;

    if schedules.iter().any(|schedule| *schedule == "postUpdate") {
        bundle.world.events.clear();
    }

    Ok(NativeSystemsHostRun {
        logs,
        resource_observations,
        transform_patches,
    })
}

fn enqueue_native_delayed_commands(
    pending: &mut Vec<NativeDelayedCommand>,
    observations: &mut Vec<NativeDelayedCommandObservation>,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    tick: u64,
) {
    for schedule in &effects.schedules {
        let Some(declaration) = system
            .delayed_commands
            .iter()
            .find(|declaration| declaration.id == schedule.id)
        else {
            continue;
        };
        if schedule.delay_ticks == 0 || schedule.delay_ticks > declaration.max_delay_ticks {
            continue;
        }
        pending.push(native_delayed_command(system, declaration, schedule.delay_ticks, tick));
        observations.push(NativeDelayedCommandObservation {
            delay_ticks: schedule.delay_ticks,
            id: schedule.id.clone(),
            remaining_ticks: schedule.delay_ticks,
            status: "enqueued".to_owned(),
            system: system.name.clone(),
            tick,
        });
    }
}

fn native_delayed_command(
    system: &SystemIr,
    declaration: &SystemDelayedCommandIr,
    delay_ticks: u32,
    tick: u64,
) -> NativeDelayedCommand {
    NativeDelayedCommand {
        cancel_policy: declaration.cancel_policy.clone(),
        command: declaration.command.clone(),
        delay_ticks,
        enqueued_tick: tick,
        id: declaration.id.clone(),
        ownership_id: declaration.ownership.id.clone(),
        ownership_kind: declaration.ownership.kind.clone(),
        remaining_ticks: delay_ticks,
        schedule: system.schedule.clone(),
        system_name: system.name.clone(),
    }
}

fn advance_native_delayed_commands(
    bundle: &LoadedBundle,
    pending: &mut Vec<NativeDelayedCommand>,
    observations: &mut Vec<NativeDelayedCommandObservation>,
    tick: u64,
) -> Vec<NativeDelayedCommand> {
    let mut ready = Vec::new();
    let mut still_pending = Vec::new();
    for command in pending.drain(..) {
        if command.enqueued_tick >= tick {
            still_pending.push(command);
            continue;
        }
        let mut next = command.clone();
        next.remaining_ticks = next.remaining_ticks.saturating_sub(1);
        if next.remaining_ticks > 0 {
            observations.push(NativeDelayedCommandObservation {
                delay_ticks: next.delay_ticks,
                id: next.id.clone(),
                remaining_ticks: next.remaining_ticks,
                status: "pending".to_owned(),
                system: next.system_name.clone(),
                tick,
            });
            still_pending.push(next);
            continue;
        }
        if next.cancel_policy == "drop" && !native_delayed_owner_active(bundle, &next) {
            observations.push(NativeDelayedCommandObservation {
                delay_ticks: next.delay_ticks,
                id: next.id.clone(),
                remaining_ticks: 0,
                status: "dropped".to_owned(),
                system: next.system_name.clone(),
                tick,
            });
            continue;
        }
        observations.push(NativeDelayedCommandObservation {
            delay_ticks: next.delay_ticks,
            id: next.id.clone(),
            remaining_ticks: 0,
            status: "flushed".to_owned(),
            system: next.system_name.clone(),
            tick,
        });
        ready.push(next);
    }
    *pending = still_pending;
    ready
}

fn native_delayed_owner_active(bundle: &LoadedBundle, command: &NativeDelayedCommand) -> bool {
    if command.ownership_kind == "entity" {
        return bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == command.ownership_id);
    }
    true
}

fn native_command_effect(command: &SystemCommandIr) -> crate::systems_effects::NativeSystemCommandEffect {
    match command {
        SystemCommandIr::AddComponent { component, entity } => crate::systems_effects::NativeSystemCommandEffect {
            command: "addComponent".to_owned(),
            component: Some(component.clone()),
            entity: Some(entity.clone()),
            value: Some(json!({})),
            ..Default::default()
        },
        SystemCommandIr::Despawn { entity } => crate::systems_effects::NativeSystemCommandEffect {
            command: "despawn".to_owned(),
            entity: Some(entity.clone()),
            ..Default::default()
        },
        SystemCommandIr::EmitEvent { event } => crate::systems_effects::NativeSystemCommandEffect {
            command: "emitEvent".to_owned(),
            entity: Some(String::new()),
            event: Some(event.clone()),
            payload: Some(json!({})),
            ..Default::default()
        },
        SystemCommandIr::Instantiate { prefab, prefix } => crate::systems_effects::NativeSystemCommandEffect {
            command: "instantiate".to_owned(),
            entity: Some(String::new()),
            prefab: Some(prefab.clone()),
            prefix: Some(prefix.clone()),
            ..Default::default()
        },
        SystemCommandIr::RemoveComponent { component, entity } => crate::systems_effects::NativeSystemCommandEffect {
            command: "removeComponent".to_owned(),
            component: Some(component.clone()),
            entity: Some(entity.clone()),
            ..Default::default()
        },
        SystemCommandIr::SetParent { child, parent } => crate::systems_effects::NativeSystemCommandEffect {
            child: Some(child.clone()),
            command: "setParent".to_owned(),
            entity: Some(child.clone()),
            parent: Some(parent.clone()),
            ..Default::default()
        },
        SystemCommandIr::ClearParent { child } => crate::systems_effects::NativeSystemCommandEffect {
            child: Some(child.clone()),
            command: "clearParent".to_owned(),
            entity: Some(child.clone()),
            ..Default::default()
        },
        SystemCommandIr::SetComponent { component, entity } => crate::systems_effects::NativeSystemCommandEffect {
            command: "setComponent".to_owned(),
            component: Some(component.clone()),
            entity: Some(entity.clone()),
            value: Some(json!({})),
            ..Default::default()
        },
        SystemCommandIr::Spawn { components, entity } => crate::systems_effects::NativeSystemCommandEffect {
            command: "spawn".to_owned(),
            components: Some(Value::Object(
                components
                    .iter()
                    .map(|component| (component.clone(), json!({})))
                    .collect(),
            )),
            entity: Some(entity.clone()),
            ..Default::default()
        },
    }
}

fn declared_resource_load_observations(
    bundle: &LoadedBundle,
    system: &SystemIr,
) -> Vec<NativeResourceObservation> {
    system
        .resource_reads
        .iter()
        .chain(system.resource_writes.iter())
        .filter(|resource| bundle.world.resources.contains_key(*resource))
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(|resource| NativeResourceObservation {
            frame: 1,
            kind: "load".to_owned(),
            resource,
            schedule: system.schedule.clone(),
            system: system.name.clone(),
            tick: 1,
        })
        .collect()
}

fn native_resource_observations(
    system: &SystemIr,
    effects: &NativeSystemEffects,
) -> Vec<NativeResourceObservation> {
    let mut observations = Vec::new();
    for observation in &effects.observations {
        observations.push(NativeResourceObservation {
            frame: 1,
            kind: observation.kind.clone(),
            resource: observation.resource.clone(),
            schedule: system.schedule.clone(),
            system: system.name.clone(),
            tick: 1,
        });
    }
    for resource in &effects.resources {
        let duplicate = observations.iter().any(|observation| {
            observation.kind == "write" && observation.resource == resource.resource
        });
        if !duplicate {
            observations.push(NativeResourceObservation {
                frame: 1,
                kind: "write".to_owned(),
                resource: resource.resource.clone(),
                schedule: system.schedule.clone(),
                system: system.name.clone(),
                tick: 1,
            });
        }
    }
    observations
}

fn with_script_host<T>(
    script_path: &PathBuf,
    run: impl FnOnce(&Context) -> Result<T, SystemsHostError>,
) -> Result<T, SystemsHostError> {
    SCRIPT_HOST.with(|host| {
        let script_metadata = script_host_metadata(script_path)?;
        let mut host = host.borrow_mut();
        let needs_init = host.as_ref().is_none_or(|host| {
            host.script_path != *script_path
                || host.size != script_metadata.0
                || host.modified != script_metadata.1
        });
        if needs_init {
            *host = Some(create_script_host(script_path, script_metadata)?);
        }
        let context = &host
            .as_ref()
            .expect("script host should be initialized")
            .context;
        run(context)
    })
}

fn script_host_metadata(
    script_path: &PathBuf,
) -> Result<(u64, Option<SystemTime>), SystemsHostError> {
    let metadata = fs::metadata(script_path).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_SCRIPT_READ_FAILED",
            format!("Failed to stat {}: {source}", script_path.display()),
        )
    })?;
    Ok((metadata.len(), metadata.modified().ok()))
}

fn create_script_host(
    script_path: &PathBuf,
    metadata: (u64, Option<SystemTime>),
) -> Result<NativeScriptHost, SystemsHostError> {
    let script_source = fs::read_to_string(script_path).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_SCRIPT_READ_FAILED",
            format!("Failed to read {}: {source}", script_path.display()),
        )
    })?;

    let context = Context::builder().build().map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_HOST_INIT_FAILED",
            format!("Failed to initialize QuickJS host: {source}"),
        )
    })?;

    context
        .eval_module(&module_source(&script_source), true)
        .map_err(|source| {
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_LOAD_FAILED",
                format!("Failed to load scripts.bundle.js in QuickJS: {source}"),
            )
        })?;
    context.eval(&bridge_source(), false).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_BRIDGE_LOAD_FAILED",
            format!("Failed to load native system bridge in QuickJS: {source}"),
        )
    })?;

    Ok(NativeScriptHost {
        context,
        modified: metadata.1,
        script_path: script_path.clone(),
        size: metadata.0,
    })
}

fn loop_time_snapshot(
    delta: f32,
    elapsed: f32,
    fixed_delta: f32,
    paused: bool,
) -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta,
        dt: delta,
        elapsed,
        fixed_delta,
        fixed_dt: fixed_delta,
        paused,
    }
}

fn ordered_systems_for_schedule<'a>(systems: &'a [SystemIr], schedule: &str) -> Vec<&'a SystemIr> {
    let mut scheduled = systems
        .iter()
        .filter(|system| system.schedule == schedule)
        .collect::<Vec<_>>();
    scheduled.sort_by(|left, right| left.name.cmp(&right.name));

    let mut by_name = BTreeMap::new();
    let mut outgoing: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut indegree: BTreeMap<String, usize> = BTreeMap::new();
    for system in &scheduled {
        by_name.insert(system.name.clone(), *system);
        outgoing.insert(system.name.clone(), BTreeSet::new());
        indegree.insert(system.name.clone(), 0);
    }
    for system in &scheduled {
        for target in &system.before {
            if by_name.contains_key(target) {
                add_order_edge(&system.name, target, &mut outgoing, &mut indegree);
            }
        }
        for source in &system.after {
            if by_name.contains_key(source) {
                add_order_edge(source, &system.name, &mut outgoing, &mut indegree);
            }
        }
    }

    let mut ready = indegree
        .iter()
        .filter_map(|(name, count)| (*count == 0).then_some(name.clone()))
        .collect::<Vec<_>>();
    ready.sort();
    let mut ordered = Vec::new();
    while !ready.is_empty() {
        let name = ready.remove(0);
        if let Some(system) = by_name.get(&name) {
            ordered.push(*system);
        }
        for next in outgoing
            .get(&name)
            .map(|targets| targets.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default()
        {
            if let Some(count) = indegree.get_mut(&next) {
                *count = count.saturating_sub(1);
                if *count == 0 {
                    ready.push(next);
                    ready.sort();
                }
            }
        }
    }

    if ordered.len() == scheduled.len() {
        ordered
    } else {
        scheduled
    }
}

fn add_order_edge(
    source: &str,
    target: &str,
    outgoing: &mut BTreeMap<String, BTreeSet<String>>,
    indegree: &mut BTreeMap<String, usize>,
) {
    if let Some(edges) = outgoing.get_mut(source) {
        if edges.insert(target.to_owned()) {
            *indegree.entry(target.to_owned()).or_insert(0) += 1;
        }
    }
}

fn call_system_export(
    context: &Context,
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
    input: Option<&NativeInputState>,
    diff_cache: Option<&ComponentDiffCache>,
) -> Result<NativeSystemEffects, SystemsHostError> {
    let export_name = system
        .script
        .as_ref()
        .map(|script| script.export_name.as_str())
        .ok_or_else(|| {
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_MISSING",
                format!("System '{}' does not declare a script export.", system.name),
            )
        })?;
    let snapshot = build_system_context_snapshot_with_events_input_and_diff(
        bundle, system, time, events, input, diff_cache,
    );
    let payload_json = serde_json::to_string(&json!({
        "exportName": export_name,
        "snapshot": snapshot,
    }))
    .map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_CONTEXT_SERIALIZE_FAILED",
            format!(
                "Failed to serialize system '{}' context: {source}",
                system.name
            ),
        )
    })?;

    let effects_json: String = context
        .eval_as(&format!("__tnInvokeSystemJson({});", json!(payload_json)))
        .map_err(|source| {
            let missing_fragment = format!("System export '{}' was not found", export_name);
            if source.to_string().contains(&missing_fragment) {
                return host_error(
                    "TN_BEVY_SYSTEM_EXPORT_MISSING",
                    format!(
                        "System '{}' references missing script export '{}'.",
                        system.name, export_name
                    ),
                );
            }
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_EXECUTION_FAILED",
                format!(
                    "Failed to execute system '{}' export '{}': {source}",
                    system.name, export_name
                ),
            )
        })?;

    serde_json::from_str(&effects_json).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_EFFECTS_PARSE_FAILED",
            format!(
                "System '{}' export '{}' returned invalid effects: {source}",
                system.name, export_name
            ),
        )
    })
}

fn module_source(script_source: &str) -> String {
    format!(
        "{script_source}\nglobalThis.__tnExports = {{ systems, systemIds: typeof systemIds === 'undefined' ? {{}} : systemIds }};\n"
    )
}

fn bridge_source() -> String {
    format!(
        "{BRIDGE_SOURCE}\nglobalThis.__tnInvokeSystemJson = function(payload) {{ return __tnInvokeSystem(JSON.parse(payload)); }};\n"
    )
}

fn host_error(code: &'static str, message: impl Into<String>) -> SystemsHostError {
    SystemsHostError {
        code,
        message: message.into(),
    }
}
