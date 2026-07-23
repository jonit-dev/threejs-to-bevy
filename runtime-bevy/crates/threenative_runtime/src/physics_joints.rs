use std::collections::{BTreeMap, BTreeSet};
use std::hash::{DefaultHasher, Hash, Hasher};

use rapier3d::glamx::{Quat as RapierQuat, Vec3 as RapierVec3};
use rapier3d::prelude::*;
use serde::Serialize;
use threenative_loader::{LoadedBundle, PhysicsJointComponent, WorldEntity};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsJointLoadObservation {
    pub active: bool,
    pub connected_entity: String,
    pub entity: String,
    pub force: f32,
    pub kind: String,
    pub lifecycle: u64,
    pub torque: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsJointBreakEvent {
    pub connected_entity: String,
    pub entity: String,
    pub force: f32,
    pub kind: String,
    pub phase: &'static str,
    pub torque: f32,
}

#[derive(Default)]
pub(crate) struct PhysicsJointRuntimeState {
    entries: BTreeMap<String, RuntimeJoint>,
    next_lifecycle: u64,
}

struct RuntimeJoint {
    break_force: Option<f32>,
    break_torque: Option<f32>,
    connected_entity: String,
    fingerprint: u64,
    force: f32,
    handle: Option<ImpulseJointHandle>,
    kind: String,
    lifecycle: u64,
    pending_removal: bool,
    torque: f32,
}

impl PhysicsJointRuntimeState {
    pub(crate) fn creation_count(&self) -> u64 {
        self.next_lifecycle
    }

    pub(crate) fn observation(&self, entity: &str) -> Option<PhysicsJointLoadObservation> {
        let joint = self.entries.get(entity)?;
        Some(PhysicsJointLoadObservation {
            active: joint.handle.is_some(),
            connected_entity: joint.connected_entity.clone(),
            entity: entity.to_owned(),
            force: joint.force,
            kind: joint.kind.clone(),
            lifecycle: joint.lifecycle,
            torque: joint.torque,
        })
    }

    pub(crate) fn observations(&self) -> Vec<PhysicsJointLoadObservation> {
        self.entries
            .keys()
            .filter_map(|entity| self.observation(entity))
            .collect()
    }
}

pub(crate) fn reconcile_physics_joints(
    bundle: &LoadedBundle,
    world: &mut PhysicsWorld,
    body_handles: &BTreeMap<String, RigidBodyHandle>,
    state: &mut PhysicsJointRuntimeState,
) {
    for joint in state
        .entries
        .values_mut()
        .filter(|joint| joint.pending_removal)
    {
        if let Some(handle) = joint.handle.take() {
            world.remove_impulse_joint(handle);
        }
        joint.pending_removal = false;
    }

    let desired_entities = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.components.physics_joint.is_some())
        .map(|entity| entity.id.clone())
        .collect::<BTreeSet<_>>();
    let removed = state
        .entries
        .keys()
        .filter(|entity| !desired_entities.contains(*entity))
        .cloned()
        .collect::<Vec<_>>();
    for entity in removed {
        if let Some(joint) = state.entries.remove(&entity)
            && let Some(handle) = joint.handle
        {
            world.remove_impulse_joint(handle);
        }
    }

    for entity in &bundle.world.entities {
        let Some(joint) = entity.components.physics_joint.as_ref() else {
            continue;
        };
        let fingerprint = joint_fingerprint(joint);
        if state
            .entries
            .get(&entity.id)
            .is_some_and(|current| current.fingerprint == fingerprint)
        {
            continue;
        }
        if let Some(previous) = state.entries.remove(&entity.id)
            && let Some(handle) = previous.handle
        {
            world.remove_impulse_joint(handle);
        }
        let Some(connected) = bundle
            .world
            .entities
            .iter()
            .find(|candidate| candidate.id == joint.connected_entity)
        else {
            continue;
        };
        let (Some(connected_handle), Some(body_handle), Some(data)) = (
            body_handles.get(&joint.connected_entity).copied(),
            body_handles.get(&entity.id).copied(),
            build_rapier_joint(entity, connected, joint),
        ) else {
            continue;
        };
        state.next_lifecycle += 1;
        let handle = world.insert_impulse_joint(connected_handle, body_handle, data);
        state.entries.insert(
            entity.id.clone(),
            RuntimeJoint {
                break_force: joint.break_force,
                break_torque: joint.break_torque,
                connected_entity: joint.connected_entity.clone(),
                fingerprint,
                force: 0.0,
                handle: Some(handle),
                kind: joint.kind.clone(),
                lifecycle: state.next_lifecycle,
                pending_removal: false,
                torque: 0.0,
            },
        );
    }
}

pub(crate) fn observe_joint_loads_and_schedule_breaks(
    world: &PhysicsWorld,
    state: &mut PhysicsJointRuntimeState,
    fixed_delta: f32,
) -> Vec<PhysicsJointBreakEvent> {
    let inverse_delta = fixed_delta.max(f32::EPSILON).recip();
    let mut events = Vec::new();
    for (entity, runtime) in &mut state.entries {
        let Some(handle) = runtime.handle else {
            continue;
        };
        let Some(joint) = world.impulse_joints.get(handle) else {
            runtime.handle = None;
            continue;
        };
        runtime.force = runtime
            .force
            .max(vector_length(&joint.impulses[0..3]) * inverse_delta);
        runtime.torque = runtime
            .torque
            .max(vector_length(&joint.impulses[3..6]) * inverse_delta);
        if runtime.kind == "hinge" {
            if let Some(motor) = joint.data.motor(JointAxis::AngX) {
                runtime.torque = runtime.torque.max(motor.impulse.abs() * inverse_delta);
            }
        } else if matches!(runtime.kind.as_str(), "slider" | "suspension")
            && let Some(motor) = joint.data.motor(JointAxis::LinX)
        {
            runtime.force = runtime.force.max(motor.impulse.abs() * inverse_delta);
        }
        if runtime.pending_removal {
            continue;
        }
        let force_broken = runtime
            .break_force
            .is_some_and(|threshold| runtime.force > threshold);
        let torque_broken = runtime
            .break_torque
            .is_some_and(|threshold| runtime.torque > threshold);
        if force_broken || torque_broken {
            runtime.pending_removal = true;
            events.push(PhysicsJointBreakEvent {
                connected_entity: runtime.connected_entity.clone(),
                entity: entity.clone(),
                force: runtime.force,
                kind: runtime.kind.clone(),
                phase: "break",
                torque: runtime.torque,
            });
        }
    }
    events
}

pub(crate) fn begin_joint_load_frame(state: &mut PhysicsJointRuntimeState) {
    for joint in state.entries.values_mut() {
        if joint.handle.is_some() {
            joint.force = 0.0;
            joint.torque = 0.0;
        }
    }
}

pub(crate) fn record_external_joint_load(
    state: &mut PhysicsJointRuntimeState,
    entity: &str,
    point: RapierVec3,
    value: RapierVec3,
    center_of_mass: RapierVec3,
    impulse: bool,
    fixed_delta: f32,
) {
    let scale = if impulse {
        fixed_delta.max(f32::EPSILON).recip()
    } else {
        1.0
    };
    let force = value * scale;
    let torque = (point - center_of_mass).cross(force).length();
    for (joint_entity, joint) in &mut state.entries {
        if joint.handle.is_none() || (joint_entity != entity && joint.connected_entity != entity) {
            continue;
        }
        joint.force = joint.force.max(force.length());
        joint.torque = joint.torque.max(torque);
    }
}

fn vector_length(values: &[f32]) -> f32 {
    values.iter().map(|value| value * value).sum::<f32>().sqrt()
}

fn joint_fingerprint(joint: &PhysicsJointComponent) -> u64 {
    let mut fingerprint = DefaultHasher::new();
    serde_json::to_string(joint)
        .unwrap_or_default()
        .hash(&mut fingerprint);
    fingerprint.finish()
}

fn build_rapier_joint(
    entity: &WorldEntity,
    connected: &WorldEntity,
    joint: &PhysicsJointComponent,
) -> Option<GenericJoint> {
    let local_anchor = RapierVec3::from_array(joint.anchor.unwrap_or([0.0, 0.0, 0.0]));
    let body_position = entity_position(entity);
    let connected_position = entity_position(connected);
    let body_rotation = entity_rotation(entity);
    let connected_rotation = entity_rotation(connected);
    let world_anchor = body_position + body_rotation * local_anchor;
    let derived_connected_anchor =
        connected_rotation.inverse() * (world_anchor - connected_position);
    let connected_anchor = joint
        .connected_anchor
        .map(RapierVec3::from_array)
        .unwrap_or(derived_connected_anchor);
    let local_axis = RapierVec3::from_array(joint.axis.unwrap_or([1.0, 0.0, 0.0]))
        .try_normalize()
        .unwrap_or(RapierVec3::X);
    let connected_axis = (connected_rotation.inverse() * (body_rotation * local_axis))
        .try_normalize()
        .unwrap_or(RapierVec3::X);

    match joint.kind.as_str() {
        "fixed" => Some(
            FixedJointBuilder::new()
                .contacts_enabled(false)
                .local_frame1(Pose::from_parts(
                    connected_anchor.into(),
                    normalized_rotation(joint.connected_rotation),
                ))
                .local_frame2(Pose::from_parts(
                    local_anchor.into(),
                    normalized_rotation(joint.rotation),
                ))
                .build()
                .into(),
        ),
        "ball" => Some(
            SphericalJointBuilder::new()
                .contacts_enabled(false)
                .local_anchor1(connected_anchor)
                .local_anchor2(local_anchor)
                .build()
                .into(),
        ),
        "rope" => Some(
            RopeJointBuilder::new(joint.length.unwrap_or(0.0))
                .contacts_enabled(false)
                .local_anchor1(connected_anchor)
                .local_anchor2(local_anchor)
                .build()
                .into(),
        ),
        "hinge" => {
            let mut builder = GenericJointBuilder::new(JointAxesMask::LOCKED_REVOLUTE_AXES)
                .contacts_enabled(false)
                .local_anchor1(connected_anchor)
                .local_anchor2(local_anchor)
                .local_axis1(connected_axis)
                .local_axis2(local_axis);
            if let Some(limits) = joint.limits.as_ref() {
                builder = builder.limits(JointAxis::AngX, [limits.min, limits.max]);
            }
            if let Some(motor) = joint.motor.as_ref() {
                builder = apply_motor(builder, JointAxis::AngX, motor);
                if let Some(max_torque) = motor.max_torque {
                    builder = builder.motor_max_force(JointAxis::AngX, max_torque);
                }
            }
            Some(builder.build())
        }
        "slider" | "suspension" => {
            let mut builder = GenericJointBuilder::new(JointAxesMask::LOCKED_PRISMATIC_AXES)
                .contacts_enabled(false)
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
            if let Some(motor) = joint.motor.as_ref() {
                builder = apply_motor(builder, JointAxis::LinX, motor);
                if let Some(max_force) = motor.max_force {
                    builder = builder.motor_max_force(JointAxis::LinX, max_force);
                }
            }
            Some(builder.build())
        }
        _ => None,
    }
}

fn apply_motor(
    builder: GenericJointBuilder,
    axis: JointAxis,
    motor: &threenative_loader::PhysicsJointMotorComponent,
) -> GenericJointBuilder {
    if motor.mode == "position" {
        builder.motor_position(
            axis,
            motor.target,
            motor.stiffness.unwrap_or(0.0),
            motor.damping.unwrap_or(0.0),
        )
    } else {
        builder.motor_velocity(axis, motor.target, motor.damping.unwrap_or(1.0))
    }
}

fn entity_position(entity: &WorldEntity) -> RapierVec3 {
    RapierVec3::from_array(
        entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position)
            .unwrap_or([0.0, 0.0, 0.0]),
    )
}

fn entity_rotation(entity: &WorldEntity) -> RapierQuat {
    normalized_rotation(
        entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.rotation),
    )
}

fn normalized_rotation(rotation: Option<[f32; 4]>) -> RapierQuat {
    RapierQuat::from_array(rotation.unwrap_or([0.0, 0.0, 0.0, 1.0])).normalize()
}
