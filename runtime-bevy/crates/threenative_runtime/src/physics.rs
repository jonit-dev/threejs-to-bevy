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

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RigidBodyTraceObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ccd: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contacts: Option<Vec<String>>,
    pub damping: f32,
    pub entity: String,
    pub friction: f32,
    pub gravity_scale: f32,
    pub position: [f32; 3],
    pub restitution: f32,
    pub step: usize,
    pub velocity: [f32; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsJointObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axis: Option<[f32; 3]>,
    pub connected_entity: String,
    pub entity: String,
    pub kind: String,
}

struct Bounds<'a> {
    center: [f32; 3],
    half_extents: [f32; 3],
    id: &'a str,
    layer: Option<&'a str>,
    mask: &'a [String],
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

pub fn trace_rigid_body_primitives(
    bundle: &LoadedBundle,
    steps: usize,
    fixed_delta: f32,
) -> Vec<RigidBodyTraceObservation> {
    let mut entities = bundle
        .world
        .entities
        .iter()
        .filter_map(simulated_entity)
        .collect::<Vec<_>>();
    let mut observations = Vec::new();
    for step in 1..=steps {
        let contacts = step_primitive_bodies(&mut entities, fixed_delta, [0.0, -9.81, 0.0]);
        for entity in entities
            .iter()
            .filter(|entity| entity.body_kind.as_deref() == Some("dynamic"))
        {
            observations.push(RigidBodyTraceObservation {
                ccd: if entity.ccd { Some(true) } else { None },
                contact: contacts
                    .get(&entity.id)
                    .and_then(|contacts| contacts.first().cloned()),
                contacts: contacts.get(&entity.id).and_then(|contacts| {
                    if contacts.len() > 1 {
                        Some(contacts.clone())
                    } else {
                        None
                    }
                }),
                damping: round(entity.damping),
                entity: entity.id.clone(),
                friction: round(entity.friction),
                gravity_scale: round(entity.gravity_scale),
                position: round_vec3(entity.center),
                restitution: round(entity.restitution),
                step,
                velocity: round_vec3(entity.velocity.unwrap_or([0.0, 0.0, 0.0])),
            });
        }
    }
    observations.sort_by(|left, right| {
        left.step
            .cmp(&right.step)
            .then(left.entity.cmp(&right.entity))
    });
    observations
}

pub fn trace_physics_joints(bundle: &LoadedBundle) -> Vec<PhysicsJointObservation> {
    let mut observations = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            let joint = entity.components.physics_joint.as_ref()?;
            Some(PhysicsJointObservation {
                axis: joint.axis,
                connected_entity: joint.connected_entity.clone(),
                entity: entity.id.clone(),
                kind: joint.kind.clone(),
            })
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.entity.cmp(&right.entity));
    observations
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
        let velocity = entity.velocity.unwrap_or([0.0, 0.0, 0.0]);
        entity.center[0] += velocity[0] * fixed_delta;
        entity.center[1] += velocity[1] * fixed_delta;
        entity.center[2] += velocity[2] * fixed_delta;
    }
}

fn step_primitive_bodies(
    entities: &mut [SimulatedEntity],
    fixed_delta: f32,
    gravity: [f32; 3],
) -> BTreeMap<String, Vec<String>> {
    let previous_centers = entities
        .iter()
        .map(|entity| (entity.id.clone(), entity.center))
        .collect::<BTreeMap<_, _>>();
    for entity in entities.iter_mut() {
        let Some(body_kind) = entity.body_kind.as_deref() else {
            continue;
        };
        if body_kind != "dynamic" && body_kind != "kinematic" {
            continue;
        }
        let source_velocity = entity.velocity.unwrap_or([0.0, 0.0, 0.0]);
        let damping_factor = (1.0 - entity.damping * fixed_delta).max(0.0);
        let gravity_scale = if body_kind == "dynamic" {
            entity.gravity_scale
        } else {
            0.0
        };
        let velocity = [
            (source_velocity[0] + gravity[0] * gravity_scale * fixed_delta) * damping_factor,
            (source_velocity[1] + gravity[1] * gravity_scale * fixed_delta) * damping_factor,
            (source_velocity[2] + gravity[2] * gravity_scale * fixed_delta) * damping_factor,
        ];
        entity.velocity = Some(velocity);
        entity.center[0] += velocity[0] * fixed_delta;
        entity.center[1] += velocity[1] * fixed_delta;
        entity.center[2] += velocity[2] * fixed_delta;
    }

    let mut blockers = entities
        .iter()
        .filter(|entity| {
            matches!(
                entity.body_kind.as_deref(),
                Some("static") | Some("kinematic")
            )
        })
        .cloned()
        .collect::<Vec<_>>();
    blockers.sort_by(|left, right| {
        entity_bottom(left)
            .partial_cmp(&entity_bottom(right))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(left.id.cmp(&right.id))
    });
    let mut contacts = BTreeMap::new();
    let mut dynamic_indices = entities
        .iter()
        .enumerate()
        .filter(|(_, entity)| entity.body_kind.as_deref() == Some("dynamic"))
        .map(|(index, entity)| (index, entity_bottom(entity), entity.id.clone()))
        .collect::<Vec<_>>();
    dynamic_indices.sort_by(|left, right| {
        left.1
            .partial_cmp(&right.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(left.2.cmp(&right.2))
    });
    let mut settled = Vec::new();
    for (index, _, _) in dynamic_indices {
        let mut local_blockers = blockers.clone();
        local_blockers.extend(settled.clone());
        local_blockers.sort_by(|left, right| left.id.cmp(&right.id));
        for floor in &local_blockers {
            if floor.id == entities[index].id {
                continue;
            }
            let previous_center = previous_centers.get(&entities[index].id).copied();
            if resolve_vertical_contact(&mut entities[index], floor, previous_center) {
                let entry = contacts
                    .entry(entities[index].id.clone())
                    .or_insert_with(Vec::new);
                entry.push(floor.id.clone());
                entry.sort();
            }
        }
        settled.push(entities[index].clone());
    }
    contacts
}

fn entity_bottom(entity: &SimulatedEntity) -> f32 {
    entity.center[1] - entity.half_extents[1]
}

fn resolve_vertical_contact(
    entity: &mut SimulatedEntity,
    floor: &SimulatedEntity,
    previous_center: Option<[f32; 3]>,
) -> bool {
    let entity_bounds = simulated_entity_bounds(entity);
    let floor_bounds = simulated_entity_bounds(floor);
    if !overlaps(&entity_bounds, &floor_bounds)
        && !swept_vertical_overlap(entity, &entity_bounds, &floor_bounds, previous_center)
    {
        return false;
    }
    let floor_top = floor.center[1] + floor.half_extents[1];
    entity.center[1] = round(floor_top + entity.half_extents[1]);
    let restitution = entity.restitution.max(floor.restitution);
    let friction = (entity.friction + floor.friction) / 2.0;
    let velocity = entity.velocity.unwrap_or([0.0, 0.0, 0.0]);
    let next_y = if velocity[1] < 0.0 {
        -velocity[1] * restitution
    } else {
        velocity[1]
    };
    let friction_factor = (1.0 - friction).max(0.0);
    entity.velocity = Some([
        velocity[0] * friction_factor,
        if next_y.abs() < 0.000001 { 0.0 } else { next_y },
        velocity[2] * friction_factor,
    ]);
    true
}

fn swept_vertical_overlap(
    entity: &SimulatedEntity,
    bounds: &Bounds<'_>,
    floor_bounds: &Bounds<'_>,
    previous_center: Option<[f32; 3]>,
) -> bool {
    if !entity.ccd {
        return false;
    }
    let Some(previous_center) = previous_center else {
        return false;
    };
    let previous_bottom = previous_center[1] - bounds.half_extents[1];
    let current_bottom = bounds.center[1] - bounds.half_extents[1];
    let floor_top = floor_bounds.center[1] + floor_bounds.half_extents[1];
    let x_overlaps = (bounds.center[0] - floor_bounds.center[0]).abs()
        <= bounds.half_extents[0] + floor_bounds.half_extents[0];
    let z_overlaps = (bounds.center[2] - floor_bounds.center[2]).abs()
        <= bounds.half_extents[2] + floor_bounds.half_extents[2];
    x_overlaps && z_overlaps && previous_bottom >= floor_top && current_bottom <= floor_top
}

#[derive(Clone)]
struct SimulatedEntity {
    body_kind: Option<String>,
    ccd: bool,
    center: [f32; 3],
    damping: f32,
    friction: f32,
    gravity_scale: f32,
    half_extents: [f32; 3],
    id: String,
    layer: Option<String>,
    mask: Vec<String>,
    restitution: f32,
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
        ccd: entity
            .components
            .rigid_body
            .as_ref()
            .and_then(|body| body.ccd.as_ref())
            .map(|ccd| ccd.enabled)
            .unwrap_or(false),
        center: collider_center(
            collider,
            entity
                .components
                .transform
                .as_ref()
                .and_then(|transform| transform.position)
                .unwrap_or([0.0, 0.0, 0.0]),
        ),
        damping: entity
            .components
            .rigid_body
            .as_ref()
            .and_then(|body| body.damping)
            .unwrap_or(0.0),
        friction: collider.friction.unwrap_or(0.0),
        gravity_scale: entity
            .components
            .rigid_body
            .as_ref()
            .and_then(|body| body.gravity_scale)
            .unwrap_or(1.0),
        half_extents: half_extents(collider),
        id: entity.id.clone(),
        layer: collider.layer.clone(),
        mask: collider.mask.clone().unwrap_or_default(),
        restitution: collider.restitution.unwrap_or(0.0),
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
        layer: entity.layer.as_deref(),
        mask: &entity.mask,
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
            if overlaps(left, right) && passes_contact_filter(left, right) {
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
    let transform_position = entity
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .unwrap_or([0.0, 0.0, 0.0]);
    Some(Bounds {
        center: collider_center(collider, transform_position),
        half_extents: half_extents(collider),
        id: &entity.id,
        layer: collider.layer.as_deref(),
        mask: collider.mask.as_deref().unwrap_or(&[]),
        trigger: collider.trigger.unwrap_or(false),
    })
}

fn half_extents(collider: &ColliderComponent) -> [f32; 3] {
    match collider.kind.as_str() {
        "mesh" => {
            if let Some(mesh) = collider.mesh.as_ref() {
                let size = mesh.bounds.size;
                [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
            } else {
                [0.5, 0.5, 0.5]
            }
        }
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

fn collider_center(collider: &ColliderComponent, transform_position: [f32; 3]) -> [f32; 3] {
    let Some(mesh) = collider.mesh.as_ref() else {
        return transform_position;
    };
    let Some(center) = mesh.bounds.center else {
        return transform_position;
    };
    [
        transform_position[0] + center[0],
        transform_position[1] + center[1],
        transform_position[2] + center[2],
    ]
}

fn overlaps(left: &Bounds<'_>, right: &Bounds<'_>) -> bool {
    (left.center[0] - right.center[0]).abs() <= left.half_extents[0] + right.half_extents[0]
        && (left.center[1] - right.center[1]).abs() <= left.half_extents[1] + right.half_extents[1]
        && (left.center[2] - right.center[2]).abs() <= left.half_extents[2] + right.half_extents[2]
}

fn passes_contact_filter(left: &Bounds<'_>, right: &Bounds<'_>) -> bool {
    allows(left, right) && allows(right, left)
}

fn allows(left: &Bounds<'_>, right: &Bounds<'_>) -> bool {
    left.mask.is_empty()
        || right
            .layer
            .is_some_and(|layer| left.mask.iter().any(|candidate| candidate == layer))
}

fn round_vec3(value: [f32; 3]) -> [f32; 3] {
    [round(value[0]), round(value[1]), round(value[2])]
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

fn ordered_pair<'a>(left: &'a str, right: &'a str) -> (&'a str, &'a str) {
    if left <= right {
        (left, right)
    } else {
        (right, left)
    }
}
