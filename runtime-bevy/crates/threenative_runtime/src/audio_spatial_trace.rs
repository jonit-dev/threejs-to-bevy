use std::{env, fs, path::PathBuf, process};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::audio::{trace_audio_spatial_attenuation, NativeAudioSpatialTrace};

#[derive(Serialize)]
struct AudioSpatialTraceReport {
    schema: &'static str,
    version: &'static str,
    trace: NativeAudioSpatialTrace,
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
    let audio = bundle
        .audio
        .as_ref()
        .ok_or("bundle does not contain audio.ir.json")?;
    let report = AudioSpatialTraceReport {
        schema: "threenative.audio-spatial-trace",
        version: "0.1.0",
        trace: trace_audio_spatial_attenuation(audio, &["DamageEvent"]),
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
