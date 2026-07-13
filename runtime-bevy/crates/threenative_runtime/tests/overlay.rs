use std::collections::HashMap;
use std::fs;

use serde_json::json;
use threenative_loader::{
    OverlayBridgeMessagesIr, OverlayIr, OverlayMessageIr, OverlayMessageSchemaIr, OverlaysIr,
};
use threenative_runtime::overlay::{
    NativeOverlayBridge, native_overlay_input_policy, report_unsupported_desktop_webview,
};

#[test]
fn validates_native_overlay_bridge_envelopes() {
    let overlays = make_overlays();
    let mut bridge = NativeOverlayBridge::new();

    assert!(bridge.receive_overlay_message(
        &overlays,
        "inventory",
        "inventory:use-item",
        json!({ "itemId": "potion" }),
    ));
    assert_eq!(bridge.events().len(), 1);

    assert!(!bridge.receive_overlay_message(
        &overlays,
        "inventory",
        "inventory:drop-item",
        json!({ "itemId": "potion" }),
    ));
    assert_eq!(bridge.diagnostics()[0].code, "TN_OVERLAY_MESSAGE_REJECTED");
}

#[test]
fn records_overlay_bridge_trace() {
    let overlays = make_overlays();
    let mut bridge = NativeOverlayBridge::new();

    assert!(bridge.publish_game_message(
        &overlays,
        "inventory",
        "inventory:snapshot",
        json!({ "gold": 7 }),
    ));

    let snapshot = bridge.snapshots().front().expect("snapshot queued");
    assert_eq!(snapshot.overlay_id, "inventory");
    assert_eq!(snapshot.message_type, "inventory:snapshot");
    assert_eq!(snapshot.payload, json!({ "gold": 7 }));
}

#[test]
fn routes_native_overlay_events_both_directions_through_world_queues() {
    let overlays = make_overlays();
    let mut bridge = NativeOverlayBridge::new();
    assert!(bridge.receive_overlay_message(
        &overlays,
        "inventory",
        "inventory:use-item",
        json!({ "itemId": "potion" })
    ));
    let mut world_events = HashMap::new();
    bridge.drain_events_into(&mut world_events);
    assert_eq!(
        world_events["inventory:use-item"],
        json!([{ "itemId": "potion" }])
    );

    world_events.insert("inventory:snapshot".to_owned(), json!([{ "gold": 9 }]));
    bridge.publish_world_events(&overlays, &world_events);
    assert_eq!(
        bridge.snapshots().back().map(|entry| &entry.payload),
        Some(&json!({ "gold": 9 }))
    );
}

#[test]
fn reports_unsupported_desktop_overlay_webview_capability() {
    let diagnostics = report_unsupported_desktop_webview(Some(&make_overlays()));

    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, "TN_OVERLAY_TARGET_UNSUPPORTED");
}

#[test]
fn maps_overlay_input_capture_modes_without_stealing_bevy_clicks() {
    let none = native_overlay_input_policy("none");
    assert!(!none.captures_pointer);
    assert!(!none.captures_keyboard);

    let pointer = native_overlay_input_policy("pointer");
    assert!(pointer.captures_pointer);
    assert!(!pointer.captures_keyboard);

    let modal = native_overlay_input_policy("modal");
    assert!(modal.captures_pointer);
    assert!(modal.captures_keyboard);
    assert!(modal.modal);
}

#[test]
fn validates_shared_overlay_payload_conformance_vectors() {
    let fixture_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/ir/fixtures/overlay-payload-validation.json"
    );
    let fixture: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(fixture_path).expect("shared overlay vectors"))
            .expect("valid vectors json");
    let schema = &fixture["schema"];
    let fields = schema["fields"]
        .as_object()
        .expect("schema fields")
        .iter()
        .map(|(name, kind)| (name.clone(), kind.as_str().expect("kind").to_owned()))
        .collect();
    let required = schema["required"]
        .as_array()
        .expect("required")
        .iter()
        .map(|value| value.as_str().expect("required name").to_owned())
        .collect();
    let overlays = OverlaysIr {
        schema: "threenative.overlays".to_owned(),
        version: "0.2.0".to_owned(),
        overlays: vec![OverlayIr {
            id: "vectors".to_owned(),
            entry: "overlay/index.html".to_owned(),
            transparent: true,
            z_index: 1,
            input: "none".to_owned(),
            layout: None,
            messages: OverlayBridgeMessagesIr {
                overlay_to_game: vec![],
                game_to_overlay: vec![OverlayMessageIr {
                    name: "vectors:snapshot".to_owned(),
                    schema: OverlayMessageSchemaIr {
                        kind: "object".to_owned(),
                        fields,
                        required,
                    },
                }],
            },
            target_profiles: vec!["desktop".to_owned()],
        }],
    };
    for vector in fixture["vectors"].as_array().expect("vectors") {
        let mut payload = vector["payload"].clone();
        if let Some(bytes) = vector["paddingBytes"].as_u64() {
            payload
                .as_object_mut()
                .expect("payload object")
                .insert("label".to_owned(), json!("x".repeat(bytes as usize)));
        }
        let mut bridge = NativeOverlayBridge::new();
        let accepted =
            bridge.publish_game_message(&overlays, "vectors", "vectors:snapshot", payload);
        assert_eq!(
            accepted,
            vector["valid"].as_bool().expect("valid"),
            "{}",
            vector["name"]
        );
        if !accepted {
            assert_eq!(
                bridge
                    .diagnostics()
                    .last()
                    .map(|diagnostic| diagnostic.code.as_str()),
                vector["code"].as_str()
            );
        }
    }
}

fn make_overlays() -> OverlaysIr {
    OverlaysIr {
        schema: "threenative.overlays".to_owned(),
        version: "0.1.0".to_owned(),
        overlays: vec![OverlayIr {
            id: "inventory".to_owned(),
            entry: "overlay/index.html".to_owned(),
            transparent: true,
            z_index: 20,
            input: "pointer".to_owned(),
            layout: None,
            messages: OverlayBridgeMessagesIr {
                overlay_to_game: vec![OverlayMessageIr {
                    name: "inventory:use-item".to_owned(),
                    schema: OverlayMessageSchemaIr {
                        kind: "object".to_owned(),
                        fields: HashMap::from([("itemId".to_owned(), "string".to_owned())]),
                        required: vec!["itemId".to_owned()],
                    },
                }],
                game_to_overlay: vec![OverlayMessageIr {
                    name: "inventory:snapshot".to_owned(),
                    schema: OverlayMessageSchemaIr {
                        kind: "object".to_owned(),
                        fields: HashMap::from([("gold".to_owned(), "integer".to_owned())]),
                        required: vec!["gold".to_owned()],
                    },
                }],
            },
            target_profiles: vec!["desktop".to_owned(), "web".to_owned()],
        }],
    }
}
