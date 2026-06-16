use std::collections::VecDeque;

use serde_json::Value;
use threenative_loader::{OverlayIr, OverlaysIr};

#[derive(Clone, Debug, PartialEq)]
pub struct OverlayBridgeEnvelope {
    pub overlay_id: String,
    pub message_type: String,
    pub payload: Value,
    pub sequence: u64,
    pub timestamp: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OverlayDiagnostic {
    pub code: String,
    pub message: String,
    pub overlay_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeOverlayInputPolicy {
    pub captures_keyboard: bool,
    pub captures_pointer: bool,
    pub modal: bool,
}

#[derive(Debug)]
pub struct NativeOverlayBridge {
    diagnostics: Vec<OverlayDiagnostic>,
    events: Vec<OverlayBridgeEnvelope>,
    sequence: u64,
    snapshots: VecDeque<OverlayBridgeEnvelope>,
}

impl NativeOverlayBridge {
    pub fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            events: Vec::new(),
            sequence: 0,
            snapshots: VecDeque::with_capacity(64),
        }
    }

    pub fn diagnostics(&self) -> &[OverlayDiagnostic] {
        &self.diagnostics
    }

    pub fn events(&self) -> &[OverlayBridgeEnvelope] {
        &self.events
    }

    pub fn snapshots(&self) -> &VecDeque<OverlayBridgeEnvelope> {
        &self.snapshots
    }

    pub fn receive_overlay_message(
        &mut self,
        overlays: &OverlaysIr,
        overlay_id: &str,
        message_type: &str,
        payload: Value,
    ) -> bool {
        let Some(overlay) = overlays
            .overlays
            .iter()
            .find(|overlay| overlay.id == overlay_id)
        else {
            self.reject(overlay_id, "TN_OVERLAY_UNKNOWN", "Overlay is not declared.");
            return false;
        };
        let Some(message) = overlay
            .messages
            .overlay_to_game
            .iter()
            .find(|message| message.name == message_type)
        else {
            self.reject(
                overlay_id,
                "TN_OVERLAY_MESSAGE_REJECTED",
                "Overlay message is not declared.",
            );
            return false;
        };
        if !matches_schema(
            &payload,
            &message.schema.kind,
            &message.schema.fields,
            &message.schema.required,
        ) {
            self.reject(
                overlay_id,
                "TN_OVERLAY_MESSAGE_REJECTED",
                "Overlay message failed schema validation.",
            );
            return false;
        }
        self.sequence += 1;
        self.events.push(OverlayBridgeEnvelope {
            overlay_id: overlay_id.to_owned(),
            message_type: message_type.to_owned(),
            payload,
            sequence: self.sequence,
            timestamp: 0,
        });
        true
    }

    pub fn publish_game_message(
        &mut self,
        overlays: &OverlaysIr,
        overlay_id: &str,
        message_type: &str,
        payload: Value,
    ) -> bool {
        let Some(overlay) = overlays
            .overlays
            .iter()
            .find(|overlay| overlay.id == overlay_id)
        else {
            self.reject(overlay_id, "TN_OVERLAY_UNKNOWN", "Overlay is not declared.");
            return false;
        };
        let Some(message) = overlay
            .messages
            .game_to_overlay
            .iter()
            .find(|message| message.name == message_type)
        else {
            self.reject(
                overlay_id,
                "TN_OVERLAY_MESSAGE_REJECTED",
                "Game-to-overlay message is not declared.",
            );
            return false;
        };
        if !matches_schema(
            &payload,
            &message.schema.kind,
            &message.schema.fields,
            &message.schema.required,
        ) {
            self.reject(
                overlay_id,
                "TN_OVERLAY_MESSAGE_REJECTED",
                "Game-to-overlay message failed schema validation.",
            );
            return false;
        }
        self.sequence += 1;
        if self.snapshots.len() == 64 {
            self.snapshots.pop_front();
        }
        self.snapshots.push_back(OverlayBridgeEnvelope {
            overlay_id: overlay_id.to_owned(),
            message_type: message_type.to_owned(),
            payload,
            sequence: self.sequence,
            timestamp: 0,
        });
        true
    }

    fn reject(&mut self, overlay_id: &str, code: &str, message: &str) {
        self.diagnostics.push(OverlayDiagnostic {
            code: code.to_owned(),
            message: message.to_owned(),
            overlay_id: overlay_id.to_owned(),
        });
    }
}

pub fn native_overlay_input_policy(input: &str) -> NativeOverlayInputPolicy {
    match input {
        "pointer" => NativeOverlayInputPolicy {
            captures_keyboard: false,
            captures_pointer: true,
            modal: false,
        },
        "keyboard" => NativeOverlayInputPolicy {
            captures_keyboard: true,
            captures_pointer: false,
            modal: false,
        },
        "pointer-and-keyboard" => NativeOverlayInputPolicy {
            captures_keyboard: true,
            captures_pointer: true,
            modal: false,
        },
        "modal" => NativeOverlayInputPolicy {
            captures_keyboard: true,
            captures_pointer: true,
            modal: true,
        },
        _ => NativeOverlayInputPolicy {
            captures_keyboard: false,
            captures_pointer: false,
            modal: false,
        },
    }
}

pub fn report_unsupported_desktop_webview(overlays: Option<&OverlaysIr>) -> Vec<OverlayDiagnostic> {
    overlays
        .into_iter()
        .flat_map(|overlays| overlays.overlays.iter())
        .filter(|overlay| overlay.target_profiles.iter().any(|profile| profile == "desktop"))
        .map(|overlay| OverlayDiagnostic {
            code: "TN_OVERLAY_TARGET_UNSUPPORTED".to_owned(),
            message: "Native desktop webview overlays are declared but no adapter-private webview host is enabled in this runtime build.".to_owned(),
            overlay_id: overlay.id.clone(),
        })
        .collect()
}

pub fn sorted_overlay_mount_order(overlays: &OverlaysIr) -> Vec<&OverlayIr> {
    let mut ordered: Vec<&OverlayIr> = overlays.overlays.iter().collect();
    ordered.sort_by_key(|overlay| overlay.z_index);
    ordered
}

fn matches_schema(
    payload: &Value,
    kind: &str,
    fields: &std::collections::HashMap<String, String>,
    required: &[String],
) -> bool {
    if kind != "object" {
        return false;
    }
    let Some(object) = payload.as_object() else {
        return false;
    };
    if required.iter().any(|field| !object.contains_key(field)) {
        return false;
    }
    object.iter().all(|(key, value)| {
        fields
            .get(key)
            .is_some_and(|kind| matches_value_kind(value, kind))
    })
}

fn matches_value_kind(value: &Value, kind: &str) -> bool {
    match kind {
        "boolean" => value.is_boolean(),
        "integer" => value.as_i64().is_some(),
        "number" => value.as_f64().is_some(),
        "object" => value.is_object(),
        "string" => value.is_string(),
        _ => false,
    }
}
