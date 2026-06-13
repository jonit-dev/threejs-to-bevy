use bevy::prelude::*;
use threenative_loader::FirstPersonControllerIr;

use crate::input::NativeInputState;

#[derive(Debug, PartialEq)]
pub struct NativeFirstPersonObservation {
    pub camera: String,
    pub capture_status: String,
    pub max_speed: f32,
    pub pitch_min: f32,
    pub pitch_max: f32,
}

pub fn observe_first_person(controller: &FirstPersonControllerIr) -> NativeFirstPersonObservation {
    NativeFirstPersonObservation {
        camera: controller.camera.clone(),
        capture_status: if controller.pointer_lock == "required" {
            "capture-required".to_owned()
        } else {
            "capture-optional".to_owned()
        },
        max_speed: controller.max_speed,
        pitch_min: controller.pitch.min,
        pitch_max: controller.pitch.max,
    }
}

pub fn move_forward(
    transform: &mut Transform,
    controller: &FirstPersonControllerIr,
    delta_seconds: f32,
) {
    transform.translation.y = controller.height;
    transform.translation.z -= controller.max_speed * delta_seconds;
}

pub fn update_first_person_from_input(
    transform: &mut Transform,
    controller: &FirstPersonControllerIr,
    input: &NativeInputState,
    delta_seconds: f32,
) {
    let move_x = movement_axis(
        input.action(&controller.input.right),
        input.action(&controller.input.left),
    );
    let move_z = movement_axis(
        input.action(&controller.input.backward),
        input.action(&controller.input.forward),
    );
    let mut movement = Vec3::new(move_x, 0.0, move_z);
    if movement.length_squared() > 0.0 {
        movement = movement.normalize() * controller.max_speed * delta_seconds;
        transform.translation += movement;
    }
    transform.translation.y = controller.height;
}

fn movement_axis(positive: bool, negative: bool) -> f32 {
    match (positive, negative) {
        (true, false) => 1.0,
        (false, true) => -1.0,
        _ => 0.0,
    }
}
