use std::{env, fs, path::Path};

use threenative_loader::load_bundle;
use threenative_runtime::runtime_query_diffing::trace_runtime_query_diffing;

fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: threenative_runtime_query_diffing_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }

    let mut bundle = load_bundle(Path::new(&args[1])).expect("load runtime query diffing bundle");
    let report = trace_runtime_query_diffing(&mut bundle);
    fs::write(
        &args[2],
        format!(
            "{}\n",
            serde_json::to_string_pretty(&report).expect("serialize runtime query diffing report")
        ),
    )
    .expect("write runtime query diffing report");
}
