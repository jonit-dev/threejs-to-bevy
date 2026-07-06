use std::{fs, time::SystemTime};

use bevy::{app::PreUpdate, input::ButtonInput, prelude::*};
use threenative_components::ThreeNativeId;
use threenative_runtime::proof_harness::{
    NativeProofHarnessCommand, NativeProofHarnessCommandStream, NativeProofHarnessState,
    apply_native_proof_harness_commands, load_native_proof_harness_stream,
    native_proof_harness_transform_samples,
};

#[test]
fn should_apply_injected_action_exactly_at_requested_tick() {
    let root = temp_dir("input-injection");
    let readiness_path = root.join("readiness.json");
    let mut app = App::new();
    app.add_event::<AppExit>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(NativeProofHarnessState::from_stream(
        NativeProofHarnessCommandStream {
            schema: "threenative.native-proof-harness".to_owned(),
            version: "0.1.0".to_owned(),
            commands: vec![
                serde_json::from_value::<NativeProofHarnessCommand>(serde_json::json!({
                    "tick": 1,
                    "type": "key",
                    "code": "KeyW",
                    "pressed": true
                }))
                .expect("command should parse"),
                serde_json::from_value::<NativeProofHarnessCommand>(serde_json::json!({
                    "tick": 2,
                    "type": "key",
                    "code": "KeyW",
                    "pressed": false
                }))
                .expect("command should parse"),
            ],
        },
        readiness_path.display().to_string(),
    ));
    app.add_systems(PreUpdate, apply_native_proof_harness_commands);

    app.update();
    assert!(
        !app.world()
            .resource::<ButtonInput<KeyCode>>()
            .pressed(KeyCode::KeyW)
    );

    app.update();
    assert!(
        app.world()
            .resource::<ButtonInput<KeyCode>>()
            .pressed(KeyCode::KeyW)
    );

    app.update();
    assert!(
        !app.world()
            .resource::<ButtonInput<KeyCode>>()
            .pressed(KeyCode::KeyW)
    );

    fs::remove_dir_all(root).expect("temp proof harness dir should be removed");
}

#[test]
fn should_apply_shift_modifier_with_movement_key() {
    let root = temp_dir("input-shift-injection");
    let readiness_path = root.join("readiness.json");
    let mut app = App::new();
    app.add_event::<AppExit>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(NativeProofHarnessState::from_stream(
        NativeProofHarnessCommandStream {
            schema: "threenative.native-proof-harness".to_owned(),
            version: "0.1.0".to_owned(),
            commands: vec![
                serde_json::from_value::<NativeProofHarnessCommand>(serde_json::json!({
                    "tick": 1,
                    "type": "key",
                    "code": "ShiftLeft",
                    "pressed": true
                }))
                .expect("command should parse"),
                serde_json::from_value::<NativeProofHarnessCommand>(serde_json::json!({
                    "tick": 2,
                    "type": "key",
                    "code": "KeyW",
                    "pressed": true
                }))
                .expect("command should parse"),
            ],
        },
        readiness_path.display().to_string(),
    ));
    app.add_systems(PreUpdate, apply_native_proof_harness_commands);

    app.update();
    app.update();
    assert!(
        app.world()
            .resource::<ButtonInput<KeyCode>>()
            .pressed(KeyCode::ShiftLeft)
    );

    app.update();
    let keyboard = app.world().resource::<ButtonInput<KeyCode>>();
    assert!(keyboard.pressed(KeyCode::ShiftLeft));
    assert!(keyboard.pressed(KeyCode::KeyW));

    fs::remove_dir_all(root).expect("temp proof harness dir should be removed");
}

#[test]
fn should_write_readiness_json_matching_schema() {
    let root = temp_dir("readiness");
    let stream_path = root.join("commands.json");
    let readiness_path = root.join("nested/readiness.json");
    fs::write(
        &stream_path,
        serde_json::json!({
            "schema": "threenative.native-proof-harness",
            "version": "0.1.0",
            "commands": [
                { "tick": 0, "type": "key", "code": "KeyW", "pressed": true }
            ]
        })
        .to_string(),
    )
    .expect("command stream should be written");
    let stream = load_native_proof_harness_stream(&stream_path).expect("stream should load");

    let mut app = App::new();
    app.add_event::<AppExit>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(NativeProofHarnessState::from_stream(
        stream,
        readiness_path.display().to_string(),
    ));
    app.add_systems(PreUpdate, apply_native_proof_harness_commands);
    app.update();

    let readiness = fs::read_to_string(&readiness_path).expect("readiness should be written");
    let payload: serde_json::Value =
        serde_json::from_str(&readiness).expect("readiness should be valid json");
    assert_eq!(payload["schema"], "threenative.native-proof-readiness");
    assert_eq!(payload["version"], "0.1.0");
    assert_eq!(payload["ok"], true);
    assert_eq!(payload["tick"], 0);
    assert_eq!(payload["diagnostics"], serde_json::json!([]));
    assert!(payload["performance"]["elapsed_ms"].as_f64().is_some());
    assert!(payload["performance"]["frame_ms"].as_f64().is_some());
    assert!(payload["performance"]["fps"].as_f64().is_some());
    assert!(payload["transforms"].as_array().is_some());

    fs::remove_dir_all(root).expect("temp proof harness dir should be removed");
}

#[test]
fn should_parse_screenshot_commands_and_report_missing_window_as_warning() {
    let root = temp_dir("screenshot");
    let readiness_path = root.join("readiness.json");
    let screenshot_path = root.join("before.png");
    let mut app = App::new();
    app.add_event::<AppExit>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(NativeProofHarnessState::from_stream(
        NativeProofHarnessCommandStream {
            schema: "threenative.native-proof-harness".to_owned(),
            version: "0.1.0".to_owned(),
            commands: vec![
                serde_json::from_value::<NativeProofHarnessCommand>(serde_json::json!({
                    "tick": 0,
                    "type": "screenshot",
                    "path": screenshot_path.display().to_string()
                }))
                .expect("command should parse"),
            ],
        },
        readiness_path.display().to_string(),
    ));
    app.add_systems(PreUpdate, apply_native_proof_harness_commands);
    app.update();

    let readiness = fs::read_to_string(&readiness_path).expect("readiness should be written");
    let payload: serde_json::Value =
        serde_json::from_str(&readiness).expect("readiness should be valid json");
    assert_eq!(
        payload["diagnostics"][0]["code"],
        "TN_NATIVE_PROOF_SCREENSHOT_FAILED"
    );
    assert_eq!(payload["diagnostics"][0]["severity"], "warning");

    fs::remove_dir_all(root).expect("temp proof harness dir should be removed");
}

#[test]
fn should_snapshot_transform_positions_for_readiness() {
    let player = ThreeNativeId("player".to_owned());
    let player_transform = Transform::from_xyz(1.0, 2.0, 3.0);
    let samples = native_proof_harness_transform_samples([(&player, &player_transform)]);

    assert_eq!(samples.len(), 1);
    assert_eq!(samples[0].entity, "player");
    assert_eq!(samples[0].position, [1.0, 2.0, 3.0]);
}

fn temp_dir(name: &str) -> std::path::PathBuf {
    let stamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "tn-native-proof-harness-{name}-{}-{stamp}",
        std::process::id()
    ));
    fs::create_dir_all(&root).expect("temp proof harness dir should be created");
    root
}
