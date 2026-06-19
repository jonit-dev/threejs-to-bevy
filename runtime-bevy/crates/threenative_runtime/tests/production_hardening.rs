mod support;

use threenative_runtime::production_hardening::trace_production_hardening;

#[test]
fn should_report_production_audio_profiler_debug_and_boundaries() {
    let fixture = support::load_conformance_fixture("production-hardening");
    let report = trace_production_hardening(&fixture.bundle);

    assert_eq!(report["schema"], "threenative.production-hardening");
    assert_eq!(
        report["audio"]["mixer"]["effects"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    assert_eq!(report["profiler"]["capture"]["hostState"], "captured");
    assert_eq!(report["profiler"]["gpu"]["state"], "unavailable");
    assert_eq!(report["debug"]["enabled"], true);
    assert!(
        report["boundaries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|boundary| boundary["code"] == "TN_AUDIO_CUSTOM_DECODER_UNSUPPORTED")
    );
}
