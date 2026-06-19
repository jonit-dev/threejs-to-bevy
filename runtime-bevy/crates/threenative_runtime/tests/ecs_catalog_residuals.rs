use threenative_runtime::bevy_catalog_residuals::report_disabled_entity_query_participation;

#[test]
fn should_report_disabled_entity_query_participation() {
    let report = report_disabled_entity_query_participation("enemy.hidden", false);

    assert_eq!(report["schema"], "threenative.bevy-catalog.ecs");
    assert_eq!(report["entity"], "enemy.hidden");
    assert_eq!(report["participatesInQueries"], false);
    assert_eq!(report["rendererVisibility"], "unchanged");
}
