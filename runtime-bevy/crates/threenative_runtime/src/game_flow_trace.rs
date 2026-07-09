use std::{collections::HashMap, env, path::Path};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::game_flow::{NativeGameFlowTraceInput, trace_game_flow};
use threenative_runtime::trace_report::write_pretty_json_report;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameFlowTraceReport {
    fixture: String,
    runtime: &'static str,
    trace: Vec<threenative_runtime::game_flow::NativeGameFlowTraceFrame>,
}

fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: threenative_game_flow_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }

    let bundle = load_bundle(Path::new(&args[1])).expect("load GameFlow bundle");
    let game_flow = bundle.game_flow.as_ref().expect("GameFlow fixture should include game_flow");
    let report = GameFlowTraceReport {
        fixture: bundle.manifest.name,
        runtime: "bevy",
        trace: trace_game_flow(
            game_flow,
            NativeGameFlowTraceInput {
                events_by_tick: HashMap::from([(1, vec!["start".to_owned()])]),
                fixed_delta: 0.5,
                resources: HashMap::from([("coins".to_owned(), serde_json::json!(0))]),
                ticks: 5,
            },
        ),
    };

    write_pretty_json_report(&args[2], &report).expect("write GameFlow trace report");
}
