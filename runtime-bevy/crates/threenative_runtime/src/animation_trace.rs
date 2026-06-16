use std::{collections::BTreeMap, env, fs, path::PathBuf, process};

use serde::Serialize;
use serde_json::Value;
use threenative_loader::load_bundle;
use threenative_runtime::animation::{
    AnimationTraceInput, AnimationTraceObservation, TransformAnimationSample,
    sample_transform_animations, trace_animation_graphs,
};

#[derive(Serialize)]
struct AnimationTraceReport {
    schema: &'static str,
    version: &'static str,
    observations: Vec<AnimationTraceObservation>,
    #[serde(skip_serializing_if = "Vec::is_empty", rename = "transformSamples")]
    transform_samples: Vec<TransformAnimationSample>,
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
    let mut parameters = BTreeMap::new();
    parameters.insert("moving".to_owned(), Value::from(true));
    let report = AnimationTraceReport {
        schema: "threenative.animation-trace",
        version: "0.1.0",
        observations: trace_animation_graphs(
            &bundle,
            &AnimationTraceInput {
                fixed_delta: 0.5,
                parameters,
            },
        ),
        transform_samples: sample_transform_animations(&bundle, 0.5),
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
