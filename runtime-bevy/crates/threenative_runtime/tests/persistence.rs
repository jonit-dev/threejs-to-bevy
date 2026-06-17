use threenative_loader::{
    LocalDataAutosaveIr, LocalDataIr, LocalDataMigrationIr, LocalDataSaveSlotIr,
};
use threenative_runtime::persistence::diagnose_native_persistence_migration;

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
