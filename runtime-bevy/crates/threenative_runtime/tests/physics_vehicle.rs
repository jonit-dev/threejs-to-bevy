use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::PhysicsSlipCurvePoint;
use threenative_loader::load_bundle;
use threenative_runtime::{
    physics::{
        dispose_native_physics_runtime, inspect_physics_body_mass_properties,
        native_physics_runtime_id, step_bundle_physics_with_script_poses,
    },
    physics_vehicle::{
        VehicleControlInput, WheelControlInput, combined_surface_value,
        combined_tire_surface_value, inspect_physics_vehicle_debug_telemetry,
        observe_physics_vehicle_controllers, observe_physics_vehicle_visuals,
        observe_physics_vehicles, sample_physics_slip_curve, set_physics_vehicle_control_input,
        set_physics_vehicle_inputs,
    },
};

#[test]
fn vehicle_should_compress_suspension_and_converge_under_static_load() {
    let invariants = physics_invariant_registry();
    let root = write_vehicle_bundle("static-load", "asphalt", 1.0, &[true, true, true, true]);
    let mut bundle = load_bundle(&root).expect("vehicle bundle should load");
    let runtime = BTreeSet::new();
    let chassis_mass = inspect_physics_body_mass_properties(&bundle, "chassis")
        .expect("chassis mass properties should resolve")
        .mass;
    let gravity = bundle
        .runtime_config
        .as_ref()
        .and_then(|config| config.physics.as_ref())
        .map(|physics| physics.gravity)
        .unwrap_or([0.0, -9.81, 0.0]);
    let gravity_magnitude =
        (gravity[0] * gravity[0] + gravity[1] * gravity[1] + gravity[2] * gravity[2]).sqrt();

    for _ in 0..invariants.static_load.settle_steps {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
    }

    let mut terminal_loads = Vec::new();
    let mut terminal_heights = Vec::new();
    for _ in 0..invariants.static_load.sample_window_steps {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
        let observation = &observe_physics_vehicles(native_physics_runtime_id(&runtime))[0];
        assert!(
            observation
                .wheels
                .iter()
                .all(|wheel| wheel.normal_load > 0.0)
        );
        terminal_loads.push(
            observation
                .wheels
                .iter()
                .map(|wheel| wheel.normal_load)
                .sum::<f32>(),
        );
        terminal_heights.push(
            bundle
                .world
                .entities
                .iter()
                .find(|entity| entity.id == "chassis")
                .and_then(|entity| entity.components.transform.as_ref()?.position)
                .expect("chassis position")[1],
        );
    }

    let observations = observe_physics_vehicles(native_physics_runtime_id(&runtime));
    assert_eq!(observations.len(), 1);
    assert_eq!(
        observations[0]
            .wheels
            .iter()
            .map(|wheel| wheel.wheel_id.as_str())
            .collect::<Vec<_>>(),
        vec!["rear-right", "front-left", "rear-left", "front-right"]
    );
    let chassis_y = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.transform.as_ref()?.position)
        .expect("chassis position")[1];
    assert!(
        observations[0].wheels.iter().all(|wheel| wheel.grounded),
        "chassis_y={chassis_y}, wheel telemetry: {:?}",
        observations[0].wheels
    );
    assert!(
        observations[0]
            .wheels
            .iter()
            .all(|wheel| wheel.grounded == wheel.contact.is_some())
    );
    assert!(
        observations[0]
            .wheels
            .iter()
            .all(|wheel| wheel.compression > 0.0)
    );
    let mean_load = terminal_loads.iter().sum::<f32>() / terminal_loads.len() as f32;
    let chassis_weight = chassis_mass * gravity_magnitude;
    assert!(
        (chassis_weight * invariants.static_load.min_total_normal_load_weight_ratio
            ..chassis_weight * invariants.static_load.max_total_normal_load_weight_ratio)
            .contains(&mean_load),
        "terminal mean suspension load {mean_load} should remain tied to chassis weight {chassis_weight}"
    );
    let height_span = terminal_heights.iter().copied().fold(f32::MIN, f32::max)
        - terminal_heights.iter().copied().fold(f32::MAX, f32::min);
    assert!(
        height_span < invariants.static_load.max_ride_height_span,
        "terminal ride-height span={height_span}"
    );
    let debug = inspect_physics_vehicle_debug_telemetry(native_physics_runtime_id(&runtime));
    assert_eq!(debug.len(), 4);
    assert_eq!(debug[0].observation.wheel_id, "rear-right");
    assert_ne!(debug[0].cast_start, debug[0].cast_end);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn vehicle_should_observe_authored_ground_on_the_first_fixed_tick() {
    let root = write_vehicle_bundle("first-tick-contact", "asphalt", 1.0, &[true; 4]);
    let mut bundle = load_bundle(&root).expect("vehicle bundle should load");
    let runtime = BTreeSet::new();

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);

    let observations = observe_physics_vehicles(native_physics_runtime_id(&runtime));
    assert_eq!(observations.len(), 1);
    assert!(
        observations[0]
            .wheels
            .iter()
            .all(|wheel| wheel.grounded && wheel.contact.is_some()),
        "tick-zero retained-world suspension casts must see authored ground: {:?}",
        observations[0].wheels
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn vehicle_should_accelerate_less_on_ice_and_require_driven_wheels() {
    let asphalt = vehicle_acceleration("asphalt-run", "asphalt", 1.0, &[true, true, true, true]);
    let ice = vehicle_acceleration("ice-run", "ice", 0.1, &[true, true, true, true]);
    let not_driven =
        vehicle_acceleration("not-driven", "asphalt", 1.0, &[false, false, false, false]);

    assert!(
        asphalt.0 > ice.0 * 2.0,
        "asphalt must accelerate measurably faster"
    );
    assert!(ice.0 > 0.05, "ice should retain bounded non-zero grip");
    assert!(
        not_driven.0.abs() < 0.01,
        "drive input must not actuate non-driven wheels"
    );
    assert!(asphalt.1.iter().all(|surface| surface == "ground-asphalt"));
    assert!(ice.1.iter().all(|surface| surface == "ground-ice"));
}

#[test]
fn vehicle_should_steer_and_brake_only_when_the_authored_wheels_allow_it() {
    let steering_root = write_vehicle_bundle(
        "steering-positive",
        "asphalt",
        1.0,
        &[true, true, true, true],
    );
    let steering_negative_root = write_vehicle_bundle(
        "steering-negative",
        "asphalt",
        1.0,
        &[true, true, true, true],
    );
    let braking_root = write_vehicle_bundle(
        "braking-positive",
        "asphalt",
        1.0,
        &[true, true, true, true],
    );
    let braking_negative_root = write_vehicle_bundle(
        "braking-negative",
        "asphalt",
        1.0,
        &[true, true, true, true],
    );
    let mut steering_bundle = load_bundle(&steering_root).expect("steering bundle should load");
    let mut steering_negative_bundle =
        load_bundle(&steering_negative_root).expect("steering negative bundle should load");
    let mut braking_bundle = load_bundle(&braking_root).expect("braking bundle should load");
    let mut braking_negative_bundle =
        load_bundle(&braking_negative_root).expect("braking negative bundle should load");
    set_all_wheel_flag(&mut steering_negative_bundle, "steering", false);
    set_all_wheel_flag(&mut braking_negative_bundle, "braked", false);

    let steering_runtime = BTreeSet::new();
    let steering_negative_runtime = BTreeSet::new();
    let braking_runtime = BTreeSet::new();
    let braking_negative_runtime = BTreeSet::new();
    let steering_control = WheelControlInput {
        brake: 0.0,
        drive: 1.0,
        steering: 0.5,
    };
    step_vehicle(
        &mut steering_bundle,
        &steering_runtime,
        steering_control,
        90,
    );
    step_vehicle(
        &mut steering_negative_bundle,
        &steering_negative_runtime,
        steering_control,
        90,
    );
    let (steering_position, steering_rotation, _) = chassis_motion(&steering_bundle);
    let (negative_position, negative_rotation, _) = chassis_motion(&steering_negative_bundle);
    assert!(
        steering_position[0].abs() > 0.1,
        "steering should produce a measurable lateral path: {steering_position:?}"
    );
    assert!(
        steering_rotation[1].abs() > negative_rotation[1].abs() + 0.1,
        "steering should produce yaw without a transform teleport: positive={steering_rotation:?}, negative={negative_rotation:?}"
    );
    assert!(
        negative_position[0].abs() < 0.5,
        "non-steering wheels should preserve a nearly straight path: {negative_position:?}"
    );
    assert!(
        steering_position.iter().all(|value| value.is_finite())
            && steering_rotation.iter().all(|value| value.is_finite())
            && steering_position[0].hypot(steering_position[2]) < 30.0,
        "steering pose should remain finite and bounded"
    );

    let drive_control = WheelControlInput {
        brake: 0.0,
        drive: 1.0,
        steering: 0.0,
    };
    step_vehicle(&mut braking_bundle, &braking_runtime, drive_control, 120);
    step_vehicle(
        &mut braking_negative_bundle,
        &braking_negative_runtime,
        drive_control,
        120,
    );
    let initial_speed = chassis_motion(&braking_bundle).2[2].abs();
    let initial_negative_speed = chassis_motion(&braking_negative_bundle).2[2].abs();
    let brake_control = WheelControlInput {
        brake: 1.0,
        drive: 0.0,
        steering: 0.0,
    };
    step_vehicle(&mut braking_bundle, &braking_runtime, brake_control, 60);
    step_vehicle(
        &mut braking_negative_bundle,
        &braking_negative_runtime,
        brake_control,
        60,
    );
    let final_speed = chassis_motion(&braking_bundle).2[2].abs();
    let final_negative_speed = chassis_motion(&braking_negative_bundle).2[2].abs();
    assert!(
        final_speed < initial_speed * 0.5,
        "brakes should measurably reduce speed: initial={initial_speed}, final={final_speed}"
    );
    assert!(
        final_negative_speed > initial_negative_speed * 0.9,
        "brake input must not actuate non-braked wheels: initial={initial_negative_speed}, final={final_negative_speed}"
    );

    for root in [
        steering_root,
        steering_negative_root,
        braking_root,
        braking_negative_root,
    ] {
        fs::remove_dir_all(root).expect("temporary bundle should be removed");
    }
}

#[test]
fn vehicle_surface_combine_rules_should_match_portable_priority() {
    assert_eq!(combined_surface_value(0.5, "average", 0.2, "minimum"), 0.2);
    assert_eq!(combined_surface_value(0.5, "minimum", 0.2, "multiply"), 0.1);
    assert_eq!(combined_surface_value(0.5, "multiply", 0.2, "maximum"), 0.5);
    assert_eq!(combined_surface_value(0.5, "average", 0.3, "average"), 0.4);
    assert_eq!(combined_tire_surface_value(0.6, None), 0.6);
    assert_eq!(combined_tire_surface_value(0.08, None), 0.08);
    let asymmetric = [
        PhysicsSlipCurvePoint {
            grip: 0.2,
            slip: -1.0,
        },
        PhysicsSlipCurvePoint {
            grip: 0.5,
            slip: 0.0,
        },
        PhysicsSlipCurvePoint {
            grip: 1.0,
            slip: 1.0,
        },
    ];
    assert!((sample_physics_slip_curve(&asymmetric, -0.5) - 0.35).abs() < 0.0001);
    assert!((sample_physics_slip_curve(&asymmetric, 0.5) - 0.75).abs() < 0.0001);
}

#[test]
fn vehicle_visuals_should_follow_normalized_suspension_steering_and_spin_state() {
    let root = write_vehicle_bundle(
        "visual-presentation",
        "asphalt",
        1.0,
        &[true, true, true, true],
    );
    let mut bundle = load_bundle(&root).expect("vehicle bundle should load");
    let authored_visual_transforms = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.id.starts_with("wheel-visual-"))
        .map(|entity| {
            (
                entity.id.clone(),
                serde_json::to_string(&entity.components.transform)
                    .expect("authored transform should serialize"),
            )
        })
        .collect::<Vec<_>>();
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    assert!(set_physics_vehicle_control_input(
        runtime_id,
        "chassis",
        WheelControlInput {
            brake: 0.0,
            drive: 1.0,
            steering: 0.5,
        },
    ));
    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);

    let visuals = observe_physics_vehicle_visuals(runtime_id, 0.5);
    assert_eq!(
        visuals
            .iter()
            .map(|visual| visual.wheel_id.as_str())
            .collect::<Vec<_>>(),
        vec!["rear-right", "front-left", "rear-left", "front-right"]
    );
    assert_eq!(
        visuals
            .iter()
            .map(|visual| visual.target_id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "wheel-visual-rear-right",
            "wheel-visual-front-left",
            "wheel-visual-rear-left",
            "wheel-visual-front-right"
        ]
    );
    assert!(visuals.iter().all(|visual| {
        visual.position != [9.0, 9.0, 9.0] && visual.interpolated_position != [9.0, 9.0, 9.0]
    }));
    assert_eq!(visuals[0].steering_angle, 0.0);
    assert!((visuals[1].steering_angle - 0.3).abs() < 1.0e-6);
    assert!(visuals.iter().all(|visual| {
        visual.spin_angle != visual.previous_spin_angle
            && (visual.interpolated_spin_angle
                - (visual.previous_spin_angle + visual.spin_angle) * 0.5)
                .abs()
                < 1.0e-5
            && visual.interpolation_alpha == 0.5
    }));
    let source_after = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.id.starts_with("wheel-visual-"))
        .map(|entity| {
            (
                entity.id.clone(),
                serde_json::to_string(&entity.components.transform)
                    .expect("authored transform should serialize"),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(source_after, authored_visual_transforms);
    assert!(
        authored_visual_transforms
            .iter()
            .all(|(id, _)| inspect_physics_body_mass_properties(&bundle, id).is_none()),
        "presentation targets must not create physics bodies"
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn vehicle_controller_should_shift_deterministically_and_retry_from_fresh_state() {
    let first = recorded_automatic_launch("controller-auto-first");
    let retry = recorded_automatic_launch("controller-auto-retry");

    assert_eq!(
        first.0, retry.0,
        "fresh retry must reproduce the gear sequence"
    );
    assert!(
        first.0.iter().any(|gear| *gear > 1),
        "automatic launch should upshift"
    );
    let lockout_ticks = 6;
    for (tick, gears) in first.0.windows(2).enumerate() {
        if gears[1] > gears[0] {
            assert!(
                first.0[tick + 1..(tick + 1 + lockout_ticks).min(first.0.len())]
                    .iter()
                    .all(|gear| *gear >= gears[1]),
                "automatic shift at tick {tick} reversed during the clutch-response lockout"
            );
        }
    }
    assert!(first.1 > 1.0, "automatic launch should gain speed");
    assert!(first.2 > 800.0 && first.2 <= 5000.0);
}

#[test]
fn vehicle_controller_should_hold_a_bounded_straight_path_without_steering() {
    let root = write_drivetrain_bundle(
        "controller-straight-stability",
        "automatic",
        "open",
        1.0,
        false,
    );
    let mut bundle = load_bundle(&root).expect("automatic drivetrain bundle should load");
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    assert!(set_physics_vehicle_inputs(
        runtime_id,
        "chassis",
        VehicleControlInput {
            throttle: 1.0,
            ..VehicleControlInput::default()
        },
    ));

    for _ in 0..180 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
    }

    let (position, rotation, _) = chassis_motion(&bundle);
    let yaw = 2.0 * rotation[1].atan2(rotation[3]);
    assert!(
        position[0].abs() < 0.25 && yaw.abs() < 0.05,
        "zero-steer grounded acceleration must remain straight and bounded: position={position:?}, yaw={yaw}"
    );
    assert!(
        observe_physics_vehicles(runtime_id)[0]
            .wheels
            .iter()
            .all(|wheel| wheel.grounded)
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn vehicle_controller_should_brake_reverse_and_publish_assist_transitions() {
    let root = write_drivetrain_bundle("controller-controls", "manual", "limited-slip", 0.1, true);
    let mut bundle = load_bundle(&root).expect("drivetrain bundle should load");
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    let mut input = VehicleControlInput {
        brake: 0.0,
        clutch: 0.0,
        gear: Some(1),
        handbrake: 0.0,
        steer: 0.0,
        throttle: 1.0,
    };
    assert!(set_physics_vehicle_inputs(runtime_id, "chassis", input));
    let mut tcs_transition = false;
    for step in 0..120 {
        if step == 1 {
            input.gear = None;
            assert!(set_physics_vehicle_inputs(runtime_id, "chassis", input));
        }
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
        tcs_transition |= observe_physics_vehicle_controllers(runtime_id)
            .first()
            .is_some_and(|observation| observation.tcs_active);
    }
    input = VehicleControlInput {
        brake: 1.0,
        clutch: 0.0,
        gear: None,
        handbrake: 0.0,
        steer: 0.0,
        throttle: 0.0,
    };
    assert!(set_physics_vehicle_inputs(runtime_id, "chassis", input));
    let mut abs_transition = false;
    for _ in 0..60 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
        abs_transition |= observe_physics_vehicle_controllers(runtime_id)[0].abs_active;
    }
    assert!(
        tcs_transition && abs_transition,
        "low grip should activate TCS and ABS"
    );
    input.brake = 0.0;
    assert!(set_physics_vehicle_inputs(runtime_id, "chassis", input));
    for _ in 0..60 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
    }
    let recovered = &observe_physics_vehicle_controllers(runtime_id)[0];
    assert!(!recovered.tcs_active && !recovered.abs_active);

    let reverse_root =
        write_drivetrain_bundle("controller-reverse", "manual", "limited-slip", 1.0, false);
    let mut reverse_bundle = load_bundle(&reverse_root).expect("reverse bundle should load");
    let reverse_runtime = BTreeSet::new();
    let reverse_runtime_id = native_physics_runtime_id(&reverse_runtime);
    let mut reverse_input = VehicleControlInput {
        brake: 0.0,
        clutch: 0.0,
        gear: Some(-1),
        handbrake: 0.0,
        steer: 0.0,
        throttle: 1.0,
    };
    assert!(set_physics_vehicle_inputs(
        reverse_runtime_id,
        "chassis",
        reverse_input,
    ));
    for step in 0..180 {
        if step == 1 {
            reverse_input.gear = None;
            assert!(set_physics_vehicle_inputs(
                reverse_runtime_id,
                "chassis",
                reverse_input,
            ));
        }
        step_bundle_physics_with_script_poses(&mut reverse_bundle, 1.0 / 120.0, &reverse_runtime);
    }
    let reverse = observe_physics_vehicle_controllers(reverse_runtime_id)[0].clone();
    let reverse_velocity = chassis_motion(&reverse_bundle).2;
    assert_eq!(reverse.gear, -1);
    assert!(
        reverse_velocity[2] > 0.1,
        "reverse gear should reverse longitudinal motion"
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
    fs::remove_dir_all(reverse_root).expect("temporary bundle should be removed");
}

#[test]
fn vehicle_controller_service_brakes_should_reduce_authored_forward_speed() {
    let invariants = physics_invariant_registry();
    let root = write_drivetrain_bundle("controller-braking", "manual", "open", 1.0, false);
    let mut bundle = load_bundle(&root).expect("drivetrain bundle should load");
    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.rigid_body.as_mut())
        .expect("chassis rigid body should exist")
        .velocity = Some([0.0, 0.0, -invariants.braking.initial_speed]);
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    assert!(set_physics_vehicle_inputs(
        runtime_id,
        "chassis",
        VehicleControlInput {
            brake: 1.0,
            clutch: 0.0,
            gear: Some(1),
            handbrake: 0.0,
            steer: 0.0,
            throttle: 0.0,
        },
    ));

    for _ in 0..invariants.braking.ticks {
        step_bundle_physics_with_script_poses(
            &mut bundle,
            invariants.braking.fixed_delta,
            &runtime,
        );
    }

    let final_speed = observe_physics_vehicle_controllers(runtime_id)[0].speed;
    assert!(
        final_speed < invariants.braking.initial_speed * invariants.braking.max_final_speed_ratio,
        "service brakes should reduce authored {} m/s forward speed below {} retained ratio, final={final_speed}",
        invariants.braking.initial_speed,
        invariants.braking.max_final_speed_ratio
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhysicsInvariantRegistry {
    braking: BrakingInvariant,
    schema: String,
    static_load: StaticLoadInvariant,
    version: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StaticLoadInvariant {
    max_ride_height_span: f32,
    max_total_normal_load_weight_ratio: f32,
    min_total_normal_load_weight_ratio: f32,
    sample_window_steps: usize,
    settle_steps: usize,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrakingInvariant {
    fixed_delta: f32,
    initial_speed: f32,
    max_final_speed_ratio: f32,
    ticks: usize,
}

fn physics_invariant_registry() -> PhysicsInvariantRegistry {
    let registry: PhysicsInvariantRegistry = serde_json::from_str(include_str!(
        "../../../../packages/ir/src/physicsInvariantRegistry.json"
    ))
    .expect("shared physics invariant registry should deserialize");
    assert_eq!(registry.schema, "threenative.physics-invariant-registry");
    assert_eq!(registry.version, "0.1.0");
    registry
}

#[test]
fn vehicle_controller_teardown_should_clear_gear_assists_and_inputs_for_reused_identity() {
    let root = write_drivetrain_bundle("controller-disposal", "manual", "limited-slip", 0.1, true);
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    let mut first = load_bundle(&root).expect("first drivetrain bundle should load");
    assert!(set_physics_vehicle_inputs(
        runtime_id,
        "chassis",
        VehicleControlInput {
            brake: 0.0,
            clutch: 0.0,
            gear: Some(-1),
            handbrake: 0.0,
            steer: 0.0,
            throttle: 1.0,
        },
    ));
    for _ in 0..30 {
        step_bundle_physics_with_script_poses(&mut first, 1.0 / 120.0, &runtime);
    }
    let before = observe_physics_vehicle_controllers(runtime_id)[0].clone();
    assert!(before.inputs.throttle > 0.0);
    assert!(before.gear == -1 || before.shift_state == "shifting");

    dispose_native_physics_runtime(&runtime);
    let mut fresh = load_bundle(&root).expect("fresh drivetrain bundle should load");
    step_bundle_physics_with_script_poses(&mut fresh, 1.0 / 120.0, &runtime);
    let after = observe_physics_vehicle_controllers(runtime_id)[0].clone();
    assert_eq!(after.gear, 0);
    assert_eq!(after.inputs, VehicleControlInput::default());
    assert!(!after.abs_active && !after.tcs_active);

    dispose_native_physics_runtime(&runtime);
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn vehicle_controller_should_persist_manual_gear_and_apply_speed_curve_steering() {
    let manual_root = write_drivetrain_bundle(
        "controller-manual-persistence",
        "manual",
        "open",
        1.0,
        false,
    );
    let mut manual = load_bundle(&manual_root).expect("manual drivetrain bundle should load");
    let manual_runtime = BTreeSet::new();
    let manual_id = native_physics_runtime_id(&manual_runtime);
    let throttle = VehicleControlInput {
        brake: 0.0,
        clutch: 0.0,
        gear: None,
        handbrake: 0.0,
        steer: 0.0,
        throttle: 1.0,
    };
    assert!(set_physics_vehicle_inputs(
        manual_id,
        "chassis",
        VehicleControlInput {
            gear: Some(1),
            ..throttle
        },
    ));
    step_bundle_physics_with_script_poses(&mut manual, 1.0 / 120.0, &manual_runtime);
    let neutral_observation = &observe_physics_vehicle_controllers(manual_id)[0];
    assert_eq!(neutral_observation.gear, 0);
    assert_eq!(neutral_observation.engine_rpm, 5000.0);
    assert!(set_physics_vehicle_inputs(manual_id, "chassis", throttle));
    for _ in 1..180 {
        step_bundle_physics_with_script_poses(&mut manual, 1.0 / 120.0, &manual_runtime);
    }
    assert_eq!(observe_physics_vehicle_controllers(manual_id)[0].gear, 1);
    assert!(set_physics_vehicle_inputs(
        manual_id,
        "chassis",
        VehicleControlInput {
            gear: Some(2),
            ..throttle
        },
    ));
    step_bundle_physics_with_script_poses(&mut manual, 1.0 / 120.0, &manual_runtime);
    assert!(set_physics_vehicle_inputs(manual_id, "chassis", throttle));
    for _ in 1..180 {
        step_bundle_physics_with_script_poses(&mut manual, 1.0 / 120.0, &manual_runtime);
    }
    let manual_observation = &observe_physics_vehicle_controllers(manual_id)[0];
    assert_eq!(manual_observation.gear, 2);
    assert_eq!(manual_observation.inputs.gear, None);

    let steering_root =
        write_drivetrain_bundle("controller-steering", "manual", "open", 1.0, false);
    let straight_root =
        write_drivetrain_bundle("controller-steering-negative", "manual", "open", 1.0, false);
    let mut steering = load_bundle(&steering_root).expect("steering bundle should load");
    let mut straight = load_bundle(&straight_root).expect("straight bundle should load");
    let steering_runtime = BTreeSet::new();
    let straight_runtime = BTreeSet::new();
    let steering_id = native_physics_runtime_id(&steering_runtime);
    let straight_id = native_physics_runtime_id(&straight_runtime);
    for (runtime_id, steer) in [(steering_id, 0.5), (straight_id, 0.0)] {
        assert!(set_physics_vehicle_inputs(
            runtime_id,
            "chassis",
            VehicleControlInput {
                gear: Some(1),
                steer,
                ..throttle
            },
        ));
    }
    for tick in 0..90 {
        if tick == 1 {
            assert!(set_physics_vehicle_inputs(
                steering_id,
                "chassis",
                VehicleControlInput {
                    steer: 0.5,
                    ..throttle
                },
            ));
            assert!(set_physics_vehicle_inputs(straight_id, "chassis", throttle));
        }
        step_bundle_physics_with_script_poses(&mut steering, 1.0 / 120.0, &steering_runtime);
        step_bundle_physics_with_script_poses(&mut straight, 1.0 / 120.0, &straight_runtime);
    }
    let steered_pose = chassis_motion(&steering);
    let straight_pose = chassis_motion(&straight);
    assert!(steered_pose.0[0].abs() > straight_pose.0[0].abs() + 0.02);
    assert!(steered_pose.1[1].abs() > straight_pose.1[1].abs() + 0.005);
    assert!(
        steered_pose.0.iter().all(|value| value.is_finite())
            && steered_pose.0[0].hypot(steered_pose.0[2]) < 30.0,
        "controller steering must remain solver-owned and bounded"
    );

    for runtime in [&manual_runtime, &steering_runtime, &straight_runtime] {
        dispose_native_physics_runtime(runtime);
    }
    for root in [manual_root, steering_root, straight_root] {
        fs::remove_dir_all(root).expect("temporary bundle should be removed");
    }
}

fn vehicle_acceleration(
    name: &str,
    surface: &str,
    grip: f32,
    driven: &[bool; 4],
) -> (f32, Vec<String>) {
    let root = write_vehicle_bundle(name, surface, grip, driven);
    let mut bundle = load_bundle(&root).expect("vehicle bundle should load");
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    assert!(set_physics_vehicle_control_input(
        runtime_id,
        "chassis",
        WheelControlInput {
            brake: 0.0,
            drive: 1.0,
            steering: 0.0,
        },
    ));
    for _ in 0..180 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
    }
    let velocity = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.rigid_body.as_ref()?.velocity)
        .expect("chassis velocity");
    let surfaces = observe_physics_vehicles(runtime_id)[0]
        .wheels
        .iter()
        .filter_map(|wheel| wheel.surface.clone())
        .collect();
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
    (-velocity[2], surfaces)
}

fn recorded_automatic_launch(name: &str) -> (Vec<i32>, f32, f32) {
    let root = write_drivetrain_bundle(name, "automatic", "open", 1.0, false);
    let mut bundle = load_bundle(&root).expect("automatic drivetrain bundle should load");
    let runtime = BTreeSet::new();
    let runtime_id = native_physics_runtime_id(&runtime);
    assert!(set_physics_vehicle_inputs(
        runtime_id,
        "chassis",
        VehicleControlInput {
            brake: 0.0,
            clutch: 0.0,
            gear: None,
            handbrake: 0.0,
            steer: 0.0,
            throttle: 1.0,
        },
    ));
    let mut gears = Vec::new();
    for _ in 0..360 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 120.0, &runtime);
        let observation = &observe_physics_vehicle_controllers(runtime_id)[0];
        if gears.last() != Some(&observation.gear) {
            gears.push(observation.gear);
        }
    }
    let observation = observe_physics_vehicle_controllers(runtime_id)[0].clone();
    dispose_native_physics_runtime(&runtime);
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
    (gears, observation.speed, observation.engine_rpm)
}

fn write_drivetrain_bundle(
    name: &str,
    shift_policy: &str,
    differential: &str,
    grip: f32,
    assists: bool,
) -> PathBuf {
    let root = write_vehicle_bundle(name, "asphalt", grip, &[true, true, true, true]);
    let path = root.join("world.ir.json");
    let mut world: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).expect("vehicle world should be readable"))
            .expect("vehicle world should be JSON");
    let chassis = world["entities"]
        .as_array_mut()
        .and_then(|entities| entities.iter_mut().find(|entity| entity["id"] == "chassis"))
        .expect("chassis should exist");
    chassis["components"]["VehicleController"] = serde_json::json!({
        "assists": assists.then(|| serde_json::json!({
            "abs": { "enabled": true, "response": 0.05, "slipThreshold": 0.05 },
            "tcs": { "enabled": true, "response": 0.05, "slipThreshold": 0.05 }
        })),
        "brakes": { "frontBias": 0.6, "handbrakeWheelIds": ["rear-right", "rear-left"] },
        "differential": { "kind": differential, "limitedSlipRatio": 3 },
        "engine": {
            "engineBraking": 20,
            "idleRpm": 800,
            "redlineRpm": 5000,
            "torqueCurve": [
                { "rpm": 800, "torque": 180 },
                { "rpm": 2500, "torque": 260 },
                { "rpm": 5000, "torque": 180 }
            ]
        },
        "steering": { "speedCurve": [{ "speed": 0, "scale": 1 }, { "speed": 30, "scale": 0.4 }] },
        "transmission": {
            "clutchResponse": 0.05,
            "downshiftRpm": 1100,
            "finalDrive": 3.2,
            "forwardRatios": [3.2, 2.0, 1.3],
            "reverseRatio": 2.8,
            "shiftPolicy": shift_policy,
            "upshiftRpm": 1800
        }
    });
    fs::write(
        path,
        serde_json::to_vec_pretty(&world).expect("drivetrain world should serialize"),
    )
    .expect("drivetrain world should be written");
    root
}

fn step_vehicle(
    bundle: &mut threenative_loader::LoadedBundle,
    runtime: &BTreeSet<String>,
    control: WheelControlInput,
    steps: usize,
) {
    assert!(set_physics_vehicle_control_input(
        native_physics_runtime_id(runtime),
        "chassis",
        control,
    ));
    for _ in 0..steps {
        step_bundle_physics_with_script_poses(bundle, 1.0 / 120.0, runtime);
    }
}

fn chassis_motion(bundle: &threenative_loader::LoadedBundle) -> ([f32; 3], [f32; 4], [f32; 3]) {
    let chassis = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "chassis")
        .expect("chassis should exist");
    let transform = chassis
        .components
        .transform
        .as_ref()
        .expect("chassis transform should exist");
    let body = chassis
        .components
        .rigid_body
        .as_ref()
        .expect("chassis rigid body should exist");
    (
        transform.position.expect("chassis position should exist"),
        transform.rotation.expect("chassis rotation should exist"),
        body.velocity.expect("chassis velocity should exist"),
    )
}

fn set_all_wheel_flag(bundle: &mut threenative_loader::LoadedBundle, flag: &str, value: bool) {
    let wheels = &mut bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "chassis")
        .and_then(|entity| entity.components.wheel_assembly.as_mut())
        .expect("chassis wheel assembly should exist")
        .wheels;
    for wheel in wheels {
        match flag {
            "braked" => wheel.braked = value,
            "steering" => wheel.steering = value,
            _ => panic!("unsupported wheel flag {flag}"),
        }
    }
}

fn write_vehicle_bundle(name: &str, surface: &str, grip: f32, driven: &[bool; 4]) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-vehicle-{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary bundle directory should be created");
    write(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle", "version": "0.1.0", "name": "vehicle",
  "requiredCapabilities": {}, "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    let wheels = [
        ("rear-right", [0.65, -0.2, 1.0], driven[0]),
        ("front-left", [-0.65, -0.2, -1.0], driven[1]),
        ("rear-left", [-0.65, -0.2, 1.0], driven[2]),
        ("front-right", [0.65, -0.2, -1.0], driven[3]),
    ]
    .into_iter()
    .map(|(id, attachment, driven)| {
        serde_json::json!({
            "attachment": attachment, "braked": true, "driven": driven, "id": id,
            "radius": 0.3, "steering": id.starts_with("front"),
            "suspension": { "damperRate": 500, "springRate": 20000, "travel": 0.5 },
            "tire": "touring-tire", "visual": format!("wheel-visual-{id}"), "width": 0.2
        })
    })
    .collect::<Vec<_>>();
    let world = serde_json::json!({
        "schema": "threenative.world", "version": "0.1.0",
        "entities": [
            {
                "id": format!("ground-{surface}"),
                "components": {
                    "Collider": { "kind": "box", "size": [100, 0.1, 100] },
                    "PhysicsSurface": { "combineRule": "multiply", "grip": grip, "rollingResistance": 0.0 },
                    "Transform": { "position": [0, 0, 0] }
                }
            },
            {
                "id": "touring-tire",
                "components": {
                    "TireModel": {
                        "lateralSlipCurve": [{ "slip": 0, "grip": 1 }, { "slip": 1, "grip": 1 }],
                        "loadSensitivity": 0,
                        "longitudinalSlipCurve": [{ "slip": 0, "grip": 1 }, { "slip": 1, "grip": 1 }],
                        "rollingResistance": 0
                    }
                }
            },
            {
                "id": "chassis",
                "components": {
                    "Collider": { "kind": "box", "size": [1.6, 0.4, 3] },
                    "RigidBody": { "enabledRotations": [false, true, false], "gravityScale": 1, "kind": "dynamic", "mass": 100, "velocity": [0, 0, 0] },
                    "Transform": { "position": [0, 1.02, 0] },
                    "WheelAssembly": {
                        "maxSteeringAngle": 0.6, "maxSuspensionForce": 10000, "maxTireForce": 5000,
                        "wheels": wheels
                    }
                }
            },
            { "id": "wheel-visual-rear-right", "components": { "Transform": { "position": [9, 9, 9] } } },
            { "id": "wheel-visual-front-left", "components": { "Transform": { "position": [9, 9, 9] } } },
            { "id": "wheel-visual-rear-left", "components": { "Transform": { "position": [9, 9, 9] } } },
            { "id": "wheel-visual-front-right", "components": { "Transform": { "position": [9, 9, 9] } } }
        ]
    });
    fs::write(
        root.join("world.ir.json"),
        serde_json::to_vec_pretty(&world).expect("world should serialize"),
    )
    .expect("world should be written");
    write(
        &root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    root
}

fn write(root: &Path, path: &str, contents: &str) {
    fs::write(root.join(path), contents).expect("fixture file should be written");
}
