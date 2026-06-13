use threenative_loader::{InputActionIr, InputAxisIr, InputBindingIr, InputIr};
use threenative_runtime::input::{NativeInputState, map_keyboard_event, map_pointer_button_event};

#[test]
fn should_map_keyboard_input_event_to_action() {
    let input = InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Attack".to_owned(),
            bindings: vec![InputBindingIr::Keyboard {
                code: "Space".to_owned(),
            }],
        }],
        axes: vec![InputAxisIr {
            id: "MoveX".to_owned(),
            negative: vec![InputBindingIr::Keyboard {
                code: "KeyA".to_owned(),
            }],
            positive: vec![InputBindingIr::Keyboard {
                code: "KeyD".to_owned(),
            }],
        }],
    };
    let mut state = NativeInputState::default();

    map_keyboard_event(&input, "Space", true, &mut state);
    map_keyboard_event(&input, "KeyD", true, &mut state);

    assert!(state.action("Attack"));
    assert_eq!(state.axis("MoveX"), 1.0);
}

#[test]
fn should_map_pointer_input_event_to_action() {
    let input = InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Attack".to_owned(),
            bindings: vec![InputBindingIr::Pointer {
                button: Some(0),
                axis: None,
            }],
        }],
        axes: vec![],
    };
    let mut state = NativeInputState::default();

    map_pointer_button_event(&input, 0, true, &mut state);
    assert!(state.action("Attack"));

    map_pointer_button_event(&input, 0, false, &mut state);
    assert!(!state.action("Attack"));
}
