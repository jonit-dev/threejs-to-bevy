use std::collections::{HashMap, HashSet};

use bevy::{
    input::{
        gamepad::{GamepadAxis, GamepadAxisType, GamepadButton, GamepadButtonType, Gamepads},
        mouse::MouseMotion,
        ButtonInput,
    },
    prelude::*,
    window::PrimaryWindow,
};
use threenative_loader::{InputBindingIr, InputIr};

#[derive(Clone, Debug, Resource)]
pub struct NativeInputMap(pub InputIr);

#[derive(Debug, Default, Resource)]
pub struct NativeInputState {
    actions: HashSet<String>,
    axes: HashMap<String, f32>,
}

#[derive(Debug, Default, Resource)]
pub struct NativeTouchState {
    controls: HashSet<String>,
    axes: HashMap<(String, String), f32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeGamepadCapabilityReport {
    pub connected: Vec<NativeGamepadDeviceReport>,
    pub declared_controls: Vec<NativeGamepadControlReport>,
    pub diagnostics: Vec<NativeGamepadDiagnostic>,
    pub supported: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeGamepadDeviceReport {
    pub index: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeGamepadControlReport {
    pub control: String,
    pub kind: String,
    pub required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeGamepadDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativeInputRebindTarget {
    Action {
        binding_index: Option<usize>,
        id: String,
    },
    Axis {
        binding_index: Option<usize>,
        id: String,
        slot: NativeInputAxisRebindSlot,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativeInputAxisRebindSlot {
    Negative,
    Positive,
    Value,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeInputRebindDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Clone, Debug)]
pub struct NativeInputRebindResult {
    pub diagnostics: Vec<NativeInputRebindDiagnostic>,
    pub input: InputIr,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTouchGesturePoint {
    pub id: u64,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeTouchGestureEvent {
    Tap {
        duration_ms: f32,
        id: u64,
        x: f32,
        y: f32,
    },
    Swipe {
        delta_x: f32,
        delta_y: f32,
        direction: String,
        duration_ms: f32,
        id: u64,
    },
    Pinch {
        center_x: f32,
        center_y: f32,
        distance: f32,
        duration_ms: f32,
        scale: f32,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeDragPickingFrame {
    pub button_down: bool,
    pub picked_entity: Option<String>,
    pub pointer: [f64; 2],
    pub time_ms: f64,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NativeDragPickingEvent {
    #[serde(rename = "start")]
    Start {
        entity: String,
        pointer: [f64; 2],
        #[serde(rename = "timeMs")]
        time_ms: f64,
    },
    #[serde(rename = "move")]
    Move {
        delta: [f64; 2],
        entity: String,
        pointer: [f64; 2],
        #[serde(rename = "timeMs")]
        time_ms: f64,
    },
    #[serde(rename = "drop")]
    Drop {
        delta: [f64; 2],
        entity: String,
        pointer: [f64; 2],
        #[serde(skip_serializing_if = "Option::is_none")]
        target: Option<String>,
        #[serde(rename = "timeMs")]
        time_ms: f64,
    },
    #[serde(rename = "cancel")]
    Cancel {
        entity: String,
        pointer: [f64; 2],
        #[serde(rename = "timeMs")]
        time_ms: f64,
    },
}

#[derive(Clone, Debug)]
pub struct NativeDragPickingTracker {
    active: Option<ActiveDragPicking>,
    move_threshold: f64,
}

#[derive(Clone, Debug, Default)]
pub struct NativeTouchGestureTracker {
    active_pinch: Option<ActivePinchGesture>,
    active_single: Option<ActiveSingleTouchGesture>,
    previous_touch_count: usize,
}

impl NativeInputState {
    pub fn action(&self, id: &str) -> bool {
        self.actions.contains(id)
    }

    pub fn axis(&self, id: &str) -> f32 {
        self.axes.get(id).copied().unwrap_or(0.0)
    }

    pub fn action_ids(&self) -> impl Iterator<Item = &String> {
        self.actions.iter()
    }

    pub fn axes(&self) -> impl Iterator<Item = (&String, &f32)> {
        self.axes.iter()
    }
}

impl NativeTouchState {
    pub fn set_control(&mut self, control: impl Into<String>, active: bool) {
        let control = control.into();
        if active {
            self.controls.insert(control);
        } else {
            self.controls.remove(&control);
        }
    }

    pub fn set_axis(&mut self, control: impl Into<String>, axis: impl Into<String>, value: f32) {
        self.axes
            .insert((control.into(), axis.into()), value.clamp(-1.0, 1.0));
    }

    fn control_active(&self, control: &str) -> bool {
        self.controls.contains(control)
    }

    fn axis(&self, control: &str, axis: &str) -> f32 {
        self.axes
            .get(&(control.to_owned(), axis.to_owned()))
            .copied()
            .unwrap_or(0.0)
    }
}

impl NativeTouchGestureTracker {
    pub fn update(
        &mut self,
        time_ms: f32,
        touches: &[NativeTouchGesturePoint],
    ) -> Vec<NativeTouchGestureEvent> {
        let mut events = Vec::new();
        if touches.len() == 1 {
            let touch = &touches[0];
            if self.previous_touch_count != 1
                || self
                    .active_single
                    .as_ref()
                    .map(|active| active.id != touch.id)
                    .unwrap_or(true)
            {
                self.active_single = Some(ActiveSingleTouchGesture {
                    id: touch.id,
                    start_time_ms: time_ms,
                    start_x: touch.x,
                    start_y: touch.y,
                    x: touch.x,
                    y: touch.y,
                });
            } else if let Some(active) = self.active_single.as_mut() {
                active.x = touch.x;
                active.y = touch.y;
            }
            self.active_pinch = None;
        } else if touches.len() >= 2 {
            let pinch = pinch_state(&touches[0], &touches[1]);
            if self.previous_touch_count < 2 || self.active_pinch.is_none() {
                self.active_pinch = Some(ActivePinchGesture {
                    center_x: pinch.center_x,
                    center_y: pinch.center_y,
                    distance: pinch.distance,
                    start_distance: pinch.distance,
                    start_time_ms: time_ms,
                });
            } else if let Some(active) = self.active_pinch.as_mut() {
                active.center_x = pinch.center_x;
                active.center_y = pinch.center_y;
                active.distance = pinch.distance;
            }
            self.active_single = None;
        } else {
            if self.previous_touch_count == 1 {
                if let Some(active) = self.active_single.as_ref() {
                    if let Some(event) = classify_single_touch(active, time_ms) {
                        events.push(event);
                    }
                }
            }
            if self.previous_touch_count >= 2 {
                if let Some(active) = self.active_pinch.as_ref() {
                    if let Some(event) = classify_pinch(active, time_ms) {
                        events.push(event);
                    }
                }
            }
            self.active_single = None;
            self.active_pinch = None;
        }
        self.previous_touch_count = touches.len();
        events
    }
}

impl Default for NativeDragPickingTracker {
    fn default() -> Self {
        Self::new(0.005)
    }
}

impl NativeDragPickingTracker {
    pub fn new(move_threshold: f64) -> Self {
        Self {
            active: None,
            move_threshold,
        }
    }

    pub fn update(&mut self, frame: NativeDragPickingFrame) -> Vec<NativeDragPickingEvent> {
        let mut events = Vec::new();
        if frame.button_down {
            if self.active.is_none() {
                if let Some(entity) = frame.picked_entity.as_ref() {
                    self.active = Some(ActiveDragPicking {
                        entity: entity.clone(),
                        pointer: frame.pointer,
                        start: frame.pointer,
                        started: false,
                    });
                }
            }
            if let Some(active) = self.active.as_mut() {
                let delta = [
                    round_f64(frame.pointer[0] - active.pointer[0]),
                    round_f64(frame.pointer[1] - active.pointer[1]),
                ];
                let total_distance = distance2(frame.pointer, active.start);
                if !active.started && total_distance >= self.move_threshold {
                    active.started = true;
                    events.push(NativeDragPickingEvent::Start {
                        entity: active.entity.clone(),
                        pointer: active.start,
                        time_ms: frame.time_ms,
                    });
                }
                if active.started && (delta[0] != 0.0 || delta[1] != 0.0) {
                    events.push(NativeDragPickingEvent::Move {
                        delta,
                        entity: active.entity.clone(),
                        pointer: frame.pointer,
                        time_ms: frame.time_ms,
                    });
                }
                if active.started {
                    active.pointer = frame.pointer;
                }
            }
            return events;
        }

        let Some(active) = self.active.take() else {
            return events;
        };
        if active.started {
            events.push(NativeDragPickingEvent::Drop {
                delta: [
                    round_f64(frame.pointer[0] - active.start[0]),
                    round_f64(frame.pointer[1] - active.start[1]),
                ],
                entity: active.entity,
                pointer: frame.pointer,
                target: frame.picked_entity,
                time_ms: frame.time_ms,
            });
        } else {
            events.push(NativeDragPickingEvent::Cancel {
                entity: active.entity,
                pointer: frame.pointer,
                time_ms: frame.time_ms,
            });
        }
        events
    }
}

#[derive(Clone, Debug)]
struct ActiveDragPicking {
    entity: String,
    pointer: [f64; 2],
    start: [f64; 2],
    started: bool,
}

#[derive(Clone, Debug)]
struct ActiveSingleTouchGesture {
    id: u64,
    start_time_ms: f32,
    start_x: f32,
    start_y: f32,
    x: f32,
    y: f32,
}

#[derive(Clone, Debug)]
struct ActivePinchGesture {
    center_x: f32,
    center_y: f32,
    distance: f32,
    start_distance: f32,
    start_time_ms: f32,
}

struct PinchState {
    center_x: f32,
    center_y: f32,
    distance: f32,
}

fn distance2(left: [f64; 2], right: [f64; 2]) -> f64 {
    (left[0] - right[0]).hypot(left[1] - right[1])
}

fn round_f64(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

fn classify_single_touch(
    touch: &ActiveSingleTouchGesture,
    end_time_ms: f32,
) -> Option<NativeTouchGestureEvent> {
    let delta_x = touch.x - touch.start_x;
    let delta_y = touch.y - touch.start_y;
    let distance = delta_x.hypot(delta_y);
    let duration_ms = (end_time_ms - touch.start_time_ms).max(0.0);
    if distance <= 10.0 && duration_ms <= 300.0 {
        return Some(NativeTouchGestureEvent::Tap {
            duration_ms,
            id: touch.id,
            x: touch.x,
            y: touch.y,
        });
    }
    if distance >= 40.0 && duration_ms <= 700.0 {
        let direction = if delta_x.abs() >= delta_y.abs() {
            if delta_x >= 0.0 {
                "right"
            } else {
                "left"
            }
        } else if delta_y >= 0.0 {
            "down"
        } else {
            "up"
        };
        return Some(NativeTouchGestureEvent::Swipe {
            delta_x,
            delta_y,
            direction: direction.to_owned(),
            duration_ms,
            id: touch.id,
        });
    }
    None
}

fn pinch_state(left: &NativeTouchGesturePoint, right: &NativeTouchGesturePoint) -> PinchState {
    PinchState {
        center_x: (left.x + right.x) / 2.0,
        center_y: (left.y + right.y) / 2.0,
        distance: (right.x - left.x).hypot(right.y - left.y),
    }
}

fn classify_pinch(pinch: &ActivePinchGesture, end_time_ms: f32) -> Option<NativeTouchGestureEvent> {
    if pinch.start_distance <= 0.0 {
        return None;
    }
    let scale = pinch.distance / pinch.start_distance;
    if (scale - 1.0).abs() < 0.1 {
        return None;
    }
    Some(NativeTouchGestureEvent::Pinch {
        center_x: pinch.center_x,
        center_y: pinch.center_y,
        distance: pinch.distance,
        duration_ms: (end_time_ms - pinch.start_time_ms).max(0.0),
        scale,
    })
}

pub fn map_keyboard_event(
    input: &InputIr,
    code: &str,
    pressed: bool,
    state: &mut NativeInputState,
) {
    for action in &input.actions {
        if action
            .bindings
            .iter()
            .any(|binding| matches_keyboard(binding, code))
        {
            if pressed {
                state.actions.insert(action.id.clone());
            } else {
                state.actions.remove(&action.id);
            }
        }
    }

    for axis in &input.axes {
        let positive = axis
            .positive
            .iter()
            .any(|binding| matches_keyboard(binding, code));
        let negative = axis
            .negative
            .iter()
            .any(|binding| matches_keyboard(binding, code));
        if positive || negative {
            let current = state.axis(&axis.id);
            let delta = match (positive, negative, pressed) {
                (true, false, true) => 1.0,
                (true, false, false) => -1.0,
                (false, true, true) => -1.0,
                (false, true, false) => 1.0,
                _ => 0.0,
            };
            state
                .axes
                .insert(axis.id.clone(), (current + delta).clamp(-1.0, 1.0));
        }
    }
}

pub fn map_pointer_button_event(
    input: &InputIr,
    button: u8,
    pressed: bool,
    state: &mut NativeInputState,
) {
    for action in &input.actions {
        if action
            .bindings
            .iter()
            .any(|binding| matches_pointer_button(binding, button))
        {
            if pressed {
                state.actions.insert(action.id.clone());
            } else {
                state.actions.remove(&action.id);
            }
        }
    }
}

pub fn report_native_gamepad_capabilities(
    input: Option<&InputIr>,
    gamepads: Option<&Gamepads>,
) -> NativeGamepadCapabilityReport {
    let declared_controls = declared_gamepad_controls(input);
    let connected = gamepads
        .map(|gamepads| {
            gamepads
                .iter()
                .map(|gamepad| NativeGamepadDeviceReport {
                    index: gamepad.id as usize,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut diagnostics = Vec::new();
    if gamepads.is_none() {
        diagnostics.push(NativeGamepadDiagnostic {
            code: "TN_BEVY_GAMEPAD_RESOURCE_UNAVAILABLE".to_owned(),
            message: "Bevy Gamepads resource is unavailable.".to_owned(),
            severity: "warning".to_owned(),
        });
    }
    if !declared_controls.is_empty() && connected.is_empty() {
        diagnostics.push(NativeGamepadDiagnostic {
            code: "TN_BEVY_GAMEPAD_NONE_CONNECTED".to_owned(),
            message: "Input map declares gamepad controls, but no gamepad is connected.".to_owned(),
            severity: "warning".to_owned(),
        });
    }
    for control in &declared_controls {
        if control.kind == "unknown" {
            diagnostics.push(NativeGamepadDiagnostic {
                code: "TN_BEVY_GAMEPAD_CONTROL_UNKNOWN".to_owned(),
                message: format!(
                    "Gamepad control '{}' is not a recognized portable control.",
                    control.control
                ),
                severity: if control.required { "error" } else { "warning" }.to_owned(),
            });
        }
    }
    NativeGamepadCapabilityReport {
        connected,
        declared_controls,
        diagnostics,
        supported: gamepads.is_some(),
    }
}

pub fn rebind_native_input(
    input: &InputIr,
    target: NativeInputRebindTarget,
    binding: InputBindingIr,
) -> NativeInputRebindResult {
    let mut next = input.clone();
    let mut diagnostics = Vec::new();
    match target {
        NativeInputRebindTarget::Action { binding_index, id } => {
            if let Some(action) = next.actions.iter_mut().find(|action| action.id == id) {
                replace_native_binding(
                    &mut action.bindings,
                    binding_index.unwrap_or(0),
                    binding,
                    &mut diagnostics,
                    &format!("actions/{id}"),
                );
            } else {
                diagnostics.push(NativeInputRebindDiagnostic {
                    code: "TN_INPUT_REBIND_ACTION_MISSING".to_owned(),
                    message: format!("Input action '{id}' does not exist."),
                    severity: "error".to_owned(),
                });
                return NativeInputRebindResult {
                    diagnostics,
                    input: next,
                };
            }
        }
        NativeInputRebindTarget::Axis {
            binding_index,
            id,
            slot,
        } => {
            if let Some(axis) = next.axes.iter_mut().find(|axis| axis.id == id) {
                match slot {
                    NativeInputAxisRebindSlot::Negative => replace_native_binding(
                        &mut axis.negative,
                        binding_index.unwrap_or(0),
                        binding,
                        &mut diagnostics,
                        &format!("axes/{id}/negative"),
                    ),
                    NativeInputAxisRebindSlot::Positive => replace_native_binding(
                        &mut axis.positive,
                        binding_index.unwrap_or(0),
                        binding,
                        &mut diagnostics,
                        &format!("axes/{id}/positive"),
                    ),
                    NativeInputAxisRebindSlot::Value => axis.value = Some(binding),
                }
            } else {
                diagnostics.push(NativeInputRebindDiagnostic {
                    code: "TN_INPUT_REBIND_AXIS_MISSING".to_owned(),
                    message: format!("Input axis '{id}' does not exist."),
                    severity: "error".to_owned(),
                });
                return NativeInputRebindResult {
                    diagnostics,
                    input: next,
                };
            }
        }
    }
    diagnostics.extend(validate_rebound_input(&next));
    NativeInputRebindResult {
        diagnostics,
        input: next,
    }
}

fn replace_native_binding(
    bindings: &mut Vec<InputBindingIr>,
    index: usize,
    binding: InputBindingIr,
    diagnostics: &mut Vec<NativeInputRebindDiagnostic>,
    path: &str,
) {
    if index > bindings.len() {
        diagnostics.push(NativeInputRebindDiagnostic {
            code: "TN_INPUT_REBIND_INDEX_INVALID".to_owned(),
            message: format!("Input rebind index {index} is outside '{path}'."),
            severity: "error".to_owned(),
        });
        return;
    }
    if index == bindings.len() {
        bindings.push(binding);
    } else {
        bindings[index] = binding;
    }
}

fn validate_rebound_input(input: &InputIr) -> Vec<NativeInputRebindDiagnostic> {
    let mut diagnostics = Vec::new();
    let mut seen = HashMap::new();
    for (path, binding) in native_input_bindings(input) {
        let key = native_input_binding_key(binding);
        if let Some(existing) = seen.insert(key.clone(), path.clone()) {
            diagnostics.push(NativeInputRebindDiagnostic {
                code: "TN_INPUT_REBIND_DUPLICATE".to_owned(),
                message: format!("Input binding '{key}' is already used by '{existing}'."),
                severity: "error".to_owned(),
            });
        }
        if matches!(
            binding,
            InputBindingIr::Gamepad {
                required: Some(true) | None,
                ..
            }
        ) {
            diagnostics.push(NativeInputRebindDiagnostic {
                code: "TN_INPUT_REBIND_GAMEPAD_REQUIRED".to_owned(),
                message: "Gamepad bindings must be optional for portable rebinding diagnostics."
                    .to_owned(),
                severity: "warning".to_owned(),
            });
        }
    }
    diagnostics
}

fn native_input_bindings(input: &InputIr) -> Vec<(String, &InputBindingIr)> {
    let mut bindings = Vec::new();
    for action in &input.actions {
        for (index, binding) in action.bindings.iter().enumerate() {
            bindings.push((format!("action:{}/{}", action.id, index), binding));
        }
    }
    for axis in &input.axes {
        for (index, binding) in axis.negative.iter().enumerate() {
            bindings.push((format!("axis:{}/negative/{}", axis.id, index), binding));
        }
        for (index, binding) in axis.positive.iter().enumerate() {
            bindings.push((format!("axis:{}/positive/{}", axis.id, index), binding));
        }
        if let Some(binding) = axis.value.as_ref() {
            bindings.push((format!("axis:{}/value", axis.id), binding));
        }
    }
    bindings
}

fn native_input_binding_key(binding: &InputBindingIr) -> String {
    match binding {
        InputBindingIr::Keyboard { code } => format!("keyboard:{code}"),
        InputBindingIr::Pointer {
            button: Some(button),
            axis: _,
        } => format!("pointer:button:{button}"),
        InputBindingIr::Pointer {
            button: _,
            axis: Some(axis),
        } => format!("pointer:axis:{axis}"),
        InputBindingIr::Pointer {
            button: None,
            axis: None,
        } => "pointer:none".to_owned(),
        InputBindingIr::Touch { control, axis } => {
            format!("touch:{}:{}", control, axis.as_deref().unwrap_or(""))
        }
        InputBindingIr::Gamepad { control, .. } => format!("gamepad:{control}"),
    }
}

fn declared_gamepad_controls(input: Option<&InputIr>) -> Vec<NativeGamepadControlReport> {
    let mut controls = HashMap::new();
    if let Some(input) = input {
        for binding in input
            .actions
            .iter()
            .flat_map(|action| action.bindings.iter())
            .chain(input.axes.iter().flat_map(|axis| {
                axis.negative
                    .iter()
                    .chain(axis.positive.iter())
                    .chain(axis.value.iter())
            }))
        {
            if let InputBindingIr::Gamepad { control, required } = binding {
                controls.insert(
                    control.clone(),
                    NativeGamepadControlReport {
                        control: control.clone(),
                        kind: gamepad_control_kind(control).to_owned(),
                        required: required.unwrap_or(true),
                    },
                );
            }
        }
    }
    let mut controls = controls.into_values().collect::<Vec<_>>();
    controls.sort_by(|left, right| left.control.cmp(&right.control));
    controls
}

fn gamepad_control_kind(control: &str) -> &'static str {
    if gamepad_button_type(control).is_some() {
        return "button";
    }
    if gamepad_axis_type(control).is_some() {
        return "axis";
    }
    "unknown"
}

pub fn capture_native_input(
    input: Option<Res<NativeInputMap>>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mouse_buttons: Res<ButtonInput<MouseButton>>,
    gamepads: Option<Res<Gamepads>>,
    gamepad_buttons: Option<Res<ButtonInput<GamepadButton>>>,
    gamepad_button_axes: Option<Res<Axis<GamepadButton>>>,
    gamepad_axes: Option<Res<Axis<GamepadAxis>>>,
    touch: Option<Res<NativeTouchState>>,
    mut mouse_motion: EventReader<MouseMotion>,
    mut cursor_moved: EventReader<CursorMoved>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut state: ResMut<NativeInputState>,
) {
    let Some(input) = input else {
        return;
    };

    let pointer_delta = mouse_motion
        .read()
        .fold(Vec2::ZERO, |total, event| total + event.delta);
    let pointer_position = cursor_moved.read().last().map(|event| event.position);
    let window_size = windows
        .get_single()
        .ok()
        .map(|window| Vec2::new(window.width().max(1.0), window.height().max(1.0)));

    state.actions.clear();
    state.axes.clear();
    let gamepad = match (
        &gamepads,
        &gamepad_buttons,
        &gamepad_button_axes,
        &gamepad_axes,
    ) {
        (Some(gamepads), Some(buttons), Some(button_axes), Some(axes)) => Some(GamepadInput {
            gamepads,
            buttons,
            button_axes,
            axes,
        }),
        _ => None,
    };

    for action in &input.0.actions {
        if action.bindings.iter().any(|binding| {
            binding_pressed(
                binding,
                &keyboard,
                &mouse_buttons,
                gamepad.as_ref(),
                touch.as_deref(),
            )
        }) {
            state.actions.insert(action.id.clone());
        }
    }

    for axis in &input.0.axes {
        let positive = axis.positive.iter().any(|binding| {
            binding_pressed(
                binding,
                &keyboard,
                &mouse_buttons,
                gamepad.as_ref(),
                touch.as_deref(),
            )
        });
        let negative = axis.negative.iter().any(|binding| {
            binding_pressed(
                binding,
                &keyboard,
                &mouse_buttons,
                gamepad.as_ref(),
                touch.as_deref(),
            )
        });
        let digital_value = match (positive, negative) {
            (true, false) => 1.0,
            (false, true) => -1.0,
            _ => 0.0,
        };
        let pointer_value = axis
            .value
            .iter()
            .chain(axis.positive.iter())
            .chain(axis.negative.iter())
            .filter_map(|binding| {
                binding_axis_value(
                    binding,
                    pointer_delta,
                    pointer_position,
                    window_size,
                    gamepad.as_ref(),
                    touch.as_deref(),
                )
            })
            .next()
            .unwrap_or(0.0);
        let value = if pointer_value != 0.0 {
            pointer_value
        } else {
            digital_value
        };
        if value != 0.0 {
            state.axes.insert(axis.id.clone(), value.clamp(-1.0, 1.0));
        }
    }
}

fn matches_keyboard(binding: &InputBindingIr, code: &str) -> bool {
    matches!(binding, InputBindingIr::Keyboard { code: binding_code } if binding_code == code)
}

fn matches_pointer_button(binding: &InputBindingIr, button: u8) -> bool {
    matches!(binding, InputBindingIr::Pointer { button: Some(binding_button), axis: _ } if *binding_button == button)
}

fn binding_pressed(
    binding: &InputBindingIr,
    keyboard: &ButtonInput<KeyCode>,
    mouse_buttons: &ButtonInput<MouseButton>,
    gamepad: Option<&GamepadInput>,
    touch: Option<&NativeTouchState>,
) -> bool {
    match binding {
        InputBindingIr::Keyboard { code } => key_code(code)
            .map(|key| keyboard.pressed(key))
            .unwrap_or(false),
        InputBindingIr::Pointer {
            button: Some(button),
            axis: _,
        } => pointer_button(*button)
            .map(|button| mouse_buttons.pressed(button))
            .unwrap_or(false),
        InputBindingIr::Gamepad { control, .. } => gamepad
            .map(|state| state.control_active(control))
            .unwrap_or(false),
        InputBindingIr::Touch { control, axis } => touch
            .map(|state| {
                axis.as_deref()
                    .map(|axis| state.axis(control, axis).abs() > 0.5)
                    .unwrap_or_else(|| state.control_active(control))
            })
            .unwrap_or(false),
        _ => false,
    }
}

fn binding_axis_value(
    binding: &InputBindingIr,
    pointer_delta: Vec2,
    pointer_position: Option<Vec2>,
    window_size: Option<Vec2>,
    gamepad: Option<&GamepadInput>,
    touch: Option<&NativeTouchState>,
) -> Option<f32> {
    match binding {
        InputBindingIr::Pointer {
            button: _,
            axis: Some(axis),
        } => match axis.as_str() {
            "deltaX" => Some(pointer_delta.x),
            "deltaY" => Some(pointer_delta.y),
            "x" => pointer_position
                .zip(window_size)
                .map(|(position, size)| position.x / size.x),
            "y" => pointer_position
                .zip(window_size)
                .map(|(position, size)| position.y / size.y),
            _ => None,
        },
        InputBindingIr::Gamepad { control, .. } => gamepad
            .and_then(|state| state.axis_value(control))
            .or_else(|| {
                gamepad.map(|state| {
                    if state.control_active(control) {
                        1.0
                    } else {
                        0.0
                    }
                })
            }),
        InputBindingIr::Touch { control, axis } => touch.map(|state| {
            axis.as_deref()
                .map(|axis| state.axis(control, axis))
                .unwrap_or_else(|| {
                    if state.control_active(control) {
                        1.0
                    } else {
                        0.0
                    }
                })
        }),
        _ => None,
    }
}

struct GamepadInput<'a> {
    gamepads: &'a Gamepads,
    buttons: &'a ButtonInput<GamepadButton>,
    button_axes: &'a Axis<GamepadButton>,
    axes: &'a Axis<GamepadAxis>,
}

impl GamepadInput<'_> {
    fn control_active(&self, control: &str) -> bool {
        for gamepad in self.gamepads.iter() {
            if let Some(button_type) = gamepad_button_type(control) {
                let button = GamepadButton::new(gamepad, button_type);
                if self.buttons.pressed(button)
                    || self.button_axes.get(button).unwrap_or(0.0).abs() > 0.5
                {
                    return true;
                }
            }
            if let Some(axis_type) = gamepad_axis_type(control) {
                let axis = GamepadAxis::new(gamepad, axis_type);
                if self.axes.get(axis).unwrap_or(0.0).abs() > 0.5 {
                    return true;
                }
            }
        }
        false
    }

    fn axis_value(&self, control: &str) -> Option<f32> {
        let axis_type = gamepad_axis_type(control)?;
        self.gamepads
            .iter()
            .filter_map(|gamepad| self.axes.get(GamepadAxis::new(gamepad, axis_type)))
            .find(|value| value.abs() > 0.0)
            .map(|value| value.clamp(-1.0, 1.0))
            .or(Some(0.0))
    }
}

fn gamepad_button_type(control: &str) -> Option<GamepadButtonType> {
    match control {
        "buttonSouth" | "south" => Some(GamepadButtonType::South),
        "buttonEast" | "east" => Some(GamepadButtonType::East),
        "buttonNorth" | "north" => Some(GamepadButtonType::North),
        "buttonWest" | "west" => Some(GamepadButtonType::West),
        "leftTrigger" => Some(GamepadButtonType::LeftTrigger),
        "leftTrigger2" => Some(GamepadButtonType::LeftTrigger2),
        "rightTrigger" => Some(GamepadButtonType::RightTrigger),
        "rightTrigger2" => Some(GamepadButtonType::RightTrigger2),
        "select" => Some(GamepadButtonType::Select),
        "start" => Some(GamepadButtonType::Start),
        "mode" => Some(GamepadButtonType::Mode),
        "leftThumb" => Some(GamepadButtonType::LeftThumb),
        "rightThumb" => Some(GamepadButtonType::RightThumb),
        "dpadUp" => Some(GamepadButtonType::DPadUp),
        "dpadDown" => Some(GamepadButtonType::DPadDown),
        "dpadLeft" => Some(GamepadButtonType::DPadLeft),
        "dpadRight" => Some(GamepadButtonType::DPadRight),
        _ => None,
    }
}

fn gamepad_axis_type(control: &str) -> Option<GamepadAxisType> {
    match control {
        "leftStickX" => Some(GamepadAxisType::LeftStickX),
        "leftStickY" => Some(GamepadAxisType::LeftStickY),
        "leftZ" => Some(GamepadAxisType::LeftZ),
        "rightStickX" => Some(GamepadAxisType::RightStickX),
        "rightStickY" => Some(GamepadAxisType::RightStickY),
        "rightZ" => Some(GamepadAxisType::RightZ),
        _ => None,
    }
}

fn key_code(code: &str) -> Option<KeyCode> {
    match code {
        "Backspace" => Some(KeyCode::Backspace),
        "Enter" => Some(KeyCode::Enter),
        "Escape" => Some(KeyCode::Escape),
        "Space" => Some(KeyCode::Space),
        "Tab" => Some(KeyCode::Tab),
        "ArrowDown" => Some(KeyCode::ArrowDown),
        "ArrowLeft" => Some(KeyCode::ArrowLeft),
        "ArrowRight" => Some(KeyCode::ArrowRight),
        "ArrowUp" => Some(KeyCode::ArrowUp),
        "KeyA" => Some(KeyCode::KeyA),
        "KeyB" => Some(KeyCode::KeyB),
        "KeyC" => Some(KeyCode::KeyC),
        "KeyD" => Some(KeyCode::KeyD),
        "KeyE" => Some(KeyCode::KeyE),
        "KeyF" => Some(KeyCode::KeyF),
        "KeyG" => Some(KeyCode::KeyG),
        "KeyH" => Some(KeyCode::KeyH),
        "KeyI" => Some(KeyCode::KeyI),
        "KeyJ" => Some(KeyCode::KeyJ),
        "KeyK" => Some(KeyCode::KeyK),
        "KeyL" => Some(KeyCode::KeyL),
        "KeyM" => Some(KeyCode::KeyM),
        "KeyN" => Some(KeyCode::KeyN),
        "KeyO" => Some(KeyCode::KeyO),
        "KeyP" => Some(KeyCode::KeyP),
        "KeyQ" => Some(KeyCode::KeyQ),
        "KeyR" => Some(KeyCode::KeyR),
        "KeyS" => Some(KeyCode::KeyS),
        "KeyT" => Some(KeyCode::KeyT),
        "KeyU" => Some(KeyCode::KeyU),
        "KeyV" => Some(KeyCode::KeyV),
        "KeyW" => Some(KeyCode::KeyW),
        "KeyX" => Some(KeyCode::KeyX),
        "KeyY" => Some(KeyCode::KeyY),
        "KeyZ" => Some(KeyCode::KeyZ),
        "Digit0" => Some(KeyCode::Digit0),
        "Digit1" => Some(KeyCode::Digit1),
        "Digit2" => Some(KeyCode::Digit2),
        "Digit3" => Some(KeyCode::Digit3),
        "Digit4" => Some(KeyCode::Digit4),
        "Digit5" => Some(KeyCode::Digit5),
        "Digit6" => Some(KeyCode::Digit6),
        "Digit7" => Some(KeyCode::Digit7),
        "Digit8" => Some(KeyCode::Digit8),
        "Digit9" => Some(KeyCode::Digit9),
        _ => None,
    }
}

fn pointer_button(button: u8) -> Option<MouseButton> {
    match button {
        0 => Some(MouseButton::Left),
        1 => Some(MouseButton::Middle),
        2 => Some(MouseButton::Right),
        other => Some(MouseButton::Other(other as u16)),
    }
}
