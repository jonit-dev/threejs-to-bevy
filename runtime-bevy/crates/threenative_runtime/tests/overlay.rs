use std::collections::HashMap;

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
