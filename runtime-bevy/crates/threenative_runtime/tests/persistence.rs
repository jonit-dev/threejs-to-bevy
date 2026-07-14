use threenative_loader::{
    LocalDataAutosaveIr, LocalDataIr, LocalDataMigrationIr, LocalDataMigrationOperationIr,
    LocalDataMigrationTransformIr, LocalDataSaveSlotIr, LocalDataSchemaEntryIr,
};
use threenative_runtime::persistence::{
    NativeAutosaveRuntimeState, collect_native_autosave_triggers,
    diagnose_native_persistence_migration, migrate_native_persistence_record,
};
use threenative_runtime::persistence_storage::NativePersistenceRecord;

#[test]
fn should_report_migration_diagnostics_when_save_version_is_unsupported() {
    let local_data = LocalDataIr {
        schema: "threenative.local-data".to_owned(),
        version: "0.1.0".to_owned(),
        autosave: Some(LocalDataAutosaveIr {
            checkpoint_events: vec!["CheckpointReached".to_owned()],
            debounce_ms: 250.0,
            interval_seconds: Some(30.0),
        }),
        components: vec![],
        migration: Some(LocalDataMigrationIr {
            current_version: 3,
            migrators: vec![1],
            transforms: vec![],
        }),
        resources: vec![],
        save_slots: vec![LocalDataSaveSlotIr {
            app_version: "1.0.0".to_owned(),
            id: "slot.main".to_owned(),
            schema_version: 3,
        }],
        settings: vec![],
    };

    let missing = diagnose_native_persistence_migration(&local_data, 1);
    assert_eq!(missing.len(), 1);
    assert_eq!(missing[0].code, "TN_PERSISTENCE_MIGRATOR_MISSING");

    let forward = diagnose_native_persistence_migration(&local_data, 4);
    assert_eq!(forward.len(), 1);
    assert_eq!(forward[0].code, "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE");
}

#[test]
fn should_debounce_repeated_checkpoint_autosaves() {
    let autosave = LocalDataAutosaveIr {
        checkpoint_events: vec!["CheckpointReached".to_owned()],
        debounce_ms: 250.0,
        interval_seconds: Some(30.0),
    };
    let events = std::collections::HashMap::from([(
        "CheckpointReached".to_owned(),
        serde_json::json!([{}]),
    )]);
    let mut state = NativeAutosaveRuntimeState::default();
    assert_eq!(
        collect_native_autosave_triggers(&autosave, 1.0, &events, &mut state),
        vec!["checkpoint:CheckpointReached"]
    );
    assert!(collect_native_autosave_triggers(&autosave, 1.1, &events, &mut state).is_empty());
    assert_eq!(
        collect_native_autosave_triggers(&autosave, 1.25, &events, &mut state),
        vec!["checkpoint:CheckpointReached"]
    );
}

#[test]
fn should_schedule_interval_autosave_at_declared_bounds() {
    let autosave = LocalDataAutosaveIr {
        checkpoint_events: vec![],
        debounce_ms: 0.0,
        interval_seconds: Some(30.0),
    };
    let mut state = NativeAutosaveRuntimeState::default();
    assert!(
        collect_native_autosave_triggers(&autosave, 29.9, &Default::default(), &mut state)
            .is_empty()
    );
    assert_eq!(
        collect_native_autosave_triggers(&autosave, 30.0, &Default::default(), &mut state),
        vec!["interval"]
    );
}

#[test]
fn should_run_every_migration_step_in_order() {
    let mut local_data = migration_local_data();
    local_data.migration = Some(LocalDataMigrationIr {
        current_version: 3,
        migrators: vec![1, 2],
        transforms: vec![
            LocalDataMigrationTransformIr {
                from_version: 1,
                operations: vec![LocalDataMigrationOperationIr {
                    from: "LegacyProgress".to_owned(),
                    kind: "renameResource".to_owned(),
                    to: Some("IntermediateProgress".to_owned()),
                }],
            },
            LocalDataMigrationTransformIr {
                from_version: 2,
                operations: vec![LocalDataMigrationOperationIr {
                    from: "IntermediateProgress".to_owned(),
                    kind: "renameResource".to_owned(),
                    to: Some("Progress".to_owned()),
                }],
            },
        ],
    });
    let migrated = migrate_native_persistence_record(&local_data, migration_record())
        .expect("both steps should execute");
    assert_eq!(migrated.schema_version, 3);
    assert_eq!(
        migrated.resources["Progress"],
        serde_json::json!({ "level": 2 })
    );
    assert!(!migrated.resources.contains_key("LegacyProgress"));
}

#[test]
fn should_fail_closed_when_one_migrator_is_missing() {
    let mut local_data = migration_local_data();
    local_data.migration = Some(LocalDataMigrationIr {
        current_version: 3,
        migrators: vec![1, 2],
        transforms: vec![LocalDataMigrationTransformIr {
            from_version: 1,
            operations: vec![],
        }],
    });
    let error = migrate_native_persistence_record(&local_data, migration_record())
        .expect_err("step two has no transform");
    assert!(error.contains("TN_PERSISTENCE_MIGRATOR_UNEXECUTABLE"));
}

fn migration_local_data() -> LocalDataIr {
    LocalDataIr {
        schema: "threenative.local-data".to_owned(),
        version: "0.2.0".to_owned(),
        autosave: None,
        components: vec![],
        migration: None,
        resources: vec![LocalDataSchemaEntryIr {
            id: "Progress".to_owned(),
            schema: serde_json::json!({}),
        }],
        save_slots: vec![LocalDataSaveSlotIr {
            app_version: "1.0.0".to_owned(),
            id: "slot.main".to_owned(),
            schema_version: 3,
        }],
        settings: vec![],
    }
}

fn migration_record() -> NativePersistenceRecord {
    NativePersistenceRecord {
        app_version: "1.0.0".to_owned(),
        components: Default::default(),
        resources: std::collections::BTreeMap::from([(
            "LegacyProgress".to_owned(),
            serde_json::json!({ "level": 2 }),
        )]),
        schema: "threenative.persistence-record".to_owned(),
        schema_version: 1,
        settings: Default::default(),
        slot: "slot.main".to_owned(),
        version: "0.1.0".to_owned(),
    }
}
