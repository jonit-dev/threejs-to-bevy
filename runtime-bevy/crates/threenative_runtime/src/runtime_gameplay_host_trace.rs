use std::{env, fs, path::Path};

use threenative_loader::load_bundle;
use threenative_runtime::runtime_gameplay_host::trace_runtime_gameplay_host;

fn main() {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("usage: threenative_runtime_gameplay_host_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }
    let mut bundle = load_bundle(Path::new(&args[1])).expect("load runtime gameplay host bundle");
    let report = trace_runtime_gameplay_host(&mut bundle);
    fs::write(
        &args[2],
        format!(
            "{}\n",
            serde_json::to_string_pretty(&report).expect("serialize runtime gameplay host report")
        ),
    )
    .expect("write runtime gameplay host report");
}
