use threenative_runtime::debug_overlay::{
    NativeDebugCounter, NativeDebugDrawPrimitive, observe_debug_overlay,
};

#[test]
fn should_report_debug_draw_observations_when_native_overlay_is_enabled() {
    let report = observe_debug_overlay(
        Some(60.0),
        &[
            NativeDebugDrawPrimitive {
                id: "line.forward".to_owned(),
                kind: "line".to_owned(),
                label: None,
                lifetime_seconds: Some(0.25),
            },
            NativeDebugDrawPrimitive {
                id: "label.player".to_owned(),
                kind: "textLabel".to_owned(),
                label: Some("Player".to_owned()),
                lifetime_seconds: None,
            },
        ],
        &[NativeDebugCounter {
            category: "gameplay".to_owned(),
            id: "counter.enemies".to_owned(),
            label: "Enemies".to_owned(),
            severity: "warning".to_owned(),
            value: 4.0,
        }],
    );

    assert!(report.enabled);
    assert_eq!(report.primitives[0].id, "label.player");
    assert_eq!(report.primitives[0].label.as_deref(), Some("Player"));
    assert_eq!(report.primitives[1].id, "line.forward");
    assert_eq!(report.counters[0].label, "Enemies");
}
