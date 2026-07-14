use std::{collections::BTreeMap, path::Path};

use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::LoadedBundle;

use crate::persistence_storage::{
    NativeFilePersistenceStorage, NativePersistenceNamespace, NativePersistenceStorage,
    apply_record_to_world, load_settings, record_from_world, save_settings,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceReloadReport {
    pub boundaries: Vec<PersistenceReloadBoundary>,
    pub diagnostics: Vec<PersistenceReloadDiagnostic>,
    pub persistence: PersistenceReport,
    pub process: &'static str,
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
    pub restore: RestoreObservation,
    pub saved_record: Value,
    pub settings: BTreeMap<String, Value>,
    pub storage: StorageObservation,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreObservation {
    pub resource_value: Value,
    pub setting_value: Value,
    pub slot: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageObservation {
    pub atomic_commit: bool,
    pub backend: &'static str,
    pub namespace: String,
    pub path_policy: &'static str,
    pub slot: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceReloadBoundary {
    pub code: &'static str,
    pub status: &'static str,
}

pub fn write_persistence_reload(
    bundle: &mut LoadedBundle,
    storage_root: &Path,
) -> Result<PersistenceReloadReport, String> {
    let local_data = bundle
        .local_data
        .as_ref()
        .ok_or("bundle does not declare local data")?;
    let slot = local_data
        .save_slots
        .first()
        .ok_or("bundle does not declare a save slot")?
        .id
        .clone();
    let namespace =
        NativePersistenceNamespace::from_bundle(bundle).map_err(|error| error.to_string())?;
    let storage = NativeFilePersistenceStorage::new(storage_root);
    bundle
        .world
        .resources
        .get_mut("Progress")
        .and_then(Value::as_object_mut)
        .ok_or("fixture Progress resource is missing")?
        .insert("level".to_owned(), json!(7));
    let mut settings = local_data
        .settings
        .iter()
        .map(|setting| (setting.key.clone(), setting.default_value.clone()))
        .collect::<BTreeMap<_, _>>();
    settings.insert("audio.master".to_owned(), json!(0.25));
    if settings.contains_key("accessibility.contrast") {
        settings.insert("accessibility.contrast".to_owned(), json!("highContrast"));
    }
    let mut record = record_from_world(local_data, &bundle.world, &slot, settings.clone())
        .map_err(|error| error.to_string())?;
    if local_data.version == "0.2.0" && record.schema_version > 1 {
        record.schema_version = 1;
        if let Some(progress) = record.resources.remove("Progress") {
            record
                .resources
                .insert("LegacyProgress".to_owned(), progress);
        }
    }
    storage
        .save(
            &namespace,
            &slot,
            &serde_json::to_vec_pretty(&record).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
    settings.insert("audio.master".to_owned(), json!(0.75));
    save_settings(&storage, &namespace, local_data, settings.clone())
        .map_err(|error| error.to_string())?;
    Ok(report("write", &namespace, &slot, &record, settings))
}

pub fn read_persistence_reload(
    bundle: &mut LoadedBundle,
    storage_root: &Path,
) -> Result<PersistenceReloadReport, String> {
    let local_data = bundle
        .local_data
        .as_ref()
        .ok_or("bundle does not declare local data")?;
    let slot = local_data
        .save_slots
        .first()
        .ok_or("bundle does not declare a save slot")?
        .id
        .clone();
    let namespace =
        NativePersistenceNamespace::from_bundle(bundle).map_err(|error| error.to_string())?;
    let storage = NativeFilePersistenceStorage::new(storage_root);
    let record = crate::persistence::load_and_commit_native_persistence_record(
        &storage, &namespace, local_data, &slot,
    )?
    .ok_or_else(|| format!("TN_PERSISTENCE_SAVE_MISSING: slot '{slot}' was not restored"))?;
    apply_record_to_world(local_data, &record, &mut bundle.world)
        .map_err(|error| error.to_string())?;
    let settings =
        load_settings(&storage, &namespace, local_data).map_err(|error| error.to_string())?;
    let level = bundle
        .world
        .resources
        .get("Progress")
        .and_then(|value| value.get("level"))
        .cloned()
        .ok_or("restored Progress.level is missing")?;
    if level != json!(7) {
        return Err(format!(
            "TN_PERSISTENCE_RESTORE_MISMATCH: expected Progress.level 7, got {level}"
        ));
    }
    if settings.get("audio.master") != Some(&json!(0.75)) {
        return Err(format!(
            "TN_PERSISTENCE_SETTINGS_RESTORE_MISMATCH: expected audio.master 0.75, got {:?}",
            settings.get("audio.master")
        ));
    }
    Ok(report("read", &namespace, &slot, &record, settings))
}

fn report(
    process: &'static str,
    namespace: &NativePersistenceNamespace,
    slot: &str,
    record: &crate::persistence_storage::NativePersistenceRecord,
    settings: BTreeMap<String, Value>,
) -> PersistenceReloadReport {
    PersistenceReloadReport {
        boundaries: vec![
            PersistenceReloadBoundary {
                code: "TN_PERSISTENCE_CLOUD_STORAGE_UNSUPPORTED",
                status: "diagnostic-only",
            },
            PersistenceReloadBoundary {
                code: "TN_SCRIPT_FILESYSTEM_API_UNSUPPORTED",
                status: "diagnostic-only",
            },
        ],
        diagnostics: Vec::new(),
        persistence: PersistenceReport {
            restore: RestoreObservation {
                resource_value: record
                    .resources
                    .get("Progress")
                    .and_then(|value| value.get("level"))
                    .cloned()
                    .unwrap_or(Value::Null),
                setting_value: settings.get("audio.master").cloned().unwrap_or(Value::Null),
                slot: slot.to_owned(),
                status: if process == "read" { "loaded" } else { "saved" },
            },
            saved_record: serde_json::to_value(record).expect("record serializes"),
            settings,
            storage: StorageObservation {
                atomic_commit: true,
                backend: "native-atomic-json",
                namespace: format!("{}/{}", namespace.app, namespace.target_profile),
                path_policy: "adapter-private-target-profile",
                slot: slot.to_owned(),
            },
        },
        process,
        schema: "threenative.persistence-reload",
        version: "0.2.0",
    }
}
