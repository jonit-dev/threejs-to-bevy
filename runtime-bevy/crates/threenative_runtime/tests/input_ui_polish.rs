use std::path::PathBuf;

use threenative_loader::load_bundle;
use threenative_runtime::input_ui_polish::trace_input_ui_polish;

#[test]
fn should_report_input_ui_polish_fixture() {
    let bundle = load_bundle(fixture_path()).expect("input UI polish fixture should load");
    let report = trace_input_ui_polish(&bundle);

    assert_eq!(report.schema, "threenative.input-ui-polish");
    assert_eq!(report.input.touch_stream.len(), 4);
    assert_eq!(report.input.gamepad.connected[0].mapping, "standard");
    assert_eq!(report.input.gamepad.repair_hints.len(), 0);
    assert_eq!(report.ui.disabled_update[0].node, "ui.apply");
    assert_eq!(report.ui.scroll[0].node, "ui.controls");
    assert_eq!(report.ui.focus_narration[0].text, "Player name");
    assert_eq!(report.ui.virtual_keyboard.status, "diagnostic-only");
    assert!(report.diagnostics.iter().any(|diagnostic| diagnostic.code == "TN_INPUT_UI_NATIVE_ITALIC_DIAGNOSTIC_ONLY"));
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("packages/ir/fixtures/conformance/input-ui-polish/game.bundle")
}
