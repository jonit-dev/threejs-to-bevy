use std::{env, fs, path::Path};

use threenative_loader::load_bundle;
use threenative_runtime::rendering_residuals::trace_rendering_residuals;

fn main() {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("usage: threenative_rendering_residuals_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }
    let bundle = load_bundle(Path::new(&args[1])).expect("load rendering residuals bundle");
    let report = trace_rendering_residuals(&bundle);
    fs::write(&args[2], format!("{}\n", serde_json::to_string_pretty(&report).expect("serialize rendering residuals report"))).expect("write rendering residuals report");
}
