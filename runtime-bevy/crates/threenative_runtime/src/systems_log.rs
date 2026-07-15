use std::{env, fs, path::PathBuf, process::ExitCode};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::{
    systems_context::NativeSystemTimeSnapshot, systems_effects::NativeSystemEffectLogEntry,
    systems_host::run_native_systems_once,
};

#[derive(Serialize)]
struct MergedEffectLog {
    entries: Vec<NativeSystemEffectLogEntry>,
    schema: &'static str,
    version: u8,
}

fn main() -> ExitCode {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("Usage: threenative_systems_log <bundle-path> <output-json>");
        return ExitCode::from(2);
    }

    let bundle_path = &args[1];
    let output_path = PathBuf::from(&args[2]);
    let mut bundle = match load_bundle(bundle_path) {
        Ok(bundle) => bundle,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };

    let run = match run_native_systems_once(&mut bundle, fixed_time()) {
        Ok(run) => run,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    let mut entries = run
        .logs
        .into_iter()
        .flat_map(|log| log.entries)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| {
        serde_json::to_string(entry).unwrap_or_else(|_| {
            format!(
                "{}:{}:{}:{}",
                entry.frame, entry.tick, entry.schedule, entry.system
            )
        })
    });
    let log = MergedEffectLog {
        entries,
        schema: "threenative.web-system-effects",
        version: 1,
    };
    let json = match serde_json::to_string_pretty(&log) {
        Ok(json) => format!("{json}\n"),
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    if let Some(parent) = output_path.parent()
        && let Err(error) = fs::create_dir_all(parent)
    {
        eprintln!("{error}");
        return ExitCode::from(1);
    }
    match fs::write(&output_path, json) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}

fn fixed_time() -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta: 1.0 / 60.0,
        dt: 1.0 / 60.0,
        elapsed: 1.0,
        fixed_delta: 1.0 / 60.0,
        fixed_dt: 1.0 / 60.0,
        paused: false,
    }
}
