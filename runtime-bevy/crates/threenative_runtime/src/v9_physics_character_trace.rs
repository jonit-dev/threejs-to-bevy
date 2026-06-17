use std::{env, fs, path::PathBuf, process};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::{
    character::{CharacterTraceAxis, CharacterTraceObservation, trace_character_controllers},
    navigation::{NavigationPathResult, trace_navigation_paths},
    physics::{RigidBodyTraceObservation, trace_rigid_body_primitives},
    physics_sensors::{PhysicsSensorEvent, trace_physics_sensors},
};

#[derive(Serialize)]
struct V9PhysicsCharacterReport {
    schema: &'static str,
    version: &'static str,
    character: Vec<CharacterTraceObservation>,
    navigation: Vec<NavigationPathResult>,
    sensors: Vec<PhysicsSensorEvent>,
    solver: Vec<RigidBodyTraceObservation>,
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
    let output_path = PathBuf::from(args.next().ok_or("missing output path")?);
    let bundle = load_bundle(bundle_path)?;
    let report = V9PhysicsCharacterReport {
        schema: "threenative.v9-physics-character-trace",
        version: "0.1.0",
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
        navigation: trace_navigation_paths(&bundle),
        sensors: trace_physics_sensors(&bundle, 3, 1.0),
        solver: trace_rigid_body_primitives(&bundle, 4, 0.25),
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(output_path, format!("{}\n", serde_json::to_string_pretty(&report)?))?;
    Ok(())
}
