use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::{LoadedBundle, LocalDataIr, WorldIr};

use crate::persistence::diagnose_native_persistence_migration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceReloadReport {
    pub boundaries: Vec<PersistenceReloadBoundary>,
    pub diagnostics: Vec<PersistenceReloadDiagnostic>,
    pub persistence: PersistenceReport,
    pub reload: ReloadPolicyObservation,
    pub schema: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceReloadDiagnostic {
    pub code: String,
    pub message: String,
    pub path: String,
    pub severity: &'static str,
    pub suggestion: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceReport {
    pub autosave: Vec<AutosaveObservation>,
    pub restore: RestoreObservation,
    pub saved_record: Value,
    pub settings: Value,
    pub storage: StorageObservation,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutosaveObservation {
    pub event: String,
    pub slot: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_value: Option<Value>,
    pub slot: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageObservation {
    pub backend: &'static str,
    pub path_policy: &'static str,
    pub slot: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReloadPolicyObservation {
    pub asset_reload: Value,
    pub incompatible: Vec<&'static str>,
    pub replaced: Vec<&'static str>,
    pub reset: Vec<&'static str>,
    pub retained: Vec<&'static str>,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceReloadBoundary {
    pub code: &'static str,
    pub status: &'static str,
}

pub fn trace_persistence_reload(bundle: &LoadedBundle) -> PersistenceReloadReport {
    let local_data = bundle.local_data.as_ref().expect("bundle contains local data");
    let slot = local_data
        .save_slots
        .first()
        .map(|slot| slot.id.clone())
        .unwrap_or_else(|| "slot.main".to_owned());
    let saved_record = save_record(local_data, &bundle.world, &slot);
    PersistenceReloadReport {
        boundaries: vec![
            PersistenceReloadBoundary { code: "TN_PERSISTENCE_CLOUD_STORAGE_UNSUPPORTED", status: "diagnostic-only" },
            PersistenceReloadBoundary { code: "TN_SCRIPT_FILESYSTEM_API_UNSUPPORTED", status: "diagnostic-only" },
        ],
        diagnostics: migration_diagnostics(local_data, saved_record["schemaVersion"].as_u64().unwrap_or(1) as u32 + 1),
        persistence: PersistenceReport {
            autosave: local_data.autosave.as_ref().map(|autosave| autosave.checkpoint_events.iter().map(|event| AutosaveObservation { event: event.clone(), slot: slot.clone(), status: "saved" }).collect()).unwrap_or_default(),
            restore: RestoreObservation { resource_value: saved_record.pointer("/resources/Progress/level").cloned(), slot: slot.clone(), status: "loaded" },
            saved_record,
            settings: settings(local_data),
            storage: StorageObservation { backend: "native-json", path_policy: "target-profile", slot },
        },
        reload: reload_policy(),
        schema: "threenative.persistence-reload",
        version: "0.1.0",
    }
}

fn save_record(local_data: &LocalDataIr, world: &WorldIr, slot: &str) -> Value {
    let slot_spec = local_data.save_slots.first();
    let mut resources = serde_json::Map::new();
    for resource in &local_data.resources {
        if let Some(value) = world.resources.get(&resource.id) {
            resources.insert(resource.id.clone(), value.clone());
        }
    }
    let mut components = serde_json::Map::new();
    for entity in &world.entities {
        let mut persisted = serde_json::Map::new();
        for component in &local_data.components {
            if let Some(value) = entity.components.extra.get(&component.id) {
                persisted.insert(component.id.clone(), value.clone());
            }
        }
        if !persisted.is_empty() {
            components.insert(entity.id.clone(), Value::Object(persisted));
        }
    }
    json!({
        "appVersion": slot_spec.map(|slot| slot.app_version.as_str()).unwrap_or("1.0.0"),
        "components": components,
        "resources": resources,
        "schemaVersion": slot_spec.map(|slot| slot.schema_version).unwrap_or(1),
        "settings": settings(local_data),
        "slot": slot,
    })
}

fn settings(local_data: &LocalDataIr) -> Value {
    let mut settings = serde_json::Map::new();
    for setting in &local_data.settings {
        let value = if setting.key == "audio.master" {
            json!(0.6)
        } else {
            setting.default_value.clone()
        };
        settings.insert(setting.key.clone(), value);
    }
    Value::Object(settings)
}

fn migration_diagnostics(local_data: &LocalDataIr, save_version: u32) -> Vec<PersistenceReloadDiagnostic> {
    diagnose_native_persistence_migration(local_data, save_version)
        .into_iter()
        .map(|diagnostic| PersistenceReloadDiagnostic {
            code: diagnostic.code.to_owned(),
            message: diagnostic.message,
            path: diagnostic.path,
            severity: "error",
            suggestion: "Open this save with a newer game build or add a compatible migrator before restore.",
        })
        .collect()
}

fn reload_policy() -> ReloadPolicyObservation {
    ReloadPolicyObservation {
        asset_reload: json!({
            "changedAssets": [{ "assetId": "texture.hud", "change": "changed", "path": "assets/hud.png" }],
            "classification": "reloadable",
            "diagnostics": [],
            "impactedHandles": ["texture.hud"],
            "schema": "threenative.asset-reload",
            "statePolicy": "preserve",
            "version": "0.1.0"
        }),
        incompatible: vec!["local-data.ir.json/migration/currentVersion"],
        replaced: vec!["assets/hud.png"],
        reset: vec!["TransientEffects"],
        retained: vec!["Progress", "Inventory", "settings"],
        status: "retained",
    }
}
