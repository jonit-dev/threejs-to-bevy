use bevy::prelude::*;
use threenative_loader::FirstPersonControllerIr;

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

pub fn move_forward(transform: &mut Transform, controller: &FirstPersonControllerIr, delta_seconds: f32) {
    transform.translation.y = controller.height;
    transform.translation.z -= controller.max_speed * delta_seconds;
}
