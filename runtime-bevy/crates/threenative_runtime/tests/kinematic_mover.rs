use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::{
    kinematic_mover::step_bundle_kinematic_movers,
    physics::step_bundle_physics_with_script_poses,
    systems_host::{
        NativeGameLoopRunOptions, NativeGameLoopState, run_native_systems_frame_with_input,
    },
};

#[test]
fn kinematic_mover_should_write_sine_position_and_derivative_velocity() {
    let root = write_kinematic_mover_bundle("sine-position");
    let mut bundle = load_bundle(&root).expect("kinematic mover bundle should load");
    let mut origins = BTreeMap::new();

    let observations = step_bundle_kinematic_movers(&mut bundle, 0.5, &mut origins);

    assert_eq!(observations.len(), 1);
    assert_eq!(round_vec(observations[0].position), [2.682942, 0.0, 2.0]);
    assert_eq!(round_vec(observations[0].velocity), [2.161209, 0.0, 0.0]);
    let hazard = &bundle.world.entities[0];
    assert_eq!(
        round_vec(
            hazard
                .components
                .transform
                .as_ref()
                .and_then(|transform| transform.position)
                .expect("hazard should have transform position")
        ),
        [2.682942, 0.0, 2.0]
    );
    assert_eq!(
        round_vec(
            hazard
                .components
                .rigid_body
                .as_ref()
                .and_then(|body| body.velocity)
                .expect("hazard should have rigid body velocity")
        ),
        [2.161209, 0.0, 0.0]
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn kinematic_mover_should_keep_initial_authored_origin_instead_of_drifting() {
    let root = write_kinematic_mover_bundle("stable-origin");
    let mut bundle = load_bundle(&root).expect("kinematic mover bundle should load");
    let mut origins = BTreeMap::new();

    step_bundle_kinematic_movers(&mut bundle, 0.5, &mut origins);
    step_bundle_kinematic_movers(&mut bundle, 1.0, &mut origins);

    let hazard = &bundle.world.entities[0];
    assert_eq!(
        round_vec(
            hazard
                .components
                .transform
                .as_ref()
                .and_then(|transform| transform.position)
                .expect("hazard should have transform position")
        ),
        [2.818595, 0.0, 2.0]
    );
    assert_eq!(
        round_vec(
            hazard
                .components
                .rigid_body
                .as_ref()
                .and_then(|body| body.velocity)
                .expect("hazard should have rigid body velocity")
        ),
        [-1.664587, 0.0, 0.0]
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn kinematic_mover_should_run_before_native_physics_without_double_integration() {
    let root = write_kinematic_mover_bundle("loop-physics-skip");
    let mut bundle = load_bundle(&root).expect("kinematic mover bundle should load");
    let mut state = NativeGameLoopState::default();
    let mut saw_mover_pose = false;

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        NativeGameLoopRunOptions {
            delta: 0.5,
            fixed_delta: 0.5,
            input: None,
            paused: false,
        },
        |bundle, fixed_delta, script_posed_entities| {
            saw_mover_pose = script_posed_entities.contains("hazard");
            step_bundle_physics_with_script_poses(bundle, fixed_delta, script_posed_entities);
        },
    )
    .expect("native loop should run");

    assert!(saw_mover_pose);
    let hazard = &bundle.world.entities[0];
    assert_eq!(
        round_vec(
            hazard
                .components
                .transform
                .as_ref()
                .and_then(|transform| transform.position)
                .expect("hazard should have transform position")
        ),
        [2.682942, 0.0, 2.0]
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

fn write_kinematic_mover_bundle(name: &str) -> PathBuf {
    let root = temp_bundle_dir(name);
    write(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "kinematic-mover",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "hazard",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "KinematicMover": { "direction": [1, 0, 0], "mode": "sine", "radius": 2, "speed": 2 },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [1, 0, 2] }
      }
    }
  ]
}"#,
    );
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

fn temp_bundle_dir(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-kinematic-mover-{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary bundle directory should be created");
    root
}

fn write(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}

fn round_vec(value: [f32; 3]) -> [f32; 3] {
    value.map(|item| {
        let rounded = (item * 1_000_000.0).round() / 1_000_000.0;
        if rounded == -0.0 { 0.0 } else { rounded }
    })
}
