use std::{
    collections::BTreeSet,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::physics::{
    detect_physics_event_trace, detect_physics_events, step_bundle_physics_with_script_poses,
    trace_physics_joints, trace_rigid_body_primitives,
};

#[test]
fn physics_should_detect_collision_fixture() {
    let root = write_physics_bundle();
    let bundle = load_bundle(&root).expect("physics bundle should load");

    let events = detect_physics_events(&bundle);

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event, "CollisionEvent");
    assert_eq!(events[0].a, "enemy");
    assert_eq!(events[0].b, "player");
    assert_eq!(events[0].phase, "enter");

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_emit_fixed_trace_phases() {
    let root = write_physics_trace_bundle();
    let bundle = load_bundle(&root).expect("physics bundle should load");

    let events = detect_physics_event_trace(&bundle, 3, 1.0);

    assert_eq!(events.len(), 3);
    assert_eq!(events[0].event, "TriggerEvent");
    assert_eq!(events[0].a, "pickup");
    assert_eq!(events[0].b, "player");
    assert_eq!(events[0].phase, "enter");
    assert_eq!(events[1].phase, "stay");
    assert_eq!(events[2].phase, "exit");

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_skip_script_posed_kinematic_velocity_once() {
    let root = write_physics_trace_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let mut script_posed_entities = BTreeSet::new();
    script_posed_entities.insert("player".to_owned());

    step_bundle_physics_with_script_poses(&mut bundle, 1.0, &script_posed_entities);

    let player = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "player")
        .expect("player should exist");
    assert_eq!(
        player
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position),
        Some([-0.5, 0.0, 0.0])
    );
    assert_eq!(
        player
            .components
            .rigid_body
            .as_ref()
            .and_then(|body| body.velocity),
        Some([0.75, 0.0, 0.0])
    );

    step_bundle_physics_with_script_poses(&mut bundle, 1.0, &BTreeSet::new());

    let player = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "player")
        .expect("player should exist");
    let position = player
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .expect("player transform should have a position");
    assert!((position[0] - 0.25).abs() < 0.00001);
    assert_eq!(position[1], 0.0);
    assert_eq!(position[2], 0.0);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_preserve_rotation_and_constrained_angular_velocity() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let body = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_mut())
        .expect("box rigid body should exist");
    body.gravity_scale = Some(0.0);
    body.angular_velocity = Some([1.0, 2.0, 3.0]);
    body.enabled_rotations = Some([false, true, false]);

    step_bundle_physics_with_script_poses(&mut bundle, 0.1, &BTreeSet::new());

    let box_entity = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .expect("box should exist");
    let rotation = box_entity
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.rotation)
        .expect("physics should write rotation back");
    let angular_velocity = box_entity
        .components
        .rigid_body
        .as_ref()
        .and_then(|body| body.angular_velocity)
        .expect("physics should write angular velocity back");
    assert!(rotation[1].abs() > 0.01);
    assert!(rotation[0].abs() < 0.0001);
    assert!(rotation[2].abs() < 0.0001);
    assert!(angular_velocity[1].abs() > 1.0);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_treat_sensor_metadata_as_nonblocking_trigger() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let collider = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "floor")
        .and_then(|entity| entity.components.collider.as_mut())
        .expect("floor collider should exist");
    collider.sensor = Some(serde_json::json!({ "kind": "overlap" }));

    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_mut())
        .expect("box transform should exist")
        .position = Some([0.0, 0.0, 0.0]);
    let events = detect_physics_events(&bundle);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event, "TriggerEvent");
    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_mut())
        .expect("box transform should exist")
        .position = Some([0.0, 2.0, 0.0]);
    step_bundle_physics_with_script_poses(&mut bundle, 1.0, &BTreeSet::new());

    let box_y = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_ref())
        .and_then(|transform| transform.position)
        .expect("box position should exist")[1];
    assert!(
        box_y < 0.0,
        "sensor-only floor must not block the falling body"
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_apply_portable_contact_filters() {
    let root = write_filtered_physics_bundle();
    let bundle = load_bundle(&root).expect("physics bundle should load");

    let events = detect_physics_events(&bundle);

    assert!(events.is_empty());

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_emit_deterministic_contact_ordering() {
    let root = write_unordered_contact_bundle();
    let bundle = load_bundle(&root).expect("physics bundle should load");

    let events = detect_physics_events(&bundle);

    assert_eq!(events.len(), 4);
    assert_eq!(events[0].event, "CollisionEvent");
    assert_eq!(events[0].a, "alpha");
    assert_eq!(events[0].b, "middle");
    assert_eq!(events[1].event, "CollisionEvent");
    assert_eq!(events[1].a, "alpha");
    assert_eq!(events[1].b, "zeta");
    assert_eq!(events[2].event, "CollisionEvent");
    assert_eq!(events[2].a, "middle");
    assert_eq!(events[2].b, "zeta");
    assert_eq!(events[3].event, "TriggerEvent");
    assert_eq!(events[3].a, "middle");
    assert_eq!(events[3].b, "sensor");
    assert!(events.iter().all(|event| event.phase == "enter"));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_trace_dynamic_box_falling_onto_static_floor() {
    let root = write_falling_box_bundle();
    let bundle = load_bundle(&root).expect("physics bundle should load");

    let observations = trace_rigid_body_primitives(&bundle, 4, 0.25);

    assert_eq!(observations.len(), 4);
    assert_eq!(observations[0].contact, None);
    assert_eq!(observations[0].position, [0.0, 1.386875, 0.0]);
    assert_eq!(observations[0].velocity, [0.0, -2.4525, 0.0]);
    assert_eq!(observations[1].contact.as_deref(), Some("floor"));
    assert_eq!(observations[1].position, [0.0, 0.55, 0.0]);
    assert_eq!(observations[1].velocity, [0.0, 0.0, 0.0]);
    assert_eq!(observations[2].contact.as_deref(), Some("floor"));
    assert_eq!(observations[2].position, [0.0, 0.55, 0.0]);
    assert_eq!(observations[2].velocity, [0.0, 0.0, 0.0]);
    assert_eq!(observations[2].gravity_scale, 1.0);
    assert_eq!(observations[2].damping, 0.0);
    assert_eq!(observations[2].friction, 0.5);
    assert_eq!(observations[2].restitution, 0.0);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_trace_dynamic_mesh_ccd_against_track_collider() {
    let root = write_mesh_ccd_bundle();
    let bundle = load_bundle(&root).expect("physics mesh ccd bundle should load");

    let observations = trace_rigid_body_primitives(&bundle, 1, 0.25);

    assert_eq!(observations.len(), 2);
    let car = observations
        .iter()
        .find(|observation| observation.entity == "car")
        .expect("car observation should exist");
    assert_eq!(car.ccd, Some(true));
    assert_eq!(car.contact.as_deref(), Some("track"));
    assert_eq!(car.position, [0.0, 0.35, 0.0]);
    assert_eq!(car.velocity, [0.0, 0.0, 0.0]);

    let joints = trace_physics_joints(&bundle);
    assert_eq!(joints.len(), 1);
    assert_eq!(joints[0].entity, "wheel.fl");
    assert_eq!(joints[0].connected_entity, "car");
    assert_eq!(joints[0].kind, "suspension");
    assert_eq!(joints[0].axis, Some([0.0, 1.0, 0.0]));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn write_physics_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-{}",
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
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics",
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
      "id": "enemy",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0.5, 0, 0] }
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

fn write_falling_box_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-falling-box-{}",
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
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics-falling-box",
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
      "id": "floor",
      "components": {
        "Collider": { "friction": 0.5, "kind": "box", "restitution": 0, "size": [4, 0.1, 4] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "box",
      "components": {
        "Collider": { "friction": 0.5, "kind": "box", "restitution": 0, "size": [1, 1, 1] },
        "RigidBody": { "gravityScale": 1, "kind": "dynamic", "velocity": [0, 0, 0] },
        "Transform": { "position": [0, 2, 0] }
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

fn write_filtered_physics_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-filtered-{}",
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
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics-filtered",
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
      "id": "pickup",
      "components": {
        "Collider": { "kind": "sphere", "layer": "pickup", "mask": ["enemy"], "radius": 0.5, "trigger": true },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "Collider": { "kind": "box", "layer": "player", "mask": ["pickup"], "size": [1, 1, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0.25, 0, 0] }
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

fn write_unordered_contact_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-ordering-{}",
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
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics-ordering",
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
      "id": "zeta",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "sensor",
      "components": {
        "Collider": { "kind": "sphere", "radius": 0.5, "trigger": true },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [1.05, 0, 0] }
      }
    },
    {
      "id": "middle",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0.1, 0, 0] }
      }
    },
    {
      "id": "alpha",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [-0.1, 0, 0] }
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

fn write_physics_trace_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-trace-{}",
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
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics-trace",
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
      "id": "pickup",
      "components": {
        "Collider": { "kind": "sphere", "radius": 0.5, "trigger": true },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "kinematic", "velocity": [0.75, 0, 0] },
        "Transform": { "position": [-0.5, 0, 0] }
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

fn write_mesh_ccd_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-mesh-ccd-{}",
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
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics-mesh-ccd",
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
      "id": "track",
      "components": {
        "Collider": { "friction": 0.4, "kind": "mesh", "layer": "track", "mask": ["car"], "mesh": { "bounds": { "size": [8, 0.2, 16] }, "source": "mesh.track", "triangleCount": 256 }, "restitution": 0 },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "car",
      "components": {
        "Collider": { "friction": 0.4, "kind": "mesh", "layer": "car", "mask": ["track"], "mesh": { "bounds": { "size": [2, 0.5, 4] }, "source": "mesh.car", "triangleCount": 128 }, "restitution": 0 },
        "RigidBody": { "ccd": { "enabled": true, "maxSubsteps": 4, "mode": "swept-aabb" }, "gravityScale": 0, "kind": "dynamic", "velocity": [0, -20, 0] },
        "Transform": { "position": [0, 3, 0] }
      }
    },
    {
      "id": "wheel.fl",
      "components": {
        "Collider": { "kind": "sphere", "layer": "wheel", "mask": ["none"], "radius": 0.35 },
        "PhysicsJoint": { "axis": [0, 1, 0], "connectedEntity": "car", "damping": 0.6, "kind": "suspension", "stiffness": 12, "travel": 0.4 },
        "RigidBody": { "kind": "dynamic" },
        "Transform": { "position": [-0.8, 1.2, 1.2] }
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

fn write(root: &PathBuf, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
