use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::json;
use threenative_loader::{
    LocalDataIr, LocalDataSaveSlotIr, LocalDataSchemaEntryIr, LocalDataSettingIr,
};
use threenative_runtime::persistence::{
    NativeAutosaveRuntimeState, load_and_commit_native_persistence_record,
    migrate_native_persistence_record, step_native_autosave_with_storage,
};
use threenative_runtime::persistence_storage::{
    NativeFilePersistenceStorage, NativeMemoryPersistenceStorage, NativePersistenceNamespace,
    NativePersistenceRecord, NativePersistenceStorage, apply_record_to_world, decode_record,
    load_settings, validate_record,
};

#[test]
fn should_apply_shared_persistence_contract_vectors() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/ir/fixtures/contracts/persistence/records.json"
    ))
    .unwrap();
    let local_data: LocalDataIr = serde_json::from_value(fixture["localData"].clone()).unwrap();
    let declared: NativePersistenceRecord =
        serde_json::from_value(fixture["records"]["declared"].clone()).unwrap();
    validate_record(&local_data, &declared).unwrap();
    let forward: NativePersistenceRecord =
        serde_json::from_value(fixture["records"]["forward"].clone()).unwrap();
    assert!(validate_record(&local_data, &forward).is_err());
    let undeclared: NativePersistenceRecord =
        serde_json::from_value(fixture["records"]["undeclared"].clone()).unwrap();
    assert!(validate_record(&local_data, &undeclared).is_err());
    let migratable: NativePersistenceRecord =
        serde_json::from_value(fixture["records"]["migratable"].clone()).unwrap();
    let migrated = migrate_native_persistence_record(&local_data, migratable).unwrap();
    assert_eq!(migrated.resources["Progress"], json!({ "level": 2 }));
    assert!(
        decode_record(
            &local_data,
            fixture["corruptRaw"].as_str().unwrap().as_bytes()
        )
        .is_err()
    );
}

#[test]
fn should_accept_a_declared_bounded_save_record() {
    let local_data = local_data();
    let record = record(2);
    validate_record(&local_data, &record).expect("declared record should pass");
}

#[test]
fn should_inject_deterministic_in_memory_storage() {
    let storage = NativeMemoryPersistenceStorage::default();
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    storage.save(&namespace, "slot.main", b"record").unwrap();
    assert_eq!(
        storage.load(&namespace, "slot.main").unwrap(),
        Some(b"record".to_vec())
    );
    assert!(storage.delete(&namespace, "slot.main").unwrap());
}

#[test]
fn should_reject_undeclared_fields() {
    let local_data = local_data();
    let mut record = record(2);
    record
        .resources
        .insert("Secret".to_owned(), json!({ "value": 1 }));
    let error = validate_record(&local_data, &record).expect_err("undeclared resource should fail");
    assert!(
        error
            .to_string()
            .contains("resource 'Secret' is not declared")
    );
}

#[test]
fn should_reject_unknown_record_envelope_fields() {
    let mut value = serde_json::to_value(record(2)).unwrap();
    value
        .as_object_mut()
        .unwrap()
        .insert("nativeHandle".to_owned(), json!(7));
    let error = decode_record(&local_data(), &serde_json::to_vec(&value).unwrap())
        .expect_err("unknown envelope field should fail");
    assert!(error.to_string().contains("unknown field"));
}

#[test]
fn should_preserve_a_corrupt_record_for_recovery() {
    let root = temp_root("corrupt");
    let storage = NativeFilePersistenceStorage::new(&root);
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    storage.save(&namespace, "slot.main", b"{not-json").unwrap();
    let bytes = storage.load(&namespace, "slot.main").unwrap().unwrap();
    assert!(decode_record(&local_data(), &bytes).is_err());
    assert_eq!(
        storage.load(&namespace, "slot.main").unwrap().unwrap(),
        b"{not-json"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn should_reject_and_preserve_corrupt_forward_and_undeclared_settings_records() {
    let root = temp_root("settings-negative");
    let storage = NativeFilePersistenceStorage::new(&root);
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    let cases = [
        (b"{not-json".to_vec(), "TN_PERSISTENCE_RECORD_CORRUPT"),
        (serde_json::to_vec(&json!({ "schema": "threenative.persistence-settings", "settings": {}, "version": "0.2.0" })).unwrap(), "unsupported settings envelope"),
        (serde_json::to_vec(&json!({ "schema": "threenative.persistence-settings", "settings": { "secret.handle": 7 }, "version": "0.1.0" })).unwrap(), "not declared"),
    ];
    for (bytes, expected) in cases {
        storage.save(&namespace, "settings", &bytes).unwrap();
        let error = load_settings(&storage, &namespace, &local_data())
            .expect_err("invalid settings must fail closed");
        assert!(
            error.to_string().contains(expected),
            "unexpected error: {error}"
        );
        assert_eq!(
            storage.load(&namespace, "settings").unwrap().unwrap(),
            bytes
        );
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn should_diagnose_a_forward_incompatible_record() {
    let error = validate_record(&local_data(), &record(3)).expect_err("forward save should fail");
    assert!(error.to_string().contains("newer than declared"));
}

#[test]
fn should_retain_the_prior_record_when_atomic_commit_fails() {
    let root = temp_root("atomic");
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    let storage = NativeFilePersistenceStorage::new(&root);
    storage.save(&namespace, "slot.main", b"previous").unwrap();
    let failing = NativeFilePersistenceStorage::with_failed_commit(&root);
    assert!(failing.save(&namespace, "slot.main", b"next").is_err());
    assert_eq!(
        storage.load(&namespace, "slot.main").unwrap().unwrap(),
        b"previous"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn should_atomically_commit_a_successful_native_migration() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/ir/fixtures/contracts/persistence/records.json"
    ))
    .unwrap();
    let local_data: LocalDataIr = serde_json::from_value(fixture["localData"].clone()).unwrap();
    let original = serde_json::to_vec(&fixture["records"]["migratable"]).unwrap();
    let root = temp_root("migration-commit");
    let storage = NativeFilePersistenceStorage::new(&root);
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    storage.save(&namespace, "slot.main", &original).unwrap();

    let migrated =
        load_and_commit_native_persistence_record(&storage, &namespace, &local_data, "slot.main")
            .unwrap()
            .unwrap();
    assert_eq!(migrated.schema_version, 2);
    let committed = decode_record(
        &local_data,
        &storage.load(&namespace, "slot.main").unwrap().unwrap(),
    )
    .unwrap();
    assert_eq!(committed, migrated);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn should_preserve_the_old_record_when_migration_commit_is_interrupted() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/ir/fixtures/contracts/persistence/records.json"
    ))
    .unwrap();
    let local_data: LocalDataIr = serde_json::from_value(fixture["localData"].clone()).unwrap();
    let original = serde_json::to_vec(&fixture["records"]["migratable"]).unwrap();
    let root = temp_root("migration-interrupted");
    let storage = NativeFilePersistenceStorage::new(&root);
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    storage.save(&namespace, "slot.main", &original).unwrap();
    let failing = NativeFilePersistenceStorage::with_failed_commit(&root);

    let error =
        load_and_commit_native_persistence_record(&failing, &namespace, &local_data, "slot.main")
            .expect_err("migration commit should fail");
    assert!(error.contains("TN_PERSISTENCE_MIGRATION_COMMIT_FAILED"));
    assert_eq!(
        storage.load(&namespace, "slot.main").unwrap().unwrap(),
        original
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn should_reject_a_storage_namespace_escape() {
    assert!(NativePersistenceNamespace::new("../game", "desktop").is_err());
    let root = temp_root("escape");
    let storage = NativeFilePersistenceStorage::new(&root);
    let namespace = NativePersistenceNamespace::new("game", "desktop").unwrap();
    assert!(storage.save(&namespace, "../slot", b"data").is_err());
    assert!(!root.join("slot.json").exists());
    fs::remove_dir_all(root).ok();
}

#[test]
fn should_durably_autosave_checkpoint_debounce_and_interval_then_cold_restore() {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("packages/ir/fixtures/conformance/persistence-reload/game.bundle");
    let mut bundle = threenative_loader::load_bundle(&fixture).unwrap();
    let root = temp_root("autosave-e2e");
    let storage = NativeFilePersistenceStorage::new(&root);
    let namespace = NativePersistenceNamespace::from_bundle(&bundle).unwrap();
    let mut state = NativeAutosaveRuntimeState::default();
    bundle.world.resources.get_mut("Progress").unwrap()["level"] = json!(4);
    let checkpoint =
        std::collections::HashMap::from([("CheckpointReached".to_owned(), json!([{}]))]);

    let first = step_native_autosave_with_storage(
        &storage,
        &namespace,
        &bundle,
        1.0,
        &checkpoint,
        &mut state,
    )
    .unwrap();
    assert_eq!(first[0].trigger, "checkpoint:CheckpointReached");
    bundle.world.resources.get_mut("Progress").unwrap()["level"] = json!(5);
    assert!(
        step_native_autosave_with_storage(
            &storage,
            &namespace,
            &bundle,
            1.1,
            &checkpoint,
            &mut state
        )
        .unwrap()
        .is_empty()
    );
    let checkpoint_record = decode_record(
        bundle.local_data.as_ref().unwrap(),
        &storage.load(&namespace, "slot.main").unwrap().unwrap(),
    )
    .unwrap();
    assert_eq!(checkpoint_record.resources["Progress"]["level"], json!(4));

    let interval = step_native_autosave_with_storage(
        &storage,
        &namespace,
        &bundle,
        30.0,
        &Default::default(),
        &mut state,
    )
    .unwrap();
    assert_eq!(interval[0].trigger, "interval");
    let mut cold = threenative_loader::load_bundle(&fixture).unwrap();
    let record = decode_record(
        cold.local_data.as_ref().unwrap(),
        &storage.load(&namespace, "slot.main").unwrap().unwrap(),
    )
    .unwrap();
    apply_record_to_world(cold.local_data.as_ref().unwrap(), &record, &mut cold.world).unwrap();
    assert_eq!(cold.world.resources["Progress"]["level"], json!(5));
    fs::remove_dir_all(root).unwrap();
}

fn local_data() -> LocalDataIr {
    LocalDataIr {
        schema: "threenative.local-data".to_owned(),
        version: "0.1.0".to_owned(),
        autosave: None,
        components: vec![LocalDataSchemaEntryIr {
            id: "Inventory".to_owned(),
            schema: json!({}),
        }],
        migration: None,
        resources: vec![LocalDataSchemaEntryIr {
            id: "Progress".to_owned(),
            schema: json!({}),
        }],
        save_slots: vec![LocalDataSaveSlotIr {
            app_version: "1.0.0".to_owned(),
            id: "slot.main".to_owned(),
            schema_version: 2,
        }],
        settings: vec![LocalDataSettingIr {
            default_value: json!(0.8),
            enum_values: vec![],
            group: "audio".to_owned(),
            key: "audio.master".to_owned(),
            kind: "number".to_owned(),
            max: Some(1.0),
            min: Some(0.0),
        }],
    }
}

fn record(schema_version: u32) -> NativePersistenceRecord {
    NativePersistenceRecord {
        app_version: "1.0.0".to_owned(),
        components: BTreeMap::from([(
            "player".to_owned(),
            BTreeMap::from([("Inventory".to_owned(), json!({ "items": "key" }))]),
        )]),
        resources: BTreeMap::from([("Progress".to_owned(), json!({ "level": 7 }))]),
        schema: "threenative.persistence-record".to_owned(),
        schema_version,
        settings: BTreeMap::from([("audio.master".to_owned(), json!(0.6))]),
        slot: "slot.main".to_owned(),
        version: "0.1.0".to_owned(),
    }
}

fn temp_root(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("threenative-persistence-{label}-{nonce}"))
}
