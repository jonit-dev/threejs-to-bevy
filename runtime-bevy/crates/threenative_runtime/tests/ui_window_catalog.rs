use threenative_runtime::bevy_catalog_residuals::report_window_resize_and_scale_factor;

#[test]
fn should_report_window_resize_and_scale_factor_changes() {
    let report = report_window_resize_and_scale_factor(1600, 900, 1.5);

    assert_eq!(report["schema"], "threenative.bevy-catalog.window");
    assert_eq!(report["resize"]["width"], 1600);
    assert_eq!(report["resize"]["height"], 900);
    assert_eq!(report["resize"]["scaleFactor"], 1.5);
    assert_eq!(
        report["diagnostics"][0]["code"],
        "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED"
    );
}
