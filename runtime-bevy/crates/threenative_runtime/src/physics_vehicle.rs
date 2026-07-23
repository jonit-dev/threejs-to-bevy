use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
};

use rapier3d::{glamx::Vec3, parry::query::ShapeCastOptions, prelude::*};
use serde::{Deserialize, Serialize};
use threenative_loader::{
    LoadedBundle, PhysicsSlipCurvePoint, PhysicsSurfaceComponent, TireModelComponent,
    VehicleAssistComponent, VehicleControllerComponent, VehicleTorqueCurvePoint,
    WheelAssemblyComponent, WheelComponent,
};

use crate::{input::NativeInputState, physics::ColliderOwner};

// Mirrors PHYSICS_CAPABILITY_LIMITS.vehicleLimitedSlipActivationDelta.
const LIMITED_SLIP_ACTIVATION_DELTA: f32 = 0.05;
// Mirrors PHYSICS_CAPABILITY_LIMITS.vehicleGroundedCouplingGraceTicks.
const VEHICLE_GROUNDED_COUPLING_GRACE_TICKS: u32 = 1;
// Mirrors PHYSICS_CAPABILITY_LIMITS.vehicleShaftDirectionEpsilon.
const SHAFT_DIRECTION_EPSILON: f32 = 0.0001;

thread_local! {
    static VEHICLE_CONTROLS: RefCell<BTreeMap<usize, BTreeMap<String, WheelControlInput>>> = const { RefCell::new(BTreeMap::new()) };
    static VEHICLE_OBSERVATIONS: RefCell<BTreeMap<usize, Vec<WheelAssemblyObservation>>> = const { RefCell::new(BTreeMap::new()) };
    static VEHICLE_DEBUG_TELEMETRY: RefCell<BTreeMap<usize, Vec<WheelDebugTelemetry>>> = const { RefCell::new(BTreeMap::new()) };
    static VEHICLE_VISUAL_STATES: RefCell<BTreeMap<usize, Vec<WheelVisualState>>> = const { RefCell::new(BTreeMap::new()) };
    static VEHICLE_CONTROLLER_CONTROLS: RefCell<BTreeMap<usize, BTreeMap<String, VehicleControlInput>>> = const { RefCell::new(BTreeMap::new()) };
    static VEHICLE_CONTROLLER_OBSERVATIONS: RefCell<BTreeMap<usize, Vec<VehicleControllerObservation>>> = const { RefCell::new(BTreeMap::new()) };
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct WheelControlInput {
    pub brake: f32,
    pub drive: f32,
    pub steering: f32,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct VehicleControlInput {
    pub brake: f32,
    pub clutch: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gear: Option<i32>,
    pub handbrake: f32,
    pub steer: f32,
    pub throttle: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleWheelTorqueObservation {
    pub torque: f32,
    pub wheel_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleTorquePathObservation {
    pub clutch: f32,
    pub engine: f32,
    pub final_drive: f32,
    pub gearbox: f32,
    pub wheels: Vec<VehicleWheelTorqueObservation>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleControllerObservation {
    pub abs_active: bool,
    pub clutch: f32,
    pub drive_torque: f32,
    pub engine_rpm: f32,
    pub entity: String,
    pub gear: i32,
    pub inputs: VehicleControlInput,
    pub shift_state: String,
    pub speed: f32,
    pub tcs_active: bool,
    pub torque_path: VehicleTorquePathObservation,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelContactObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub child: Option<String>,
    pub distance: f32,
    pub entity: String,
    pub normal: [f32; 3],
    pub point: [f32; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelObservation {
    pub angular_speed: f32,
    pub compression: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact: Option<WheelContactObservation>,
    pub grounded: bool,
    pub lateral_slip: f32,
    pub longitudinal_slip: f32,
    pub normal_load: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    pub wheel_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct WheelAssemblyObservation {
    pub entity: String,
    pub step: u64,
    pub wheels: Vec<WheelObservation>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelDebugTelemetry {
    pub cast_end: [f32; 3],
    pub cast_start: [f32; 3],
    pub entity: String,
    pub observation: WheelObservation,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct WheelVisualPose {
    chassis_position: [f32; 3],
    chassis_rotation: [f32; 4],
    position: [f32; 3],
    spin_angle: f32,
    steering_angle: f32,
}

#[derive(Clone, Debug, PartialEq)]
struct WheelVisualState {
    current: WheelVisualPose,
    entity: String,
    previous: WheelVisualPose,
    target_id: String,
    wheel_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelVisualObservation {
    pub entity: String,
    #[serde(skip)]
    pub interpolated_chassis_position: [f32; 3],
    #[serde(skip)]
    pub interpolated_chassis_rotation: [f32; 4],
    pub interpolated_position: [f32; 3],
    pub interpolated_spin_angle: f32,
    pub interpolated_steering_angle: f32,
    pub interpolation_alpha: f32,
    pub position: [f32; 3],
    pub previous_spin_angle: f32,
    pub spin_angle: f32,
    pub steering_angle: f32,
    pub target_id: String,
    pub wheel_id: String,
}

#[derive(Default)]
pub(crate) struct VehicleRuntimeState {
    angular_speed: BTreeMap<(String, String), f32>,
    step: u64,
    visual: BTreeMap<(String, String), WheelVisualState>,
    controller: BTreeMap<String, VehicleControllerRuntimeState>,
    wheel_feedback: BTreeMap<(String, String), WheelFeedback>,
}

#[derive(Clone, Copy, Debug, Default)]
struct WheelFeedback {
    grounded: bool,
    longitudinal_slip: f32,
}

#[derive(Clone, Debug)]
struct VehicleControllerRuntimeState {
    abs_multiplier: f32,
    clutch_engagement: f32,
    consecutive_zero_grounded_driven_ticks: u32,
    engine_rpm: f32,
    gear: i32,
    last_grounded_coupled_angular_speed: f32,
    pending_gear: Option<i32>,
    shift_phase: VehicleShiftPhase,
    shift_cooldown: f32,
    tcs_multiplier: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum VehicleShiftPhase {
    Disengaging,
    Engaging,
    #[default]
    Engaged,
}

impl Default for VehicleControllerRuntimeState {
    fn default() -> Self {
        Self {
            abs_multiplier: 1.0,
            clutch_engagement: 1.0,
            consecutive_zero_grounded_driven_ticks: 0,
            engine_rpm: 0.0,
            gear: 1,
            last_grounded_coupled_angular_speed: 0.0,
            pending_gear: None,
            shift_phase: VehicleShiftPhase::Engaged,
            shift_cooldown: 0.0,
            tcs_multiplier: 1.0,
        }
    }
}

pub fn set_physics_vehicle_control_input(
    runtime_id: usize,
    entity: impl Into<String>,
    input: WheelControlInput,
) -> bool {
    if !(0.0..=1.0).contains(&input.brake)
        || !(-1.0..=1.0).contains(&input.drive)
        || !(-1.0..=1.0).contains(&input.steering)
    {
        return false;
    }
    VEHICLE_CONTROLS.with(|controls| {
        controls
            .borrow_mut()
            .entry(runtime_id)
            .or_default()
            .insert(entity.into(), input);
    });
    true
}

pub fn set_physics_vehicle_controller_inputs(
    runtime_id: usize,
    entity: impl Into<String>,
    input: VehicleControlInput,
) -> bool {
    if !(0.0..=1.0).contains(&input.brake)
        || !(0.0..=1.0).contains(&input.clutch)
        || !(0.0..=1.0).contains(&input.handbrake)
        || !(-1.0..=1.0).contains(&input.steer)
        || !(0.0..=1.0).contains(&input.throttle)
        || input.gear.is_some_and(|gear| !(-1..=12).contains(&gear))
    {
        return false;
    }
    VEHICLE_CONTROLLER_CONTROLS.with(|controls| {
        controls
            .borrow_mut()
            .entry(runtime_id)
            .or_default()
            .insert(entity.into(), input);
    });
    true
}

pub fn set_physics_vehicle_inputs(
    runtime_id: usize,
    entity: impl Into<String>,
    input: VehicleControlInput,
) -> bool {
    set_physics_vehicle_controller_inputs(runtime_id, entity, input)
}

pub fn apply_physics_vehicle_bindings(
    runtime_id: usize,
    bundle: &LoadedBundle,
    input: &NativeInputState,
    allow_gear_edges: bool,
) {
    let observed_gears = VEHICLE_CONTROLLER_OBSERVATIONS.with(|observations| {
        observations
            .borrow()
            .get(&runtime_id)
            .into_iter()
            .flatten()
            .map(|observation| (observation.entity.clone(), observation.gear))
            .collect::<BTreeMap<_, _>>()
    });
    for entity in &bundle.world.entities {
        let Some(controller) = entity.components.vehicle_controller.as_ref() else {
            continue;
        };
        if controller.bindings.is_none() {
            continue;
        }
        if entity.components.wheel_assembly.is_none() {
            continue;
        }
        let current_gear = observed_gears.get(&entity.id).copied().unwrap_or_else(|| {
            if controller.transmission.shift_policy == "automatic" {
                1
            } else {
                0
            }
        });
        set_physics_vehicle_controller_inputs(
            runtime_id,
            entity.id.clone(),
            bound_vehicle_input(controller, input, current_gear, allow_gear_edges),
        );
    }
}

fn bound_vehicle_input(
    controller: &VehicleControllerComponent,
    input: &NativeInputState,
    current_gear: i32,
    allow_gear_edges: bool,
) -> VehicleControlInput {
    let bindings = controller
        .bindings
        .as_ref()
        .expect("bound vehicle input requires bindings");
    let analog = |binding: Option<&String>| {
        binding.map_or(0.0, |binding| {
            f32::max(
                if input.action(binding) { 1.0 } else { 0.0 },
                input.axis(binding),
            )
            .clamp(0.0, 1.0)
        })
    };
    let gear_delta = if allow_gear_edges
        && bindings
            .gear_up
            .as_ref()
            .is_some_and(|binding| input.pressed(binding))
    {
        1
    } else if allow_gear_edges
        && bindings
            .gear_down
            .as_ref()
            .is_some_and(|binding| input.pressed(binding))
    {
        -1
    } else {
        0
    };
    VehicleControlInput {
        brake: analog(bindings.brake.as_ref()),
        clutch: analog(bindings.clutch.as_ref()),
        gear: (controller.transmission.shift_policy == "manual" && gear_delta != 0).then(|| {
            (current_gear + gear_delta)
                .clamp(-1, controller.transmission.forward_ratios.len() as i32)
        }),
        handbrake: analog(bindings.handbrake.as_ref()),
        steer: bindings
            .steer
            .as_ref()
            .map_or(0.0, |binding| input.axis(binding).clamp(-1.0, 1.0)),
        throttle: analog(bindings.throttle.as_ref()),
    }
}

pub fn observe_physics_vehicle_controllers(runtime_id: usize) -> Vec<VehicleControllerObservation> {
    VEHICLE_CONTROLLER_OBSERVATIONS.with(|observations| {
        observations
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    })
}

pub fn observe_physics_vehicles(runtime_id: usize) -> Vec<WheelAssemblyObservation> {
    VEHICLE_OBSERVATIONS.with(|observations| {
        observations
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    })
}

pub fn inspect_physics_vehicle_debug_telemetry(runtime_id: usize) -> Vec<WheelDebugTelemetry> {
    VEHICLE_DEBUG_TELEMETRY.with(|telemetry| {
        telemetry
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    })
}

pub fn observe_physics_vehicle_visuals(
    runtime_id: usize,
    interpolation_alpha: f32,
) -> Vec<WheelVisualObservation> {
    let alpha = interpolation_alpha.clamp(0.0, 1.0);
    VEHICLE_VISUAL_STATES.with(|states| {
        states
            .borrow()
            .get(&runtime_id)
            .into_iter()
            .flatten()
            .map(|state| WheelVisualObservation {
                entity: state.entity.clone(),
                interpolated_chassis_position: interpolate_vec3(
                    state.previous.chassis_position,
                    state.current.chassis_position,
                    alpha,
                ),
                interpolated_chassis_rotation: crate::transform_interpolation::interpolate_quat(
                    state.previous.chassis_rotation,
                    state.current.chassis_rotation,
                    alpha,
                ),
                interpolated_position: interpolate_vec3(
                    state.previous.position,
                    state.current.position,
                    alpha,
                ),
                interpolated_spin_angle: interpolate_angle(
                    state.previous.spin_angle,
                    state.current.spin_angle,
                    alpha,
                ),
                interpolated_steering_angle: interpolate_angle(
                    state.previous.steering_angle,
                    state.current.steering_angle,
                    alpha,
                ),
                interpolation_alpha: alpha,
                position: state.current.position,
                previous_spin_angle: state.previous.spin_angle,
                spin_angle: state.current.spin_angle,
                steering_angle: state.current.steering_angle,
                target_id: state.target_id.clone(),
                wheel_id: state.wheel_id.clone(),
            })
            .collect()
    })
}

pub(crate) fn clear_physics_vehicle_runtime(runtime_id: usize) {
    VEHICLE_CONTROLS.with(|controls| {
        controls.borrow_mut().remove(&runtime_id);
    });
    VEHICLE_OBSERVATIONS.with(|observations| {
        observations.borrow_mut().remove(&runtime_id);
    });
    VEHICLE_DEBUG_TELEMETRY.with(|telemetry| {
        telemetry.borrow_mut().remove(&runtime_id);
    });
    VEHICLE_VISUAL_STATES.with(|states| {
        states.borrow_mut().remove(&runtime_id);
    });
    VEHICLE_CONTROLLER_CONTROLS.with(|controls| {
        controls.borrow_mut().remove(&runtime_id);
    });
    VEHICLE_CONTROLLER_OBSERVATIONS.with(|observations| {
        observations.borrow_mut().remove(&runtime_id);
    });
}

struct ControllerStep {
    brake_force: BTreeMap<String, f32>,
    drive_force: BTreeMap<String, f32>,
    observation: VehicleControllerObservation,
    steering: f32,
}

#[allow(
    clippy::too_many_lines,
    reason = "the drivetrain state transition and its torque-path observation must remain one deterministic calculation"
)]
fn step_vehicle_controller(
    entity_id: &str,
    controller: &VehicleControllerComponent,
    assembly: &WheelAssemblyComponent,
    input: VehicleControlInput,
    body_velocity: Vec3,
    chassis_forward: Vec3,
    state: &mut VehicleRuntimeState,
    fixed_delta: f32,
) -> ControllerStep {
    let runtime = state
        .controller
        .entry(entity_id.to_owned())
        .or_insert_with(|| VehicleControllerRuntimeState {
            engine_rpm: controller.engine.idle_rpm,
            gear: if controller.transmission.shift_policy == "automatic" {
                1
            } else {
                0
            },
            ..VehicleControllerRuntimeState::default()
        });
    let maximum_gear = controller.transmission.forward_ratios.len() as i32;
    runtime.gear = runtime.gear.clamp(-1, maximum_gear);
    runtime.shift_cooldown = (runtime.shift_cooldown - fixed_delta).max(0.0);
    if controller.transmission.shift_policy == "manual"
        && runtime.shift_phase == VehicleShiftPhase::Engaged
        && let Some(requested) = input.gear
    {
        let requested = requested.clamp(-1, maximum_gear);
        if requested != runtime.gear {
            runtime.pending_gear = Some(requested);
            runtime.shift_phase = VehicleShiftPhase::Disengaging;
        }
    }

    let clutch_rate = fixed_delta / controller.transmission.clutch_response;
    match runtime.shift_phase {
        VehicleShiftPhase::Disengaging => {
            runtime.clutch_engagement = move_toward(runtime.clutch_engagement, 0.0, clutch_rate);
            if runtime.clutch_engagement <= 1.0e-6 {
                runtime.clutch_engagement = 0.0;
                runtime.gear = runtime.pending_gear.unwrap_or(runtime.gear);
                runtime.pending_gear = None;
                runtime.shift_phase = VehicleShiftPhase::Engaging;
            }
        }
        VehicleShiftPhase::Engaging => {
            runtime.clutch_engagement = move_toward(runtime.clutch_engagement, 1.0, clutch_rate);
            if runtime.clutch_engagement >= 0.999999 {
                runtime.clutch_engagement = 1.0;
                runtime.shift_phase = VehicleShiftPhase::Engaged;
                runtime.shift_cooldown = controller.transmission.clutch_response;
            }
        }
        VehicleShiftPhase::Engaged => {
            runtime.clutch_engagement =
                move_toward(runtime.clutch_engagement, 1.0 - input.clutch, clutch_rate);
        }
    }

    let driven = assembly
        .wheels
        .iter()
        .filter(|wheel| wheel.driven)
        .collect::<Vec<_>>();
    let average_angular_speed = if driven.is_empty() {
        0.0
    } else {
        driven
            .iter()
            .map(|wheel| {
                state
                    .angular_speed
                    .get(&(entity_id.to_owned(), wheel.id.clone()))
                    .copied()
                    .unwrap_or(0.0)
            })
            .sum::<f32>()
            / driven.len() as f32
    };
    let longitudinal_speed = body_velocity.dot(chassis_forward);
    let coupled_angular_speed = normalized_vehicle_coupled_angular_speed(
        entity_id,
        &driven,
        longitudinal_speed.abs(),
        average_angular_speed,
        &state.wheel_feedback,
        &mut runtime.last_grounded_coupled_angular_speed,
        &mut runtime.consecutive_zero_grounded_driven_ticks,
    );
    let gear_ratio = vehicle_gear_ratio(controller, runtime.gear);
    let free_rpm = controller.engine.idle_rpm
        + input.throttle * (controller.engine.redline_rpm - controller.engine.idle_rpm);
    let coupled_rpm =
        (coupled_angular_speed * gear_ratio * controller.transmission.final_drive).abs() * 60.0
            / std::f32::consts::TAU;
    runtime.engine_rpm = if gear_ratio.abs() <= 1.0e-6 {
        free_rpm
    } else {
        free_rpm * (1.0 - runtime.clutch_engagement) + coupled_rpm * runtime.clutch_engagement
    }
    .clamp(controller.engine.idle_rpm, controller.engine.redline_rpm);
    if controller.transmission.shift_policy == "automatic"
        && runtime.shift_phase == VehicleShiftPhase::Engaged
        && runtime.shift_cooldown <= 1.0e-6
    {
        let upshift = controller
            .transmission
            .upshift_rpm
            .unwrap_or(controller.engine.redline_rpm * 0.85);
        let downshift = controller
            .transmission
            .downshift_rpm
            .unwrap_or(controller.engine.idle_rpm * 1.5);
        if runtime.engine_rpm >= upshift && runtime.gear < maximum_gear {
            runtime.pending_gear = Some(runtime.gear + 1);
            runtime.shift_phase = VehicleShiftPhase::Disengaging;
        } else if runtime.engine_rpm <= downshift && runtime.gear > 1 {
            runtime.pending_gear = Some(runtime.gear - 1);
            runtime.shift_phase = VehicleShiftPhase::Disengaging;
        }
    }

    let tcs_triggered = input.throttle > 0.0
        && assist_triggered(
            controller
                .assists
                .as_ref()
                .and_then(|assists| assists.tcs.as_ref()),
            driven.iter().filter_map(|wheel| {
                state
                    .wheel_feedback
                    .get(&(entity_id.to_owned(), wheel.id.clone()))
            }),
        );
    runtime.tcs_multiplier = step_assist_multiplier(
        runtime.tcs_multiplier,
        controller
            .assists
            .as_ref()
            .and_then(|assists| assists.tcs.as_ref()),
        tcs_triggered,
        fixed_delta,
    );
    let braked = assembly
        .wheels
        .iter()
        .filter(|wheel| wheel.braked)
        .collect::<Vec<_>>();
    let abs_triggered = input.brake > 0.0
        && assist_triggered(
            controller
                .assists
                .as_ref()
                .and_then(|assists| assists.abs.as_ref()),
            braked.iter().filter_map(|wheel| {
                state
                    .wheel_feedback
                    .get(&(entity_id.to_owned(), wheel.id.clone()))
            }),
        );
    runtime.abs_multiplier = step_assist_multiplier(
        runtime.abs_multiplier,
        controller
            .assists
            .as_ref()
            .and_then(|assists| assists.abs.as_ref()),
        abs_triggered,
        fixed_delta,
    );

    let powered_torque =
        sample_vehicle_torque_curve(&controller.engine.torque_curve, runtime.engine_rpm)
            * input.throttle;
    let shaft_direction =
        vehicle_shaft_direction(longitudinal_speed, average_angular_speed, gear_ratio);
    let braking_torque = if shaft_direction.abs() > 0.0 {
        -shaft_direction * controller.engine.engine_braking * (1.0 - input.throttle)
    } else {
        0.0
    };
    let engine_torque = powered_torque + braking_torque;
    let clutch_torque = engine_torque * runtime.clutch_engagement * runtime.tcs_multiplier;
    let gearbox_torque = clutch_torque * gear_ratio;
    let final_drive_torque = gearbox_torque * controller.transmission.final_drive;
    let wheel_torques = distribute_vehicle_torque(
        entity_id,
        controller,
        assembly,
        final_drive_torque,
        &state.wheel_feedback,
    );
    let drive_force = assembly
        .wheels
        .iter()
        .map(|wheel| {
            let torque = wheel_torques.get(&wheel.id).copied().unwrap_or(0.0);
            (
                wheel.id.clone(),
                (torque / wheel.radius.max(1.0e-4))
                    .clamp(-assembly.max_tire_force, assembly.max_tire_force),
            )
        })
        .collect();
    let brake_force =
        distribute_vehicle_braking(controller, assembly, input, runtime.abs_multiplier);
    let speed = vehicle_planar_speed(body_velocity);
    let steering = (input.steer
        * sample_vehicle_steering_curve(&controller.steering.speed_curve, speed))
    .clamp(-1.0, 1.0);
    let torque_path = VehicleTorquePathObservation {
        clutch: round(clutch_torque),
        engine: round(engine_torque),
        final_drive: round(final_drive_torque),
        gearbox: round(gearbox_torque),
        wheels: assembly
            .wheels
            .iter()
            .map(|wheel| VehicleWheelTorqueObservation {
                torque: round(wheel_torques.get(&wheel.id).copied().unwrap_or(0.0)),
                wheel_id: wheel.id.clone(),
            })
            .collect(),
    };
    ControllerStep {
        brake_force,
        drive_force,
        observation: VehicleControllerObservation {
            abs_active: abs_triggered,
            clutch: round(1.0 - runtime.clutch_engagement),
            drive_torque: round(final_drive_torque),
            engine_rpm: round(runtime.engine_rpm),
            entity: entity_id.to_owned(),
            gear: runtime.gear,
            inputs: input,
            shift_state: if runtime.shift_phase != VehicleShiftPhase::Engaged {
                "shifting"
            } else {
                "engaged"
            }
            .to_owned(),
            speed: round(speed),
            tcs_active: tcs_triggered,
            torque_path,
        },
        steering,
    }
}

#[allow(
    clippy::too_many_lines,
    reason = "the wheel fixed-step keeps casts, tire forces, feedback, and visual state in explicit adapter order"
)]
pub(crate) fn step_physics_vehicles(
    runtime_id: usize,
    bundle: &LoadedBundle,
    world: &mut PhysicsWorld,
    handles: &BTreeMap<String, RigidBodyHandle>,
    collider_owners: &[(ColliderHandle, ColliderOwner)],
    state: &mut VehicleRuntimeState,
    fixed_delta: f32,
    initial_query_broad_phase: Option<&BroadPhaseBvh>,
) {
    let controls = VEHICLE_CONTROLS.with(|controls| {
        controls
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    });
    let controller_controls = VEHICLE_CONTROLLER_CONTROLS.with(|controls| {
        controls
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    });
    let mut observations = Vec::new();
    let mut controller_observations = Vec::new();
    let mut debug_telemetry = Vec::new();
    let mut visual_states = Vec::new();
    let mut active_visual_keys = BTreeSet::new();
    let mut assemblies = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            Some((
                entity.id.as_str(),
                entity.components.wheel_assembly.as_ref()?,
                entity.components.vehicle_controller.as_ref(),
            ))
        })
        .collect::<Vec<_>>();
    assemblies.sort_by_key(|(entity, _, _)| *entity);

    for (entity_id, assembly, controller) in assemblies {
        let Some(body_handle) = handles.get(entity_id).copied() else {
            continue;
        };
        let Some(body) = world.bodies.get(body_handle) else {
            continue;
        };
        let control = controls.get(entity_id).copied().unwrap_or_default();
        let pose = *body.position();
        let body_velocity = body.linvel();
        let body_angular_velocity = body.angvel();
        let controller_step = controller.map(|controller| {
            step_vehicle_controller(
                entity_id,
                controller,
                assembly,
                controller_controls
                    .get(entity_id)
                    .copied()
                    .unwrap_or_default(),
                body_velocity,
                pose.rotation * -Vec3::Z,
                state,
                fixed_delta,
            )
        });
        let mut wheel_observations = Vec::with_capacity(assembly.wheels.len());
        let mut forces = Vec::new();

        for wheel in &assembly.wheels {
            let attachment = pose * Vec3::from_array(wheel.attachment);
            let down = pose.rotation * -Vec3::Y;
            let steering_angle = if wheel.steering {
                controller_step
                    .as_ref()
                    .map(|controller| controller.steering)
                    .unwrap_or(control.steering)
                    * assembly.max_steering_angle
            } else {
                0.0
            };
            let forward =
                pose.rotation * Vec3::new(-steering_angle.sin(), 0.0, -steering_angle.cos());
            let right = pose.rotation * Vec3::new(steering_angle.cos(), 0.0, -steering_angle.sin());
            let shape = Ball::new(wheel.radius);
            let filter = QueryFilter::default()
                .exclude_rigid_body(body_handle)
                .exclude_sensors();
            let cast_pose = Pose::translation(attachment.x, attachment.y, attachment.z);
            let cast_options = ShapeCastOptions {
                max_time_of_impact: wheel.suspension.travel,
                compute_impact_geometry_on_penetration: true,
                ..ShapeCastOptions::default()
            };
            let hit = if let Some(broad_phase) = initial_query_broad_phase {
                broad_phase
                    .as_query_pipeline(
                        world.narrow_phase.query_dispatcher(),
                        &world.bodies,
                        &world.colliders,
                        filter,
                    )
                    .cast_shape(&cast_pose, down, &shape, cast_options)
            } else {
                world.cast_shape(&cast_pose, down, &shape, cast_options, filter)
            };
            let state_key = (entity_id.to_owned(), wheel.id.clone());
            let drive_force = if let Some(controller) = controller_step.as_ref() {
                controller
                    .drive_force
                    .get(&wheel.id)
                    .copied()
                    .unwrap_or(0.0)
            } else if wheel.driven {
                control.drive * assembly.max_tire_force
            } else {
                0.0
            };
            let mut angular_speed = state.angular_speed.get(&state_key).copied().unwrap_or(0.0)
                + drive_force * fixed_delta / wheel.radius.max(1.0e-4);
            let wheel_brake_force = controller_step
                .as_ref()
                .and_then(|controller| controller.brake_force.get(&wheel.id).copied())
                .unwrap_or({
                    if wheel.braked {
                        control.brake * assembly.max_tire_force
                    } else {
                        0.0
                    }
                });
            if wheel_brake_force > 0.0 {
                angular_speed = move_toward(
                    angular_speed,
                    0.0,
                    wheel_brake_force * fixed_delta / wheel.radius.max(1.0e-4),
                );
            }
            let Some((collider_handle, hit)) = hit else {
                state.angular_speed.insert(state_key.clone(), angular_speed);
                state.wheel_feedback.insert(
                    state_key,
                    WheelFeedback {
                        grounded: false,
                        longitudinal_slip: 0.0,
                    },
                );
                record_wheel_visual_state(
                    state,
                    entity_id,
                    &wheel.id,
                    wheel.visual.as_deref(),
                    attachment + down * wheel.suspension.travel,
                    attachment + down * wheel.suspension.travel,
                    [pose.translation.x, pose.translation.y, pose.translation.z],
                    [
                        pose.rotation.x,
                        pose.rotation.y,
                        pose.rotation.z,
                        pose.rotation.w,
                    ],
                    steering_angle,
                    angular_speed,
                    fixed_delta,
                    &mut active_visual_keys,
                    &mut visual_states,
                );
                let observation = airborne_observation(&wheel.id, angular_speed);
                debug_telemetry.push(WheelDebugTelemetry {
                    cast_end: round_vec3(attachment + down * wheel.suspension.travel),
                    cast_start: round_vec3(attachment),
                    entity: entity_id.to_owned(),
                    observation: observation.clone(),
                });
                wheel_observations.push(observation);
                continue;
            };
            let surface_owner = collider_owners
                .iter()
                .find_map(|(candidate, owner)| (*candidate == collider_handle).then_some(owner));
            let Some(surface_owner) = surface_owner else {
                state.angular_speed.insert(state_key.clone(), angular_speed);
                state.wheel_feedback.insert(
                    state_key,
                    WheelFeedback {
                        grounded: false,
                        longitudinal_slip: 0.0,
                    },
                );
                record_wheel_visual_state(
                    state,
                    entity_id,
                    &wheel.id,
                    wheel.visual.as_deref(),
                    attachment + down * wheel.suspension.travel,
                    attachment + down * wheel.suspension.travel,
                    [pose.translation.x, pose.translation.y, pose.translation.z],
                    [
                        pose.rotation.x,
                        pose.rotation.y,
                        pose.rotation.z,
                        pose.rotation.w,
                    ],
                    steering_angle,
                    angular_speed,
                    fixed_delta,
                    &mut active_visual_keys,
                    &mut visual_states,
                );
                let observation = airborne_observation(&wheel.id, angular_speed);
                debug_telemetry.push(WheelDebugTelemetry {
                    cast_end: round_vec3(attachment + down * wheel.suspension.travel),
                    cast_start: round_vec3(attachment),
                    entity: entity_id.to_owned(),
                    observation: observation.clone(),
                });
                wheel_observations.push(observation);
                continue;
            };
            let compression =
                (wheel.suspension.travel - hit.time_of_impact).clamp(0.0, wheel.suspension.travel);
            let contact_point = hit.witness1;
            let contact_normal = hit.normal1.try_normalize().unwrap_or(Vec3::Y);
            let point_velocity =
                body_velocity + body_angular_velocity.cross(contact_point - body.center_of_mass());
            let compression_velocity = point_velocity.dot(down);
            let normal_load = (wheel.suspension.spring_rate * compression
                + wheel.suspension.damper_rate * compression_velocity)
                .clamp(0.0, assembly.max_suspension_force);
            let longitudinal_speed = point_velocity.dot(forward);
            let lateral_speed = point_velocity.dot(right);
            let wheel_surface_speed = angular_speed * wheel.radius;
            let longitudinal_slip = (wheel_surface_speed - longitudinal_speed)
                / 1.0_f32
                    .max(wheel_surface_speed.abs())
                    .max(longitudinal_speed.abs());
            let lateral_slip = lateral_speed.atan2(longitudinal_speed.abs().max(0.1));
            let tire = tire_model(bundle, &wheel.tire);
            let surface = physics_surface(bundle, &surface_owner.entity);
            let load_multiplier = tire
                .map(|tire| {
                    1.0 / (1.0
                        + tire.load_sensitivity * normal_load
                            / assembly.max_suspension_force.max(1.0))
                })
                .unwrap_or(1.0);
            let longitudinal_grip = tire
                .map(|tire| {
                    sample_physics_slip_curve(&tire.longitudinal_slip_curve, longitudinal_slip)
                })
                .unwrap_or(1.0);
            let lateral_grip = tire
                .map(|tire| sample_physics_slip_curve(&tire.lateral_slip_curve, lateral_slip))
                .unwrap_or(1.0);
            let longitudinal_grip = combined_tire_surface_value(
                longitudinal_grip,
                surface.map(|surface| (surface.grip, surface.combine_rule.as_str())),
            ) * load_multiplier;
            let lateral_grip = combined_tire_surface_value(
                lateral_grip,
                surface.map(|surface| (surface.grip, surface.combine_rule.as_str())),
            ) * load_multiplier;
            let rolling_resistance = combined_tire_surface_value(
                tire.map(|tire| tire.rolling_resistance).unwrap_or(0.0),
                surface.map(|surface| (surface.rolling_resistance, surface.combine_rule.as_str())),
            );
            let brake_force = if wheel_brake_force > 0.0 && longitudinal_speed.abs() > 1.0e-5 {
                -longitudinal_speed.signum() * wheel_brake_force
            } else {
                0.0
            };
            let rolling_force = if longitudinal_speed.abs() > 1.0e-5 {
                -longitudinal_speed.signum() * rolling_resistance * normal_load
            } else {
                0.0
            };
            let longitudinal_cap = (longitudinal_grip * normal_load).min(assembly.max_tire_force);
            let lateral_cap = (lateral_grip * normal_load).min(assembly.max_tire_force);
            let mut longitudinal_force = (drive_force + brake_force + rolling_force)
                .clamp(-longitudinal_cap, longitudinal_cap);
            let mut lateral_force = (-lateral_speed * normal_load).clamp(-lateral_cap, lateral_cap);
            let magnitude = longitudinal_force.hypot(lateral_force);
            if magnitude > assembly.max_tire_force {
                let scale = assembly.max_tire_force / magnitude;
                longitudinal_force *= scale;
                lateral_force *= scale;
            }
            forces.push((
                contact_normal * normal_load + forward * longitudinal_force + right * lateral_force,
                contact_point,
            ));
            let coupling = (longitudinal_grip * fixed_delta * 10.0).clamp(0.0, 1.0);
            angular_speed +=
                (longitudinal_speed / wheel.radius.max(1.0e-4) - angular_speed) * coupling;
            state.angular_speed.insert(state_key.clone(), angular_speed);
            state.wheel_feedback.insert(
                state_key,
                WheelFeedback {
                    grounded: true,
                    longitudinal_slip,
                },
            );
            record_wheel_visual_state(
                state,
                entity_id,
                &wheel.id,
                wheel.visual.as_deref(),
                attachment + down * wheel.suspension.travel,
                attachment + down * (wheel.suspension.travel - compression),
                [pose.translation.x, pose.translation.y, pose.translation.z],
                [
                    pose.rotation.x,
                    pose.rotation.y,
                    pose.rotation.z,
                    pose.rotation.w,
                ],
                steering_angle,
                angular_speed,
                fixed_delta,
                &mut active_visual_keys,
                &mut visual_states,
            );
            let observation = WheelObservation {
                angular_speed: round(angular_speed),
                compression: round(compression),
                contact: Some(WheelContactObservation {
                    child: surface_owner.child.clone(),
                    distance: round(hit.time_of_impact),
                    entity: surface_owner.entity.clone(),
                    normal: round_vec3(contact_normal),
                    point: round_vec3(contact_point),
                }),
                grounded: true,
                lateral_slip: round(lateral_slip),
                longitudinal_slip: round(longitudinal_slip),
                normal_load: round(normal_load),
                surface: surface.is_some().then(|| surface_owner.entity.clone()),
                wheel_id: wheel.id.clone(),
            };
            debug_telemetry.push(WheelDebugTelemetry {
                cast_end: round_vec3(attachment + down * wheel.suspension.travel),
                cast_start: round_vec3(attachment),
                entity: entity_id.to_owned(),
                observation: observation.clone(),
            });
            wheel_observations.push(observation);
        }

        if let Some(body) = world.bodies.get_mut(body_handle) {
            for (force, point) in forces {
                body.apply_impulse_at_point(force * fixed_delta, point, true);
            }
        }
        observations.push(WheelAssemblyObservation {
            entity: entity_id.to_owned(),
            step: state.step,
            wheels: wheel_observations,
        });
        if let Some(controller) = controller_step {
            controller_observations.push(controller.observation);
        }
    }
    state.step += 1;
    state
        .visual
        .retain(|key, _| active_visual_keys.contains(key));
    VEHICLE_OBSERVATIONS.with(|stored| {
        stored.borrow_mut().insert(runtime_id, observations);
    });
    VEHICLE_DEBUG_TELEMETRY.with(|stored| {
        stored.borrow_mut().insert(runtime_id, debug_telemetry);
    });
    VEHICLE_VISUAL_STATES.with(|stored| {
        stored.borrow_mut().insert(runtime_id, visual_states);
    });
    VEHICLE_CONTROLLER_OBSERVATIONS.with(|stored| {
        stored
            .borrow_mut()
            .insert(runtime_id, controller_observations);
    });
}

#[allow(clippy::too_many_arguments)]
fn record_wheel_visual_state(
    state: &mut VehicleRuntimeState,
    entity_id: &str,
    wheel_id: &str,
    target_id: Option<&str>,
    initial_position: Vec3,
    position: Vec3,
    chassis_position: [f32; 3],
    chassis_rotation: [f32; 4],
    steering_angle: f32,
    angular_speed: f32,
    fixed_delta: f32,
    active_keys: &mut BTreeSet<(String, String)>,
    output: &mut Vec<WheelVisualState>,
) {
    let Some(target_id) = target_id else {
        return;
    };
    let key = (entity_id.to_owned(), wheel_id.to_owned());
    let initial = WheelVisualPose {
        chassis_position,
        chassis_rotation,
        position: initial_position.into(),
        spin_angle: 0.0,
        steering_angle: 0.0,
    };
    let previous = state
        .visual
        .get(&key)
        .map(|visual| visual.current)
        .unwrap_or(initial);
    let current = WheelVisualPose {
        chassis_position,
        chassis_rotation,
        position: position.into(),
        spin_angle: normalize_angle(previous.spin_angle + angular_speed * fixed_delta),
        steering_angle,
    };
    let visual = WheelVisualState {
        current,
        entity: entity_id.to_owned(),
        previous,
        target_id: target_id.to_owned(),
        wheel_id: wheel_id.to_owned(),
    };
    active_keys.insert(key.clone());
    state.visual.insert(key, visual.clone());
    output.push(visual);
}

fn airborne_observation(wheel_id: &str, angular_speed: f32) -> WheelObservation {
    WheelObservation {
        angular_speed: round(angular_speed),
        compression: 0.0,
        contact: None,
        grounded: false,
        lateral_slip: 0.0,
        longitudinal_slip: 0.0,
        normal_load: 0.0,
        surface: None,
        wheel_id: wheel_id.to_owned(),
    }
}

fn tire_model<'a>(bundle: &'a LoadedBundle, entity_id: &str) -> Option<&'a TireModelComponent> {
    bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)?
        .components
        .tire_model
        .as_ref()
}

fn physics_surface<'a>(
    bundle: &'a LoadedBundle,
    entity_id: &str,
) -> Option<&'a PhysicsSurfaceComponent> {
    bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)?
        .components
        .physics_surface
        .as_ref()
}

fn vehicle_gear_ratio(controller: &VehicleControllerComponent, gear: i32) -> f32 {
    if gear < 0 {
        -controller.transmission.reverse_ratio
    } else if gear == 0 {
        0.0
    } else {
        controller
            .transmission
            .forward_ratios
            .get((gear - 1) as usize)
            .copied()
            .unwrap_or(0.0)
    }
}

fn vehicle_shaft_direction(
    longitudinal_speed: f32,
    average_wheel_angular_speed: f32,
    gear_ratio: f32,
) -> f32 {
    let shaft_speed = if longitudinal_speed.abs() > SHAFT_DIRECTION_EPSILON {
        longitudinal_speed
    } else if average_wheel_angular_speed.abs() > SHAFT_DIRECTION_EPSILON {
        average_wheel_angular_speed
    } else {
        0.0
    };
    if shaft_speed == 0.0 || gear_ratio == 0.0 {
        0.0
    } else {
        (shaft_speed * gear_ratio).signum()
    }
}

fn vehicle_planar_speed(velocity: Vec3) -> f32 {
    velocity.x.hypot(velocity.z)
}

fn normalized_vehicle_coupled_angular_speed(
    entity_id: &str,
    driven: &[&WheelComponent],
    longitudinal_speed: f32,
    airborne_fallback: f32,
    feedback: &BTreeMap<(String, String), WheelFeedback>,
    last_grounded_coupled_angular_speed: &mut f32,
    consecutive_zero_grounded_driven_ticks: &mut u32,
) -> f32 {
    let grounded = driven
        .iter()
        .filter_map(|wheel| {
            let wheel_feedback = feedback.get(&(entity_id.to_owned(), wheel.id.clone()))?;
            wheel_feedback.grounded.then(|| {
                let slip_scale = 1.0 + wheel_feedback.longitudinal_slip.clamp(-0.5, 0.5);
                longitudinal_speed / wheel.radius.max(1.0e-4) * slip_scale
            })
        })
        .collect::<Vec<_>>();
    if !grounded.is_empty() {
        let coupled_angular_speed = grounded.iter().sum::<f32>() / grounded.len() as f32;
        *last_grounded_coupled_angular_speed = coupled_angular_speed;
        *consecutive_zero_grounded_driven_ticks = 0;
        return coupled_angular_speed;
    }
    *consecutive_zero_grounded_driven_ticks =
        consecutive_zero_grounded_driven_ticks.saturating_add(1);
    if *consecutive_zero_grounded_driven_ticks <= VEHICLE_GROUNDED_COUPLING_GRACE_TICKS {
        *last_grounded_coupled_angular_speed
    } else {
        airborne_fallback
    }
}

pub fn sample_vehicle_torque_curve(points: &[VehicleTorqueCurvePoint], rpm: f32) -> f32 {
    let Some(first) = points.first() else {
        return 0.0;
    };
    if rpm <= first.rpm {
        return first.torque;
    }
    for pair in points.windows(2) {
        let [left, right] = pair else { continue };
        if rpm <= right.rpm {
            let t = (rpm - left.rpm) / (right.rpm - left.rpm).max(1.0e-6);
            return left.torque + (right.torque - left.torque) * t;
        }
    }
    points.last().map(|point| point.torque).unwrap_or(0.0)
}

fn sample_vehicle_steering_curve(
    points: &[threenative_loader::VehicleSteeringCurvePoint],
    speed: f32,
) -> f32 {
    let Some(first) = points.first() else {
        return 1.0;
    };
    if speed <= first.speed {
        return first.scale;
    }
    for pair in points.windows(2) {
        let [left, right] = pair else { continue };
        if speed <= right.speed {
            let t = (speed - left.speed) / (right.speed - left.speed).max(1.0e-6);
            return left.scale + (right.scale - left.scale) * t;
        }
    }
    points.last().map(|point| point.scale).unwrap_or(1.0)
}

fn assist_triggered<'a>(
    assist: Option<&VehicleAssistComponent>,
    mut feedback: impl Iterator<Item = &'a WheelFeedback>,
) -> bool {
    let Some(assist) = assist.filter(|assist| assist.enabled) else {
        return false;
    };
    feedback.any(|wheel| wheel.grounded && wheel.longitudinal_slip.abs() > assist.slip_threshold)
}

fn step_assist_multiplier(
    current: f32,
    assist: Option<&VehicleAssistComponent>,
    triggered: bool,
    fixed_delta: f32,
) -> f32 {
    let Some(assist) = assist.filter(|assist| assist.enabled) else {
        return 1.0;
    };
    move_toward(
        current,
        if triggered { 0.0 } else { 1.0 },
        fixed_delta / assist.response,
    )
}

fn distribute_vehicle_torque(
    entity_id: &str,
    controller: &VehicleControllerComponent,
    assembly: &WheelAssemblyComponent,
    total_torque: f32,
    feedback: &BTreeMap<(String, String), WheelFeedback>,
) -> BTreeMap<String, f32> {
    let driven = assembly
        .wheels
        .iter()
        .filter(|wheel| wheel.driven)
        .collect::<Vec<_>>();
    let eligible = driven
        .iter()
        .copied()
        .filter(|wheel| {
            controller.differential.kind == "locked"
                || feedback
                    .get(&(entity_id.to_owned(), wheel.id.clone()))
                    .is_some_and(|wheel| wheel.grounded)
        })
        .collect::<Vec<_>>();
    if eligible.is_empty() {
        return BTreeMap::new();
    }
    let eligible_slips = eligible
        .iter()
        .map(|wheel| {
            feedback
                .get(&(entity_id.to_owned(), wheel.id.clone()))
                .map(|feedback| feedback.longitudinal_slip.abs())
                .unwrap_or(0.0)
        })
        .collect::<Vec<_>>();
    let minimum_slip = eligible_slips.iter().copied().fold(f32::MAX, f32::min);
    let maximum_slip = eligible_slips.iter().copied().fold(0.0_f32, f32::max);
    let has_meaningful_slip_difference =
        maximum_slip - minimum_slip > LIMITED_SLIP_ACTIVATION_DELTA;
    let weights = eligible
        .iter()
        .map(|wheel| {
            if controller.differential.kind != "limited-slip" || !has_meaningful_slip_difference {
                return 1.0;
            }
            let ratio = controller
                .differential
                .limited_slip_ratio
                .unwrap_or(1.0)
                .clamp(1.0, 10.0);
            let slip = feedback
                .get(&(entity_id.to_owned(), wheel.id.clone()))
                .map(|wheel| wheel.longitudinal_slip.abs())
                .unwrap_or(0.0);
            ((maximum_slip + 0.001) / (slip + 0.001)).clamp(1.0, ratio)
        })
        .collect::<Vec<_>>();
    let total_weight = weights.iter().sum::<f32>().max(1.0e-6);
    eligible
        .into_iter()
        .zip(weights)
        .map(|(wheel, weight)| (wheel.id.clone(), total_torque * weight / total_weight))
        .collect()
}

fn distribute_vehicle_braking(
    controller: &VehicleControllerComponent,
    assembly: &WheelAssemblyComponent,
    input: VehicleControlInput,
    abs_multiplier: f32,
) -> BTreeMap<String, f32> {
    let front_count = assembly
        .wheels
        .iter()
        .filter(|wheel| wheel.braked && wheel.attachment[2] < 0.0)
        .count();
    let rear_count = assembly
        .wheels
        .iter()
        .filter(|wheel| wheel.braked && wheel.attachment[2] >= 0.0)
        .count();
    let front_budget = if rear_count == 0 {
        1.0
    } else {
        controller.brakes.front_bias
    };
    let rear_budget = if front_count == 0 {
        1.0
    } else {
        1.0 - controller.brakes.front_bias
    };
    assembly
        .wheels
        .iter()
        .map(|wheel| {
            let service = if !wheel.braked {
                0.0
            } else if wheel.attachment[2] < 0.0 {
                input.brake * abs_multiplier * front_budget * assembly.max_tire_force
                    / front_count.max(1) as f32
            } else {
                input.brake * abs_multiplier * rear_budget * assembly.max_tire_force
                    / rear_count.max(1) as f32
            };
            let handbrake = if controller
                .brakes
                .handbrake_wheel_ids
                .iter()
                .any(|id| id == &wheel.id)
            {
                input.handbrake * assembly.max_tire_force
            } else {
                0.0
            };
            (
                wheel.id.clone(),
                (service + handbrake).min(assembly.max_tire_force),
            )
        })
        .collect()
}

pub fn sample_physics_slip_curve(points: &[PhysicsSlipCurvePoint], slip: f32) -> f32 {
    let Some(first) = points.first() else {
        return 0.0;
    };
    if slip <= first.slip {
        return first.grip;
    }
    for pair in points.windows(2) {
        let [left, right] = pair else { continue };
        if slip <= right.slip {
            let t = (slip - left.slip) / (right.slip - left.slip).max(1.0e-6);
            return left.grip + (right.grip - left.grip) * t;
        }
    }
    points.last().map(|point| point.grip).unwrap_or(0.0)
}

fn move_toward(current: f32, target: f32, max_delta: f32) -> f32 {
    if (target - current).abs() <= max_delta {
        target
    } else {
        current + (target - current).signum() * max_delta
    }
}

pub fn combined_surface_value(left: f32, left_rule: &str, right: f32, right_rule: &str) -> f32 {
    let rule = if combine_priority(left_rule) >= combine_priority(right_rule) {
        left_rule
    } else {
        right_rule
    };
    match rule {
        "minimum" => left.min(right),
        "maximum" => left.max(right),
        "multiply" => left * right,
        _ => (left + right) / 2.0,
    }
}

fn interpolate_vec3(from: [f32; 3], to: [f32; 3], alpha: f32) -> [f32; 3] {
    [
        from[0] + (to[0] - from[0]) * alpha,
        from[1] + (to[1] - from[1]) * alpha,
        from[2] + (to[2] - from[2]) * alpha,
    ]
}

fn interpolate_angle(from: f32, to: f32, alpha: f32) -> f32 {
    normalize_angle(from + normalize_angle(to - from) * alpha)
}

fn normalize_angle(angle: f32) -> f32 {
    (angle + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU) - std::f32::consts::PI
}

pub fn combined_tire_surface_value(left: f32, surface: Option<(f32, &str)>) -> f32 {
    surface.map_or(left, |(right, rule)| {
        combined_surface_value(left, "average", right, rule)
    })
}

fn combine_priority(rule: &str) -> u8 {
    match rule {
        "minimum" => 1,
        "multiply" => 2,
        "maximum" => 3,
        _ => 0,
    }
}

fn round(value: f32) -> f32 {
    (value * 10_000.0).round() / 10_000.0
}

fn round_vec3(value: Vec3) -> [f32; 3] {
    [round(value.x), round(value.y), round(value.z)]
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use rapier3d::glamx::Vec3;
    use threenative_loader::{
        VehicleAssistComponent, VehicleControllerComponent, WheelAssemblyComponent,
    };

    use crate::input::NativeInputState;

    use super::{
        VehicleControllerRuntimeState, WheelFeedback, airborne_observation, bound_vehicle_input,
        distribute_vehicle_torque, interpolate_angle, normalize_angle,
        normalized_vehicle_coupled_angular_speed, step_assist_multiplier, vehicle_planar_speed,
        vehicle_shaft_direction,
    };

    #[test]
    fn vehicle_bindings_should_drive_native_controller_input_and_single_gear_edge() {
        let controller: VehicleControllerComponent = serde_json::from_value(serde_json::json!({
            "bindings": { "brake": "Brake", "gearUp": "GearUp", "throttle": "Throttle" },
            "brakes": { "frontBias": 0.5, "handbrakeWheelIds": [] },
            "differential": { "kind": "open" },
            "engine": { "engineBraking": 20, "idleRpm": 800, "redlineRpm": 5000, "torqueCurve": [{ "rpm": 800, "torque": 200 }] },
            "steering": { "speedCurve": [{ "speed": 0, "scale": 1 }] },
            "transmission": { "clutchResponse": 0.1, "finalDrive": 3, "forwardRatios": [3, 2], "reverseRatio": 3, "shiftPolicy": "manual" }
        }))
        .expect("bound vehicle controller should deserialize");
        let input = NativeInputState::from_action_ids(["Throttle", "GearUp"]);

        let first = bound_vehicle_input(&controller, &input, 0, true);
        let repeated = bound_vehicle_input(&controller, &input, 0, false);

        assert_eq!(first.throttle, 1.0);
        assert_eq!(first.brake, 0.0);
        assert_eq!(first.gear, Some(1));
        assert_eq!(repeated.gear, None);
    }

    #[test]
    fn wheel_visual_spin_should_interpolate_across_wrap_by_the_shortest_arc() {
        let previous = normalize_angle(std::f32::consts::PI - 0.1);
        let current = normalize_angle(std::f32::consts::PI + 0.1);
        let midpoint = interpolate_angle(previous, current, 0.5);

        assert!(previous > 3.0);
        assert!(current < -3.0);
        assert!((midpoint.abs() - std::f32::consts::PI).abs() < 1.0e-5);
    }

    #[test]
    fn drivetrain_differentials_should_follow_grounding_and_slip_rules() {
        let assembly: WheelAssemblyComponent = serde_json::from_value(serde_json::json!({
            "maxSteeringAngle": 0.6,
            "maxSuspensionForce": 10000,
            "maxTireForce": 5000,
            "wheels": [
                wheel("low-slip"),
                wheel("high-slip"),
                wheel("airborne")
            ]
        }))
        .expect("wheel assembly should deserialize");
        let mut feedback = BTreeMap::new();
        feedback.insert(
            ("chassis".to_owned(), "low-slip".to_owned()),
            WheelFeedback {
                grounded: true,
                longitudinal_slip: 0.1,
            },
        );
        feedback.insert(
            ("chassis".to_owned(), "high-slip".to_owned()),
            WheelFeedback {
                grounded: true,
                longitudinal_slip: 0.9,
            },
        );
        feedback.insert(
            ("chassis".to_owned(), "airborne".to_owned()),
            WheelFeedback {
                grounded: false,
                longitudinal_slip: 0.0,
            },
        );

        let open =
            distribute_vehicle_torque("chassis", &controller("open"), &assembly, 120.0, &feedback);
        assert_eq!(open.get("low-slip"), Some(&60.0));
        assert_eq!(open.get("high-slip"), Some(&60.0));
        assert!(!open.contains_key("airborne"));

        let locked = distribute_vehicle_torque(
            "chassis",
            &controller("locked"),
            &assembly,
            120.0,
            &feedback,
        );
        assert!(
            locked
                .values()
                .all(|torque| (*torque - 40.0).abs() < 1.0e-5)
        );

        feedback
            .get_mut(&("chassis".to_owned(), "high-slip".to_owned()))
            .expect("high-slip feedback should exist")
            .longitudinal_slip = 0.14;
        let limited_slip_below_deadband = distribute_vehicle_torque(
            "chassis",
            &controller("limited-slip"),
            &assembly,
            120.0,
            &feedback,
        );
        assert_eq!(limited_slip_below_deadband["low-slip"], 60.0);
        assert_eq!(limited_slip_below_deadband["high-slip"], 60.0);

        feedback
            .get_mut(&("chassis".to_owned(), "high-slip".to_owned()))
            .expect("high-slip feedback should exist")
            .longitudinal_slip = 0.9;
        let limited_slip = distribute_vehicle_torque(
            "chassis",
            &controller("limited-slip"),
            &assembly,
            120.0,
            &feedback,
        );
        assert!(limited_slip["low-slip"] > limited_slip["high-slip"]);
        assert!(limited_slip["low-slip"] / limited_slip["high-slip"] <= 3.0);
        assert!(!limited_slip.contains_key("airborne"));
    }

    #[test]
    fn drivetrain_assist_multiplier_should_transition_and_recover_deterministically() {
        let assist = VehicleAssistComponent {
            enabled: true,
            response: 0.1,
            slip_threshold: 0.2,
        };
        let intervention = step_assist_multiplier(1.0, Some(&assist), true, 0.025);
        let held = step_assist_multiplier(intervention, Some(&assist), true, 0.025);
        let recovery = step_assist_multiplier(held, Some(&assist), false, 0.025);
        assert_eq!(intervention, 0.75);
        assert_eq!(held, 0.5);
        assert_eq!(recovery, 0.75);
    }

    #[test]
    fn drivetrain_shaft_direction_should_ignore_zero_noise_and_preserve_real_motion() {
        assert_eq!(vehicle_shaft_direction(0.0, 0.0, 3.1), 0.0);
        assert_eq!(vehicle_shaft_direction(0.00001, -0.00009, 3.1), 0.0);
        assert_eq!(vehicle_shaft_direction(0.0, 0.00011, 3.1), 1.0);
        assert_eq!(vehicle_shaft_direction(0.0, 0.00011, -3.0), -1.0);
        assert_eq!(vehicle_shaft_direction(-0.5, 10.0, 3.1), -1.0);
    }

    #[test]
    fn drivetrain_speed_should_measure_the_y_up_ground_plane() {
        assert_eq!(vehicle_planar_speed(Vec3::new(0.0, 12.0, 0.0)), 0.0);
        assert_eq!(vehicle_planar_speed(Vec3::new(3.0, 12.0, -4.0)), 5.0);
    }

    #[test]
    fn airborne_wheel_observation_should_zero_slip_and_retain_angular_speed() {
        let observation = airborne_observation("wheel", 27.5);

        assert!(!observation.grounded);
        assert_eq!(observation.longitudinal_slip, 0.0);
        assert_eq!(observation.lateral_slip, 0.0);
        assert_eq!(observation.angular_speed, 27.5);
    }

    #[test]
    fn drivetrain_coupled_speed_should_bound_grounded_slip() {
        let assembly: WheelAssemblyComponent = serde_json::from_value(serde_json::json!({
            "maxSteeringAngle": 0.5,
            "maxSuspensionForce": 10000,
            "maxTireForce": 5000,
            "wheels": [wheel("left"), wheel("right")]
        }))
        .expect("wheel assembly should deserialize");
        let driven = assembly.wheels.iter().collect::<Vec<_>>();
        let mut feedback = BTreeMap::new();
        feedback.insert(
            ("chassis".to_owned(), "left".to_owned()),
            WheelFeedback {
                grounded: true,
                longitudinal_slip: 4.0,
            },
        );
        feedback.insert(
            ("chassis".to_owned(), "right".to_owned()),
            WheelFeedback {
                grounded: true,
                longitudinal_slip: -4.0,
            },
        );

        let mut last_grounded = 0.0;
        let mut consecutive_zero_grounded = 0;
        let bounded = normalized_vehicle_coupled_angular_speed(
            "chassis",
            &driven,
            6.0,
            99.0,
            &feedback,
            &mut last_grounded,
            &mut consecutive_zero_grounded,
        );
        assert!((bounded - 20.0).abs() < 1.0e-5);
        assert_eq!(last_grounded, 20.0);
        assert_eq!(consecutive_zero_grounded, 0);
    }

    #[test]
    fn drivetrain_coupled_speed_should_grace_one_transient_airborne_tick_then_fallback() {
        let assembly: WheelAssemblyComponent = serde_json::from_value(serde_json::json!({
            "maxSteeringAngle": 0.5,
            "maxSuspensionForce": 10000,
            "maxTireForce": 5000,
            "wheels": [wheel("left"), wheel("right")]
        }))
        .expect("wheel assembly should deserialize");
        let driven = assembly.wheels.iter().collect::<Vec<_>>();
        let mut feedback = BTreeMap::new();
        for wheel in &driven {
            feedback.insert(
                ("chassis".to_owned(), wheel.id.clone()),
                WheelFeedback {
                    grounded: true,
                    longitudinal_slip: 0.0,
                },
            );
        }
        let mut last_grounded = 0.0;
        let mut consecutive_zero_grounded = 0;
        assert_eq!(
            normalized_vehicle_coupled_angular_speed(
                "chassis",
                &driven,
                6.0,
                99.0,
                &feedback,
                &mut last_grounded,
                &mut consecutive_zero_grounded,
            ),
            20.0
        );

        for wheel_feedback in feedback.values_mut() {
            wheel_feedback.grounded = false;
        }
        let transient = normalized_vehicle_coupled_angular_speed(
            "chassis",
            &driven,
            6.0,
            27.5,
            &feedback,
            &mut last_grounded,
            &mut consecutive_zero_grounded,
        );
        let sustained = normalized_vehicle_coupled_angular_speed(
            "chassis",
            &driven,
            6.0,
            27.5,
            &feedback,
            &mut last_grounded,
            &mut consecutive_zero_grounded,
        );
        assert_eq!(transient, 20.0);
        assert_eq!(sustained, 27.5);
        assert_eq!(consecutive_zero_grounded, 2);
    }

    #[test]
    fn drivetrain_coupled_speed_cache_should_start_empty_for_a_fresh_runtime() {
        let assembly: WheelAssemblyComponent = serde_json::from_value(serde_json::json!({
            "maxSteeringAngle": 0.5,
            "maxSuspensionForce": 10000,
            "maxTireForce": 5000,
            "wheels": [wheel("left"), wheel("right")]
        }))
        .expect("wheel assembly should deserialize");
        let driven = assembly.wheels.iter().collect::<Vec<_>>();
        let feedback = BTreeMap::new();
        let mut fresh = VehicleControllerRuntimeState::default();

        let airborne = normalized_vehicle_coupled_angular_speed(
            "chassis",
            &driven,
            6.0,
            27.5,
            &feedback,
            &mut fresh.last_grounded_coupled_angular_speed,
            &mut fresh.consecutive_zero_grounded_driven_ticks,
        );
        let sustained = normalized_vehicle_coupled_angular_speed(
            "chassis",
            &driven,
            6.0,
            27.5,
            &feedback,
            &mut fresh.last_grounded_coupled_angular_speed,
            &mut fresh.consecutive_zero_grounded_driven_ticks,
        );

        assert_eq!(airborne, 0.0);
        assert_eq!(sustained, 27.5);
        assert_eq!(fresh.last_grounded_coupled_angular_speed, 0.0);
        assert_eq!(fresh.consecutive_zero_grounded_driven_ticks, 2);
    }

    fn wheel(id: &str) -> serde_json::Value {
        serde_json::json!({
            "attachment": [0, -0.2, 0],
            "braked": true,
            "driven": true,
            "id": id,
            "radius": 0.3,
            "steering": false,
            "suspension": { "damperRate": 500, "springRate": 20000, "travel": 0.5 },
            "tire": "tire",
            "width": 0.2
        })
    }

    fn controller(kind: &str) -> VehicleControllerComponent {
        serde_json::from_value(serde_json::json!({
            "brakes": { "frontBias": 0.5, "handbrakeWheelIds": [] },
            "differential": { "kind": kind, "limitedSlipRatio": 3 },
            "engine": { "engineBraking": 20, "idleRpm": 800, "redlineRpm": 5000, "torqueCurve": [{ "rpm": 800, "torque": 200 }] },
            "steering": { "speedCurve": [{ "speed": 0, "scale": 1 }] },
            "transmission": { "clutchResponse": 0.1, "finalDrive": 3, "forwardRatios": [3], "reverseRatio": 3, "shiftPolicy": "manual" }
        }))
        .expect("vehicle controller should deserialize")
    }
}
