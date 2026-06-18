mod support;

use threenative_runtime::runtime_gameplay_host::trace_runtime_gameplay_host;

#[test]
fn should_reconcile_spawned_rendered_entities_when_command_buffer_flushes() {
    let mut fixture = support::load_conformance_fixture("runtime-gameplay-host");

    let report = trace_runtime_gameplay_host(&mut fixture.bundle);

    assert_eq!(report["schema"], "threenative.runtime-gameplay-host");
    assert!(report["reconciliation"]["spawnedRendererHandles"]
        .as_array()
        .expect("spawned handles")
        .iter()
        .any(|handle| handle == "renderer:runtime.enemy"));
    assert!(!report["reconciliation"]["finalRendererHandles"]
        .as_array()
        .expect("final handles")
        .iter()
        .any(|handle| handle == "renderer:runtime.enemy"));
    assert_eq!(
        report["hooks"][2],
        serde_json::json!({
            "component": "Health",
            "entity": "runtime.enemy",
            "hook": "onRemove",
            "order": 3
        })
    );
}
