use bevy::{
    app::{App, PreUpdate},
    input::{
        ButtonInput,
        gamepad::{
            Gamepad, GamepadAxis, GamepadAxisType, GamepadButton, GamepadButtonType,
            GamepadConnection, GamepadConnectionEvent, GamepadInfo, Gamepads,
            gamepad_connection_system,
        },
        mouse::MouseMotion,
    },
    prelude::*,
    window::PrimaryWindow,
};
use threenative_loader::{InputActionIr, InputAxisIr, InputBindingIr, InputIr};
use threenative_runtime::input::{
    NativeInputAxisRebindSlot, NativeInputMap, NativeInputRebindTarget, NativeInputState,
    NativeTouchGestureEvent, NativeTouchGesturePoint, NativeTouchGestureTracker, NativeTouchState,
    capture_native_input, map_keyboard_event, map_pointer_button_event, rebind_native_input,
    report_native_gamepad_capabilities,
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
        controls_settings: None,
        persisted_binding_overrides: vec![],
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
        controls_settings: None,
        persisted_binding_overrides: vec![],
    };
    let mut state = NativeInputState::default();

    map_pointer_button_event(&input, 0, true, &mut state);
    assert!(state.action("Attack"));

    map_pointer_button_event(&input, 0, false, &mut state);
    assert!(!state.action("Attack"));
}

#[test]
fn should_rebind_native_input_actions_and_axes() {
    let input = sample_rebind_input();

    let action_rebind = rebind_native_input(
        &input,
        NativeInputRebindTarget::Action {
            binding_index: None,
            id: "Attack".to_owned(),
        },
        InputBindingIr::Keyboard {
            code: "KeyF".to_owned(),
        },
    );
    let axis_rebind = rebind_native_input(
        &action_rebind.input,
        NativeInputRebindTarget::Axis {
            binding_index: None,
            id: "MoveX".to_owned(),
            slot: NativeInputAxisRebindSlot::Positive,
        },
        InputBindingIr::Keyboard {
            code: "ArrowRight".to_owned(),
        },
    );

    assert!(action_rebind.diagnostics.is_empty());
    assert!(axis_rebind.diagnostics.is_empty());
    assert!(matches!(
        axis_rebind.input.actions[0].bindings.as_slice(),
        [InputBindingIr::Keyboard { code }] if code == "KeyF"
    ));
    assert!(matches!(
        axis_rebind.input.axes[0].positive.as_slice(),
        [InputBindingIr::Keyboard { code }] if code == "ArrowRight"
    ));
    assert!(matches!(
        input.actions[0].bindings.as_slice(),
        [InputBindingIr::Pointer {
            button: Some(0),
            axis: None
        }]
    ));
}

#[test]
fn should_report_native_rebind_diagnostics() {
    let input = sample_rebind_input();

    let missing = rebind_native_input(
        &input,
        NativeInputRebindTarget::Action {
            binding_index: None,
            id: "Missing".to_owned(),
        },
        InputBindingIr::Keyboard {
            code: "KeyF".to_owned(),
        },
    );
    let duplicate = rebind_native_input(
        &input,
        NativeInputRebindTarget::Action {
            binding_index: None,
            id: "Attack".to_owned(),
        },
        InputBindingIr::Keyboard {
            code: "KeyD".to_owned(),
        },
    );
    let gamepad = rebind_native_input(
        &input,
        NativeInputRebindTarget::Action {
            binding_index: None,
            id: "Attack".to_owned(),
        },
        InputBindingIr::Gamepad {
            control: "buttonNorth".to_owned(),
            required: None,
        },
    );

    assert_eq!(
        missing
            .diagnostics
            .first()
            .map(|diagnostic| diagnostic.code.as_str()),
        Some("TN_INPUT_REBIND_ACTION_MISSING")
    );
    assert!(
        duplicate
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "TN_INPUT_REBIND_DUPLICATE")
    );
    assert!(gamepad.diagnostics.iter().any(|diagnostic| diagnostic.code
        == "TN_INPUT_REBIND_GAMEPAD_REQUIRED"
        && diagnostic.severity == "warning"));
}

fn sample_rebind_input() -> InputIr {
    InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Attack".to_owned(),
            bindings: vec![InputBindingIr::Pointer {
                button: Some(0),
                axis: None,
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
        controls_settings: None,
        persisted_binding_overrides: vec![],
    }
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
        controls_settings: None,
        persisted_binding_overrides: vec![],
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

#[test]
fn should_capture_gamepad_and_touch_input() {
    let mut app = App::new();
    app.add_event::<MouseMotion>();
    app.add_event::<CursorMoved>();
    app.add_event::<GamepadConnectionEvent>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(ButtonInput::<MouseButton>::default());
    app.insert_resource(ButtonInput::<GamepadButton>::default());
    app.insert_resource(Axis::<GamepadButton>::default());
    app.insert_resource(Axis::<GamepadAxis>::default());
    app.init_resource::<Gamepads>();
    app.init_resource::<NativeInputState>();
    app.init_resource::<NativeTouchState>();
    app.insert_resource(NativeInputMap(InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![
            InputActionIr {
                id: "Interact".to_owned(),
                bindings: vec![InputBindingIr::Gamepad {
                    control: "buttonSouth".to_owned(),
                    required: Some(false),
                }],
            },
            InputActionIr {
                id: "Jump".to_owned(),
                bindings: vec![InputBindingIr::Touch {
                    control: "jump".to_owned(),
                    axis: None,
                }],
            },
        ],
        axes: vec![
            InputAxisIr {
                id: "MoveX".to_owned(),
                negative: vec![],
                positive: vec![],
                value: Some(InputBindingIr::Gamepad {
                    control: "leftStickX".to_owned(),
                    required: Some(false),
                }),
            },
            InputAxisIr {
                id: "TouchMoveX".to_owned(),
                negative: vec![],
                positive: vec![],
                value: Some(InputBindingIr::Touch {
                    control: "move-stick".to_owned(),
                    axis: Some("x".to_owned()),
                }),
            },
        ],
        controls_settings: None,
        persisted_binding_overrides: vec![],
    }));
    app.add_systems(PreUpdate, (gamepad_connection_system, capture_native_input));

    let gamepad = Gamepad::new(0);
    app.world_mut().send_event(GamepadConnectionEvent::new(
        gamepad,
        GamepadConnection::Connected(GamepadInfo {
            name: "Test Gamepad".to_owned(),
        }),
    ));
    app.update();

    app.world_mut()
        .resource_mut::<ButtonInput<GamepadButton>>()
        .press(GamepadButton::new(gamepad, GamepadButtonType::South));
    app.world_mut()
        .resource_mut::<Axis<GamepadAxis>>()
        .set(GamepadAxis::new(gamepad, GamepadAxisType::LeftStickX), 0.65);
    {
        let mut touch = app.world_mut().resource_mut::<NativeTouchState>();
        touch.set_control("jump", true);
        touch.set_axis("move-stick", "x", -0.4);
    }
    app.update();

    let state = app.world().resource::<NativeInputState>();
    assert!(state.action("Interact"));
    assert!(state.action("Jump"));
    assert_eq!(state.axis("MoveX"), 0.65);
    assert_eq!(state.axis("TouchMoveX"), -0.4);
}

#[test]
fn should_recognize_native_touch_gestures() {
    let mut tracker = NativeTouchGestureTracker::default();

    assert_eq!(
        tracker.update(
            0.0,
            &[NativeTouchGesturePoint {
                id: 1,
                x: 10.0,
                y: 10.0,
            }],
        ),
        Vec::<NativeTouchGestureEvent>::new()
    );
    assert_eq!(
        tracker.update(120.0, &[]),
        vec![NativeTouchGestureEvent::Tap {
            duration_ms: 120.0,
            id: 1,
            x: 10.0,
            y: 10.0,
        }]
    );

    tracker.update(
        200.0,
        &[NativeTouchGesturePoint {
            id: 2,
            x: 10.0,
            y: 10.0,
        }],
    );
    tracker.update(
        260.0,
        &[NativeTouchGesturePoint {
            id: 2,
            x: 80.0,
            y: 15.0,
        }],
    );
    assert_eq!(
        tracker.update(320.0, &[]),
        vec![NativeTouchGestureEvent::Swipe {
            delta_x: 70.0,
            delta_y: 5.0,
            direction: "right".to_owned(),
            duration_ms: 120.0,
            id: 2,
        }]
    );

    tracker.update(
        400.0,
        &[
            NativeTouchGesturePoint {
                id: 3,
                x: 0.0,
                y: 0.0,
            },
            NativeTouchGesturePoint {
                id: 4,
                x: 10.0,
                y: 0.0,
            },
        ],
    );
    tracker.update(
        460.0,
        &[
            NativeTouchGesturePoint {
                id: 3,
                x: -5.0,
                y: 0.0,
            },
            NativeTouchGesturePoint {
                id: 4,
                x: 15.0,
                y: 0.0,
            },
        ],
    );
    assert_eq!(
        tracker.update(520.0, &[]),
        vec![NativeTouchGestureEvent::Pinch {
            center_x: 5.0,
            center_y: 0.0,
            distance: 20.0,
            duration_ms: 120.0,
            scale: 2.0,
        }]
    );
}

#[test]
fn should_report_native_gamepad_capabilities_and_diagnostics() {
    let input = InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![
            InputActionIr {
                id: "Interact".to_owned(),
                bindings: vec![InputBindingIr::Gamepad {
                    control: "buttonSouth".to_owned(),
                    required: Some(false),
                }],
            },
            InputActionIr {
                id: "Cheat".to_owned(),
                bindings: vec![InputBindingIr::Gamepad {
                    control: "turbo".to_owned(),
                    required: Some(true),
                }],
            },
        ],
        axes: vec![InputAxisIr {
            id: "MoveX".to_owned(),
            negative: vec![],
            positive: vec![],
            value: Some(InputBindingIr::Gamepad {
                control: "leftStickX".to_owned(),
                required: Some(false),
            }),
        }],
        controls_settings: None,
        persisted_binding_overrides: vec![],
    };
    let mut app = App::new();
    app.add_event::<GamepadConnectionEvent>();
    app.insert_resource(Axis::<GamepadAxis>::default());
    app.insert_resource(Axis::<GamepadButton>::default());
    app.insert_resource(ButtonInput::<GamepadButton>::default());
    app.init_resource::<Gamepads>();
    app.add_systems(PreUpdate, gamepad_connection_system);
    app.world_mut().send_event(GamepadConnectionEvent::new(
        Gamepad::new(2),
        GamepadConnection::Connected(GamepadInfo {
            name: "Test Controller".to_owned(),
        }),
    ));
    app.update();

    let report =
        report_native_gamepad_capabilities(Some(&input), Some(app.world().resource::<Gamepads>()));

    assert_eq!(report.connected.len(), 1);
    assert_eq!(
        report
            .declared_controls
            .iter()
            .map(|control| (
                control.control.as_str(),
                control.kind.as_str(),
                control.required
            ))
            .collect::<Vec<_>>(),
        vec![
            ("buttonSouth", "button", false),
            ("leftStickX", "axis", false),
            ("turbo", "unknown", true),
        ]
    );
    assert!(report.supported);
    assert!(report.diagnostics.iter().any(|diagnostic| diagnostic.code
        == "TN_BEVY_GAMEPAD_CONTROL_UNKNOWN"
        && diagnostic.severity == "error"));

    let unavailable = report_native_gamepad_capabilities(Some(&input), None);
    assert!(!unavailable.supported);
    assert!(
        unavailable
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "TN_BEVY_GAMEPAD_RESOURCE_UNAVAILABLE")
    );
}
