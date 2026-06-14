use bevy::{
    app::{App, PreUpdate},
    input::{ButtonInput, mouse::MouseMotion},
    prelude::*,
    window::PrimaryWindow,
};
use threenative_loader::{InputActionIr, InputAxisIr, InputBindingIr, InputIr};
use threenative_runtime::input::{
    NativeInputMap, NativeInputState, capture_native_input, map_keyboard_event,
    map_pointer_button_event,
};

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
            value: None,
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

#[test]
fn should_capture_bevy_keyboard_and_pointer_input() {
    let mut app = App::new();
    app.add_event::<MouseMotion>();
    app.add_event::<CursorMoved>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(ButtonInput::<MouseButton>::default());
    app.insert_resource(NativeInputMap(InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Attack".to_owned(),
            bindings: vec![InputBindingIr::Pointer {
                button: Some(0),
                axis: None,
            }],
        }],
        axes: vec![
            InputAxisIr {
                id: "MoveX".to_owned(),
                negative: vec![InputBindingIr::Keyboard {
                    code: "KeyA".to_owned(),
                }],
                positive: vec![InputBindingIr::Keyboard {
                    code: "KeyD".to_owned(),
                }],
                value: None,
            },
            InputAxisIr {
                id: "LookX".to_owned(),
                negative: vec![],
                positive: vec![],
                value: Some(InputBindingIr::Pointer {
                    button: None,
                    axis: Some("deltaX".to_owned()),
                }),
            },
        ],
    }));
    app.init_resource::<NativeInputState>();
    app.world_mut().spawn((
        Window {
            resolution: (200.0, 100.0).into(),
            ..Default::default()
        },
        PrimaryWindow,
    ));
    app.add_systems(PreUpdate, capture_native_input);

    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .press(KeyCode::KeyD);
    app.world_mut()
        .resource_mut::<ButtonInput<MouseButton>>()
        .press(MouseButton::Left);
    app.world_mut().send_event(MouseMotion {
        delta: Vec2::new(0.5, 0.0),
    });
    app.update();

    let state = app.world().resource::<NativeInputState>();
    assert!(state.action("Attack"));
    assert_eq!(state.axis("MoveX"), 1.0);
    assert_eq!(state.axis("LookX"), 0.5);
}
