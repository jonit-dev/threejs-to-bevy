use std::{env, path::PathBuf, process};

use threenative_loader::load_bundle;
use threenative_runtime::input_ui_polish::trace_input_ui_polish;
use threenative_runtime::trace_report::write_pretty_json_report;

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
    let report = trace_input_ui_polish(&bundle);
    write_pretty_json_report(output_path, &report)
}
