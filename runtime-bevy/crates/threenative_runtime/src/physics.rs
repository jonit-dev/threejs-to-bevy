use std::cell::RefCell;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::hash::{DefaultHasher, Hash, Hasher};

use rapier3d::glamx::{Quat as RapierQuat, Vec3 as RapierVec3};
use rapier3d::prelude::*;
use serde::Serialize;
use threenative_loader::{
    AssetIr, ColliderComponent, LoadedBundle, PhysicsJointComponent, WorldEntity,
};

thread_local! {
    static RAPIER_CACHES: RefCell<BTreeMap<usize, PersistentRapierWorld>> = const { RefCell::new(BTreeMap::new()) };
}

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

pub fn step_bundle_physics(bundle: &mut LoadedBundle, fixed_delta: f32) {
    step_bundle_physics_with_script_poses(bundle, fixed_delta, &BTreeSet::new());
}

pub fn inspect_physics_body_mass(bundle: &LoadedBundle, entity_id: &str) -> Option<f32> {
    let entities = simulated_rapier_entities(bundle);
    let runtime = PersistentRapierWorld::new(
        &entities,
        [0.0, -9.81, 0.0],
        rapier_world_signature(&entities, [0.0, -9.81, 0.0]),
    );
    runtime
        .handles
        .get(entity_id)
        .and_then(|handle| runtime.world.bodies.get(*handle))
        .map(|body| body.mass())
}

pub fn inspect_cached_physics_body_sleeping(
    script_posed_entities: &BTreeSet<String>,
    entity_id: &str,
) -> Option<bool> {
    let runtime_id = script_posed_entities as *const BTreeSet<String> as usize;
    RAPIER_CACHES.with(|caches| {
        let caches = caches.borrow();
        let runtime = caches.get(&runtime_id)?;
        let handle = runtime.handles.get(entity_id)?;
        runtime
            .world
            .bodies
            .get(*handle)
            .map(RigidBody::is_sleeping)
    })
}

pub fn inspect_cached_physics_ccd_substeps(
    script_posed_entities: &BTreeSet<String>,
) -> Option<usize> {
    let runtime_id = script_posed_entities as *const BTreeSet<String> as usize;
    RAPIER_CACHES.with(|caches| {
        caches
            .borrow()
            .get(&runtime_id)
            .map(|runtime| runtime.world.integration_parameters.max_ccd_substeps)
    })
}

pub fn step_bundle_physics_with_script_poses(
    bundle: &mut LoadedBundle,
    fixed_delta: f32,
    script_posed_entities: &BTreeSet<String>,
) {
    let mut entities = simulated_rapier_entities(bundle);
    let gravity = bundle
        .runtime_config
        .as_ref()
        .and_then(|config| config.physics.as_ref())
        .map(|physics| physics.gravity)
        .unwrap_or([0.0, -9.81, 0.0]);
    let events = step_rapier_bodies(&mut entities, fixed_delta, gravity, script_posed_entities);
    let entity_indexes = bundle
        .world
        .entities
        .iter()
        .enumerate()
        .map(|(index, entity)| (entity.id.clone(), index))
        .collect::<BTreeMap<_, _>>();
    for simulated in entities {
        let Some(index) = entity_indexes.get(&simulated.id).copied() else {
            continue;
        };
        let entity = &mut bundle.world.entities[index];
        if let Some(transform) = entity.components.transform.as_mut() {
            transform.position = Some(simulated.center);
            transform.rotation = Some(simulated.rotation);
        }
        if let Some(body) = entity.components.rigid_body.as_mut() {
            body.velocity = simulated.velocity;
            body.angular_velocity = simulated.angular_velocity;
        }
    }
    write_live_event_queues(bundle, &events);
}

fn write_live_event_queues(bundle: &mut LoadedBundle, events: &[PhysicsEvent]) {
    for event_name in ["CollisionEvent", "TriggerEvent"] {
        let payloads = events
            .iter()
            .filter(|event| event.event == event_name)
            .map(|event| {
                serde_json::json!({
                    "a": event.a,
                    "b": event.b,
                    "phase": event.phase,
                })
            })
            .collect::<Vec<_>>();
        bundle
            .world
            .events
            .insert(event_name.to_owned(), serde_json::Value::Array(payloads));
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
        integrate_entity(entity, fixed_delta, gravity);
    }

    let mut static_or_kinematic = entities
        .iter()
        .filter(|entity| {
            matches!(
                entity.body_kind.as_deref(),
                Some("static") | Some("kinematic")
            ) && !entity.trigger
        })
        .cloned()
        .collect::<Vec<_>>();
    static_or_kinematic.sort_by(compare_entity_bottom_then_id);

    let mut dynamic_indices = entities
        .iter()
        .enumerate()
        .filter(|(_, entity)| entity.body_kind.as_deref() == Some("dynamic"))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    dynamic_indices
        .sort_by(|left, right| compare_entity_bottom_then_id(&entities[*left], &entities[*right]));

    let mut contacts: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut settled_dynamics = Vec::new();
    for index in dynamic_indices {
        let previous_center = previous_centers.get(&entities[index].id).copied();
        let mut blockers = static_or_kinematic.clone();
        blockers.extend(settled_dynamics.clone());
        blockers.sort_by(|left, right| left.id.cmp(&right.id));
        for blocker in blockers {
            if blocker.id == entities[index].id
                || !passes_simulated_contact_filter(&entities[index], &blocker)
            {
                continue;
            }
            if resolve_vertical_contact(&mut entities[index], &blocker, previous_center) {
                contacts
                    .entry(entities[index].id.clone())
                    .or_default()
                    .push(blocker.id.clone());
            }
        }
        if let Some(values) = contacts.get_mut(&entities[index].id) {
            values.sort();
        }
        settled_dynamics.push(entities[index].clone());
    }

    contacts
}

fn integrate_entity(entity: &mut SimulatedEntity, fixed_delta: f32, gravity: [f32; 3]) {
    let Some(body_kind) = entity.body_kind.as_deref() else {
        return;
    };
    if body_kind != "dynamic" && body_kind != "kinematic" {
        return;
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
    entity.center = [
        entity.center[0] + velocity[0] * fixed_delta,
        entity.center[1] + velocity[1] * fixed_delta,
        entity.center[2] + velocity[2] * fixed_delta,
    ];
}

fn resolve_vertical_contact(
    entity: &mut SimulatedEntity,
    floor: &SimulatedEntity,
    previous_center: Option<[f32; 3]>,
) -> bool {
    let bounds = Bounds {
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
    };
    let floor_bounds = simulated_entity_bounds(floor);
    let previous_bounds_center = previous_center.map(|center| {
        [
            center[0] + entity.collider_center[0],
            center[1] + entity.collider_center[1],
            center[2] + entity.collider_center[2],
        ]
    });
    if !overlaps(&bounds, &floor_bounds)
        && !swept_vertical_overlap(entity, &bounds, &floor_bounds, previous_bounds_center)
    {
        return false;
    }

    let floor_top = floor_bounds.center[1] + floor_bounds.half_extents[1];
    let resolved_y = floor_top + bounds.half_extents[1];
    entity.center[1] = round(resolved_y - entity.collider_center[1]);
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

fn passes_simulated_contact_filter(left: &SimulatedEntity, right: &SimulatedEntity) -> bool {
    let left_accepts = left.mask.is_empty()
        || right
            .layer
            .as_ref()
            .is_some_and(|layer| left.mask.contains(layer));
    let right_accepts = right.mask.is_empty()
        || left
            .layer
            .as_ref()
            .is_some_and(|layer| right.mask.contains(layer));
    left_accepts && right_accepts
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

fn compare_entity_bottom_then_id(
    left: &SimulatedEntity,
    right: &SimulatedEntity,
) -> std::cmp::Ordering {
    entity_bottom(left)
        .partial_cmp(&entity_bottom(right))
        .unwrap_or(std::cmp::Ordering::Equal)
        .then(left.id.cmp(&right.id))
}

fn entity_bottom(entity: &SimulatedEntity) -> f32 {
    entity.center[1] - entity.half_extents[1]
}

#[derive(Clone)]
struct SimulatedEntity {
    angular_velocity: Option<[f32; 3]>,
    body_kind: Option<String>,
    ccd: bool,
    ccd_max_substeps: Option<u32>,
    ccd_mode: Option<String>,
    center: [f32; 3],
    collider_center: [f32; 3],
    collider_kind: String,
    damping: f32,
    enabled_rotations: Option<[bool; 3]>,
    enabled_translations: Option<[bool; 3]>,
    friction: f32,
    gravity_scale: f32,
    height: Option<f32>,
    heightfield: Option<HeightfieldCollider>,
    half_extents: [f32; 3],
    id: String,
    layer: Option<String>,
    mask: Vec<String>,
    mass: Option<f32>,
    joint: Option<PhysicsJointComponent>,
    radius: Option<f32>,
    restitution: f32,
    rotation: [f32; 4],
    solver_iterations: Option<u32>,
    sleep_threshold: Option<f32>,
    trigger: bool,
    velocity: Option<[f32; 3]>,
}

#[derive(Clone)]
struct HeightfieldCollider {
    heights: Vec<f32>,
    rows: usize,
    cols: usize,
    scale: [f32; 3],
}

fn simulated_rapier_entities(bundle: &LoadedBundle) -> Vec<SimulatedEntity> {
    let mut entities = bundle
        .world
        .entities
        .iter()
        .filter_map(simulated_entity)
        .collect::<Vec<_>>();
    if let Some(terrain) = simulated_heightfield_terrain(bundle) {
        entities.push(terrain);
    }
    entities
}

fn simulated_heightfield_terrain(bundle: &LoadedBundle) -> Option<SimulatedEntity> {
    let terrain = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.terrain.as_ref())?;
    let collider = terrain
        .collider
        .as_ref()
        .filter(|collider| collider.kind == "heightfield")?;
    let asset = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == collider.mesh)?;
    let heightfield = heightfield_from_mesh(asset, collider.sample_count)?;
    let center = [
        (terrain.bounds.min[0] + terrain.bounds.max[0]) / 2.0,
        0.0,
        (terrain.bounds.min[2] + terrain.bounds.max[2]) / 2.0,
    ];
    Some(SimulatedEntity {
        angular_velocity: None,
        body_kind: Some("static".to_owned()),
        ccd: false,
        ccd_max_substeps: None,
        ccd_mode: None,
        center,
        collider_center: [0.0, 0.0, 0.0],
        collider_kind: "heightfield".to_owned(),
        damping: 0.0,
        enabled_rotations: None,
        enabled_translations: None,
        friction: 0.5,
        gravity_scale: 0.0,
        height: None,
        heightfield: Some(heightfield),
        half_extents: [
            (terrain.bounds.max[0] - terrain.bounds.min[0]) / 2.0,
            (terrain.bounds.max[1] - terrain.bounds.min[1]) / 2.0,
            (terrain.bounds.max[2] - terrain.bounds.min[2]) / 2.0,
        ],
        id: format!("terrain:{}:collider", terrain.id),
        layer: Some("world".to_owned()),
        mask: Vec::new(),
        mass: None,
        joint: None,
        radius: None,
        restitution: 0.0,
        rotation: [0.0, 0.0, 0.0, 1.0],
        solver_iterations: None,
        sleep_threshold: None,
        trigger: false,
        velocity: None,
    })
}

fn heightfield_from_mesh(asset: &AssetIr, sample_count: [usize; 2]) -> Option<HeightfieldCollider> {
    let cols = sample_count[0];
    let rows = sample_count[1];
    if cols < 2 || rows < 2 {
        return None;
    }
    let positions = asset
        .attributes
        .as_deref()?
        .iter()
        .find(|attribute| attribute.name == "position" && attribute.item_size == 3)?;
    let mut samples = positions
        .values
        .chunks_exact(3)
        .map(|chunk| ([chunk[0], chunk[2]], chunk[1]))
        .collect::<Vec<_>>();
    if samples.len() != rows * cols {
        return None;
    }
    samples.sort_by(|left, right| {
        left.0[1]
            .partial_cmp(&right.0[1])
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(
                left.0[0]
                    .partial_cmp(&right.0[0])
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
    });
    let min_x = samples
        .iter()
        .map(|sample| sample.0[0])
        .fold(f32::INFINITY, f32::min);
    let max_x = samples
        .iter()
        .map(|sample| sample.0[0])
        .fold(f32::NEG_INFINITY, f32::max);
    let min_z = samples
        .iter()
        .map(|sample| sample.0[1])
        .fold(f32::INFINITY, f32::min);
    let max_z = samples
        .iter()
        .map(|sample| sample.0[1])
        .fold(f32::NEG_INFINITY, f32::max);
    Some(HeightfieldCollider {
        heights: heightfield_column_major_heights(&samples, rows, cols),
        rows,
        cols,
        scale: [(max_x - min_x).max(0.001), 1.0, (max_z - min_z).max(0.001)],
    })
}

fn heightfield_column_major_heights(
    samples: &[([f32; 2], f32)],
    rows: usize,
    cols: usize,
) -> Vec<f32> {
    let mut heights = Vec::with_capacity(samples.len());
    for col in 0..cols {
        for row in 0..rows {
            heights.push(samples[row * cols + col].1);
        }
    }
    heights
}

fn step_rapier_bodies(
    entities: &mut [SimulatedEntity],
    fixed_delta: f32,
    gravity: [f32; 3],
    script_posed_entities: &BTreeSet<String>,
) -> Vec<PhysicsEvent> {
    let runtime_id = script_posed_entities as *const BTreeSet<String> as usize;
    RAPIER_CACHES.with(|caches| {
        let mut caches = caches.borrow_mut();
        let signature = rapier_world_signature(entities, gravity);
        if caches
            .get(&runtime_id)
            .is_none_or(|cache| cache.signature != signature)
        {
            caches.insert(
                runtime_id,
                PersistentRapierWorld::new(entities, gravity, signature),
            );
        }
        caches
            .get_mut(&runtime_id)
            .expect("rapier cache should be initialized")
            .step(entities, fixed_delta, script_posed_entities)
    })
}

pub(crate) fn dispose_native_physics_runtime(script_posed_entities: &BTreeSet<String>) {
    let runtime_id = script_posed_entities as *const BTreeSet<String> as usize;
    RAPIER_CACHES.with(|caches| {
        caches.borrow_mut().remove(&runtime_id);
    });
}

struct PersistentRapierWorld {
    collider_handles: BTreeMap<String, ColliderHandle>,
    handles: BTreeMap<String, RigidBodyHandle>,
    previous_pairs: BTreeMap<String, DetectedPair>,
    signature: u64,
    world: PhysicsWorld,
}

impl PersistentRapierWorld {
    fn new(entities: &[SimulatedEntity], gravity: [f32; 3], signature: u64) -> Self {
        let mut world = PhysicsWorld::new();
        world.gravity = vector![gravity[0], gravity[1], gravity[2]].into();
        world.integration_parameters.num_solver_iterations = 12;
        world.integration_parameters.max_ccd_substeps = entities
            .iter()
            .filter(|entity| entity.ccd)
            .filter_map(|entity| entity.ccd_max_substeps)
            .max()
            .unwrap_or(1) as usize;
        let mut handles = BTreeMap::new();
        let mut collider_handles = BTreeMap::new();
        let layer_bits = layer_bits_for_entities(entities);
        for entity in entities {
            let Some(body_kind) = entity.body_kind.as_deref() else {
                continue;
            };
            let rotation = RapierQuat::from_xyzw(
                entity.rotation[0],
                entity.rotation[1],
                entity.rotation[2],
                entity.rotation[3],
            )
            .normalize();
            let mut body = match body_kind {
                "dynamic" => RigidBodyBuilder::dynamic(),
                "kinematic" => RigidBodyBuilder::kinematic_velocity_based(),
                _ => RigidBodyBuilder::fixed(),
            }
            .translation(vector![entity.center[0], entity.center[1], entity.center[2]].into())
            .rotation(rotation.to_scaled_axis())
            .linvel(vector![0.0, 0.0, 0.0].into())
            .gravity_scale(if body_kind == "dynamic" {
                entity.gravity_scale
            } else {
                0.0
            })
            .linear_damping(entity.damping)
            .angular_damping(entity.damping)
            .ccd_enabled(entity.ccd)
            .can_sleep(entity.sleep_threshold != Some(0.0));
            if let Some(enabled) = entity.enabled_translations {
                body = body.enabled_translations(enabled[0], enabled[1], enabled[2]);
            }
            if let Some(enabled) = entity.enabled_rotations {
                body = body.enabled_rotations(enabled[0], enabled[1], enabled[2]);
            }
            if let Some(angular_velocity) = constrained_angular_velocity(entity) {
                body = body.angvel(RapierVec3::new(
                    angular_velocity[0],
                    angular_velocity[1],
                    angular_velocity[2],
                ));
            }
            if let Some(iterations) = entity.solver_iterations {
                body = body.additional_solver_iterations(iterations.saturating_sub(1) as usize);
            }
            let groups = rapier_collision_groups(entity, &layer_bits);
            let mut collider = rapier_collider(entity)
                .translation(
                    vector![
                        entity.collider_center[0],
                        entity.collider_center[1],
                        entity.collider_center[2]
                    ]
                    .into(),
                )
                .friction(entity.friction)
                .restitution(entity.restitution)
                .sensor(entity.trigger)
                .active_collision_types(ActiveCollisionTypes::all())
                .collision_groups(groups)
                .solver_groups(groups);
            if body_kind == "dynamic"
                && let Some(mass) = entity.mass
            {
                collider = collider.mass(mass);
            }
            let (body_handle, collider_handle) = world.insert(body, collider);
            if let Some(threshold) = entity.sleep_threshold.filter(|threshold| *threshold > 0.0)
                && let Some(body) = world.bodies.get_mut(body_handle)
            {
                body.activation_mut().normalized_linear_threshold = threshold;
                body.activation_mut().angular_threshold = threshold;
            }
            handles.insert(entity.id.clone(), body_handle);
            collider_handles.insert(entity.id.clone(), collider_handle);
        }

        for entity in entities {
            let Some(joint) = entity.joint.as_ref() else {
                continue;
            };
            let (Some(connected_handle), Some(body_handle)) = (
                handles.get(&joint.connected_entity).copied(),
                handles.get(&entity.id).copied(),
            ) else {
                continue;
            };
            let Some(connected) = entities
                .iter()
                .find(|candidate| candidate.id == joint.connected_entity)
            else {
                continue;
            };
            if let Some(data) = rapier_joint(entity, connected, joint) {
                world.insert_impulse_joint(connected_handle, body_handle, data);
            }
        }

        Self {
            collider_handles,
            handles,
            previous_pairs: BTreeMap::new(),
            signature,
            world,
        }
    }

    fn step(
        &mut self,
        entities: &mut [SimulatedEntity],
        fixed_delta: f32,
        script_posed_entities: &BTreeSet<String>,
    ) -> Vec<PhysicsEvent> {
        let substeps = physics_substeps(fixed_delta);
        self.world.integration_parameters.dt = fixed_delta / substeps as f32;

        for entity in entities.iter() {
            let Some(handle) = self.handles.get(&entity.id).copied() else {
                continue;
            };
            let Some(body) = self.world.bodies.get_mut(handle) else {
                continue;
            };
            let source_velocity = entity.velocity.unwrap_or([0.0, 0.0, 0.0]);
            let script_posed_kinematic = entity.body_kind.as_deref() == Some("kinematic")
                && script_posed_entities.contains(&entity.id);
            let current_translation = body.translation();
            let velocity = if script_posed_kinematic {
                [
                    (entity.center[0] - current_translation.x) / fixed_delta,
                    (entity.center[1] - current_translation.y) / fixed_delta,
                    (entity.center[2] - current_translation.z) / fixed_delta,
                ]
            } else {
                source_velocity
            };
            let rotation = RapierQuat::from_xyzw(
                entity.rotation[0],
                entity.rotation[1],
                entity.rotation[2],
                entity.rotation[3],
            )
            .normalize();
            let angular_velocity = constrained_angular_velocity(entity).unwrap_or([0.0, 0.0, 0.0]);
            let current_rotation = body.rotation();
            let current_velocity = body.linvel();
            let current_angular_velocity = body.angvel();
            let authored_change = current_translation.x != entity.center[0]
                || current_translation.y != entity.center[1]
                || current_translation.z != entity.center[2]
                || current_rotation.x != rotation.x
                || current_rotation.y != rotation.y
                || current_rotation.z != rotation.z
                || current_rotation.w != rotation.w
                || current_velocity.x != velocity[0]
                || current_velocity.y != velocity[1]
                || current_velocity.z != velocity[2]
                || current_angular_velocity.x != angular_velocity[0]
                || current_angular_velocity.y != angular_velocity[1]
                || current_angular_velocity.z != angular_velocity[2];
            if !script_posed_kinematic {
                body.set_translation(
                    vector![entity.center[0], entity.center[1], entity.center[2]].into(),
                    authored_change,
                );
            }
            body.set_rotation(rotation, authored_change);
            body.set_linvel(
                vector![velocity[0], velocity[1], velocity[2]].into(),
                authored_change,
            );
            body.set_angvel(
                RapierVec3::new(
                    angular_velocity[0],
                    angular_velocity[1],
                    angular_velocity[2],
                ),
                authored_change,
            );
        }

        for _ in 0..substeps {
            self.world.step();
        }

        for entity in entities.iter_mut() {
            let Some(handle) = self.handles.get(&entity.id) else {
                continue;
            };
            let source_velocity = entity.velocity.unwrap_or([0.0, 0.0, 0.0]);
            let body = &self.world.bodies[*handle];
            let translation = body.translation();
            let rotation = body.rotation();
            let velocity = body.linvel();
            let angular_velocity = body.angvel();
            if entity.body_kind.as_deref() == Some("kinematic")
                && script_posed_entities.contains(&entity.id)
            {
                entity.velocity = Some(source_velocity);
            } else {
                entity.center = [translation.x, translation.y, translation.z];
                entity.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
                entity.velocity = Some([velocity.x, velocity.y, velocity.z]);
                entity.angular_velocity =
                    Some([angular_velocity.x, angular_velocity.y, angular_velocity.z]);
            }
        }

        let current_pairs = self.live_pairs();
        let events = physics_events_for_pair_delta(&current_pairs, &self.previous_pairs);
        self.previous_pairs = current_pairs;
        events
    }

    fn live_pairs(&self) -> BTreeMap<String, DetectedPair> {
        let mut pairs = BTreeMap::new();
        for pair in self
            .world
            .contact_pairs()
            .filter(|pair| pair.has_any_active_contact())
        {
            self.insert_live_pair(&mut pairs, pair.collider1, pair.collider2, "CollisionEvent");
        }
        for (left, _, right, _, intersecting) in self.world.intersection_pairs() {
            if intersecting {
                self.insert_live_pair(&mut pairs, left, right, "TriggerEvent");
            }
        }
        pairs
    }

    fn insert_live_pair(
        &self,
        pairs: &mut BTreeMap<String, DetectedPair>,
        left: ColliderHandle,
        right: ColliderHandle,
        event: &str,
    ) {
        let left_id = self.entity_for_collider(left);
        let right_id = self.entity_for_collider(right);
        let (Some(left_id), Some(right_id)) = (left_id, right_id) else {
            return;
        };
        let (a, b) = ordered_pair(left_id, right_id);
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

    fn entity_for_collider(&self, handle: ColliderHandle) -> Option<&str> {
        self.collider_handles
            .iter()
            .find_map(|(entity, candidate)| (*candidate == handle).then_some(entity.as_str()))
    }
}

fn constrained_angular_velocity(entity: &SimulatedEntity) -> Option<[f32; 3]> {
    let mut angular_velocity = entity.angular_velocity?;
    if let Some(enabled) = entity.enabled_rotations {
        for axis in 0..3 {
            if !enabled[axis] {
                angular_velocity[axis] = 0.0;
            }
        }
    }
    Some(angular_velocity)
}

fn rapier_world_signature(entities: &[SimulatedEntity], gravity: [f32; 3]) -> u64 {
    let mut signature = DefaultHasher::new();
    gravity.map(f32::to_bits).hash(&mut signature);
    for entity in entities {
        let Some(body_kind) = entity.body_kind.as_deref() else {
            continue;
        };
        entity.id.hash(&mut signature);
        body_kind.hash(&mut signature);
        entity.ccd.hash(&mut signature);
        entity.ccd_max_substeps.hash(&mut signature);
        entity.ccd_mode.hash(&mut signature);
        entity.collider_kind.hash(&mut signature);
        entity
            .collider_center
            .map(f32::to_bits)
            .hash(&mut signature);
        entity.damping.to_bits().hash(&mut signature);
        entity.enabled_translations.hash(&mut signature);
        entity.enabled_rotations.hash(&mut signature);
        entity.friction.to_bits().hash(&mut signature);
        entity.gravity_scale.to_bits().hash(&mut signature);
        entity.height.map(f32::to_bits).hash(&mut signature);
        if let Some(heightfield) = entity.heightfield.as_ref() {
            heightfield.rows.hash(&mut signature);
            heightfield.cols.hash(&mut signature);
            heightfield.scale.map(f32::to_bits).hash(&mut signature);
            for height in &heightfield.heights {
                height.to_bits().hash(&mut signature);
            }
        }
        entity.half_extents.map(f32::to_bits).hash(&mut signature);
        entity.layer.hash(&mut signature);
        entity.mask.hash(&mut signature);
        entity.mass.map(f32::to_bits).hash(&mut signature);
        if let Some(joint) = entity.joint.as_ref() {
            joint.kind.hash(&mut signature);
            joint.connected_entity.hash(&mut signature);
            joint
                .anchor
                .map(|value| value.map(f32::to_bits))
                .hash(&mut signature);
            joint
                .axis
                .map(|value| value.map(f32::to_bits))
                .hash(&mut signature);
            joint.damping.map(f32::to_bits).hash(&mut signature);
            joint.stiffness.map(f32::to_bits).hash(&mut signature);
            joint.travel.map(f32::to_bits).hash(&mut signature);
            if let Some(limits) = joint.limits.as_ref() {
                limits.min.to_bits().hash(&mut signature);
                limits.max.to_bits().hash(&mut signature);
            }
        }
        entity.radius.map(f32::to_bits).hash(&mut signature);
        entity.restitution.to_bits().hash(&mut signature);
        entity.solver_iterations.hash(&mut signature);
        entity
            .sleep_threshold
            .map(f32::to_bits)
            .hash(&mut signature);
        entity.trigger.hash(&mut signature);
    }
    signature.finish()
}

fn physics_substeps(fixed_delta: f32) -> usize {
    (fixed_delta / (1.0 / 120.0)).ceil().max(1.0) as usize
}

fn rapier_joint(
    entity: &SimulatedEntity,
    connected: &SimulatedEntity,
    joint: &PhysicsJointComponent,
) -> Option<GenericJoint> {
    let local_anchor = RapierVec3::from_array(joint.anchor.unwrap_or([0.0, 0.0, 0.0]));
    let entity_rotation = RapierQuat::from_array(entity.rotation).normalize();
    let connected_rotation = RapierQuat::from_array(connected.rotation).normalize();
    let world_anchor = RapierVec3::from_array(entity.center) + entity_rotation * local_anchor;
    let connected_anchor =
        connected_rotation.inverse() * (world_anchor - RapierVec3::from_array(connected.center));
    let local_axis = RapierVec3::from_array(joint.axis.unwrap_or([1.0, 0.0, 0.0]));
    let local_axis = local_axis.try_normalize().unwrap_or(RapierVec3::X);
    let world_axis = entity_rotation * local_axis;
    let connected_axis = (connected_rotation.inverse() * world_axis)
        .try_normalize()
        .unwrap_or(RapierVec3::X);

    match joint.kind.as_str() {
        "hinge" => {
            let mut builder = GenericJointBuilder::new(JointAxesMask::LOCKED_REVOLUTE_AXES)
                .local_anchor1(connected_anchor)
                .local_anchor2(local_anchor)
                .local_axis1(connected_axis)
                .local_axis2(local_axis);
            if let Some(limits) = joint.limits.as_ref() {
                builder = builder.limits(JointAxis::AngX, [limits.min, limits.max]);
            }
            Some(builder.build())
        }
        "slider" | "suspension" => {
            let mut builder = GenericJointBuilder::new(JointAxesMask::LOCKED_PRISMATIC_AXES)
                .local_anchor1(connected_anchor)
                .local_anchor2(local_anchor)
                .local_axis1(connected_axis)
                .local_axis2(local_axis);
            if let Some(limits) = joint.limits.as_ref() {
                builder = builder.limits(JointAxis::LinX, [limits.min, limits.max]);
            } else if joint.kind == "suspension"
                && let Some(travel) = joint.travel
            {
                builder = builder.limits(JointAxis::LinX, [-travel, travel]);
            }
            if joint.kind == "suspension" {
                builder = builder
                    .motor_model(JointAxis::LinX, MotorModel::ForceBased)
                    .motor_position(
                        JointAxis::LinX,
                        0.0,
                        joint.stiffness.unwrap_or(0.0),
                        joint.damping.unwrap_or(0.0),
                    );
            }
            Some(builder.build())
        }
        _ => None,
    }
}

fn layer_bits_for_entities(entities: &[SimulatedEntity]) -> BTreeMap<String, u32> {
    let mut names = BTreeSet::new();
    for entity in entities {
        if let Some(layer) = entity.layer.as_ref() {
            names.insert(layer.clone());
        }
        for layer in &entity.mask {
            names.insert(layer.clone());
        }
    }
    names
        .into_iter()
        .take(16)
        .enumerate()
        .map(|(index, layer)| (layer, 1_u32 << index))
        .collect()
}

fn rapier_collision_groups(
    entity: &SimulatedEntity,
    layer_bits: &BTreeMap<String, u32>,
) -> InteractionGroups {
    let membership = match entity.layer.as_ref() {
        Some(layer) => layer_bits.get(layer).copied().unwrap_or(0),
        None => Group::ALL.bits(),
    };
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
        "heightfield" => {
            if let Some(heightfield) = entity.heightfield.as_ref() {
                return ColliderBuilder::heightfield(
                    rapier3d::parry::utils::Array2::new(
                        heightfield.rows,
                        heightfield.cols,
                        heightfield.heights.clone(),
                    ),
                    vector![
                        heightfield.scale[0],
                        heightfield.scale[1],
                        heightfield.scale[2]
                    ]
                    .into(),
                );
            }
            ColliderBuilder::cuboid(
                entity.half_extents[0],
                entity.half_extents[1],
                entity.half_extents[2],
            )
        }
        "sphere" => ColliderBuilder::ball(entity.radius.unwrap_or(entity.half_extents[0])),
        "capsule" => ColliderBuilder::capsule_y(
            (entity.height.unwrap_or(entity.half_extents[1] * 2.0) / 2.0
                - entity.radius.unwrap_or(entity.half_extents[0]))
            .max(0.0),
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

fn simulated_entity(entity: &WorldEntity) -> Option<SimulatedEntity> {
    let collider = entity.components.collider.as_ref()?;
    let body = entity.components.rigid_body.as_ref();
    Some(SimulatedEntity {
        angular_velocity: body.and_then(|body| body.angular_velocity),
        body_kind: Some(
            body.map(|body| body.kind.clone())
                .unwrap_or_else(|| "static".to_owned()),
        ),
        ccd: body
            .and_then(|body| body.ccd.as_ref())
            .map(|ccd| ccd.enabled)
            .unwrap_or(false),
        ccd_max_substeps: body.and_then(|body| body.ccd.as_ref()?.max_substeps),
        ccd_mode: body.and_then(|body| body.ccd.as_ref().map(|ccd| ccd.mode.clone())),
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
        heightfield: None,
        half_extents: half_extents(collider),
        id: entity.id.clone(),
        layer: collider.layer.clone(),
        mask: collider.mask.clone().unwrap_or_default(),
        mass: body.and_then(|body| {
            body.mass.or_else(|| {
                body.inverse_mass
                    .filter(|inverse_mass| *inverse_mass > 0.0)
                    .map(|inverse_mass| 1.0 / inverse_mass)
            })
        }),
        joint: entity.components.physics_joint.clone(),
        radius: collider.radius,
        restitution: collider.restitution.unwrap_or(0.0),
        rotation: entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.rotation)
            .unwrap_or([0.0, 0.0, 0.0, 1.0]),
        solver_iterations: body.and_then(|body| body.solver_iterations),
        sleep_threshold: body.and_then(|body| body.sleep_threshold),
        trigger: collider.trigger.unwrap_or(false) || collider.sensor.is_some(),
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
        trigger: collider.trigger.unwrap_or(false) || collider.sensor.is_some(),
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
