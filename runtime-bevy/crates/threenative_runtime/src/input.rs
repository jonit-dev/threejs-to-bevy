use std::collections::{HashMap, HashSet};

use threenative_loader::{InputBindingIr, InputIr};

#[derive(Debug, Default)]
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

fn matches_keyboard(binding: &InputBindingIr, code: &str) -> bool {
    matches!(binding, InputBindingIr::Keyboard { code: binding_code } if binding_code == code)
}

fn matches_pointer_button(binding: &InputBindingIr, button: u8) -> bool {
    matches!(binding, InputBindingIr::Pointer { button: Some(binding_button), axis: _ } if *binding_button == button)
}
