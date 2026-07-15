use std::collections::BTreeMap;

use serde::Serialize;
use threenative_loader::{LoadedBundle, PatrolComponent, TransformComponent};

const EPSILON: f32 = 1e-6;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativePatrolRuntimeState {
    states: BTreeMap<String, PatrolState>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePatrolObservation {
    pub direction: i8,
    pub entity: String,
    pub paused: bool,
    pub position: [f32; 3],
    pub segment: usize,
    pub velocity: [f32; 3],
}

#[derive(Clone, Debug, PartialEq)]
struct PatrolState {
    direction: i8,
    pause_remaining: f32,
    segment: usize,
    waypoints_key: String,
}

pub fn step_bundle_patrols(
    bundle: &mut LoadedBundle,
    fixed_delta: f32,
    runtime: &mut NativePatrolRuntimeState,
) -> Vec<NativePatrolObservation> {
    let mut ids = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.components.patrol.is_some())
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    ids.sort();
    let delta = fixed_delta.max(0.0);
    let mut observations = Vec::new();
    for id in ids {
        let Some(entity_index) = bundle
            .world
            .entities
            .iter()
            .position(|entity| entity.id == id)
        else {
            continue;
        };
        let Some(patrol) = bundle.world.entities[entity_index]
            .components
            .patrol
            .clone()
        else {
            continue;
        };
        if patrol.waypoints.len() < 2 {
            runtime.states.remove(&id);
            continue;
        }
        let state = state_for(&id, &patrol, runtime);
        let entity = &mut bundle.world.entities[entity_index];
        let mut position = entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position)
            .unwrap_or([0.0, 0.0, 0.0]);
        let mut velocity = [0.0, 0.0, 0.0];
        if patrol.paused.unwrap_or(false)
            || delta <= 0.0
            || entity
                .components
                .rigid_body
                .as_ref()
                .is_some_and(|body| body.kind == "dynamic")
        {
            observations.push(observation(
                &id,
                state,
                position,
                velocity,
                patrol.paused.unwrap_or(false),
            ));
            continue;
        }
        let speed = patrol.speed.max(0.0);
        let mut remaining = delta;
        if state.pause_remaining > 0.0 {
            let pause = state.pause_remaining;
            state.pause_remaining = (pause - remaining).max(0.0);
            if state.pause_remaining > 0.0 || speed <= 0.0 {
                observations.push(observation(&id, state, position, velocity, false));
                continue;
            }
            remaining -= pause;
        }
        for _ in 0..patrol.waypoints.len() * 2 + 1 {
            if remaining <= EPSILON {
                break;
            }
            let target = patrol.waypoints[state.segment];
            let offset = [
                target[0] - position[0],
                target[1] - position[1],
                target[2] - position[2],
            ];
            let distance = length(offset);
            if distance <= EPSILON {
                arrive_at_waypoint(state, &patrol);
                if state.pause_remaining > 0.0 {
                    break;
                }
                continue;
            }
            let travel = speed * remaining;
            if travel < distance || speed <= EPSILON {
                let scale = if speed <= EPSILON {
                    0.0
                } else {
                    travel / distance
                };
                position = [
                    position[0] + offset[0] * scale,
                    position[1] + offset[1] * scale,
                    position[2] + offset[2] * scale,
                ];
                velocity = [
                    offset[0] / distance * speed,
                    offset[1] / distance * speed,
                    offset[2] / distance * speed,
                ];
                break;
            }
            position = target;
            velocity = [
                offset[0] / distance * speed,
                offset[1] / distance * speed,
                offset[2] / distance * speed,
            ];
            remaining -= distance / speed;
            arrive_at_waypoint(state, &patrol);
            if state.pause_remaining > 0.0 {
                break;
            }
        }
        apply_patrol_movement(entity, &patrol, position, velocity);
        observations.push(observation(&id, state, position, velocity, false));
    }
    observations
}

fn apply_patrol_movement(
    entity: &mut threenative_loader::WorldEntity,
    patrol: &PatrolComponent,
    position: [f32; 3],
    velocity: [f32; 3],
) {
    let transform = entity
        .components
        .transform
        .get_or_insert_with(default_transform);
    transform.position = Some(position);
    if patrol.face_heading.unwrap_or(false) && length([velocity[0], 0.0, velocity[2]]) > EPSILON {
        let yaw = velocity[0].atan2(velocity[2]);
        transform.rotation = Some([0.0, (yaw / 2.0).sin(), 0.0, (yaw / 2.0).cos()]);
    }
    if let Some(rigid_body) = entity.components.rigid_body.as_mut()
        && rigid_body.kind == "kinematic"
    {
        rigid_body.velocity = Some(velocity);
    }
}

fn state_for<'a>(
    id: &str,
    patrol: &PatrolComponent,
    runtime: &'a mut NativePatrolRuntimeState,
) -> &'a mut PatrolState {
    let key = format!("{:?}", patrol.waypoints);
    let reset = runtime
        .states
        .get(id)
        .is_none_or(|state| state.waypoints_key != key);
    if reset {
        runtime.states.insert(
            id.to_owned(),
            PatrolState {
                direction: 1,
                pause_remaining: 0.0,
                segment: 1,
                waypoints_key: key,
            },
        );
    }
    runtime.states.get_mut(id).expect("patrol state inserted")
}

fn arrive_at_waypoint(state: &mut PatrolState, patrol: &PatrolComponent) {
    if let Some(pause) = patrol.pause_at_waypoint.filter(|pause| *pause > 0.0) {
        state.pause_remaining = pause;
    }
    if patrol.mode == "loop" {
        state.segment = (state.segment + 1) % patrol.waypoints.len();
    } else {
        if state.segment >= patrol.waypoints.len() - 1 {
            state.direction = -1;
        } else if state.segment == 0 {
            state.direction = 1;
        }
        state.segment = (state.segment as i8 + state.direction) as usize;
    }
}

fn observation(
    id: &str,
    state: &PatrolState,
    position: [f32; 3],
    velocity: [f32; 3],
    paused: bool,
) -> NativePatrolObservation {
    NativePatrolObservation {
        direction: state.direction,
        entity: id.to_owned(),
        paused,
        position,
        segment: state.segment,
        velocity,
    }
}

fn default_transform() -> TransformComponent {
    TransformComponent {
        position: Some([0.0, 0.0, 0.0]),
        rotation: Some([0.0, 0.0, 0.0, 1.0]),
        scale: Some([1.0, 1.0, 1.0]),
    }
}

fn length(value: [f32; 3]) -> f32 {
    (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt()
}
