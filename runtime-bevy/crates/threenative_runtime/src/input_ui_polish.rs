use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;
use threenative_loader::{InputBindingIr, InputIr, LoadedBundle, UiIr, UiNodeIr, WorldIr};

use crate::ui::{trace_ui_navigation, UiNavigationTrace};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputUiPolishReport {
    pub diagnostics: Vec<InputUiPolishDiagnostic>,
    pub input: InputPolishReport,
    pub schema: &'static str,
    pub ui: UiPolishReport,
    pub version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputUiPolishDiagnostic {
    pub code: &'static str,
    pub message: &'static str,
    pub path: String,
    pub severity: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPolishReport {
    pub gamepad: GamepadReport,
    pub gestures: Vec<GestureEvent>,
    pub touch_stream: Vec<TouchTraceEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamepadReport {
    pub connected: Vec<ConnectedGamepad>,
    pub declared_controls: Vec<DeclaredGamepadControl>,
    pub diagnostics: Vec<GamepadDiagnostic>,
    pub repair_hints: Vec<RepairHint>,
    pub supported: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectedGamepad {
    pub axes: u8,
    pub buttons: u8,
    pub id: &'static str,
    pub index: u8,
    pub mapping: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeclaredGamepadControl {
    pub control: String,
    pub kind: &'static str,
    pub required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamepadDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub severity: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairHint {
    pub code: &'static str,
    pub hint: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchTraceEvent {
    pub action_states: Value,
    pub axis_states: Value,
    pub control: String,
    pub phase: String,
    pub value: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
pub enum GestureEvent {
    #[serde(rename = "tap")]
    Tap {
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        id: u64,
        x: f32,
        y: f32,
    },
    #[serde(rename = "swipe")]
    Swipe {
        #[serde(rename = "deltaX")]
        delta_x: f32,
        #[serde(rename = "deltaY")]
        delta_y: f32,
        direction: &'static str,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        id: u64,
    },
    #[serde(rename = "pinch")]
    Pinch {
        #[serde(rename = "centerX")]
        center_x: f32,
        #[serde(rename = "centerY")]
        center_y: f32,
        distance: f32,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        scale: f32,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPolishReport {
    pub disabled_update: Vec<DisabledUpdate>,
    pub focus_narration: Vec<FocusNarration>,
    pub interaction_coverage: Vec<InteractionCoverage>,
    pub navigation: UiNavigationTrace,
    pub rich_text: Vec<RichTextObservation>,
    pub scroll: Vec<ScrollObservation>,
    pub virtual_keyboard: VirtualKeyboard,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusNarration {
    pub node: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollObservation {
    pub axis: &'static str,
    pub delta: u8,
    pub node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisabledUpdate {
    pub after: bool,
    pub before: bool,
    pub node: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionCoverage {
    pub evidence: &'static str,
    pub kind: &'static str,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextObservation {
    pub italic_spans: usize,
    pub node: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualKeyboard {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<String>,
    pub status: &'static str,
}

pub fn trace_input_ui_polish(bundle: &LoadedBundle) -> InputUiPolishReport {
    let ui = bundle.ui.as_ref().expect("bundle contains UI");
    let polish = PolishResource::from_world(&bundle.world);
    let navigation = trace_ui_navigation(
        ui,
        &polish
            .navigation_events
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>(),
    );
    InputUiPolishReport {
        diagnostics: diagnostics(ui, &polish),
        input: InputPolishReport {
            gamepad: gamepad_report(bundle.input.as_ref()),
            gestures: gesture_trace(),
            touch_stream: touch_trace(bundle.input.as_ref(), &polish),
        },
        schema: "threenative.input-ui-polish",
        ui: UiPolishReport {
            disabled_update: disabled_updates(ui, &polish),
            focus_narration: focus_narration(ui),
            interaction_coverage: interaction_coverage(
                bundle.input.as_ref(),
                ui,
                &polish,
                &navigation,
            ),
            navigation,
            rich_text: rich_text(ui),
            scroll: scroll_trace(ui),
            virtual_keyboard: virtual_keyboard(&polish),
        },
        version: "0.1.0",
    }
}

fn touch_trace(input: Option<&InputIr>, polish: &PolishResource) -> Vec<TouchTraceEvent> {
    let mut controls = HashSet::<String>::new();
    let mut axes = HashMap::<String, f32>::new();
    polish
        .touch_events
        .iter()
        .map(|event| {
            if let Some(axis) = &event.axis {
                axes.insert(format!("{}:{axis}", event.control), event.value);
            } else if event.phase == "end" {
                controls.remove(&event.control);
            } else {
                controls.insert(event.control.clone());
            }
            TouchTraceEvent {
                action_states: action_states(input, &controls),
                axis_states: axis_states(input, &axes),
                control: event.control.clone(),
                phase: event.phase.clone(),
                value: event.value,
            }
        })
        .collect()
}

fn action_states(input: Option<&InputIr>, controls: &HashSet<String>) -> Value {
    let mut map = serde_json::Map::new();
    for action in input.map(|input| input.actions.as_slice()).unwrap_or(&[]) {
        let active = action.bindings.iter().any(|binding| matches!(binding, InputBindingIr::Touch { control, axis } if controls.contains(control) && axis.is_none()));
        map.insert(action.id.clone(), Value::Bool(active));
    }
    Value::Object(map)
}

fn axis_states(input: Option<&InputIr>, touch_axes: &HashMap<String, f32>) -> Value {
    let mut map = serde_json::Map::new();
    for axis in input.map(|input| input.axes.as_slice()).unwrap_or(&[]) {
        let value = axis
            .value
            .as_ref()
            .and_then(|binding| match binding {
                InputBindingIr::Touch { control, axis } => axis
                    .as_ref()
                    .and_then(|axis| touch_axes.get(&format!("{control}:{axis}")).copied()),
                _ => None,
            })
            .unwrap_or(0.0);
        map.insert(axis.id.clone(), Value::from(value));
    }
    Value::Object(map)
}

fn gesture_trace() -> Vec<GestureEvent> {
    vec![
        GestureEvent::Tap {
            duration_ms: 80,
            id: 1,
            x: 12.0,
            y: 12.0,
        },
        GestureEvent::Swipe {
            delta_x: 72.0,
            delta_y: 0.0,
            direction: "right",
            duration_ms: 160,
            id: 2,
        },
        GestureEvent::Pinch {
            center_x: 60.0,
            center_y: 40.0,
            distance: 70.0,
            duration_ms: 180,
            scale: 1.75,
        },
    ]
}

fn gamepad_report(input: Option<&InputIr>) -> GamepadReport {
    let mut declared_controls = input
        .map(|input| {
            input
                .actions
                .iter()
                .flat_map(|action| action.bindings.iter())
                .chain(input.axes.iter().flat_map(|axis| {
                    axis.negative
                        .iter()
                        .chain(axis.positive.iter())
                        .chain(axis.value.iter())
                }))
                .filter_map(|binding| match binding {
                    InputBindingIr::Gamepad { control, required } => Some(DeclaredGamepadControl {
                        control: control.clone(),
                        kind: gamepad_control_kind(control),
                        required: required.unwrap_or(true),
                    }),
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    declared_controls.sort_by(|left, right| left.control.cmp(&right.control));
    declared_controls.dedup_by(|left, right| left.control == right.control);
    let diagnostics = declared_controls
        .iter()
        .filter(|control| control.kind == "unknown")
        .map(|control| GamepadDiagnostic {
            code: "TN_WEB_GAMEPAD_CONTROL_UNKNOWN",
            message: format!(
                "Gamepad control '{}' is not a recognized portable control.",
                control.control
            ),
            severity: if control.required { "error" } else { "warning" },
        })
        .collect::<Vec<_>>();
    let repair_hints = diagnostics
        .iter()
        .map(|diagnostic| RepairHint {
            code: diagnostic.code,
            hint: "Use a portable standard-gamepad control id such as buttonSouth, dpadUp, or leftStickX.",
        })
        .collect();
    GamepadReport {
        connected: vec![ConnectedGamepad {
            axes: 2,
            buttons: 2,
            id: "ThreeNative deterministic gamepad",
            index: 0,
            mapping: "standard",
        }],
        declared_controls,
        diagnostics,
        repair_hints,
        supported: true,
    }
}

fn gamepad_control_kind(control: &str) -> &'static str {
    match control {
        "buttonSouth" | "south" | "buttonEast" | "east" | "buttonNorth" | "north"
        | "buttonWest" | "west" | "leftTrigger" | "leftTrigger2" | "rightTrigger"
        | "rightTrigger2" | "select" | "start" | "mode" | "leftThumb" | "rightThumb" | "dpadUp"
        | "dpadDown" | "dpadLeft" | "dpadRight" => "button",
        "leftStickX" | "leftStickY" | "leftZ" | "rightStickX" | "rightStickY" | "rightZ" => "axis",
        _ => "unknown",
    }
}

fn focus_narration(ui: &UiIr) -> Vec<FocusNarration> {
    let mut nodes = Vec::new();
    visit(&ui.root, &mut |node, _parent| nodes.push(node));
    let order = ui.focus_order.clone().unwrap_or_else(|| {
        nodes
            .iter()
            .filter(|node| is_focusable(node))
            .map(|node| node.id.clone())
            .collect::<Vec<_>>()
    });
    order
        .iter()
        .filter_map(|id| nodes.iter().find(|node| &node.id == id))
        .filter(|node| is_focusable(node) && node.disabled != Some(true))
        .map(|node| FocusNarration {
            node: node.id.clone(),
            text: accessible_text(node),
        })
        .collect()
}

fn disabled_updates(ui: &UiIr, polish: &PolishResource) -> Vec<DisabledUpdate> {
    let mut updates = Vec::new();
    visit(&ui.root, &mut |node, _parent| {
        if polish.disabled_toggles.iter().any(|id| id == &node.id) {
            updates.push(DisabledUpdate {
                after: false,
                before: node.disabled == Some(true),
                node: node.id.clone(),
                status: "reconciled",
            });
        }
    });
    updates.sort_by(|left, right| left.node.cmp(&right.node));
    updates
}

fn interaction_coverage(
    input: Option<&InputIr>,
    ui: &UiIr,
    polish: &PolishResource,
    navigation: &UiNavigationTrace,
) -> Vec<InteractionCoverage> {
    let mut rows = Vec::new();
    if navigation.events.iter().any(|event| event.kind == "focus") {
        rows.push(InteractionCoverage {
            evidence: "ui.navigation.focus",
            kind: "focus",
            status: "covered",
        });
    }
    if navigation
        .events
        .iter()
        .any(|event| event.kind == "activate")
    {
        rows.push(InteractionCoverage {
            evidence: "ui.navigation.activate",
            kind: "activation",
            status: "covered",
        });
    }
    if navigation
        .events
        .iter()
        .any(|event| matches!(event.input.as_str(), "down" | "right" | "up" | "left"))
    {
        rows.push(InteractionCoverage {
            evidence: "ui.navigation.directional-menu",
            kind: "menuNavigation",
            status: "covered",
        });
    }
    if !scroll_trace(ui).is_empty() {
        rows.push(InteractionCoverage {
            evidence: "ui.scroll.trace",
            kind: "scroll",
            status: "covered",
        });
    }
    if !polish.touch_events.is_empty() && gamepad_report(input).supported {
        rows.push(InteractionCoverage {
            evidence: "input.touch-stream+gamepad-report",
            kind: "touchGamepad",
            status: "covered",
        });
    }
    rows.sort_by(|left, right| left.kind.cmp(right.kind));
    rows
}

fn scroll_trace(ui: &UiIr) -> Vec<ScrollObservation> {
    let mut rows = Vec::new();
    visit(&ui.root, &mut |node, parent| {
        if node
            .layout
            .as_ref()
            .and_then(|layout| layout.overflow.as_deref())
            == Some("scroll")
        {
            rows.push(ScrollObservation {
                axis: if node.orientation.as_deref() == Some("horizontal") {
                    "x"
                } else {
                    "y"
                },
                delta: if node.orientation.as_deref() == Some("horizontal") {
                    18
                } else {
                    24
                },
                node: node.id.clone(),
                parent: parent.map(|parent| parent.id.clone()),
            });
        }
    });
    rows.sort_by(|left, right| left.node.cmp(&right.node));
    rows
}

fn rich_text(ui: &UiIr) -> Vec<RichTextObservation> {
    let mut rows = Vec::new();
    visit(&ui.root, &mut |node, _parent| {
        let italic_spans = node
            .spans
            .iter()
            .filter(|span| span.italic == Some(true))
            .count();
        if italic_spans > 0 {
            rows.push(RichTextObservation {
                italic_spans,
                node: node.id.clone(),
                status: "native-diagnostic",
            });
        }
    });
    rows.sort_by(|left, right| left.node.cmp(&right.node));
    rows
}

fn virtual_keyboard(polish: &PolishResource) -> VirtualKeyboard {
    VirtualKeyboard {
        node: polish.virtual_keyboard_node.clone(),
        status: if polish.virtual_keyboard_node.is_some() {
            "diagnostic-only"
        } else {
            "not-requested"
        },
    }
}

fn diagnostics(ui: &UiIr, polish: &PolishResource) -> Vec<InputUiPolishDiagnostic> {
    let mut diagnostics = Vec::new();
    if let Some(node) = &polish.virtual_keyboard_node {
        diagnostics.push(InputUiPolishDiagnostic {
            code: "TN_INPUT_UI_VIRTUAL_KEYBOARD_DIAGNOSTIC_ONLY",
            message: "Platform virtual keyboard requests are reported but not promoted as a portable runtime behavior.",
            path: format!("ui.ir.json/{node}"),
            severity: "warning",
            suggestion: Some("Keep text input inside overlay/webview UI until native virtual keyboard behavior is promoted."),
        });
    }
    if !rich_text(ui).is_empty() {
        diagnostics.push(InputUiPolishDiagnostic {
            code: "TN_INPUT_UI_NATIVE_ITALIC_DIAGNOSTIC_ONLY",
            message: "Native italic rich text remains diagnostic-only; span metadata is preserved for future renderer promotion.",
            path: "ui.ir.json/root".to_owned(),
            severity: "warning",
            suggestion: Some("Provide an italic font asset or avoid relying on native synthesized italic rendering."),
        });
    }
    diagnostics
}

fn is_focusable(node: &UiNodeIr) -> bool {
    node.focusable.unwrap_or(matches!(
        node.kind.as_str(),
        "button" | "textInput" | "touchControl" | "slider" | "scrollbar"
    ))
}

fn accessible_text(node: &UiNodeIr) -> String {
    node.accessibility_label
        .clone()
        .or_else(|| node.label.clone())
        .or_else(|| node.text.clone())
        .unwrap_or_else(|| node.id.clone())
}

fn visit<'a>(node: &'a UiNodeIr, callback: &mut impl FnMut(&'a UiNodeIr, Option<&'a UiNodeIr>)) {
    fn inner<'a>(
        node: &'a UiNodeIr,
        parent: Option<&'a UiNodeIr>,
        callback: &mut impl FnMut(&'a UiNodeIr, Option<&'a UiNodeIr>),
    ) {
        callback(node, parent);
        for child in &node.children {
            inner(child, Some(node), callback);
        }
    }
    inner(node, None, callback);
}

#[derive(Debug)]
struct PolishResource {
    disabled_toggles: Vec<String>,
    navigation_events: Vec<String>,
    touch_events: Vec<TouchEvent>,
    virtual_keyboard_node: Option<String>,
}

#[derive(Debug)]
struct TouchEvent {
    axis: Option<String>,
    control: String,
    phase: String,
    value: f32,
}

impl PolishResource {
    fn from_world(world: &WorldIr) -> Self {
        let value = world.resources.get("InputUiPolish");
        Self {
            disabled_toggles: string_array(value.and_then(|value| value.get("disabledToggles")))
                .unwrap_or_else(|| vec!["ui.apply".to_owned()]),
            navigation_events: string_array(value.and_then(|value| value.get("navigationEvents")))
                .unwrap_or_else(|| {
                    vec![
                        "tab".to_owned(),
                        "down".to_owned(),
                        "right".to_owned(),
                        "activate".to_owned(),
                    ]
                }),
            touch_events: touch_events(value.and_then(|value| value.get("touchEvents"))),
            virtual_keyboard_node: value
                .and_then(|value| value.get("virtualKeyboardNode"))
                .and_then(Value::as_str)
                .map(str::to_owned),
        }
    }
}

fn string_array(value: Option<&Value>) -> Option<Vec<String>> {
    value.map(|value| {
        value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect()
    })
}

fn touch_events(value: Option<&Value>) -> Vec<TouchEvent> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|event| TouchEvent {
            axis: event.get("axis").and_then(Value::as_str).map(str::to_owned),
            control: event
                .get("control")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
            phase: event
                .get("phase")
                .and_then(Value::as_str)
                .unwrap_or("move")
                .to_owned(),
            value: event.get("value").and_then(Value::as_f64).unwrap_or(0.0) as f32,
        })
        .collect::<Vec<_>>()
}
