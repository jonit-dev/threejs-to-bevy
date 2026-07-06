use std::{env, fs, path::PathBuf, process};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::character::{
    CharacterTraceAxis, CharacterTraceInput, CharacterTraceObservation,
    trace_character_controllers, trace_character_controllers_with_input,
};

#[derive(Serialize)]
struct CharacterTraceReport {
    schema: &'static str,
    version: &'static str,
    observations: Vec<CharacterTraceObservation>,
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
    let axes = [
        CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        },
        CharacterTraceAxis {
            id: "MoveZ",
            value: 0.0,
        },
    ];
    let mut observations = trace_character_controllers(&bundle, &axes, 1.0);
    observations.extend(trace_character_controllers_with_input(
        &bundle,
        CharacterTraceInput {
            axes: &axes,
            direction: Some([0.0, 1.0]),
            fixed_delta: 0.5,
            speed: Some(6.0),
        },
    ));
    let report = CharacterTraceReport {
        schema: "threenative.character-trace",
        version: "0.1.0",
        observations,
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        output_path,
        format!("{}\n", serde_json::to_string_pretty(&report)?),
    )?;
    Ok(())
}
