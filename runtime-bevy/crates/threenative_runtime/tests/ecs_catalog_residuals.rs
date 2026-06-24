use threenative_runtime::bevy_catalog_residuals::{
    report_disabled_entity_query_participation, report_gltf_metadata_transform_policy,
    report_query_combinations, target_profile_output_diagnostic,
};

#[test]
fn should_report_disabled_entity_query_participation() {
    let report = report_disabled_entity_query_participation("enemy.hidden", false);

    assert_eq!(report["schema"], "threenative.bevy-catalog.ecs");
    assert_eq!(report["entity"], "enemy.hidden");
    assert_eq!(report["participatesInQueries"], false);
    assert_eq!(report["rendererVisibility"], "unchanged");
}

#[test]
fn should_report_query_combinations_in_deterministic_order() {
    let report = report_query_combinations(vec!["enemy.z", "enemy.a", "enemy.m"], 2);

    assert_eq!(
        report["schema"],
        "threenative.bevy-catalog.ecs.query-combinations"
    );
    assert_eq!(report["observations"][0]["a"], "enemy.a");
    assert_eq!(report["observations"][0]["b"], "enemy.m");
    assert_eq!(report["observations"][0]["order"], 1);
    assert_eq!(report["observations"][1]["a"], "enemy.a");
    assert_eq!(report["observations"][1]["b"], "enemy.z");
    assert_eq!(report["observations"][1]["order"], 2);
    assert_eq!(report["observations"].as_array().unwrap().len(), 2);
}

#[test]
fn should_report_known_gltf_metadata_transform_policy() {
    let report = report_gltf_metadata_transform_policy("EXT_animation_graph", "AnimationGraph");

    assert_eq!(
        report["schema"],
        "threenative.bevy-catalog.assets.gltf-metadata-transform"
    );
    assert_eq!(report["extension"], "EXT_animation_graph");
    assert_eq!(report["processor"], "metadata");
    assert_eq!(report["transform"], "AnimationGraph");
}

#[test]
fn should_report_target_profile_output_diagnostics() {
    let report = target_profile_output_diagnostic("native", vec!["web"], "target.profile.json/targets");

    assert_eq!(report["code"], "TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED");
    assert_eq!(
        report["message"],
        "Target profile for 'native' output must include 'desktop'."
    );
    assert_eq!(report["path"], "target.profile.json/targets");
    assert_eq!(report["target"], "native");
    assert_eq!(report["value"][0], "web");
}
