use std::{env, fs, path::Path};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::spawner::{NativeSpawnerRuntimeState, step_world_spawners};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpawnerTraceReport {
    fixture: String,
    runtime: &'static str,
    trace: Vec<SpawnerTraceEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpawnerTraceEntry {
    entity: String,
    prefab: String,
    root: String,
    spawned: Vec<String>,
    tick: u32,
}

fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: threenative_spawner_trace <bundle-path> <out-json>");
        std::process::exit(2);
    }

    let mut bundle = load_bundle(Path::new(&args[1])).expect("load spawner bundle");
    let mut state = NativeSpawnerRuntimeState::default();
    let mut trace = Vec::new();
    for tick in 0..4 {
        trace.extend(
            step_world_spawners(
                &mut bundle.world,
                bundle.prefabs.as_ref(),
                tick,
                0.5,
                &mut state,
            )
            .into_iter()
            .map(|observation| SpawnerTraceEntry {
                entity: observation.entity,
                prefab: observation.prefab,
                root: observation.root,
                spawned: observation.spawned,
                tick: observation.tick,
            }),
        );
    }

    let report = SpawnerTraceReport {
        fixture: bundle.manifest.name,
        runtime: "bevy",
        trace,
    };
    fs::write(
        &args[2],
        format!(
            "{}\n",
            serde_json::to_string_pretty(&report).expect("serialize spawner trace report")
        ),
    )
    .expect("write spawner trace report");
}
