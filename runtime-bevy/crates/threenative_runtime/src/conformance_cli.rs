use std::{env, fs, path::PathBuf};

use bevy::prelude::*;
use threenative_loader::load_bundle;
use threenative_runtime::{conformance::report_bevy_conformance, map_world::map_bundle_into_world};

fn main() {
    let args = env::args().collect::<Vec<_>>();
    if args.len() < 2 || args.len() > 4 {
        eprintln!("Usage: threenative_conformance <bundle-path> [fixture-name] [output-json]");
        std::process::exit(2);
    }

    let bundle_path = PathBuf::from(&args[1]);
    let fixture = args.get(2).cloned().unwrap_or_else(|| {
        bundle_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("bundle")
            .to_owned()
    });

    let bundle = match load_bundle(&bundle_path) {
        Ok(bundle) => bundle,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    let mut app = App::new();
    if let Err(error) = map_bundle_into_world(app.world_mut(), &bundle) {
        eprintln!("{error}");
        std::process::exit(1);
    }

    let report = report_bevy_conformance(app.world_mut(), &bundle, fixture);
    let json = match serde_json::to_string_pretty(&report) {
        Ok(json) => format!("{json}\n"),
        Err(error) => {
            eprintln!("failed to serialize conformance report: {error}");
            std::process::exit(1);
        }
    };

    if let Some(output_path) = args.get(3) {
        if let Some(parent) = PathBuf::from(output_path).parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                eprintln!(
                    "failed to create output directory '{}': {error}",
                    parent.display()
                );
                std::process::exit(1);
            }
        }
        if let Err(error) = fs::write(output_path, json) {
            eprintln!("failed to write conformance report '{output_path}': {error}");
            std::process::exit(1);
        }
    } else {
        print!("{json}");
    }
}
