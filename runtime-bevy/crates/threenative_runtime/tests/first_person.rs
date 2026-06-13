use bevy::prelude::*;
use threenative_loader::{FirstPersonControllerIr, FirstPersonInputIr, FirstPersonPitchIr};
use threenative_runtime::first_person::{move_forward, observe_first_person};

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

fn make_controller() -> FirstPersonControllerIr {
    FirstPersonControllerIr {
        camera: "camera.firstPerson".to_owned(),
        height: 1.7,
        max_speed: 4.5,
        acceleration: 18.0,
        sensitivity: 0.0025,
        pointer_lock: "required".to_owned(),
        collision_profile: Some("forest.path.walkable".to_owned()),
        pitch: FirstPersonPitchIr { min: -75.0, max: 75.0 },
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
