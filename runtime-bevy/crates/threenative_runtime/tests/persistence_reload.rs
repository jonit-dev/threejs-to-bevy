use std::path::PathBuf;

use threenative_loader::load_bundle;
use threenative_runtime::persistence_reload::{read_persistence_reload, write_persistence_reload};

#[test]
fn should_report_durable_restore_and_reload_policy() {
    let storage =
        std::env::temp_dir().join(format!("tn-persistence-reload-test-{}", std::process::id()));
    std::fs::remove_dir_all(&storage).ok();
    let mut writer = load_bundle(fixture_path()).expect("persistence reload fixture should load");
    let written = write_persistence_reload(&mut writer, &storage)
        .expect("writer process contract should save");
    let mut reader = load_bundle(fixture_path()).expect("persistence reload fixture should reload");
    let report = read_persistence_reload(&mut reader, &storage)
        .expect("reader process contract should restore");

    assert_eq!(report.schema, "threenative.persistence-reload");
    assert_eq!(written.process, "write");
    assert_eq!(report.process, "read");
    assert_eq!(
        report.persistence.restore.resource_value,
        serde_json::json!(7)
    );
    assert_eq!(
        report.persistence.restore.setting_value,
        serde_json::json!(0.75)
    );
    assert_eq!(
        written
            .persistence
            .saved_record
            .pointer("/settings/audio.master"),
        Some(&serde_json::json!(0.25))
    );
    assert_eq!(report.persistence.storage.backend, "native-atomic-json");
    assert!(
        report
            .boundaries
            .iter()
            .any(|boundary| boundary.code == "TN_PERSISTENCE_CLOUD_STORAGE_UNSUPPORTED")
    );
    std::fs::remove_dir_all(storage).expect("temporary persistence root should be removed");
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("packages/ir/fixtures/conformance/persistence-reload/game.bundle")
}
