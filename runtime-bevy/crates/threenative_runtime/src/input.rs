use std::collections::{HashMap, HashSet};

use bevy::{
    input::{ButtonInput, mouse::MouseMotion},
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

pub fn capture_native_input(
    input: Option<Res<NativeInputMap>>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mouse_buttons: Res<ButtonInput<MouseButton>>,
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

    for action in &input.0.actions {
        if action
            .bindings
            .iter()
            .any(|binding| binding_pressed(binding, &keyboard, &mouse_buttons))
        {
            state.actions.insert(action.id.clone());
        }
    }

    for axis in &input.0.axes {
        let positive = axis
            .positive
            .iter()
            .any(|binding| binding_pressed(binding, &keyboard, &mouse_buttons));
        let negative = axis
            .negative
            .iter()
            .any(|binding| binding_pressed(binding, &keyboard, &mouse_buttons));
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
                binding_axis_value(binding, pointer_delta, pointer_position, window_size)
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
        _ => false,
    }
}

fn binding_axis_value(
    binding: &InputBindingIr,
    pointer_delta: Vec2,
    pointer_position: Option<Vec2>,
    window_size: Option<Vec2>,
) -> Option<f32> {
    let InputBindingIr::Pointer {
        button: _,
        axis: Some(axis),
    } = binding
    else {
        return None;
    };

    match axis.as_str() {
        "deltaX" => Some(pointer_delta.x),
        "deltaY" => Some(pointer_delta.y),
        "x" => pointer_position
            .zip(window_size)
            .map(|(position, size)| position.x / size.x),
        "y" => pointer_position
            .zip(window_size)
            .map(|(position, size)| position.y / size.y),
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
