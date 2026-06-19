use std::path::PathBuf;

use threenative_loader::load_bundle;
use threenative_runtime::persistence_reload::trace_persistence_reload;

#[test]
fn should_report_durable_restore_and_reload_policy() {
    let bundle = load_bundle(fixture_path()).expect("persistence reload fixture should load");
    let report = trace_persistence_reload(&bundle);

    assert_eq!(report.schema, "threenative.persistence-reload");
    assert_eq!(report.persistence.autosave[0].event, "CheckpointReached");
    assert_eq!(
        report.persistence.restore.resource_value,
        Some(serde_json::json!(3))
    );
    assert_eq!(
        report.reload.retained,
        vec!["Progress", "Inventory", "settings"]
    );
    assert_eq!(
        report.diagnostics[0].code,
        "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE"
    );
    assert!(
        report
            .boundaries
            .iter()
            .any(|boundary| boundary.code == "TN_PERSISTENCE_CLOUD_STORAGE_UNSUPPORTED")
    );
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("packages/ir/fixtures/conformance/persistence-reload/game.bundle")
}
