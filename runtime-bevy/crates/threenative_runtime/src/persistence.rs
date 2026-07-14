use std::collections::BTreeMap;

use serde_json::Value;
use threenative_loader::{LoadedBundle, LocalDataIr};

use crate::{
    persistence_storage::{
        NativeFilePersistenceStorage, NativePersistenceNamespace, NativePersistenceRecord,
        NativePersistenceStorage, apply_record_to_world, decode_record_envelope, load_settings,
        record_from_world, save_settings, validate_record,
    },
    systems_effects::NativeSystemEffects,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativePersistenceDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeAutosaveRuntimeState {
    pub last_checkpoint_seconds: BTreeMap<String, f32>,
    pub last_interval_seconds: f32,
    pub save_count: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeAutosaveObservation {
    pub trigger: String,
    pub slot: String,
}

pub fn diagnose_native_persistence_migration(
    local_data: &LocalDataIr,
    save_schema_version: u32,
) -> Vec<NativePersistenceDiagnostic> {
    let current_version = local_data
        .migration
        .as_ref()
        .map(|migration| migration.current_version)
        .or_else(|| {
            local_data
                .save_slots
                .iter()
                .map(|slot| slot.schema_version)
                .max()
        })
        .unwrap_or(1);

    if save_schema_version > current_version {
        return vec![NativePersistenceDiagnostic {
            code: "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE",
            message: format!(
                "Save schema version {save_schema_version} is newer than local data version {current_version}."
            ),
            path: "local-data.ir.json/migration/currentVersion".to_owned(),
        }];
    }

    if save_schema_version == current_version {
        return Vec::new();
    }

    let migrators = local_data
        .migration
        .as_ref()
        .map(|migration| migration.migrators.as_slice())
        .unwrap_or(&[]);
    let mut diagnostics = Vec::new();
    for version in save_schema_version..current_version {
        if !migrators.contains(&version) {
            diagnostics.push(NativePersistenceDiagnostic {
                code: "TN_PERSISTENCE_MIGRATOR_MISSING",
                message: format!(
                    "Save schema version {version} cannot migrate to {}.",
                    version + 1
                ),
                path: "local-data.ir.json/migration/migrators".to_owned(),
            });
        }
    }
    diagnostics
}

pub fn native_persistence_snapshot(
    bundle: &LoadedBundle,
) -> Result<(BTreeMap<String, Value>, BTreeMap<String, Value>), String> {
    let Some(local_data) = bundle.local_data.as_ref() else {
        return Ok(Default::default());
    };
    let namespace =
        NativePersistenceNamespace::from_bundle(bundle).map_err(|error| error.to_string())?;
    let storage = NativeFilePersistenceStorage::new(NativeFilePersistenceStorage::default_root());
    let mut saves = BTreeMap::new();
    for slot in &local_data.save_slots {
        if let Some(record) =
            load_and_commit_native_persistence_record(&storage, &namespace, local_data, &slot.id)?
        {
            saves.insert(
                slot.id.clone(),
                serde_json::to_value(record).map_err(|error| error.to_string())?,
            );
        }
    }
    let settings =
        load_settings(&storage, &namespace, local_data).map_err(|error| error.to_string())?;
    Ok((saves, settings))
}

pub fn apply_native_persistence_service_effects(
    bundle: &mut LoadedBundle,
    effects: &NativeSystemEffects,
) -> Result<(), String> {
    let Some(local_data) = bundle.local_data.clone() else {
        return Ok(());
    };
    let namespace =
        NativePersistenceNamespace::from_bundle(bundle).map_err(|error| error.to_string())?;
    let storage = NativeFilePersistenceStorage::new(NativeFilePersistenceStorage::default_root());
    for effect in &effects.services {
        let request = effect.payload.get("request").unwrap_or(&Value::Null);
        match effect.service.as_str() {
            "persistence.save" => {
                let slot = request
                    .get("slot")
                    .and_then(Value::as_str)
                    .ok_or("TN_PERSISTENCE_SLOT_INVALID: save request has no slot")?;
                let settings = if let Some(settings) = effect
                    .payload
                    .pointer("/result/record/settings")
                    .and_then(Value::as_object)
                {
                    settings
                        .iter()
                        .map(|(key, value)| (key.clone(), value.clone()))
                        .collect()
                } else {
                    load_settings(&storage, &namespace, &local_data)
                        .map_err(|error| error.to_string())?
                };
                let record = record_from_world(&local_data, &bundle.world, slot, settings)
                    .map_err(|error| error.to_string())?;
                let bytes =
                    serde_json::to_vec_pretty(&record).map_err(|error| error.to_string())?;
                storage
                    .save(&namespace, slot, &bytes)
                    .map_err(|error| error.to_string())?;
            }
            "persistence.load" => {
                let slot = request
                    .get("slot")
                    .and_then(Value::as_str)
                    .ok_or("TN_PERSISTENCE_SLOT_INVALID: load request has no slot")?;
                if let Some(record) = load_and_commit_native_persistence_record(
                    &storage,
                    &namespace,
                    &local_data,
                    slot,
                )? {
                    apply_record_to_world(&local_data, &record, &mut bundle.world)
                        .map_err(|error| error.to_string())?;
                }
            }
            "persistence.delete" => {
                let slot = request
                    .get("slot")
                    .and_then(Value::as_str)
                    .ok_or("TN_PERSISTENCE_SLOT_INVALID: delete request has no slot")?;
                storage
                    .delete(&namespace, slot)
                    .map_err(|error| error.to_string())?;
            }
            "settings.set" => {
                let key = request
                    .get("key")
                    .and_then(Value::as_str)
                    .ok_or("TN_PERSISTENCE_SETTING_INVALID: settings.set has no key")?;
                let value = request
                    .get("value")
                    .cloned()
                    .ok_or("TN_PERSISTENCE_SETTING_INVALID: settings.set has no value")?;
                let mut settings = load_settings(&storage, &namespace, &local_data)
                    .map_err(|error| error.to_string())?;
                settings.insert(key.to_owned(), value);
                save_settings(&storage, &namespace, &local_data, settings)
                    .map_err(|error| error.to_string())?;
            }
            "settings.import" => {
                let values = request
                    .get("values")
                    .and_then(Value::as_object)
                    .ok_or("TN_PERSISTENCE_SETTING_INVALID: settings.import has no values")?;
                let mut settings = load_settings(&storage, &namespace, &local_data)
                    .map_err(|error| error.to_string())?;
                settings.extend(
                    values
                        .iter()
                        .map(|(key, value)| (key.clone(), value.clone())),
                );
                save_settings(&storage, &namespace, &local_data, settings)
                    .map_err(|error| error.to_string())?;
            }
            _ => {}
        }
    }
    Ok(())
}

pub fn load_and_commit_native_persistence_record(
    storage: &impl NativePersistenceStorage,
    namespace: &NativePersistenceNamespace,
    local_data: &LocalDataIr,
    slot: &str,
) -> Result<Option<NativePersistenceRecord>, String> {
    let Some(bytes) = storage
        .load(namespace, slot)
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    let original = decode_record_envelope(&bytes).map_err(|error| error.to_string())?;
    let original_version = original.schema_version;
    let migrated = migrate_native_persistence_record(local_data, original)?;
    if migrated.schema_version != original_version {
        let migrated_bytes =
            serde_json::to_vec_pretty(&migrated).map_err(|error| error.to_string())?;
        storage
            .save(namespace, slot, &migrated_bytes)
            .map_err(|error| format!("TN_PERSISTENCE_MIGRATION_COMMIT_FAILED: {error}"))?;
    }
    Ok(Some(migrated))
}

pub fn migrate_native_persistence_record(
    local_data: &LocalDataIr,
    mut record: NativePersistenceRecord,
) -> Result<NativePersistenceRecord, String> {
    let target = local_data
        .save_slots
        .iter()
        .find(|slot| slot.id == record.slot)
        .ok_or_else(|| {
            format!(
                "TN_PERSISTENCE_SLOT_UNDECLARED: slot '{}' is not declared",
                record.slot
            )
        })?
        .schema_version;
    if record.schema_version > target {
        return Err(format!(
            "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE: save schema version {} is newer than {target}",
            record.schema_version
        ));
    }
    for version in record.schema_version..target {
        let migration = local_data.migration.as_ref().ok_or_else(|| format!("TN_PERSISTENCE_MIGRATOR_MISSING: save schema version {version} cannot migrate to {}", version + 1))?;
        if !migration.migrators.contains(&version) {
            return Err(format!(
                "TN_PERSISTENCE_MIGRATOR_MISSING: save schema version {version} cannot migrate to {}",
                version + 1
            ));
        }
        let transform = migration.transforms.iter().find(|transform| transform.from_version == version)
            .filter(|_| local_data.version == "0.2.0")
            .ok_or_else(|| format!("TN_PERSISTENCE_MIGRATOR_UNEXECUTABLE: save schema version {version} has no executable Local Data 0.2.0 transform"))?;
        for operation in &transform.operations {
            apply_native_migration_operation(&mut record, operation)?;
        }
        record.schema_version = version + 1;
    }
    validate_record(local_data, &record).map_err(|error| error.to_string())?;
    Ok(record)
}

fn apply_native_migration_operation(
    record: &mut NativePersistenceRecord,
    operation: &threenative_loader::LocalDataMigrationOperationIr,
) -> Result<(), String> {
    let rename = operation.kind.starts_with("rename");
    let to = rename
        .then(|| operation.to.as_deref())
        .flatten()
        .ok_or_else(|| {
            format!(
                "TN_PERSISTENCE_MIGRATION_OPERATION_INVALID: '{}' requires a destination",
                operation.kind
            )
        });
    match operation.kind.as_str() {
        "renameResource" => migrate_map_key(&mut record.resources, &operation.from, Some(to?)),
        "deleteResource" => migrate_map_key(&mut record.resources, &operation.from, None),
        "renameSetting" => migrate_map_key(&mut record.settings, &operation.from, Some(to?)),
        "deleteSetting" => migrate_map_key(&mut record.settings, &operation.from, None),
        "renameComponent" => {
            let destination = to?;
            for components in record.components.values_mut() {
                migrate_map_key(components, &operation.from, Some(destination));
            }
        }
        "deleteComponent" => {
            for components in record.components.values_mut() {
                migrate_map_key(components, &operation.from, None);
            }
        }
        kind => {
            return Err(format!(
                "TN_PERSISTENCE_MIGRATION_OPERATION_INVALID: unsupported operation '{kind}'"
            ));
        }
    }
    Ok(())
}

fn migrate_map_key<T>(map: &mut BTreeMap<String, T>, from: &str, to: Option<&str>) {
    let Some(value) = map.remove(from) else {
        return;
    };
    if let Some(to) = to {
        map.entry(to.to_owned()).or_insert(value);
    }
}

pub fn step_native_autosave(
    bundle: &LoadedBundle,
    elapsed_seconds: f32,
    events: &std::collections::HashMap<String, Value>,
    state: &mut NativeAutosaveRuntimeState,
) -> Result<Vec<NativeAutosaveObservation>, String> {
    let namespace =
        NativePersistenceNamespace::from_bundle(bundle).map_err(|error| error.to_string())?;
    let storage = NativeFilePersistenceStorage::new(NativeFilePersistenceStorage::default_root());
    step_native_autosave_with_storage(&storage, &namespace, bundle, elapsed_seconds, events, state)
}

pub fn step_native_autosave_with_storage(
    storage: &impl NativePersistenceStorage,
    namespace: &NativePersistenceNamespace,
    bundle: &LoadedBundle,
    elapsed_seconds: f32,
    events: &std::collections::HashMap<String, Value>,
    state: &mut NativeAutosaveRuntimeState,
) -> Result<Vec<NativeAutosaveObservation>, String> {
    let Some(local_data) = bundle.local_data.as_ref() else {
        return Ok(Vec::new());
    };
    let Some(autosave) = local_data.autosave.as_ref() else {
        return Ok(Vec::new());
    };
    let Some(slot) = local_data.save_slots.first() else {
        return Ok(Vec::new());
    };
    let mut candidate_state = state.clone();
    let triggers =
        collect_native_autosave_triggers(autosave, elapsed_seconds, events, &mut candidate_state);
    if triggers.is_empty() {
        return Ok(Vec::new());
    }
    let settings =
        load_settings(storage, namespace, local_data).map_err(|error| error.to_string())?;
    let record = record_from_world(local_data, &bundle.world, &slot.id, settings)
        .map_err(|error| error.to_string())?;
    storage
        .save(
            namespace,
            &slot.id,
            &serde_json::to_vec_pretty(&record).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
    candidate_state.save_count += 1;
    *state = candidate_state;
    Ok(triggers
        .into_iter()
        .map(|trigger| NativeAutosaveObservation {
            trigger,
            slot: slot.id.clone(),
        })
        .collect())
}

pub fn collect_native_autosave_triggers(
    autosave: &threenative_loader::LocalDataAutosaveIr,
    elapsed_seconds: f32,
    events: &std::collections::HashMap<String, Value>,
    state: &mut NativeAutosaveRuntimeState,
) -> Vec<String> {
    let mut triggers = Vec::new();
    if let Some(interval) = autosave.interval_seconds.map(|value| value as f32)
        && elapsed_seconds - state.last_interval_seconds >= interval
    {
        state.last_interval_seconds = elapsed_seconds;
        triggers.push("interval".to_owned());
    }
    let debounce_seconds = (autosave.debounce_ms / 1000.0) as f32;
    for event in &autosave.checkpoint_events {
        if !events
            .get(event)
            .is_some_and(|values| values.as_array().map_or(true, |values| !values.is_empty()))
        {
            continue;
        }
        let previous = state.last_checkpoint_seconds.get(event).copied();
        if previous.is_none_or(|previous| elapsed_seconds - previous >= debounce_seconds) {
            state
                .last_checkpoint_seconds
                .insert(event.clone(), elapsed_seconds);
            triggers.push(format!("checkpoint:{event}"));
        }
    }
    triggers
}
