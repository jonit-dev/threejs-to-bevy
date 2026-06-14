use std::{env, fs, path::PathBuf, process};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::ui::{UiNavigationTrace, trace_ui_navigation};

#[derive(Serialize)]
struct UiNavigationTraceReport {
    schema: &'static str,
    version: &'static str,
    trace: UiNavigationTrace,
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
    let ui = bundle
        .ui
        .as_ref()
        .ok_or("bundle does not contain ui.ir.json")?;
    let report = UiNavigationTraceReport {
        schema: "threenative.ui-navigation-trace",
        version: "0.1.0",
        trace: trace_ui_navigation(ui, &["next", "activate"]),
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
