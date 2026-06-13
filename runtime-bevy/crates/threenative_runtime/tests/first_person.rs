use bevy::prelude::*;
use threenative_loader::{
    FirstPersonControllerIr, FirstPersonInputIr, FirstPersonPitchIr, InputActionIr, InputBindingIr,
    InputIr,
};
use threenative_runtime::{
    first_person::{move_forward, observe_first_person, update_first_person_from_input},
    input::{NativeInputState, map_keyboard_event},
};

#[test]
fn first_person_should_move_camera_forward_when_forward_action_is_pressed() {
    let controller = make_controller();
    let mut transform = Transform::default();

    move_forward(&mut transform, &controller, 1.0);

    assert_eq!(transform.translation.y, 1.7);
    assert!(transform.translation.z < 0.0);
}

#[test]
fn first_person_should_report_mouse_capture_requirement() {
    let observation = observe_first_person(&make_controller());

    assert_eq!(observation.camera, "camera.firstPerson");
    assert_eq!(observation.capture_status, "capture-required");
}

#[test]
fn first_person_should_replay_keyboard_mapping_through_controller_actions() {
    let controller = make_controller();
    let input = make_input();
    let mut state = NativeInputState::default();
    let mut transform = Transform::default();

    map_keyboard_event(&input, "KeyW", true, &mut state);
    update_first_person_from_input(&mut transform, &controller, &state, 1.0);

    assert_eq!(transform.translation.y, controller.height);
    assert_eq!(transform.translation.z, -controller.max_speed);

    map_keyboard_event(&input, "KeyW", false, &mut state);
    map_keyboard_event(&input, "KeyD", true, &mut state);
    update_first_person_from_input(&mut transform, &controller, &state, 1.0);

    assert_eq!(transform.translation.x, controller.max_speed);
    assert_eq!(transform.translation.z, -controller.max_speed);
}

fn make_controller() -> FirstPersonControllerIr {
    FirstPersonControllerIr {
        camera: "camera.firstPerson".to_owned(),
        height: 1.7,
        max_speed: 4.5,
        acceleration: 18.0,
        sensitivity: 0.0025,
        pointer_lock: "required".to_owned(),
        collision_profile: Some("forest.path.walkable".to_owned()),
        pitch: FirstPersonPitchIr {
            min: -75.0,
            max: 75.0,
        },
        input: FirstPersonInputIr {
            forward: "MoveForward".to_owned(),
            backward: "MoveBackward".to_owned(),
            left: "MoveLeft".to_owned(),
            right: "MoveRight".to_owned(),
            sprint: Some("Sprint".to_owned()),
            look_x: "LookX".to_owned(),
            look_y: "LookY".to_owned(),
        },
    }
}

fn make_input() -> InputIr {
    InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![
            make_keyboard_action("MoveForward", "KeyW"),
            make_keyboard_action("MoveBackward", "KeyS"),
            make_keyboard_action("MoveLeft", "KeyA"),
            make_keyboard_action("MoveRight", "KeyD"),
        ],
        axes: vec![],
    }
}

fn make_keyboard_action(id: &str, code: &str) -> InputActionIr {
    InputActionIr {
        id: id.to_owned(),
        bindings: vec![InputBindingIr::Keyboard {
            code: code.to_owned(),
        }],
    }
}
