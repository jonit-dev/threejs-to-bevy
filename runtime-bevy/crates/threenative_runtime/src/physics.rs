use std::collections::BTreeMap;

use rapier3d::prelude::*;
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
        let contacts = step_rapier_bodies(&mut entities, fixed_delta, [0.0, -9.81, 0.0]);
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

pub fn step_bundle_physics(bundle: &mut LoadedBundle, fixed_delta: f32) {
    let mut entities = bundle
        .world
        .entities
        .iter()
        .filter_map(simulated_entity)
        .collect::<Vec<_>>();
    step_rapier_bodies(&mut entities, fixed_delta, [0.0, -9.81, 0.0]);
    for simulated in entities {
        let Some(entity) = bundle
            .world
            .entities
            .iter_mut()
            .find(|entity| entity.id == simulated.id)
        else {
            continue;
        };
        if let Some(transform) = entity.components.transform.as_mut() {
            transform.position = Some(simulated.center);
        }
        if let Some(body) = entity.components.rigid_body.as_mut() {
            body.velocity = simulated.velocity;
        }
    }
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

#[derive(Clone)]
struct SimulatedEntity {
    body_kind: Option<String>,
    ccd: bool,
    center: [f32; 3],
    collider_center: [f32; 3],
    collider_kind: String,
    damping: f32,
    enabled_rotations: Option<[bool; 3]>,
    enabled_translations: Option<[bool; 3]>,
    friction: f32,
    gravity_scale: f32,
    height: Option<f32>,
    half_extents: [f32; 3],
    id: String,
    layer: Option<String>,
    mask: Vec<String>,
    mass: Option<f32>,
    radius: Option<f32>,
    restitution: f32,
    solver_iterations: Option<u32>,
    trigger: bool,
    velocity: Option<[f32; 3]>,
}

fn step_rapier_bodies(
    entities: &mut [SimulatedEntity],
    fixed_delta: f32,
    gravity: [f32; 3],
) -> BTreeMap<String, Vec<String>> {
    let mut world = PhysicsWorld::new();
    world.gravity = vector![gravity[0], gravity[1], gravity[2]].into();
    let substeps = physics_substeps(fixed_delta);
    world.integration_parameters.dt = fixed_delta / substeps as f32;
    world.integration_parameters.num_solver_iterations = 12;
    let mut handles = BTreeMap::new();
    let layer_bits = layer_bits_for_entities(entities);
    for entity in entities.iter() {
        let Some(body_kind) = entity.body_kind.as_deref() else {
            continue;
        };
        let velocity = entity.velocity.unwrap_or([0.0, 0.0, 0.0]);
        let mut body = match body_kind {
            "dynamic" => RigidBodyBuilder::dynamic(),
            "kinematic" => RigidBodyBuilder::kinematic_velocity_based(),
            _ => RigidBodyBuilder::fixed(),
        }
        .translation(vector![entity.center[0], entity.center[1], entity.center[2]].into())
        .linvel(vector![velocity[0], velocity[1], velocity[2]].into())
        .gravity_scale(if body_kind == "dynamic" { entity.gravity_scale } else { 0.0 })
        .linear_damping(entity.damping)
        .angular_damping(entity.damping)
        .ccd_enabled(entity.ccd);
        if let Some(enabled) = entity.enabled_translations {
            body = body.enabled_translations(enabled[0], enabled[1], enabled[2]);
        }
        if let Some(enabled) = entity.enabled_rotations {
            body = body.enabled_rotations(enabled[0], enabled[1], enabled[2]);
        }
        if let Some(mass) = entity.mass {
            if body_kind == "dynamic" {
                body = body.additional_mass(mass);
            }
        }
        if let Some(iterations) = entity.solver_iterations {
            body = body.additional_solver_iterations(iterations.saturating_sub(1) as usize);
        }
        let groups = rapier_collision_groups(entity, &layer_bits);
        let collider = rapier_collider(entity)
            .translation(vector![
                entity.collider_center[0],
                entity.collider_center[1],
                entity.collider_center[2]
            ].into())
            .friction(entity.friction)
            .restitution(entity.restitution)
            .sensor(entity.trigger)
            .collision_groups(groups)
            .solver_groups(groups);
        let (body_handle, _) = world.insert(body, collider);
        handles.insert(entity.id.clone(), body_handle);
    }

    for _ in 0..substeps {
        world.step();
    }

    for entity in entities.iter_mut() {
        let Some(handle) = handles.get(&entity.id) else {
            continue;
        };
        let body = &world.bodies[*handle];
        let translation = body.translation();
        let velocity = body.linvel();
        entity.center = [translation.x, translation.y, translation.z];
        entity.velocity = Some([velocity.x, velocity.y, velocity.z]);
    }

    contacts_from_overlaps(entities)
}

fn physics_substeps(fixed_delta: f32) -> usize {
    (fixed_delta / (1.0 / 120.0)).ceil().max(1.0) as usize
}

fn layer_bits_for_entities(entities: &[SimulatedEntity]) -> BTreeMap<String, u32> {
    let mut layers = BTreeMap::new();
    for entity in entities {
        let Some(layer) = entity.layer.as_ref() else {
            continue;
        };
        if layers.contains_key(layer) {
            continue;
        }
        let index = layers.len();
        if index < 16 {
            layers.insert(layer.clone(), 1_u32 << index);
        }
    }
    layers
}

fn rapier_collision_groups(
    entity: &SimulatedEntity,
    layer_bits: &BTreeMap<String, u32>,
) -> InteractionGroups {
    let membership = entity
        .layer
        .as_ref()
        .and_then(|layer| layer_bits.get(layer).copied())
        .unwrap_or(Group::ALL.bits());
    let filter = if entity.mask.is_empty() {
        Group::ALL.bits()
    } else {
        entity
            .mask
            .iter()
            .filter_map(|layer| layer_bits.get(layer).copied())
            .fold(0_u32, |bits, bit| bits | bit)
    };
    InteractionGroups::new(
        Group::from_bits_truncate(membership),
        Group::from_bits_truncate(filter),
        InteractionTestMode::And,
    )
}

fn rapier_collider(entity: &SimulatedEntity) -> ColliderBuilder {
    match entity.collider_kind.as_str() {
        "sphere" => ColliderBuilder::ball(entity.radius.unwrap_or(entity.half_extents[0])),
        "capsule" => ColliderBuilder::capsule_y(
            entity.height.unwrap_or(entity.half_extents[1] * 2.0) / 2.0,
            entity.radius.unwrap_or(entity.half_extents[0]),
        ),
        "cylinder" => ColliderBuilder::cylinder(
            entity.height.unwrap_or(entity.half_extents[1] * 2.0) / 2.0,
            entity.radius.unwrap_or(entity.half_extents[0]),
        ),
        _ => ColliderBuilder::cuboid(
            entity.half_extents[0],
            entity.half_extents[1],
            entity.half_extents[2],
        ),
    }
}

fn contacts_from_overlaps(entities: &[SimulatedEntity]) -> BTreeMap<String, Vec<String>> {
    let mut contacts: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for pair in detect_pairs(
        entities
            .iter()
            .map(simulated_entity_bounds)
            .collect::<Vec<_>>(),
    )
    .values()
    {
        contacts
            .entry(pair.a.clone())
            .or_default()
            .push(pair.b.clone());
        contacts
            .entry(pair.b.clone())
            .or_default()
            .push(pair.a.clone());
    }
    for values in contacts.values_mut() {
        values.sort();
    }
    contacts
}

fn simulated_entity(entity: &WorldEntity) -> Option<SimulatedEntity> {
    let collider = entity.components.collider.as_ref()?;
    let body = entity.components.rigid_body.as_ref();
    Some(SimulatedEntity {
        body_kind: body.map(|body| body.kind.clone()),
        ccd: body
            .and_then(|body| body.ccd.as_ref())
            .map(|ccd| ccd.enabled)
            .unwrap_or(false),
        center: entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position)
            .unwrap_or([0.0, 0.0, 0.0]),
        collider_center: collider_local_center(collider),
        collider_kind: collider.kind.clone(),
        damping: body.and_then(|body| body.damping).unwrap_or(0.0),
        enabled_rotations: body.and_then(|body| body.enabled_rotations),
        enabled_translations: body.and_then(|body| body.enabled_translations),
        friction: collider.friction.unwrap_or(0.0),
        gravity_scale: body.and_then(|body| body.gravity_scale).unwrap_or(1.0),
        height: collider.height,
        half_extents: half_extents(collider),
        id: entity.id.clone(),
        layer: collider.layer.clone(),
        mask: collider.mask.clone().unwrap_or_default(),
        mass: body.and_then(|body| body.mass),
        radius: collider.radius,
        restitution: collider.restitution.unwrap_or(0.0),
        solver_iterations: body.and_then(|body| body.solver_iterations),
        trigger: collider.trigger.unwrap_or(false),
        velocity: body.and_then(|body| body.velocity),
    })
}

fn simulated_entity_bounds(entity: &SimulatedEntity) -> Bounds<'_> {
    Bounds {
        center: [
            entity.center[0] + entity.collider_center[0],
            entity.center[1] + entity.collider_center[1],
            entity.center[2] + entity.collider_center[2],
        ],
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
        center: {
            let center = collider_local_center(collider);
            [
                transform_position[0] + center[0],
                transform_position[1] + center[1],
                transform_position[2] + center[2],
            ]
        },
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

fn collider_local_center(collider: &ColliderComponent) -> [f32; 3] {
    if let Some(center) = collider.center {
        return center;
    }
    collider
        .mesh
        .as_ref()
        .and_then(|mesh| mesh.bounds.center)
        .unwrap_or([0.0, 0.0, 0.0])
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
