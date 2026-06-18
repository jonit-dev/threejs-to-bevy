use std::{env, fs, path::Path};

use threenative_loader::load_bundle;
use threenative_runtime::production_hardening::trace_production_hardening;

fn main() {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("usage: threenative_production_hardening_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }
    let bundle = load_bundle(Path::new(&args[1])).expect("load production hardening bundle");
    let report = trace_production_hardening(&bundle);
    fs::write(&args[2], format!("{}\n", serde_json::to_string_pretty(&report).expect("serialize production hardening report"))).expect("write production hardening report");
}
