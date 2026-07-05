use std::{env, fs, path::PathBuf, process};

use serde::Serialize;
use serde_json::Value;
use threenative_loader::{SystemIr, SystemQueryIr, load_bundle};
use threenative_runtime::{
    character::{CharacterTraceAxis, CharacterTraceObservation, trace_character_controllers},
    physics::{
        PhysicsJointObservation, RigidBodyTraceObservation, trace_physics_joints,
        trace_rigid_body_primitives,
    },
    physics_sensors::{PhysicsSensorEvent, trace_physics_sensors},
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot},
    systems_services::{
        NativeOverlapRequest, NativeOverlapResult, NativeQueryShape, NativeRaycastRequest,
        NativeRaycastResult, NativeShapeCastRequest, NativeShapeCastResult, overlap_primitive,
        raycast_primitive, shape_cast_primitive,
    },
};

#[derive(Serialize)]
#[serde(untagged)]
enum PhysicsSelfVerificationTrace {
    Character(CharacterTraceReport),
    Joint(JointTraceReport),
    Query(QueryTraceReport),
    Rigid(RigidTraceReport),
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
    let bundle = load_bundle(bundle_path)?;
    let trace = match scene_id.as_str() {
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

fn query_system() -> SystemIr {
    SystemIr {
        after: vec![],
        before: vec![],
        commands: vec![],
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
