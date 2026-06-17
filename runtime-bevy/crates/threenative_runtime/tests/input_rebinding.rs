use std::fs;

use threenative_loader::{
    ControlsSettingsIr, ControlsSettingsRowIr, InputActionIr, InputBindingIr, InputIr,
    PersistedBindingOverrideIr,
};
use threenative_runtime::input::{
    apply_native_persisted_binding_overrides, load_native_persisted_binding_overrides,
    persist_native_binding_override,
};

#[test]
fn should_persist_and_reload_native_control_binding_overrides() {
    let root = std::env::temp_dir().join(format!(
        "tn-native-input-rebinding-{}",
        std::process::id()
    ));
    let settings_path = root.join("controls.json");
    let _ = fs::remove_dir_all(&root);

    let override_record = PersistedBindingOverrideIr {
        action_or_axis_id: "Jump".to_owned(),
        axis_slot: None,
        control: "KeyJ".to_owned(),
        deadzone: None,
        device: "keyboard".to_owned(),
        modifiers: None,
        profile_id: "default".to_owned(),
        scale: None,
        updated_at: "2026-06-17T00:00:00.000Z".to_owned(),
    };
    persist_native_binding_override(&settings_path, override_record).unwrap();

    let reloaded = load_native_persisted_binding_overrides(&settings_path);
    let resolved = apply_native_persisted_binding_overrides(&make_input(), &reloaded, None);

    assert!(matches!(
        resolved.actions[0].bindings.as_slice(),
        [InputBindingIr::Keyboard { code }] if code == "KeyJ"
    ));
    assert_eq!(reloaded[0].action_or_axis_id, "Jump");
    assert_eq!(reloaded[0].control, "KeyJ");

    let _ = fs::remove_dir_all(&root);
}

fn make_input() -> InputIr {
    InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Jump".to_owned(),
            bindings: vec![InputBindingIr::Keyboard {
                code: "Space".to_owned(),
            }],
        }],
        axes: vec![],
        controls_settings: Some(ControlsSettingsIr {
            profile_id: "default".to_owned(),
            rows: vec![ControlsSettingsRowIr {
                action_or_axis_id: "Jump".to_owned(),
                axis_slot: None,
                capture_state: Some("idle".to_owned()),
                default_bindings: vec![InputBindingIr::Keyboard {
                    code: "Space".to_owned(),
                }],
                kind: "action".to_owned(),
                ui_node_id: Some("settings.jump".to_owned()),
            }],
        }),
        persisted_binding_overrides: vec![],
    }
}
