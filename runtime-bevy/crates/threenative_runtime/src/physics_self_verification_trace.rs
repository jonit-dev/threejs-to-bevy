use std::{collections::BTreeSet, env, fs, path::PathBuf, process};

use rapier3d::glamx::{Quat as RapierQuat, Vec3 as RapierVec3};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use threenative_loader::{SystemIr, SystemQueryIr, load_bundle};
use threenative_runtime::{
    character::{CharacterTraceAxis, CharacterTraceObservation, trace_character_controllers},
    physics::{
        PhysicsJointObservation, RigidBodyTraceObservation, dispose_native_physics_runtime,
        ensure_native_physics_runtime, inspect_cached_physics_joint,
        inspect_cached_physics_joint_creation_count, inspect_cached_physics_joints,
        inspect_cached_physics_world_generation, native_physics_runtime_id,
        step_bundle_physics_with_script_poses, trace_physics_joints, trace_rigid_body_primitives,
    },
    physics_aerodynamics::{
        AerodynamicInputs, AerodynamicObservation, AerodynamicTraceSample,
        dispose_physics_aerodynamics, observe_physics_aerodynamics, set_physics_aerodynamic_inputs,
        trace_physics_aerodynamics,
    },
    physics_joints::PhysicsJointLoadObservation,
    physics_sensors::{PhysicsSensorEvent, trace_physics_sensors},
    physics_vehicle::{
        VehicleControlInput, VehicleControllerObservation, WheelAssemblyObservation,
        WheelControlInput, WheelDebugTelemetry, WheelVisualObservation,
        inspect_physics_vehicle_debug_telemetry, observe_physics_vehicle_controllers,
        observe_physics_vehicle_visuals, observe_physics_vehicles,
        set_physics_vehicle_control_input, set_physics_vehicle_controller_inputs,
    },
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot},
    systems_host::{
        NativeGameLoopRunOptions, NativeGameLoopState, run_native_systems_frame_with_input,
    },
    systems_services::{
        NativeOverlapRequest, NativeOverlapResult, NativeQueryShape, NativeRaycastRequest,
        NativeRaycastResult, NativeShapeCastRequest, NativeShapeCastResult, overlap_primitive,
        raycast_primitive, shape_cast_primitive,
    },
};

#[derive(Serialize)]
#[serde(untagged)]
enum PhysicsSelfVerificationTrace {
    Aerodynamics(AerodynamicsTraceReport),
    Advanced(AdvancedTraceReport),
    AdvancedJoints(AdvancedJointsTraceReport),
    Character(CharacterTraceReport),
    Joint(JointTraceReport),
    Query(QueryTraceReport),
    Rigid(RigidTraceReport),
    Wheels(WheelTraceReport),
    Drivetrain(DrivetrainTraceReport),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsTraceReport {
    bundle_hash: String,
    fixed_dt: f32,
    fixture: &'static str,
    maneuver: AerodynamicsManeuverTrace,
    maneuver_bounds: AerodynamicsManeuverBounds,
    maneuver_parity: AerodynamicsManeuverParity,
    observations: Vec<AerodynamicsTraceObservation>,
    runtime: &'static str,
    schema: &'static str,
    source_hash: String,
    version: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsTraceObservation {
    input: AerodynamicTraceSample,
    label: String,
    observation: AerodynamicObservation,
    tick: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsScenarioManifest {
    entity: String,
    fixed_dt: f32,
    maneuver: AerodynamicsManeuverManifest,
    samples: Vec<AerodynamicsScenarioSample>,
    schema: String,
    version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsManeuverManifest {
    bounds: AerodynamicsManeuverBounds,
    checkpoints: Vec<usize>,
    parity: AerodynamicsManeuverParity,
    segments: Vec<AerodynamicsManeuverSegment>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsManeuverBounds {
    grounded_altitude: [f32; 2],
    minimum_airborne_altitude_after_ground_contact: f32,
    recovery_tick: [usize; 2],
    stall_tick: [usize; 2],
    wind_tick: [usize; 2],
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsManeuverParity {
    event_tick_max_delta: usize,
    final_position_max_delta: f32,
}

#[derive(Deserialize)]
struct AerodynamicsManeuverSegment {
    inputs: AerodynamicInputs,
    label: String,
    steps: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsManeuverTrace {
    checkpoints: Vec<AerodynamicsManeuverCheckpoint>,
    final_position: [f32; 3],
    final_velocity: [f32; 3],
    ground_contact_tick: Option<usize>,
    landing_tick: Option<usize>,
    maximum_airborne_altitude: f32,
    recovery_tick: Option<usize>,
    stall_tick: Option<usize>,
    takeoff_tick: Option<usize>,
    wind_entry_tick: Option<usize>,
    wind_exit_tick: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AerodynamicsManeuverCheckpoint {
    position: [f32; 3],
    stalled: bool,
    tick: usize,
    velocity: [f32; 3],
    wind_velocity: [f32; 3],
}

#[derive(Deserialize)]
struct AerodynamicsScenarioSample {
    label: String,
    #[serde(flatten)]
    sample: AerodynamicTraceSample,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DrivetrainTraceReport {
    bundle_hash: String,
    fixed_dt: f32,
    fixture: &'static str,
    runtime: &'static str,
    scenarios: Vec<DrivetrainTraceScenario>,
    schema: &'static str,
    source_hash: String,
    version: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DrivetrainTraceScenario {
    checkpoints: Vec<usize>,
    id: String,
    inputs: Vec<DrivetrainTraceInput>,
    observations: Vec<DrivetrainTraceObservation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outcome_bounds: Option<DrivetrainOutcomeBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    setup: Option<Value>,
}

#[derive(Serialize)]
struct DrivetrainTraceInput {
    tick: usize,
    input: VehicleControlInput,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DrivetrainTraceObservation {
    chassis_angular_velocity: [f32; 3],
    chassis_position: [f32; 3],
    chassis_rotation: [f32; 4],
    chassis_velocity: [f32; 3],
    observation: VehicleControllerObservation,
    input: VehicleControlInput,
    label: String,
    tick: usize,
    wheels: Vec<DrivetrainWheelObservation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DrivetrainWheelObservation {
    grounded: bool,
    longitudinal_slip: f32,
    wheel_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedTraceReport {
    body: AdvancedBodyObservation,
    causal_negative: AdvancedBodyObservation,
    command_order: Vec<String>,
    events: Vec<String>,
    fixed_delta: f32,
    query: Value,
    runtime: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedBodyObservation {
    angular_velocity: [f32; 3],
    position: [f32; 3],
    rotation: [f32; 4],
    velocity: [f32; 3],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WheelTraceReport {
    authored_wheel_ids: Vec<String>,
    fixed_delta: f32,
    runtime: &'static str,
    scenarios: WheelTraceScenarios,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WheelTraceScenarios {
    asphalt: WheelScenario,
    braking: WheelScenario,
    braking_causal_negative: WheelScenario,
    drive_causal_negative: WheelScenario,
    ice: WheelScenario,
    static_load: WheelScenario,
    steering: WheelScenario,
    steering_causal_negative: WheelScenario,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WheelScenario {
    chassis_angular_velocity: [f32; 3],
    chassis_position: [f32; 3],
    chassis_rotation: [f32; 4],
    chassis_velocity: [f32; 3],
    #[serde(skip_serializing_if = "Vec::is_empty")]
    debug_telemetry: Vec<WheelDebugTelemetry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    initial_speed: Option<f32>,
    speed: f32,
    steps: usize,
    visuals: Vec<WheelVisualObservation>,
    wheels: Vec<threenative_runtime::physics_vehicle::WheelObservation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RigidTraceReport {
    fixed_delta: f32,
    rigid_bodies: Vec<RigidBodyTraceObservation>,
    runtime: &'static str,
}

#[derive(Serialize)]
struct CharacterTraceReport {
    character: Vec<CharacterTraceObservation>,
    runtime: &'static str,
    sensors: Vec<PhysicsSensorEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryTraceReport {
    fixed_delta: f32,
    overlap: NativeOverlapResult,
    raycast: NativeRaycastResult,
    runtime: &'static str,
    #[serde(rename = "shapeCast")]
    shape_cast: NativeShapeCastResult,
    #[serde(rename = "triggerEvents")]
    trigger_events: Vec<Value>,
}

#[derive(Serialize)]
struct JointTraceReport {
    joints: Vec<PhysicsJointObservation>,
    runtime: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsTraceReport {
    bundle_hash: String,
    fixture: &'static str,
    fixed_dt: f32,
    load_ramp: AdvancedJointsLoadRampTrace,
    patch_reconcile: AdvancedJointsPatchTrace,
    per_kind: Vec<AdvancedJointsIdentityObservation>,
    runtime: &'static str,
    schema: &'static str,
    source_hash: String,
    version: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsLoadRampTrace {
    events: Vec<AdvancedJointsBreakTrace>,
    removed_at_tick: usize,
    samples: Vec<AdvancedJointsLoadSampleTrace>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsLoadSampleTrace {
    applied_force: f32,
    observation: PhysicsJointLoadObservation,
    relative_position_error: f32,
    relative_rotation_error: f32,
    tick: usize,
}

#[derive(Serialize)]
struct AdvancedJointsBreakTrace {
    observation: Value,
    tick: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsPatchTrace {
    body_rebuilds: u64,
    joint_rebuilds: u64,
    steps: Vec<AdvancedJointsPatchStepTrace>,
    unrelated_body_handles_preserved: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsPatchStepTrace {
    action: String,
    observations: Vec<AdvancedJointsIdentityObservation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsIdentityObservation {
    active: bool,
    connected_entity: String,
    entity: String,
    kind: String,
    lifecycle: u64,
}

impl From<&PhysicsJointLoadObservation> for AdvancedJointsIdentityObservation {
    fn from(observation: &PhysicsJointLoadObservation) -> Self {
        Self {
            active: observation.active,
            connected_entity: observation.connected_entity.clone(),
            entity: observation.entity.clone(),
            kind: observation.kind.clone(),
            lifecycle: observation.lifecycle,
        }
    }
}

#[derive(Clone, Copy)]
struct PoseSample {
    position: RapierVec3,
    rotation: RapierQuat,
}

impl PoseSample {
    fn new(position: [f32; 3], rotation: [f32; 4]) -> Self {
        let rotation = RapierQuat::from_array(rotation);
        Self {
            position: RapierVec3::from_array(position),
            rotation: if rotation.length_squared() > f32::EPSILON {
                rotation.normalize()
            } else {
                RapierQuat::IDENTITY
            },
        }
    }
}

#[derive(Clone, Copy)]
struct RelativePose {
    position: RapierVec3,
    rotation: RapierQuat,
}

impl RelativePose {
    fn between(connected: PoseSample, body: PoseSample) -> Self {
        let connected_inverse = connected.rotation.inverse();
        Self {
            position: connected_inverse * (body.position - connected.position),
            rotation: (connected_inverse * body.rotation).normalize(),
        }
    }

    fn error_from(self, baseline: Self) -> (f32, f32) {
        let position_error = (self.position - baseline.position).length();
        let rotation_dot = self.rotation.dot(baseline.rotation).abs().clamp(0.0, 1.0);
        (position_error, 2.0 * rotation_dot.acos())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsScenarioManifest {
    fixed_dt: f32,
    load_ramp: AdvancedJointsLoadRampScenario,
    patch_reconcile: AdvancedJointsPatchScenario,
    per_kind: AdvancedJointsPerKindScenario,
    schema: String,
    version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsLoadRampScenario {
    force_point: [f32; 3],
    joint: String,
    samples: Vec<AdvancedJointsLoadSample>,
}

#[derive(Deserialize)]
struct AdvancedJointsLoadSample {
    force: [f32; 3],
    steps: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsPatchScenario {
    joint: String,
    steps: Vec<AdvancedJointsPatchStep>,
    unrelated_bodies: Vec<String>,
}

#[derive(Deserialize)]
struct AdvancedJointsPatchStep {
    action: String,
    patch: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedJointsPerKindScenario {
    joint_ids: Vec<String>,
    settle_steps: usize,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let bundle_path = args.next().ok_or("missing bundle path")?;
    let scene_id = args.next().ok_or("missing scene id")?;
    let output_path = PathBuf::from(args.next().ok_or("missing output path")?);
    let source_hash = args.next();
    let bundle_hash = args.next();
    let bundle = load_bundle(&bundle_path)?;
    let trace = match scene_id.as_str() {
        "advanced-physics-foundation" => {
            PhysicsSelfVerificationTrace::Advanced(trace_advanced_physics_foundation(bundle)?)
        }
        "advanced-physics-wheels" => {
            PhysicsSelfVerificationTrace::Wheels(trace_advanced_physics_wheels(bundle)?)
        }
        "advanced-physics-drivetrain" => {
            PhysicsSelfVerificationTrace::Drivetrain(trace_advanced_physics_drivetrain(
                bundle,
                source_hash.ok_or("missing drivetrain source hash")?,
                bundle_hash.ok_or("missing drivetrain bundle hash")?,
            )?)
        }
        "advanced-physics-aerodynamics" => {
            PhysicsSelfVerificationTrace::Aerodynamics(trace_advanced_physics_aerodynamics(
                &bundle_path,
                bundle,
                source_hash.ok_or("missing aerodynamics source hash")?,
                bundle_hash.ok_or("missing aerodynamics bundle hash")?,
            )?)
        }
        "advanced-physics-joints" => {
            PhysicsSelfVerificationTrace::AdvancedJoints(trace_advanced_physics_joints(
                &bundle_path,
                source_hash.ok_or("missing joints source hash")?,
                bundle_hash.ok_or("missing joints bundle hash")?,
            )?)
        }
        "physics-character-obstacles" => {
            PhysicsSelfVerificationTrace::Character(CharacterTraceReport {
                character: trace_character_controllers(
                    &bundle,
                    &[
                        CharacterTraceAxis {
                            id: "MoveX",
                            value: 1.0,
                        },
                        CharacterTraceAxis {
                            id: "MoveZ",
                            value: 0.0,
                        },
                    ],
                    1.0,
                ),
                runtime: "bevy",
                sensors: trace_physics_sensors(&bundle, 3, 1.0),
            })
        }
        "physics-query-lab" => {
            let snapshot = build_system_context_snapshot(&bundle, &query_system(), fixed_time());
            PhysicsSelfVerificationTrace::Query(QueryTraceReport {
                fixed_delta: 1.0 / 60.0,
                overlap: overlap_primitive(
                    &snapshot,
                    &NativeOverlapRequest {
                        ignore: vec![],
                        layer: None,
                        layers: vec![],
                        mask: vec!["sensor".to_owned()],
                        position: [0.2, 0.5, 0.0],
                        shape: NativeQueryShape::Box {
                            half_extents: [0.75, 0.75, 0.75],
                        },
                    },
                ),
                raycast: raycast_primitive(
                    &snapshot,
                    &NativeRaycastRequest {
                        direction: [1.0, 0.0, 0.0],
                        ignore: vec![],
                        layer: None,
                        layers: vec![],
                        mask: vec!["world".to_owned()],
                        max_distance: 8.0,
                        origin: [0.0, 0.5, 0.0],
                    },
                ),
                runtime: "bevy",
                shape_cast: shape_cast_primitive(
                    &snapshot,
                    &NativeShapeCastRequest {
                        direction: [1.0, 0.0, 0.0],
                        ignore: vec![],
                        layer: None,
                        layers: vec![],
                        mask: vec!["world".to_owned()],
                        max_distance: 8.0,
                        origin: [0.0, 0.5, 0.0],
                        shape: NativeQueryShape::Box {
                            half_extents: [0.25, 0.25, 0.25],
                        },
                    },
                ),
                trigger_events: vec![],
            })
        }
        "physics-joint-metadata" => PhysicsSelfVerificationTrace::Joint(JointTraceReport {
            joints: trace_physics_joints(&bundle),
            runtime: "bevy",
        }),
        _ => {
            let fixed_delta = if scene_id == "physics-material-lab" {
                0.25
            } else {
                0.1
            };
            PhysicsSelfVerificationTrace::Rigid(RigidTraceReport {
                fixed_delta,
                rigid_bodies: trace_rigid_body_primitives(&bundle, 12, fixed_delta),
                runtime: "bevy",
            })
        }
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        output_path,
        format!("{}\n", serde_json::to_string_pretty(&trace)?),
    )?;
    Ok(())
}

fn trace_advanced_physics_joints(
    bundle_path: &str,
    source_hash: String,
    bundle_hash: String,
) -> Result<AdvancedJointsTraceReport, Box<dyn std::error::Error>> {
    let scenario_path = PathBuf::from(bundle_path).join("joints.scenarios.json");
    let scenarios: AdvancedJointsScenarioManifest =
        serde_json::from_str(&fs::read_to_string(scenario_path)?)?;
    if scenarios.schema != "threenative.advanced-physics-joints-scenarios"
        || scenarios.version != "0.1.0"
    {
        return Err("invalid advanced physics joints scenario manifest".into());
    }

    let mut per_kind_bundle = load_bundle(bundle_path)?;
    let per_kind_runtime = BTreeSet::new();
    for _ in 0..scenarios.per_kind.settle_steps {
        step_bundle_physics_with_script_poses(
            &mut per_kind_bundle,
            scenarios.fixed_dt,
            &per_kind_runtime,
        );
    }
    let per_kind_observations = inspect_cached_physics_joints(&per_kind_runtime);
    let per_kind = scenarios
        .per_kind
        .joint_ids
        .iter()
        .filter_map(|entity| {
            per_kind_observations
                .iter()
                .find(|observation| &observation.entity == entity)
                .map(AdvancedJointsIdentityObservation::from)
        })
        .collect();
    dispose_native_physics_runtime(&per_kind_runtime);

    let load_ramp = trace_advanced_joints_load_ramp(bundle_path, &scenarios)?;
    let patch_reconcile = trace_advanced_joints_patch_reconcile(bundle_path, &scenarios)?;
    Ok(AdvancedJointsTraceReport {
        bundle_hash,
        fixture: "advanced-physics-joints",
        fixed_dt: scenarios.fixed_dt,
        load_ramp,
        patch_reconcile,
        per_kind,
        runtime: "bevy",
        schema: "threenative.advanced-physics-joints-trace",
        source_hash,
        version: "0.1.0",
    })
}

fn trace_advanced_joints_load_ramp(
    bundle_path: &str,
    scenarios: &AdvancedJointsScenarioManifest,
) -> Result<AdvancedJointsLoadRampTrace, Box<dyn std::error::Error>> {
    let mut bundle = load_bundle(bundle_path)?;
    set_zero_gravity(&mut bundle)?;
    let connected_entity = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == scenarios.load_ramp.joint)
        .and_then(|entity| entity.components.physics_joint.as_ref())
        .map(|joint| joint.connected_entity.clone())
        .ok_or("load-ramp fixed joint is missing")?;
    let baseline_relative_pose = RelativePose::between(
        pose_sample(&bundle, &connected_entity)?,
        pose_sample(&bundle, &scenarios.load_ramp.joint)?,
    );
    let runtime = BTreeSet::new();
    let mut tick = 0;
    let mut removed_at_tick = None;
    let mut events = Vec::new();
    let mut samples = Vec::new();
    for sample in &scenarios.load_ramp.samples {
        queue_joint_force(
            &mut bundle,
            &scenarios.load_ramp.joint,
            scenarios.load_ramp.force_point,
            sample.force,
        );
        for _ in 0..sample.steps {
            tick += 1;
            step_bundle_physics_with_script_poses(&mut bundle, scenarios.fixed_dt, &runtime);
            if inspect_cached_physics_joint(&runtime, &scenarios.load_ramp.joint)
                .is_some_and(|observation| !observation.active)
                && removed_at_tick.is_none()
            {
                removed_at_tick = Some(tick);
            }
            for event in bundle
                .world
                .events
                .get("JointBreakEvent")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                events.push(AdvancedJointsBreakTrace {
                    observation: event.clone(),
                    tick,
                });
            }
        }
        let observation = inspect_cached_physics_joint(&runtime, &scenarios.load_ramp.joint)
            .ok_or("load-ramp joint observation is missing")?;
        let current_relative_pose = RelativePose::between(
            pose_sample(&bundle, &connected_entity)?,
            pose_sample(&bundle, &scenarios.load_ramp.joint)?,
        );
        let (relative_position_error, relative_rotation_error) =
            current_relative_pose.error_from(baseline_relative_pose);
        samples.push(AdvancedJointsLoadSampleTrace {
            applied_force: vector_magnitude(sample.force),
            observation,
            relative_position_error,
            relative_rotation_error,
            tick,
        });
    }
    if removed_at_tick.is_none() && !events.is_empty() {
        tick += 1;
        step_bundle_physics_with_script_poses(&mut bundle, scenarios.fixed_dt, &runtime);
        if inspect_cached_physics_joint(&runtime, &scenarios.load_ramp.joint)
            .is_some_and(|observation| !observation.active)
        {
            removed_at_tick = Some(tick);
        }
    }
    dispose_native_physics_runtime(&runtime);
    Ok(AdvancedJointsLoadRampTrace {
        events,
        removed_at_tick: removed_at_tick.unwrap_or(0),
        samples,
    })
}

fn trace_advanced_joints_patch_reconcile(
    bundle_path: &str,
    scenarios: &AdvancedJointsScenarioManifest,
) -> Result<AdvancedJointsPatchTrace, Box<dyn std::error::Error>> {
    let mut bundle = load_bundle(bundle_path)?;
    set_zero_gravity(&mut bundle)?;
    let runtime = BTreeSet::new();
    let target_index = bundle
        .world
        .entities
        .iter()
        .position(|entity| entity.id == scenarios.patch_reconcile.joint)
        .ok_or("patch-reconcile joint entity is missing")?;
    let initial = bundle.world.entities[target_index]
        .components
        .physics_joint
        .clone()
        .ok_or("patch-reconcile joint component is missing")?;
    let mut steps = Vec::new();
    let mut baseline_generation = None;
    let mut baseline_creations = None;
    for authored_step in &scenarios.patch_reconcile.steps {
        let target = &mut bundle.world.entities[target_index];
        match authored_step.action.as_str() {
            "patch" => {
                let mut value = serde_json::to_value(
                    target
                        .components
                        .physics_joint
                        .as_ref()
                        .ok_or("cannot patch an absent joint")?,
                )?;
                let patch = authored_step
                    .patch
                    .as_ref()
                    .and_then(Value::as_object)
                    .ok_or("joint patch payload must be an object")?;
                let value_object = value
                    .as_object_mut()
                    .ok_or("joint must serialize as object")?;
                for (key, patch_value) in patch {
                    value_object.insert(key.clone(), patch_value.clone());
                }
                target.components.physics_joint = Some(serde_json::from_value(value)?);
            }
            "despawn" => target.components.physics_joint = None,
            "spawn" => target.components.physics_joint = Some(initial.clone()),
            "initial" => {}
            action => return Err(format!("unsupported joint patch action '{action}'").into()),
        }
        step_bundle_physics_with_script_poses(&mut bundle, scenarios.fixed_dt, &runtime);
        let generation = inspect_cached_physics_world_generation(&runtime)
            .ok_or("retained physics generation is missing")?;
        let creations = inspect_cached_physics_joint_creation_count(&runtime)
            .ok_or("joint creation count is missing")?;
        baseline_generation.get_or_insert(generation);
        baseline_creations.get_or_insert(creations);
        steps.push(AdvancedJointsPatchStepTrace {
            action: authored_step.action.clone(),
            observations: inspect_cached_physics_joints(&runtime)
                .iter()
                .map(AdvancedJointsIdentityObservation::from)
                .collect(),
        });
    }
    let final_generation = inspect_cached_physics_world_generation(&runtime).unwrap_or(0);
    let final_creations = inspect_cached_physics_joint_creation_count(&runtime).unwrap_or(0);
    let initial_generation = baseline_generation.unwrap_or(final_generation);
    let initial_creations = baseline_creations.unwrap_or(final_creations);
    let unrelated_present = scenarios
        .patch_reconcile
        .unrelated_bodies
        .iter()
        .all(|entity| {
            bundle
                .world
                .entities
                .iter()
                .any(|candidate| &candidate.id == entity)
        });
    dispose_native_physics_runtime(&runtime);
    Ok(AdvancedJointsPatchTrace {
        body_rebuilds: u64::from(final_generation != initial_generation),
        joint_rebuilds: final_creations.saturating_sub(initial_creations),
        steps,
        unrelated_body_handles_preserved: unrelated_present
            && final_generation == initial_generation,
    })
}

fn queue_joint_force(
    bundle: &mut threenative_loader::LoadedBundle,
    entity: &str,
    point: [f32; 3],
    value: [f32; 3],
) {
    bundle.world.resources.insert(
        "__threenativePhysicsAtPointCommands".to_owned(),
        serde_json::json!([{
            "entity": entity,
            "kind": "physics.addForceAtPoint",
            "point": point,
            "value": value
        }]),
    );
}

fn set_zero_gravity(
    bundle: &mut threenative_loader::LoadedBundle,
) -> Result<(), serde_json::Error> {
    bundle.runtime_config = Some(serde_json::from_value(serde_json::json!({
        "schema": "threenative.runtime-config",
        "version": "0.1.0",
        "physics": { "gravity": [0, 0, 0] },
        "time": { "fixedDelta": 0.008333333333333333, "paused": false },
        "window": { "height": 720, "width": 1280 }
    }))?);
    Ok(())
}

fn vector_magnitude(value: [f32; 3]) -> f32 {
    (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt()
}

fn pose_sample(
    bundle: &threenative_loader::LoadedBundle,
    entity_id: &str,
) -> Result<PoseSample, Box<dyn std::error::Error>> {
    let entity = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)
        .ok_or_else(|| format!("joint pose entity '{entity_id}' is missing"))?;
    let transform = entity
        .components
        .transform
        .as_ref()
        .ok_or_else(|| format!("joint pose entity '{entity_id}' has no Transform"))?;
    Ok(PoseSample::new(
        transform.position.unwrap_or([0.0, 0.0, 0.0]),
        transform.rotation.unwrap_or([0.0, 0.0, 0.0, 1.0]),
    ))
}

#[cfg(test)]
mod advanced_joint_trace_tests {
    use super::*;

    #[test]
    fn fixed_pose_error_should_measure_relative_position_and_rotation_drift() {
        let baseline = RelativePose::between(
            PoseSample::new([0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]),
            PoseSample::new([1.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]),
        );
        let half_angle = (0.1_f32).sin();
        let current = RelativePose::between(
            PoseSample::new([0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]),
            PoseSample::new([1.1, 0.0, 0.0], [0.0, half_angle, 0.0, (0.1_f32).cos()]),
        );

        let (position_error, rotation_error) = current.error_from(baseline);

        assert!((position_error - 0.1).abs() < 0.000_01);
        assert!((rotation_error - 0.2).abs() < 0.000_01);
    }

    #[test]
    fn joint_identity_trace_should_omit_idle_solver_loads() {
        let observation = PhysicsJointLoadObservation {
            active: true,
            connected_entity: "anchor.fixed".to_owned(),
            entity: "joint.fixed".to_owned(),
            force: 12.0,
            kind: "fixed".to_owned(),
            lifecycle: 2,
            torque: 3.0,
        };

        let value = serde_json::to_value(AdvancedJointsIdentityObservation::from(&observation))
            .expect("identity observation should serialize");

        assert_eq!(
            value,
            serde_json::json!({
                "active": true,
                "connectedEntity": "anchor.fixed",
                "entity": "joint.fixed",
                "kind": "fixed",
                "lifecycle": 2
            })
        );
    }
}

fn trace_advanced_physics_wheels(
    bundle: threenative_loader::LoadedBundle,
) -> Result<WheelTraceReport, Box<dyn std::error::Error>> {
    const FIXED_DELTA: f32 = 1.0 / 120.0;
    let bundle_path = bundle.bundle_path.clone();
    let authored_wheel_ids = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.wheel_assembly.as_ref())
        .ok_or("advanced wheel fixture chassis assembly is missing")?
        .wheels
        .iter()
        .map(|wheel| wheel.id.clone())
        .collect::<Vec<_>>();
    let static_runtime = BTreeSet::new();
    let asphalt_runtime = BTreeSet::new();
    let ice_runtime = BTreeSet::new();
    let drive_negative_runtime = BTreeSet::new();
    let steering_runtime = BTreeSet::new();
    let steering_negative_runtime = BTreeSet::new();
    let braking_runtime = BTreeSet::new();
    let braking_negative_runtime = BTreeSet::new();

    let mut static_bundle = bundle;
    for _ in 0..1200 {
        step_bundle_physics_with_script_poses(&mut static_bundle, FIXED_DELTA, &static_runtime);
    }
    let static_load = wheel_scenario(&static_bundle, &static_runtime, 1200, None, true)?;

    let command = WheelControlInput {
        brake: 0.0,
        drive: 1.0,
        steering: 0.0,
    };
    let mut asphalt_bundle = load_bundle(&bundle_path)?;
    step_wheel_scenario(
        &mut asphalt_bundle,
        &asphalt_runtime,
        command,
        180,
        FIXED_DELTA,
    )?;
    let asphalt = wheel_scenario(&asphalt_bundle, &asphalt_runtime, 180, None, false)?;

    let mut ice_bundle = load_bundle(&bundle_path)?;
    move_chassis_to_surface(&mut ice_bundle, "ground-ice")?;
    step_wheel_scenario(&mut ice_bundle, &ice_runtime, command, 180, FIXED_DELTA)?;
    let ice = wheel_scenario(&ice_bundle, &ice_runtime, 180, None, false)?;

    let mut negative_bundle = load_bundle(&bundle_path)?;
    set_wheel_flag(&mut negative_bundle, WheelFlag::Driven, false)?;
    step_wheel_scenario(
        &mut negative_bundle,
        &drive_negative_runtime,
        command,
        180,
        FIXED_DELTA,
    )?;
    let drive_causal_negative =
        wheel_scenario(&negative_bundle, &drive_negative_runtime, 180, None, false)?;

    let steering_command = WheelControlInput {
        brake: 0.0,
        drive: 1.0,
        steering: 0.5,
    };
    let mut steering_bundle = load_bundle(&bundle_path)?;
    step_wheel_scenario(
        &mut steering_bundle,
        &steering_runtime,
        steering_command,
        90,
        FIXED_DELTA,
    )?;
    let steering = wheel_scenario(&steering_bundle, &steering_runtime, 90, None, false)?;

    let mut steering_negative_bundle = load_bundle(&bundle_path)?;
    set_wheel_flag(&mut steering_negative_bundle, WheelFlag::Steering, false)?;
    step_wheel_scenario(
        &mut steering_negative_bundle,
        &steering_negative_runtime,
        steering_command,
        90,
        FIXED_DELTA,
    )?;
    let steering_causal_negative = wheel_scenario(
        &steering_negative_bundle,
        &steering_negative_runtime,
        90,
        None,
        false,
    )?;

    let mut braking_bundle = load_bundle(&bundle_path)?;
    step_wheel_scenario(
        &mut braking_bundle,
        &braking_runtime,
        command,
        120,
        FIXED_DELTA,
    )?;
    let initial_speed = chassis_pose(&braking_bundle)?.3[2].abs();
    let braking_command = WheelControlInput {
        brake: 1.0,
        drive: 0.0,
        steering: 0.0,
    };
    step_wheel_scenario(
        &mut braking_bundle,
        &braking_runtime,
        braking_command,
        60,
        FIXED_DELTA,
    )?;
    let braking = wheel_scenario(
        &braking_bundle,
        &braking_runtime,
        180,
        Some(initial_speed),
        false,
    )?;

    let mut braking_negative_bundle = load_bundle(&bundle_path)?;
    set_wheel_flag(&mut braking_negative_bundle, WheelFlag::Braked, false)?;
    step_wheel_scenario(
        &mut braking_negative_bundle,
        &braking_negative_runtime,
        command,
        120,
        FIXED_DELTA,
    )?;
    let initial_negative_speed = chassis_pose(&braking_negative_bundle)?.3[2].abs();
    step_wheel_scenario(
        &mut braking_negative_bundle,
        &braking_negative_runtime,
        braking_command,
        60,
        FIXED_DELTA,
    )?;
    let braking_causal_negative = wheel_scenario(
        &braking_negative_bundle,
        &braking_negative_runtime,
        180,
        Some(initial_negative_speed),
        false,
    )?;

    Ok(WheelTraceReport {
        authored_wheel_ids,
        fixed_delta: FIXED_DELTA,
        runtime: "bevy",
        scenarios: WheelTraceScenarios {
            asphalt,
            braking,
            braking_causal_negative,
            drive_causal_negative,
            ice,
            static_load,
            steering,
            steering_causal_negative,
        },
    })
}

fn trace_advanced_physics_aerodynamics(
    bundle_path: &str,
    bundle: threenative_loader::LoadedBundle,
    source_hash: String,
    bundle_hash: String,
) -> Result<AerodynamicsTraceReport, Box<dyn std::error::Error>> {
    let manifest: AerodynamicsScenarioManifest = serde_json::from_slice(&fs::read(
        PathBuf::from(bundle_path).join("aerodynamics.scenarios.json"),
    )?)?;
    if manifest.schema != "threenative.advanced-physics-aerodynamics-scenarios"
        || manifest.version != "0.1.0"
        || !manifest.fixed_dt.is_finite()
        || manifest.fixed_dt <= 0.0
        || manifest.samples.is_empty()
        || manifest.maneuver.segments.is_empty()
        || manifest
            .maneuver
            .segments
            .iter()
            .any(|segment| segment.steps == 0)
        || manifest.maneuver.bounds.grounded_altitude[0]
            >= manifest.maneuver.bounds.grounded_altitude[1]
        || manifest.maneuver.bounds.stall_tick[0] > manifest.maneuver.bounds.stall_tick[1]
        || manifest.maneuver.bounds.recovery_tick[0] > manifest.maneuver.bounds.recovery_tick[1]
        || manifest.maneuver.bounds.wind_tick[0] > manifest.maneuver.bounds.wind_tick[1]
    {
        return Err("invalid advanced physics aerodynamics scenario manifest".into());
    }
    let samples = manifest
        .samples
        .iter()
        .map(|entry| entry.sample.clone())
        .collect::<Vec<_>>();
    let observations =
        trace_physics_aerodynamics(&bundle, &manifest.entity, manifest.fixed_dt, &samples)
            .ok_or("aerodynamics scenario entity is missing")?;
    let maneuver = trace_aerodynamics_maneuver(
        bundle,
        &manifest.entity,
        manifest.fixed_dt,
        &manifest.maneuver,
    )?;
    Ok(AerodynamicsTraceReport {
        bundle_hash,
        fixed_dt: manifest.fixed_dt,
        fixture: "advanced-physics-aerodynamics",
        maneuver,
        maneuver_bounds: manifest.maneuver.bounds,
        maneuver_parity: manifest.maneuver.parity,
        observations: manifest
            .samples
            .into_iter()
            .zip(observations)
            .enumerate()
            .map(
                |(tick, (entry, observation))| AerodynamicsTraceObservation {
                    input: entry.sample,
                    label: entry.label,
                    observation,
                    tick,
                },
            )
            .collect(),
        runtime: "bevy",
        schema: "threenative.advanced-physics-aerodynamics-trace",
        source_hash,
        version: "0.1.0",
    })
}

fn trace_aerodynamics_maneuver(
    mut bundle: threenative_loader::LoadedBundle,
    entity_id: &str,
    fixed_dt: f32,
    maneuver: &AerodynamicsManeuverManifest,
) -> Result<AerodynamicsManeuverTrace, Box<dyn std::error::Error>> {
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    let mut checkpoints = Vec::new();
    let mut trace = AerodynamicsManeuverTrace {
        checkpoints: Vec::new(),
        final_position: [0.0; 3],
        final_velocity: [0.0; 3],
        ground_contact_tick: None,
        landing_tick: None,
        maximum_airborne_altitude: f32::NEG_INFINITY,
        recovery_tick: None,
        stall_tick: None,
        takeoff_tick: None,
        wind_entry_tick: None,
        wind_exit_tick: None,
    };
    let mut tick = 0usize;
    let mut previously_stalled = false;
    let mut inside_wind = false;
    for segment in &maneuver.segments {
        for _ in 0..segment.steps {
            if !set_physics_aerodynamic_inputs(
                runtime_id,
                &bundle,
                entity_id,
                segment.inputs.clone(),
            ) {
                return Err(format!(
                    "integrated aerodynamic inputs rejected in '{}'",
                    segment.label
                )
                .into());
            }
            step_bundle_physics_with_script_poses(&mut bundle, fixed_dt, &runtime);
            let observation = observe_physics_aerodynamics(runtime_id)
                .into_iter()
                .find(|item| item.entity == entity_id)
                .ok_or("integrated aerodynamic observation is missing")?;
            let (position, velocity) = aerodynamic_body_state(&bundle, entity_id)?;
            let stalled = observation.surfaces.iter().any(|surface| surface.stalled);
            let wind = observation
                .wind_velocity
                .iter()
                .map(|value| value * value)
                .sum::<f32>()
                > 0.0;
            let ground_contact = position[1] >= maneuver.bounds.grounded_altitude[0]
                && position[1] <= maneuver.bounds.grounded_altitude[1];
            let settled = ground_contact && velocity[1].abs() <= 0.2;
            if trace.ground_contact_tick.is_none() && ground_contact {
                trace.ground_contact_tick = Some(tick);
            }
            if trace.ground_contact_tick.is_some() {
                trace.maximum_airborne_altitude = trace.maximum_airborne_altitude.max(position[1]);
            }
            if trace.takeoff_tick.is_none()
                && trace.ground_contact_tick.is_some()
                && position[1]
                    >= maneuver
                        .bounds
                        .minimum_airborne_altitude_after_ground_contact
                && velocity[1] > 0.0
            {
                trace.takeoff_tick = Some(tick);
            }
            if !previously_stalled && stalled && trace.stall_tick.is_none() {
                trace.stall_tick = Some(tick);
            }
            if previously_stalled && !stalled && trace.recovery_tick.is_none() {
                trace.recovery_tick = Some(tick);
            }
            if !inside_wind && wind && trace.wind_entry_tick.is_none() {
                trace.wind_entry_tick = Some(tick);
            }
            if inside_wind && !wind && trace.wind_exit_tick.is_none() {
                trace.wind_exit_tick = Some(tick);
            }
            if tick >= 200 && settled && trace.landing_tick.is_none() {
                trace.landing_tick = Some(tick);
            }
            if maneuver.checkpoints.contains(&tick) {
                checkpoints.push(AerodynamicsManeuverCheckpoint {
                    position,
                    stalled,
                    tick,
                    velocity,
                    wind_velocity: observation.wind_velocity,
                });
            }
            previously_stalled = stalled;
            inside_wind = wind;
            trace.final_position = position;
            trace.final_velocity = velocity;
            tick += 1;
        }
    }
    trace.checkpoints = checkpoints;
    dispose_physics_aerodynamics(runtime_id);
    dispose_native_physics_runtime(&runtime);
    Ok(trace)
}

fn aerodynamic_body_state(
    bundle: &threenative_loader::LoadedBundle,
    entity_id: &str,
) -> Result<([f32; 3], [f32; 3]), Box<dyn std::error::Error>> {
    let entity = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)
        .ok_or("integrated aerodynamic entity is missing")?;
    let position = entity
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .ok_or("integrated aerodynamic position is missing")?;
    let velocity = entity
        .components
        .rigid_body
        .as_ref()
        .and_then(|body| body.velocity)
        .ok_or("integrated aerodynamic velocity is missing")?;
    Ok((position, velocity))
}

fn trace_advanced_physics_drivetrain(
    bundle: threenative_loader::LoadedBundle,
    source_hash: String,
    bundle_hash: String,
) -> Result<DrivetrainTraceReport, Box<dyn std::error::Error>> {
    let bundle_path = bundle.bundle_path.clone();
    drop(bundle);
    let manifest_path = bundle_path.join("drivetrain.scenarios.json");
    let manifest: DrivetrainScenarioManifest = serde_json::from_slice(&fs::read(&manifest_path)?)?;
    if manifest.schema != "threenative.advanced-physics-drivetrain-scenarios"
        || manifest.version != "0.1.0"
        || manifest.entity.is_empty()
        || manifest.fixed_dt <= 0.0
    {
        return Err("invalid advanced physics drivetrain scenario manifest".into());
    }
    let scenarios = manifest
        .scenarios
        .iter()
        .map(|scenario| {
            trace_drivetrain_scenario(&bundle_path, &manifest.entity, manifest.fixed_dt, scenario)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DrivetrainTraceReport {
        bundle_hash,
        fixed_dt: manifest.fixed_dt,
        fixture: "advanced-physics-drivetrain",
        runtime: "bevy",
        scenarios,
        schema: "threenative.advanced-physics-drivetrain-trace",
        source_hash,
        version: "0.1.0",
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainScenarioManifest {
    entity: String,
    fixed_dt: f32,
    scenarios: Vec<DrivetrainScenarioDefinition>,
    schema: String,
    version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainScenarioDefinition {
    checkpoints: Vec<usize>,
    #[serde(default)]
    controller_override: Option<DrivetrainControllerOverride>,
    id: String,
    #[serde(default)]
    initial_pose: Option<DrivetrainInitialPose>,
    #[serde(default)]
    outcome_bounds: Option<DrivetrainOutcomeBounds>,
    segments: Vec<DrivetrainScenarioSegment>,
    #[serde(rename = "travelCorridor")]
    _travel_corridor: DrivetrainTravelCorridor,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainInitialPose {
    position: [f32; 3],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainTravelCorridor {
    #[allow(dead_code)]
    endpoint: [f32; 2],
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainOutcomeBounds {
    straight_stability: DrivetrainStraightStabilityBounds,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainStraightStabilityBounds {
    start_tick: usize,
    through_tick: usize,
    max_lateral_displacement: f32,
    max_abs_yaw: f32,
    max_abs_yaw_rate: f32,
    minimum_grounded_wheel_coverage: f32,
    max_consecutive_zero_contact_ticks: usize,
    require_terminal_all_wheels_grounded: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainScenarioSegment {
    input: VehicleControlInput,
    label: String,
    steps: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainControllerOverride {
    #[serde(default)]
    assists: Option<DrivetrainAssistsOverride>,
    #[serde(default)]
    differential: Option<DrivetrainDifferentialOverride>,
    #[serde(default)]
    engine: Option<DrivetrainEngineOverride>,
    #[serde(default)]
    transmission: Option<DrivetrainTransmissionOverride>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainEngineOverride {
    engine_braking: f32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DrivetrainAssistsOverride {
    #[serde(default)]
    abs: Option<DrivetrainAssistOverride>,
    #[serde(default)]
    tcs: Option<DrivetrainAssistOverride>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DrivetrainAssistOverride {
    enabled: bool,
    #[serde(default)]
    #[serde(rename = "slipThreshold")]
    slip_threshold: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainDifferentialOverride {
    kind: String,
    #[serde(default)]
    limited_slip_ratio: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DrivetrainTransmissionOverride {
    #[serde(default)]
    downshift_rpm: Option<f32>,
    shift_policy: String,
    #[serde(default)]
    upshift_rpm: Option<f32>,
}

fn trace_drivetrain_scenario(
    bundle_path: &std::path::Path,
    entity_id: &str,
    fixed_dt: f32,
    definition: &DrivetrainScenarioDefinition,
) -> Result<DrivetrainTraceScenario, Box<dyn std::error::Error>> {
    let mut bundle = load_bundle(bundle_path)?;
    apply_drivetrain_scenario_definition(&mut bundle, entity_id, definition)?;
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    ensure_native_physics_runtime(&bundle, &runtime);
    let mut tick = 0;
    let inputs = definition
        .segments
        .iter()
        .map(|segment| {
            let input = DrivetrainTraceInput {
                tick,
                input: segment.input,
            };
            tick += segment.steps;
            input
        })
        .collect::<Vec<_>>();
    let steps = tick;
    let mut observations = Vec::new();
    let mut segment_start = 0;
    for segment in &definition.segments {
        if segment.steps == 0 {
            return Err(
                format!("drivetrain scenario {} has an empty segment", definition.id).into(),
            );
        }
        if !set_physics_vehicle_controller_inputs(runtime_id, entity_id, segment.input) {
            return Err(format!(
                "drivetrain input rejected for scenario {} at tick {segment_start}",
                definition.id
            )
            .into());
        }
        for segment_tick in 0..segment.steps {
            let tick = segment_start + segment_tick;
            step_bundle_physics_with_script_poses(&mut bundle, fixed_dt, &runtime);
            let observation = observe_physics_vehicle_controllers(runtime_id)
                .into_iter()
                .find(|observation| observation.entity == entity_id)
                .ok_or("drivetrain controller observation is missing")?;
            let wheel_observation = observe_physics_vehicles(runtime_id)
                .into_iter()
                .find(|observation| observation.entity == entity_id)
                .ok_or("drivetrain wheel observation is missing")?;
            let (chassis_position, chassis_rotation, chassis_angular_velocity, chassis_velocity) =
                entity_pose(&bundle, entity_id)?;
            observations.push(DrivetrainTraceObservation {
                chassis_angular_velocity,
                chassis_position,
                chassis_rotation,
                chassis_velocity,
                observation,
                input: segment.input,
                label: segment.label.clone(),
                tick,
                wheels: wheel_observation
                    .wheels
                    .into_iter()
                    .map(|wheel| DrivetrainWheelObservation {
                        grounded: wheel.grounded,
                        longitudinal_slip: wheel.longitudinal_slip,
                        wheel_id: wheel.wheel_id,
                    })
                    .collect(),
            });
        }
        segment_start += segment.steps;
    }
    if observations.len() != steps {
        return Err(format!("drivetrain scenario {} sample count drifted", definition.id).into());
    }
    if definition
        .checkpoints
        .iter()
        .any(|checkpoint| *checkpoint >= steps)
    {
        return Err(format!(
            "drivetrain scenario {} has an out-of-range checkpoint",
            definition.id
        )
        .into());
    }
    let setup = definition
        .controller_override
        .as_ref()
        .and_then(|controller| controller.differential.as_ref())
        .and_then(|differential| {
            definition.initial_pose.as_ref().map(|pose| {
                let mut setup = serde_json::json!({
                    "chassisPosition": pose.position,
                    "differential": differential.kind,
                    "surfaceRegion": "split-grip"
                });
                if let Some(ratio) = differential.limited_slip_ratio {
                    setup["limitedSlipRatio"] = serde_json::json!(ratio);
                }
                setup
            })
        });
    dispose_native_physics_runtime(&runtime);
    Ok(DrivetrainTraceScenario {
        checkpoints: definition.checkpoints.clone(),
        id: definition.id.clone(),
        inputs,
        observations,
        outcome_bounds: definition.outcome_bounds.clone(),
        setup,
    })
}

fn apply_drivetrain_scenario_definition(
    bundle: &mut threenative_loader::LoadedBundle,
    entity_id: &str,
    definition: &DrivetrainScenarioDefinition,
) -> Result<(), Box<dyn std::error::Error>> {
    let entity = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == entity_id)
        .ok_or("drivetrain scenario entity is missing")?;
    if let Some(pose) = &definition.initial_pose {
        entity
            .components
            .transform
            .as_mut()
            .ok_or("drivetrain chassis transform is missing")?
            .position = Some(pose.position);
    }
    if let Some(overrides) = &definition.controller_override {
        let controller = entity
            .components
            .vehicle_controller
            .as_mut()
            .ok_or("drivetrain controller is missing")?;
        if let Some(assists) = &overrides.assists {
            let controller_assists = controller
                .assists
                .as_mut()
                .ok_or("drivetrain controller assists are missing")?;
            if let Some(abs) = &assists.abs {
                let controller_abs = controller_assists
                    .abs
                    .as_mut()
                    .ok_or("drivetrain ABS configuration is missing")?;
                controller_abs.enabled = abs.enabled;
                if let Some(threshold) = abs.slip_threshold {
                    controller_abs.slip_threshold = threshold;
                }
            }
            if let Some(tcs) = &assists.tcs {
                controller_assists
                    .tcs
                    .as_mut()
                    .ok_or("drivetrain TCS configuration is missing")?
                    .enabled = tcs.enabled;
            }
        }
        if let Some(differential) = &overrides.differential {
            controller.differential.kind.clone_from(&differential.kind);
            if let Some(ratio) = differential.limited_slip_ratio {
                controller.differential.limited_slip_ratio = Some(ratio);
            }
        }
        if let Some(engine) = &overrides.engine {
            controller.engine.engine_braking = engine.engine_braking;
        }
        if let Some(transmission) = &overrides.transmission {
            controller
                .transmission
                .shift_policy
                .clone_from(&transmission.shift_policy);
            if let Some(rpm) = transmission.downshift_rpm {
                controller.transmission.downshift_rpm = Some(rpm);
            }
            if let Some(rpm) = transmission.upshift_rpm {
                controller.transmission.upshift_rpm = Some(rpm);
            }
        }
    }
    Ok(())
}

fn step_wheel_scenario(
    bundle: &mut threenative_loader::LoadedBundle,
    runtime: &BTreeSet<String>,
    command: WheelControlInput,
    steps: usize,
    fixed_delta: f32,
) -> Result<(), Box<dyn std::error::Error>> {
    let runtime_id = native_physics_runtime_id(runtime);
    if !set_physics_vehicle_control_input(runtime_id, "chassis", command) {
        return Err("advanced wheel control input was rejected".into());
    }
    for _ in 0..steps {
        step_bundle_physics_with_script_poses(bundle, fixed_delta, runtime);
    }
    Ok(())
}

fn wheel_scenario(
    bundle: &threenative_loader::LoadedBundle,
    runtime: &BTreeSet<String>,
    steps: usize,
    initial_speed: Option<f32>,
    include_debug_telemetry: bool,
) -> Result<WheelScenario, Box<dyn std::error::Error>> {
    let (chassis_position, chassis_rotation, chassis_angular_velocity, chassis_velocity) =
        chassis_pose(bundle)?;
    Ok(WheelScenario {
        chassis_angular_velocity,
        chassis_position,
        chassis_rotation,
        chassis_velocity,
        debug_telemetry: if include_debug_telemetry {
            inspect_physics_vehicle_debug_telemetry(native_physics_runtime_id(runtime))
        } else {
            Vec::new()
        },
        initial_speed,
        speed: chassis_velocity[2].abs(),
        steps,
        visuals: observe_physics_vehicle_visuals(native_physics_runtime_id(runtime), 0.5),
        wheels: wheel_assembly_observation(runtime)?.wheels,
    })
}

fn wheel_assembly_observation(
    runtime: &BTreeSet<String>,
) -> Result<WheelAssemblyObservation, Box<dyn std::error::Error>> {
    observe_physics_vehicles(native_physics_runtime_id(runtime))
        .into_iter()
        .find(|observation| observation.entity == "chassis")
        .ok_or_else(|| "advanced wheel observation is missing".into())
}

fn chassis_pose(
    bundle: &threenative_loader::LoadedBundle,
) -> Result<([f32; 3], [f32; 4], [f32; 3], [f32; 3]), Box<dyn std::error::Error>> {
    entity_pose(bundle, "chassis")
}

fn entity_pose(
    bundle: &threenative_loader::LoadedBundle,
    entity_id: &str,
) -> Result<([f32; 3], [f32; 4], [f32; 3], [f32; 3]), Box<dyn std::error::Error>> {
    let chassis = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)
        .ok_or("physics trace entity is missing")?;
    let transform = chassis
        .components
        .transform
        .as_ref()
        .ok_or("advanced wheel chassis transform is missing")?;
    let rigid_body = chassis
        .components
        .rigid_body
        .as_ref()
        .ok_or("advanced wheel chassis rigid body is missing")?;
    Ok((
        transform
            .position
            .ok_or("advanced wheel chassis position is missing")?,
        transform.rotation.unwrap_or([0.0, 0.0, 0.0, 1.0]),
        rigid_body.angular_velocity.unwrap_or([0.0, 0.0, 0.0]),
        rigid_body.velocity.unwrap_or([0.0, 0.0, 0.0]),
    ))
}

fn move_chassis_to_surface(
    bundle: &mut threenative_loader::LoadedBundle,
    surface_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let surface_position = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == surface_id)
        .and_then(|entity| entity.components.transform.as_ref()?.position)
        .ok_or("advanced wheel fixture target ground is missing")?;
    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.transform.as_mut())
        .ok_or("advanced wheel fixture chassis transform is missing")?
        .position = Some([surface_position[0], 1.02, surface_position[2]]);
    Ok(())
}

#[derive(Clone, Copy)]
enum WheelFlag {
    Braked,
    Driven,
    Steering,
}

fn set_wheel_flag(
    bundle: &mut threenative_loader::LoadedBundle,
    flag: WheelFlag,
    value: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let wheels = &mut bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.wheel_assembly.as_mut())
        .ok_or("advanced wheel fixture chassis assembly is missing")?
        .wheels;
    for wheel in wheels {
        match flag {
            WheelFlag::Braked => wheel.braked = value,
            WheelFlag::Driven => wheel.driven = value,
            WheelFlag::Steering => wheel.steering = value,
        }
    }
    Ok(())
}

fn trace_advanced_physics_foundation(
    mut bundle: threenative_loader::LoadedBundle,
) -> Result<AdvancedTraceReport, Box<dyn std::error::Error>> {
    let fixed_delta = 0.1;
    let bundle_path = bundle.bundle_path.clone();
    let mut causal_negative_bundle = load_bundle(bundle_path)?;
    step_bundle_physics_with_script_poses(
        &mut causal_negative_bundle,
        fixed_delta,
        &BTreeSet::new(),
    );
    let causal_negative = advanced_body_observation(&causal_negative_bundle)?;

    let mut state = NativeGameLoopState::default();
    let run = run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        NativeGameLoopRunOptions {
            delta: fixed_delta,
            fixed_delta,
            input: None,
            paused: false,
        },
        step_bundle_physics_with_script_poses,
    )?;
    let command_order = run
        .logs
        .iter()
        .flat_map(|log| log.entries.iter())
        .filter_map(|entry| entry.service.clone())
        .filter(|service| service.starts_with("physics."))
        .collect::<Vec<_>>();
    let query = bundle
        .world
        .resources
        .get("AdvancedPhysicsReport")
        .and_then(|report| report.get("query"))
        .cloned()
        .ok_or("advanced physics script did not publish its live query observation")?;
    Ok(AdvancedTraceReport {
        body: advanced_body_observation(&bundle)?,
        causal_negative,
        events: command_order.clone(),
        command_order,
        fixed_delta,
        query,
        runtime: "bevy",
    })
}

fn advanced_body_observation(
    bundle: &threenative_loader::LoadedBundle,
) -> Result<AdvancedBodyObservation, Box<dyn std::error::Error>> {
    let entity = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "compound.body")
        .ok_or("advanced physics body is missing")?;
    let transform = entity
        .components
        .transform
        .as_ref()
        .ok_or("advanced physics body transform is missing")?;
    let rigid_body = entity
        .components
        .rigid_body
        .as_ref()
        .ok_or("advanced physics rigid body is missing")?;
    Ok(AdvancedBodyObservation {
        angular_velocity: rigid_body.angular_velocity.unwrap_or([0.0, 0.0, 0.0]),
        position: transform.position.unwrap_or([0.0, 0.0, 0.0]),
        rotation: transform.rotation.unwrap_or([0.0, 0.0, 0.0, 1.0]),
        velocity: rigid_body.velocity.unwrap_or([0.0, 0.0, 0.0]),
    })
}

fn query_system() -> SystemIr {
    SystemIr {
        after: vec![],
        before: vec![],
        commands: vec![],
        delayed_commands: vec![],
        event_reads: vec![],
        event_writes: vec![],
        name: "physicsSelfVerificationQuery".to_owned(),
        queries: vec![SystemQueryIr {
            changed: vec![],
            limit: None,
            offset: None,
            order_by: None,
            with: vec!["Transform".to_owned(), "Collider".to_owned()],
            without: vec![],
        }],
        reads: vec!["Transform".to_owned(), "Collider".to_owned()],
        resource_reads: vec![],
        resource_writes: vec![],
        schedule: "fixedUpdate".to_owned(),
        script: None,
        services: vec![
            "physics.overlap".to_owned(),
            "physics.raycast".to_owned(),
            "physics.shapeCast".to_owned(),
        ],
        writes: vec![],
    }
}

fn fixed_time() -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta: 1.0 / 60.0,
        dt: 1.0 / 60.0,
        elapsed: 0.0,
        fixed_delta: 1.0 / 60.0,
        fixed_dt: 1.0 / 60.0,
        paused: false,
    }
}

#[cfg(test)]
mod tests {
    use super::DrivetrainOutcomeBounds;

    const TRANSIENT_CONTACT_BOUNDS: &str = r#"{"straightStability":{"startTick":10,"throughTick":59,"maxLateralDisplacement":0.5,"maxAbsYaw":0.06,"maxAbsYawRate":0.25,"minimumGroundedWheelCoverage":0.975,"maxConsecutiveZeroContactTicks":1,"requireTerminalAllWheelsGrounded":true}}"#;

    #[test]
    fn drivetrain_outcome_bounds_should_parse_and_echo_transient_contact_contract() {
        let bounds: DrivetrainOutcomeBounds = serde_json::from_str(TRANSIENT_CONTACT_BOUNDS)
            .expect("transient contact bounds should parse");

        assert_eq!(
            serde_json::to_string(&bounds).expect("transient contact bounds should serialize"),
            TRANSIENT_CONTACT_BOUNDS
        );
    }

    #[test]
    fn drivetrain_outcome_bounds_should_reject_retired_all_grounded_boolean() {
        let retired = r#"{"straightStability":{"throughTick":59,"maxLateralDisplacement":0.5,"maxAbsYaw":0.06,"maxAbsYawRate":0.25,"requireAllWheelsGrounded":true}}"#;

        assert!(serde_json::from_str::<DrivetrainOutcomeBounds>(retired).is_err());
    }
}
