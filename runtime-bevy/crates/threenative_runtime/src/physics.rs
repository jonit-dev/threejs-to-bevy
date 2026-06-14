use std::collections::BTreeMap;

use serde::Serialize;
use threenative_loader::{ColliderComponent, LoadedBundle, WorldEntity};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PhysicsEvent {
    pub a: String,
    pub b: String,
    pub event: String,
    pub phase: String,
}

struct Bounds<'a> {
    center: [f32; 3],
    half_extents: [f32; 3],
    id: &'a str,
    trigger: bool,
}

pub fn detect_physics_events(bundle: &LoadedBundle) -> Vec<PhysicsEvent> {
    physics_events_for_pairs(detect_pairs(
        bundle
            .world
            .entities
            .iter()
            .filter_map(entity_bounds)
            .collect::<Vec<_>>(),
    ))
}

pub fn detect_physics_event_trace(
    bundle: &LoadedBundle,
    steps: usize,
    fixed_delta: f32,
) -> Vec<PhysicsEvent> {
    let mut entities = bundle
        .world
        .entities
        .iter()
        .filter_map(simulated_entity)
        .collect::<Vec<_>>();
    let mut previous_pairs = BTreeMap::new();
    let mut events = Vec::new();
    for _step in 0..steps {
        integrate_entities(&mut entities, fixed_delta);
        let current_pairs = detect_pairs(
            entities
                .iter()
                .map(simulated_entity_bounds)
                .collect::<Vec<_>>(),
        );
        events.extend(physics_events_for_pair_delta(
            &current_pairs,
            &previous_pairs,
        ));
        previous_pairs = current_pairs;
    }
    events
}

fn physics_events_for_pairs(current_pairs: BTreeMap<String, DetectedPair>) -> Vec<PhysicsEvent> {
    physics_events_for_pair_delta(&current_pairs, &BTreeMap::new())
}

fn physics_events_for_pair_delta(
    current_pairs: &BTreeMap<String, DetectedPair>,
    previous_pairs: &BTreeMap<String, DetectedPair>,
) -> Vec<PhysicsEvent> {
    let mut events = Vec::new();
    for pair in current_pairs.values() {
        events.push(pair.event(if previous_pairs.contains_key(&pair.key) {
            "stay"
        } else {
            "enter"
        }));
    }
    for pair in previous_pairs.values() {
        if !current_pairs.contains_key(&pair.key) {
            events.push(pair.event("exit"));
        }
    }
    events.sort_by(|left, right| {
        left.event
            .cmp(&right.event)
            .then(left.a.cmp(&right.a))
            .then(left.b.cmp(&right.b))
            .then(left.phase.cmp(&right.phase))
    });
    events
}

fn integrate_entities(entities: &mut [SimulatedEntity], fixed_delta: f32) {
    for entity in entities {
        let Some(body_kind) = entity.body_kind.as_deref() else {
            continue;
        };
        if body_kind != "dynamic" && body_kind != "kinematic" {
            continue;
        }
        let Some(velocity) = entity.velocity else {
            continue;
        };
        entity.center[0] += velocity[0] * fixed_delta;
        entity.center[1] += velocity[1] * fixed_delta;
        entity.center[2] += velocity[2] * fixed_delta;
    }
}

struct SimulatedEntity {
    body_kind: Option<String>,
    center: [f32; 3],
    half_extents: [f32; 3],
    id: String,
    trigger: bool,
    velocity: Option<[f32; 3]>,
}

fn simulated_entity(entity: &WorldEntity) -> Option<SimulatedEntity> {
    let collider = entity.components.collider.as_ref()?;
    Some(SimulatedEntity {
        body_kind: entity
            .components
            .rigid_body
            .as_ref()
            .map(|body| body.kind.clone()),
        center: entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position)
            .unwrap_or([0.0, 0.0, 0.0]),
        half_extents: half_extents(collider),
        id: entity.id.clone(),
        trigger: collider.trigger.unwrap_or(false),
        velocity: entity
            .components
            .rigid_body
            .as_ref()
            .and_then(|body| body.velocity),
    })
}

fn simulated_entity_bounds(entity: &SimulatedEntity) -> Bounds<'_> {
    Bounds {
        center: entity.center,
        half_extents: entity.half_extents,
        id: &entity.id,
        trigger: entity.trigger,
    }
}

#[derive(Clone)]
struct DetectedPair {
    a: String,
    b: String,
    event: String,
    key: String,
}

impl DetectedPair {
    fn event(&self, phase: &str) -> PhysicsEvent {
        PhysicsEvent {
            a: self.a.clone(),
            b: self.b.clone(),
            event: self.event.clone(),
            phase: phase.to_owned(),
        }
    }
}

fn detect_pairs(bounds: Vec<Bounds<'_>>) -> BTreeMap<String, DetectedPair> {
    let mut pairs = BTreeMap::new();
    for left_index in 0..bounds.len() {
        for right_index in (left_index + 1)..bounds.len() {
            let left = &bounds[left_index];
            let right = &bounds[right_index];
            if overlaps(left, right) {
                let (a, b) = ordered_pair(left.id, right.id);
                let event = if left.trigger || right.trigger {
                    "TriggerEvent"
                } else {
                    "CollisionEvent"
                };
                let key = format!("{event}:{a}:{b}");
                pairs.insert(
                    key.clone(),
                    DetectedPair {
                        a: a.to_owned(),
                        b: b.to_owned(),
                        event: event.to_owned(),
                        key,
                    },
                );
            }
        }
    }
    pairs
}

fn entity_bounds(entity: &WorldEntity) -> Option<Bounds<'_>> {
    let collider = entity.components.collider.as_ref()?;
    Some(Bounds {
        center: entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position)
            .unwrap_or([0.0, 0.0, 0.0]),
        half_extents: half_extents(collider),
        id: &entity.id,
        trigger: collider.trigger.unwrap_or(false),
    })
}

fn half_extents(collider: &ColliderComponent) -> [f32; 3] {
    match collider.kind.as_str() {
        "box" => {
            let size = collider.size.unwrap_or([1.0, 1.0, 1.0]);
            [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
        }
        "sphere" => {
            let radius = collider.radius.unwrap_or(0.5);
            [radius, radius, radius]
        }
        "capsule" | "cylinder" => {
            let radius = collider.radius.unwrap_or(0.5);
            [radius, collider.height.unwrap_or(1.0) / 2.0, radius]
        }
        _ => [0.5, 0.5, 0.5],
    }
}

fn overlaps(left: &Bounds<'_>, right: &Bounds<'_>) -> bool {
    (left.center[0] - right.center[0]).abs() <= left.half_extents[0] + right.half_extents[0]
        && (left.center[1] - right.center[1]).abs() <= left.half_extents[1] + right.half_extents[1]
        && (left.center[2] - right.center[2]).abs() <= left.half_extents[2] + right.half_extents[2]
}

fn ordered_pair<'a>(left: &'a str, right: &'a str) -> (&'a str, &'a str) {
    if left <= right {
        (left, right)
    } else {
        (right, left)
    }
}
