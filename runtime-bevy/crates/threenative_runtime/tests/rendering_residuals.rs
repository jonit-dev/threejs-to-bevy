mod support;

use threenative_runtime::rendering_residuals::trace_rendering_residuals;

#[test]
fn should_report_rendering_material_geometry_and_asset_residuals() {
    let fixture = support::load_conformance_fixture("rendering-residuals");
    let report = trace_rendering_residuals(&fixture.bundle);

    assert_eq!(report["schema"], "threenative.rendering-residuals");
    assert_eq!(
        report["geometry"]["lod"][0]["selectedMesh"],
        "mesh.hero.low"
    );
    assert_eq!(
        report["materials"]["specular"][0]["texture"],
        "texture.specular"
    );
    assert!(
        report["boundaries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|boundary| boundary["code"] == "TN_RENDERER_CUSTOM_SHADER_UNSUPPORTED")
    );
}
