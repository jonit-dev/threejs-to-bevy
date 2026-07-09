use std::{env, path::PathBuf, process};

use bevy::prelude::App;
use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::{
    trace_report::write_pretty_json_report,
    ui::{
        NativeUiAttachmentProjectionTrace, NativeUiEffectPresetTrace, NativeUiImageRenderTrace,
        NativeUiTextEditOperation, NativeUiTextEditTrace, NativeUiVisualEffectTrace,
        map_ui_into_world, trace_native_ui_attachment_projection, trace_native_ui_effect_presets,
        trace_native_ui_image_rendering, trace_native_ui_text_edit, trace_native_ui_visual_effects,
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiNativeTraceReport {
    accessibility: AccessibilityCapabilityReport,
    attachments: NativeUiAttachmentProjectionTrace,
    effects: NativeUiEffectPresetTrace,
    images: NativeUiImageRenderTrace,
    schema: &'static str,
    text_edit: NativeUiTextEditTrace,
    version: &'static str,
    visual_effects: NativeUiVisualEffectTrace,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccessibilityCapabilityReport {
    focus_narration: &'static str,
    metadata_bridge: &'static str,
    platform_screen_reader: &'static str,
    target: &'static str,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let bundle_path = args.next().ok_or("missing bundle path")?;
    let output_path = PathBuf::from(args.next().ok_or("missing output path")?);
    let bundle = load_bundle(bundle_path)?;
    let ui = bundle
        .ui
        .as_ref()
        .ok_or("bundle does not contain ui.ir.json")?;
    let mut app = App::new();
    map_ui_into_world(app.world_mut(), ui)?;
    let report = UiNativeTraceReport {
        accessibility: AccessibilityCapabilityReport {
            focus_narration: "metadata-proved",
            metadata_bridge: "accesskit",
            platform_screen_reader: "manual-platform-proof-required",
            target: "desktop-bevy",
        },
        attachments: trace_native_ui_attachment_projection(
            ui,
            "enemy.1",
            [8.0, 0.0, 12.0],
            "camera.main",
            [1280.0, 720.0],
        ),
        effects: trace_native_ui_effect_presets(ui, &["selected", "focus"]),
        images: trace_native_ui_image_rendering(app.world_mut()),
        schema: "threenative.ui-native-trace",
        text_edit: trace_native_ui_text_edit(
            "Nova",
            &[
                NativeUiTextEditOperation::Move(-1),
                NativeUiTextEditOperation::Insert("r".to_owned()),
                NativeUiTextEditOperation::Backspace,
            ],
        ),
        version: "0.1.0",
        visual_effects: trace_native_ui_visual_effects(app.world_mut()),
    };
    write_pretty_json_report(output_path, &report)
}
