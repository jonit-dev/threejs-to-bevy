use serde::Serialize;
use threenative_loader::LoadedBundle;

use crate::systems_context::NativeSystemTimeSnapshot;
use crate::systems_host::{NativeSystemsHostRun, run_native_systems_once};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePrefabsHierarchyReport {
    pub entities: Vec<RuntimePrefabEntityReport>,
    pub schema: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Serialize)]
pub struct RuntimePrefabEntityReport {
    pub id: String,
    pub parent: Option<String>,
}

pub fn trace_runtime_prefabs_hierarchy(bundle: &mut LoadedBundle) -> RuntimePrefabsHierarchyReport {
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
    .expect("runtime prefab hierarchy systems should run");

    let mut entities = bundle
        .world
        .entities
        .iter()
        .map(|entity| RuntimePrefabEntityReport {
            id: entity.id.clone(),
            parent: entity
                .components
                .hierarchy
                .as_ref()
                .and_then(|hierarchy| hierarchy.parent.clone()),
        })
        .collect::<Vec<_>>();
    entities.sort_by(|left, right| left.id.cmp(&right.id));

    RuntimePrefabsHierarchyReport {
        entities,
        schema: "threenative.runtime-prefabs-hierarchy",
        version: "0.1.0",
    }
}
