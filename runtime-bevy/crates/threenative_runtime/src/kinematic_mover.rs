use std::collections::BTreeMap;

use serde::Serialize;
use threenative_loader::{KinematicMoverComponent, LoadedBundle, TransformComponent, WorldEntity};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct NativeKinematicMoverObservation {
    pub entity: String,
    pub position: [f32; 3],
    pub velocity: [f32; 3],
}

pub fn step_bundle_kinematic_movers(
    bundle: &mut LoadedBundle,
    elapsed_seconds: f32,
    origins: &mut BTreeMap<String, [f32; 3]>,
) -> Vec<NativeKinematicMoverObservation> {
    let mut observations = Vec::new();
    for entity in &mut bundle.world.entities {
        let Some(mover) = entity.components.kinematic_mover.clone() else {
            continue;
        };
        let origin = origin_for(entity, origins);
        if mover.mode == "sine" {
            observations.push(apply_sine_mover(entity, &mover, origin, elapsed_seconds));
        }
    }
    observations
}

fn origin_for(entity: &WorldEntity, origins: &mut BTreeMap<String, [f32; 3]>) -> [f32; 3] {
    if let Some(origin) = origins.get(&entity.id) {
        return *origin;
    }
    let origin = entity
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .unwrap_or([0.0, 0.0, 0.0]);
    origins.insert(entity.id.clone(), origin);
    origin
}

fn apply_sine_mover(
    entity: &mut WorldEntity,
    mover: &KinematicMoverComponent,
    origin: [f32; 3],
    elapsed_seconds: f32,
) -> NativeKinematicMoverObservation {
    let direction = normalize(
        mover
            .direction
            .unwrap_or_else(|| axis_vector(mover.axis.as_deref())),
    );
    let radius = mover.radius.unwrap_or(1.0).max(0.0);
    let theta = mover.phase.unwrap_or(0.0) + elapsed_seconds.max(0.0) * mover.speed;
    let offset = theta.sin() * radius;
    let velocity_scale = theta.cos() * mover.speed * radius;
    let position = [
        origin[0] + direction[0] * offset,
        origin[1] + direction[1] * offset,
        origin[2] + direction[2] * offset,
    ];
    let velocity = [
        direction[0] * velocity_scale,
        direction[1] * velocity_scale,
        direction[2] * velocity_scale,
    ];

    let transform = entity
        .components
        .transform
        .get_or_insert(TransformComponent {
            position: None,
            rotation: None,
            scale: None,
        });
    transform.position = Some(position);
    if let Some(rigid_body) = entity.components.rigid_body.as_mut() {
        rigid_body.velocity = Some(velocity);
    }

    NativeKinematicMoverObservation {
        entity: entity.id.clone(),
        position,
        velocity,
    }
}

fn axis_vector(axis: Option<&str>) -> [f32; 3] {
    match axis {
        Some("y") => [0.0, 1.0, 0.0],
        Some("z") => [0.0, 0.0, 1.0],
        _ => [1.0, 0.0, 0.0],
    }
}

fn normalize(value: [f32; 3]) -> [f32; 3] {
    let length = (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt();
    if length <= 1e-9 {
        [0.0, 0.0, 0.0]
    } else {
        [value[0] / length, value[1] / length, value[2] / length]
    }
}
