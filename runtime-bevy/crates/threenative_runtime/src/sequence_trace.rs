use std::{collections::HashMap, env, path::Path};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::sequences::{NativeSequenceTraceInput, trace_sequences};
use threenative_runtime::trace_report::write_pretty_json_report;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SequenceTraceReport {
    fixture: String,
    runtime: &'static str,
    trace: Vec<threenative_runtime::sequences::NativeSequenceTraceFrame>,
}

fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: threenative_sequence_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }

    let bundle = load_bundle(Path::new(&args[1])).expect("load Sequence bundle");
    let sequences = bundle
        .sequences
        .as_ref()
        .expect("Sequence fixture should include sequences");
    let report = SequenceTraceReport {
        fixture: bundle.manifest.name,
        runtime: "bevy",
        trace: trace_sequences(
            sequences,
            NativeSequenceTraceInput {
                fixed_delta: 0.5,
                play_by_tick: HashMap::from([(0, vec!["intro".to_owned()])]),
                skip_by_tick: HashMap::new(),
                stop_by_tick: HashMap::new(),
                ticks: 4,
            },
        ),
    };

    write_pretty_json_report(&args[2], &report).expect("write Sequence trace report");
}
