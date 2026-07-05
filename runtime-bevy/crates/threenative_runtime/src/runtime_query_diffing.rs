use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::LoadedBundle;

use crate::systems_context::NativeSystemTimeSnapshot;
use crate::systems_host::{NativeSystemsHostRun, run_native_systems_once};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeQueryDiffingReport {
    pub changed_query: RuntimeChangedQueryReport,
    pub schema: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeChangedQueryReport {
    pub ids: Vec<String>,
    pub mode: &'static str,
}

pub fn trace_runtime_query_diffing(bundle: &mut LoadedBundle) -> RuntimeQueryDiffingReport {
    let _run: NativeSystemsHostRun = run_native_systems_once(
        bundle,
        NativeSystemTimeSnapshot {
            delta: 0.016,
            dt: 0.016,
            elapsed: 1.0,
            fixed_delta: 0.016,
            fixed_dt: 0.016,
            paused: false,
        },
    )
    .expect("runtime query diffing systems should run");

    let report = bundle
        .world
        .resources
        .get("QueryReport")
        .cloned()
        .unwrap_or_else(|| json!({ "ids": [] }));

    RuntimeQueryDiffingReport {
        changed_query: RuntimeChangedQueryReport {
            ids: report
                .get("ids")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default(),
            mode: "runtime",
        },
        schema: "threenative.runtime-query-diffing",
        version: "0.1.0",
    }
}
