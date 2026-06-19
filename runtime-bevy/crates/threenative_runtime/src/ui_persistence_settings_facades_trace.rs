use std::{env, fs, path::Path};

use threenative_loader::load_bundle;
use threenative_runtime::ui_persistence_settings_facades::trace_ui_persistence_settings_facades;

fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!(
            "usage: threenative_ui_persistence_settings_facades_trace <bundle-path> <out-json>"
        );
        std::process::exit(2);
    }

    let mut bundle = load_bundle(Path::new(&args[1])).expect("load UI persistence settings bundle");
    let report = trace_ui_persistence_settings_facades(&mut bundle);
    fs::write(
        &args[2],
        format!(
            "{}\n",
            serde_json::to_string_pretty(&report)
                .expect("serialize UI persistence settings facade report")
        ),
    )
    .expect("write UI persistence settings facade report");
}
