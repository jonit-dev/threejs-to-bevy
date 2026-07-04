use serde::Serialize;
use serde_json::{json, Value};
use threenative_loader::LoadedBundle;

use crate::systems_context::NativeSystemTimeSnapshot;
use crate::systems_host::{run_native_systems_once, NativeSystemsHostRun};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPersistenceSettingsFacadesReport {
    pub facade_report: Value,
    pub schema: &'static str,
    pub version: &'static str,
}

pub fn trace_ui_persistence_settings_facades(
    bundle: &mut LoadedBundle,
) -> UiPersistenceSettingsFacadesReport {
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
    .expect("UI persistence settings facade systems should run");

    UiPersistenceSettingsFacadesReport {
        facade_report: bundle
            .world
            .resources
            .get("FacadeReport")
            .cloned()
            .unwrap_or_else(|| json!({})),
        schema: "threenative.ui-persistence-settings-facades",
        version: "0.1.0",
    }
}
