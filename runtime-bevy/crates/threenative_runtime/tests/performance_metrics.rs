mod support;

use threenative_runtime::performance_metrics::{
    NativePerformanceMetric, trace_native_performance_metrics,
};

#[test]
fn performance_metrics_should_report_unsupported_native_counters() {
    let fixture = support::load_conformance_fixture("rendering-residuals");
    let report = trace_native_performance_metrics(&fixture.bundle);

    assert_eq!(report.schema, "threenative.native-performance-metrics");
    assert_eq!(report.runtime.adapter, "bevy");
    assert_eq!(report.runtime.target, "desktop");
    assert!(matches!(
        metric(&report.metrics, "frameTimeMs"),
        NativePerformanceMetric::Unsupported { diagnostic, .. }
            if diagnostic.code == "TN_PERFORMANCE_NATIVE_FRAME_TIME_UNSUPPORTED"
                && diagnostic.severity == "warning"
    ));
    assert!(matches!(
        metric(&report.metrics, "drawCalls"),
        NativePerformanceMetric::Unsupported { diagnostic, .. }
            if diagnostic.code == "TN_PERFORMANCE_NATIVE_DRAW_CALLS_UNSUPPORTED"
    ));
}

#[test]
fn performance_metrics_should_report_static_bundle_counters() {
    let fixture = support::load_conformance_fixture("rendering-residuals");
    let report = trace_native_performance_metrics(&fixture.bundle);

    assert!(matches!(
        metric(&report.metrics, "entityCount"),
        NativePerformanceMetric::Measured { value, .. }
            if value.as_u64() == Some(fixture.bundle.world.entities.len() as u64)
    ));
    assert!(matches!(
        metric(&report.metrics, "activeLodBands"),
        NativePerformanceMetric::Measured { value, .. }
            if value.as_array().is_some_and(|bands| !bands.is_empty())
    ));
}

fn metric<'a>(metrics: &'a [NativePerformanceMetric], key: &str) -> &'a NativePerformanceMetric {
    metrics
        .iter()
        .find(|metric| match metric {
            NativePerformanceMetric::Measured {
                key: metric_key, ..
            }
            | NativePerformanceMetric::Unsupported {
                key: metric_key, ..
            } => *metric_key == key,
        })
        .expect("metric should exist")
}
