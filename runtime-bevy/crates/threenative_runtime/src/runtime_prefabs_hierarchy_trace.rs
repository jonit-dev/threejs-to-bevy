use std::{env, fs, path::Path};

use threenative_loader::load_bundle;
use threenative_runtime::runtime_prefabs_hierarchy::trace_runtime_prefabs_hierarchy;

fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: threenative_runtime_prefabs_hierarchy_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }

    let mut bundle =
        load_bundle(Path::new(&args[1])).expect("load runtime prefabs hierarchy bundle");
    let report = trace_runtime_prefabs_hierarchy(&mut bundle);
    fs::write(
        &args[2],
        format!(
            "{}\n",
            serde_json::to_string_pretty(&report)
                .expect("serialize runtime prefabs hierarchy report")
        ),
    )
    .expect("write runtime prefabs hierarchy report");
}
