use threenative_runtime::bevy_catalog_residuals::{
    report_generated_asset_policy, unsupported_gltf_executable_extension_processor,
};

#[test]
fn should_report_unsupported_gltf_executable_extension_processor() {
    let diagnostic = unsupported_gltf_executable_extension_processor(
        "EXT_animation_graph_processor",
        "gltf.scene.json/extensions/0/processor",
    );

    assert_eq!(
        diagnostic["code"],
        "TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED"
    );
    assert_eq!(diagnostic["severity"], "error");
    assert_eq!(diagnostic["path"], "gltf.scene.json/extensions/0/processor");
}

#[test]
fn should_report_generated_assets_as_bundle_artifacts() {
    let report =
        report_generated_asset_policy("generated.navmesh", "threenative.generated.navmesh");

    assert_eq!(report["assetId"], "generated.navmesh");
    assert_eq!(report["path"], "artifacts/generated/generated.navmesh.json");
    assert_eq!(report["schema"], "threenative.generated.navmesh");
    assert_eq!(report["status"], "bundle-artifact");
}
