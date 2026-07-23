use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::physics::{
    detect_physics_event_trace, detect_physics_events, inspect_cached_physics_body_sleeping,
    inspect_cached_physics_ccd_substeps, inspect_cached_physics_joint,
    inspect_cached_physics_raycast, inspect_cached_physics_world_generation,
    inspect_physics_body_mass, inspect_physics_body_mass_properties,
    step_bundle_physics_with_script_poses, trace_physics_joints, trace_rigid_body_primitives,
};

#[test]
fn compound_authored_mass_should_use_equal_child_mass_for_com_and_inertia() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let body_entity = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .expect("box should exist");
    body_entity.components.collider = None;
    body_entity.components.compound_collider = Some(
        serde_json::from_value(serde_json::json!({
            "children": [
                { "id": "small", "localPose": { "position": [-2, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.25 } },
                { "id": "large", "localPose": { "position": [2, 0, 0] }, "shape": { "kind": "sphere", "radius": 1.0 } }
            ]
        }))
        .expect("compound collider should deserialize"),
    );
    let rigid_body = body_entity
        .components
        .rigid_body
        .as_mut()
        .expect("body should exist");
    rigid_body.mass = None;
    rigid_body.inverse_mass = Some(0.125);

    let properties = inspect_physics_body_mass_properties(&bundle, "box")
        .expect("compound mass properties should exist");

    assert!((properties.mass - 8.0).abs() < 0.001);
    assert!(
        properties
            .center_of_mass
            .iter()
            .all(|value| value.abs() < 0.001)
    );
    assert!((properties.principal_inertia[0] - 1.7).abs() < 0.001);
    assert!((properties.principal_inertia[1] - 33.7).abs() < 0.001);
    assert!((properties.principal_inertia[2] - 33.7).abs() < 0.001);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn compound_children_should_honor_their_own_symmetric_collision_and_solver_filters() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let floor = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "floor")
        .expect("floor should exist");
    floor.components.collider = None;
    floor.components.compound_collider = Some(
        serde_json::from_value(serde_json::json!({
            "children": [
                {
                    "filter": { "layer": "world", "mask": ["player"] },
                    "id": "accepts-player",
                    "localPose": { "position": [-1, 0, 0] },
                    "shape": { "kind": "box", "size": [1.5, 0.1, 1.5] }
                },
                {
                    "filter": { "layer": "world", "mask": ["enemy"] },
                    "id": "rejects-player",
                    "localPose": { "position": [1, 0, 0] },
                    "shape": { "kind": "box", "size": [1.5, 0.1, 1.5] }
                }
            ]
        }))
        .expect("compound collider should deserialize"),
    );
    let box_index = bundle
        .world
        .entities
        .iter()
        .position(|entity| entity.id == "box")
        .expect("box should exist");
    let mut rejected_box = bundle.world.entities[box_index].clone();
    rejected_box.id = "rejected-box".to_owned();
    for (entity, x) in [
        (&mut bundle.world.entities[box_index], -1.0),
        (&mut rejected_box, 1.0),
    ] {
        let collider = entity.components.collider.as_mut().expect("box collider");
        collider.layer = Some("player".to_owned());
        collider.mask = Some(vec!["world".to_owned()]);
        entity
            .components
            .transform
            .as_mut()
            .expect("box transform")
            .position = Some([x, 2.0, 0.0]);
    }
    bundle.world.entities.push(rejected_box);
    let runtime_id = BTreeSet::new();

    for _ in 0..120 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);
    }

    let accepted_y = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_ref()?.position)
        .expect("accepted box position")[1];
    let rejected_y = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "rejected-box")
        .and_then(|entity| entity.components.transform.as_ref()?.position)
        .expect("rejected box position")[1];
    assert!(accepted_y > 0.4, "matching child should solve contact");
    assert!(rejected_y < -5.0, "child mask must reject the player body");

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn retained_compound_contacts_should_preserve_child_identity_and_stable_ordering() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let compound = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .expect("box should exist");
    compound.id = "compound".to_owned();
    compound.components.collider = None;
    compound.components.compound_collider = Some(
        serde_json::from_value(serde_json::json!({
            "children": [
                { "id": "zeta", "localPose": { "position": [1, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.4 } },
                { "id": "alpha", "localPose": { "position": [-1, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.4 } }
            ]
        }))
        .expect("compound collider should deserialize"),
    );
    let compound_body = compound
        .components
        .rigid_body
        .as_mut()
        .expect("body should exist");
    compound_body.kind = "static".to_owned();
    compound_body.gravity_scale = Some(0.0);
    compound
        .components
        .transform
        .as_mut()
        .expect("compound transform")
        .position = Some([0.0, 0.0, 0.0]);

    let probe = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "floor")
        .expect("floor should exist");
    probe.id = "probe".to_owned();
    let probe_collider = probe.components.collider.as_mut().expect("probe collider");
    probe_collider.kind = "sphere".to_owned();
    probe_collider.radius = Some(0.8);
    probe_collider.size = None;
    probe.components.rigid_body = Some(
        serde_json::from_value(serde_json::json!({
            "gravityScale": 0,
            "kind": "dynamic",
            "velocity": [0, 0, 0]
        }))
        .expect("probe body should deserialize"),
    );
    probe
        .components
        .transform
        .as_mut()
        .expect("probe transform")
        .position = Some([0.0, 0.0, 0.0]);
    let runtime_id = BTreeSet::new();

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);

    let enter = bundle
        .world
        .events
        .get("CollisionEvent")
        .expect("collision queue should exist");
    assert_eq!(
        enter,
        &serde_json::json!([
            { "a": "compound", "b": "probe", "childA": "alpha", "phase": "enter" },
            { "a": "compound", "b": "probe", "childA": "zeta", "phase": "enter" }
        ])
    );

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);
    let stay = bundle
        .world
        .events
        .get("CollisionEvent")
        .expect("collision queue should exist");
    assert_eq!(stay[0]["childA"], "alpha");
    assert_eq!(stay[1]["childA"], "zeta");
    assert!(
        stay.as_array()
            .expect("event array")
            .iter()
            .all(|event| { event["phase"] == "stay" && event.get("childB").is_none() })
    );

    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "probe")
        .and_then(|entity| entity.components.transform.as_mut())
        .expect("probe transform")
        .position = Some([0.0, 5.0, 0.0]);
    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);
    let exit = bundle
        .world
        .events
        .get("CollisionEvent")
        .expect("collision queue should exist");
    assert_eq!(exit[0]["childA"], "alpha");
    assert_eq!(exit[1]["childA"], "zeta");
    assert!(
        exit.as_array()
            .expect("event array")
            .iter()
            .all(|event| { event["phase"] == "exit" && event.get("childB").is_none() })
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn should_rotate_a_compound_body_when_impulse_is_applied_off_center_and_report_live_child_hit() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let body_entity = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .expect("box should exist");
    body_entity.components.collider = None;
    body_entity.components.compound_collider = Some(serde_json::from_value(serde_json::json!({
        "children": [
            { "id": "left", "localPose": { "position": [-0.75, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.25 } },
            { "id": "right", "localPose": { "position": [0.75, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.25 } }
        ]
    })).expect("compound collider should deserialize"));
    let rigid_body = body_entity
        .components
        .rigid_body
        .as_mut()
        .expect("body should exist");
    rigid_body.gravity_scale = Some(0.0);
    rigid_body.mass = Some(2.0);
    let runtime_id = BTreeSet::new();

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);

    assert!(
        inspect_cached_physics_raycast(&runtime_id, [-0.75, 2.0, -5.0], [0.0, 0.0, 1.0], 10.0)
            .is_some_and(|hit| hit.entity == "box"
                && hit.child.as_deref() == Some("left")
                && (hit.distance - 4.75).abs() < 0.001)
    );
    assert_eq!(
        inspect_cached_physics_raycast(&runtime_id, [0.0, 2.0, -5.0], [0.0, 0.0, 1.0], 10.0),
        None,
        "retained Rapier should not report the conservative compound bounds gap"
    );

    bundle.world.resources.insert("__threenativePhysicsAtPointCommands".to_owned(), serde_json::json!([{
        "entity": "box", "kind": "physics.applyImpulseAtPoint", "point": [0, 3, 0], "value": [0, 0, 4]
    }]));
    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);

    let rigid_body = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_ref())
        .expect("body should remain");
    assert!(rigid_body.velocity.expect("velocity")[2] > 1.9);
    assert!(rigid_body.angular_velocity.expect("angular velocity")[0].abs() > 1.0);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

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
fn physics_should_treat_collider_only_floor_as_static_without_mutating_public_components() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");

    for _ in 0..180 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &BTreeSet::new());
    }

    let floor = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "floor")
        .unwrap();
    let box_y = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_ref())
        .and_then(|transform| transform.position)
        .unwrap()[1];
    assert!(floor.components.rigid_body.is_none());
    assert!(
        box_y > 0.5 && box_y < 0.65,
        "box should rest on collider-only floor, got {box_y}"
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_map_mass_and_inverse_mass_to_exact_rapier_mass() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_mut())
        .unwrap()
        .mass = Some(10.0);
    assert!((inspect_physics_body_mass(&bundle, "box").unwrap() - 10.0).abs() < 0.000001);
    let body = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_mut())
        .unwrap();
    body.mass = None;
    body.inverse_mass = Some(1.0);
    assert!((inspect_physics_body_mass(&bundle, "box").unwrap() - 1.0).abs() < 0.000001);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_wake_a_sleeping_body_after_an_authored_velocity_change() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let runtime_id = BTreeSet::new();
    let body = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_mut())
        .expect("box body should exist");
    body.gravity_scale = Some(0.0);
    body.velocity = Some([0.0, 0.0, 0.0]);

    for _ in 0..180 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);
    }
    assert_eq!(
        inspect_cached_physics_body_sleeping(&runtime_id, "box"),
        Some(true)
    );

    let start_x = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| {
            entity.components.rigid_body.as_mut()?.velocity = Some([1.0, 0.0, 0.0]);
            entity
                .components
                .transform
                .as_ref()?
                .position
                .map(|position| position[0])
        })
        .expect("box should have a position");
    step_bundle_physics_with_script_poses(&mut bundle, 0.25, &runtime_id);
    let end_x = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_ref())
        .and_then(|transform| transform.position)
        .expect("box should have a position")[0];

    assert!(
        end_x > start_x + 0.2,
        "authored velocity should wake and move the body"
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_solve_hinge_slider_and_suspension_joints_in_rapier() {
    let hinge_root = write_falling_box_bundle();
    let slider_root = write_falling_box_bundle();
    let suspension_root = write_falling_box_bundle();
    let mut hinge = live_joint_bundle(&hinge_root, "hinge");
    let mut slider = live_joint_bundle(&slider_root, "slider");
    let mut suspension = live_joint_bundle(&suspension_root, "suspension");
    let hinge_runtime = BTreeSet::new();
    let slider_runtime = BTreeSet::new();
    let suspension_runtime = BTreeSet::new();

    for _ in 0..120 {
        step_bundle_physics_with_script_poses(&mut hinge, 1.0 / 60.0, &hinge_runtime);
        step_bundle_physics_with_script_poses(&mut slider, 1.0 / 60.0, &slider_runtime);
        step_bundle_physics_with_script_poses(&mut suspension, 1.0 / 60.0, &suspension_runtime);
    }

    let hinge_position = body_position(&hinge);
    let slider_position = body_position(&slider);
    let suspension_position = body_position(&suspension);
    assert!(
        (hinge_position
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt()
            - 1.0)
            .abs()
            < 0.05,
        "hinge anchor drifted to {hinge_position:?}"
    );
    assert!(
        slider_position[0] >= 0.9 && slider_position[0] <= 1.05,
        "slider limit resolved to {}",
        slider_position[0]
    );
    assert!(
        suspension_position[1].abs() <= 0.3,
        "suspension travel resolved to {}",
        suspension_position[1]
    );

    for root in [hinge_root, slider_root, suspension_root] {
        fs::remove_dir_all(root).expect("temporary bundle should be removed");
    }
}

#[test]
fn fixed_joint_should_hold_relative_pose_under_load() {
    let root = write_falling_box_bundle();
    let mut bundle = live_joint_bundle(&root, "fixed");
    let runtime = BTreeSet::new();

    for _ in 0..120 {
        queue_force_at_point(&mut bundle, [0.0, -20.0, 0.0]);
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime);
    }

    let position = body_position(&bundle);
    assert!(
        position
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt()
            < 0.3,
        "fixed joint drifted under gravity to {position:?}"
    );
    let joint = inspect_cached_physics_joint(&runtime, "box").expect("fixed joint observation");
    assert!(joint.active);
    assert!(
        joint.force.is_finite() && joint.force > 0.0,
        "fixed joint load was {joint:?}"
    );
    assert!(joint.torque.is_finite());

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn joint_should_emit_one_break_event_then_remove_at_the_next_safe_tick() {
    let root = write_falling_box_bundle();
    let mut bundle = live_joint_bundle(&root, "fixed");
    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.physics_joint.as_mut())
        .expect("fixed joint")
        .break_force = Some(0.01);
    let runtime = BTreeSet::new();

    queue_force_at_point(&mut bundle, [0.0, -20.0, 0.0]);
    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime);
    let break_events = bundle
        .world
        .events
        .get("JointBreakEvent")
        .and_then(serde_json::Value::as_array)
        .expect("joint break queue");
    assert_eq!(
        break_events.len(),
        1,
        "joint observation was {:?}",
        inspect_cached_physics_joint(&runtime, "box")
    );
    assert_eq!(break_events[0]["entity"], "box");
    assert_eq!(break_events[0]["phase"], "break");
    assert!(
        inspect_cached_physics_joint(&runtime, "box")
            .expect("broken joint observation")
            .active
    );

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime);
    assert!(
        bundle.world.events["JointBreakEvent"]
            .as_array()
            .expect("joint break queue")
            .is_empty()
    );
    assert!(
        !inspect_cached_physics_joint(&runtime, "box")
            .expect("broken joint state")
            .active
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn joint_patch_should_preserve_unrelated_body_handles() {
    let root = write_falling_box_bundle();
    let mut bundle = live_joint_bundle(&root, "hinge");
    let runtime = BTreeSet::new();

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime);
    let generation = inspect_cached_physics_world_generation(&runtime).expect("retained world");
    let initial_lifecycle = inspect_cached_physics_joint(&runtime, "box")
        .expect("hinge observation")
        .lifecycle;
    let joint = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.physics_joint.as_mut())
        .expect("hinge joint");
    joint.limits = Some(
        serde_json::from_value(serde_json::json!({ "min": -0.25, "max": 0.25 }))
            .expect("joint limits"),
    );

    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime);

    assert_eq!(
        inspect_cached_physics_world_generation(&runtime),
        Some(generation)
    );
    let patched = inspect_cached_physics_joint(&runtime, "box").expect("patched hinge");
    assert!(patched.active);
    assert_eq!(patched.lifecycle, initial_lifecycle + 1);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn joint_motors_should_respect_authored_force_and_torque_caps() {
    let hinge_root = write_falling_box_bundle();
    let slider_root = write_falling_box_bundle();
    let mut hinge = live_joint_bundle(&hinge_root, "hinge");
    let mut slider = live_joint_bundle(&slider_root, "slider");
    let hinge_runtime = BTreeSet::new();
    let slider_runtime = BTreeSet::new();
    let hinge_entity = hinge
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .expect("hinge body");
    hinge_entity
        .components
        .rigid_body
        .as_mut()
        .expect("hinge rigid body")
        .gravity_scale = Some(0.0);
    hinge_entity
        .components
        .physics_joint
        .as_mut()
        .expect("hinge joint")
        .motor = Some(
        serde_json::from_value(serde_json::json!({
            "damping": 100,
            "maxTorque": 2,
            "mode": "velocity",
            "target": 100
        }))
        .expect("hinge motor"),
    );
    slider
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.physics_joint.as_mut())
        .expect("slider joint")
        .motor = Some(
        serde_json::from_value(serde_json::json!({
            "damping": 10,
            "maxForce": 3,
            "mode": "position",
            "stiffness": 1000,
            "target": 0.75
        }))
        .expect("slider motor"),
    );

    step_bundle_physics_with_script_poses(&mut hinge, 1.0 / 120.0, &hinge_runtime);
    step_bundle_physics_with_script_poses(&mut slider, 1.0 / 120.0, &slider_runtime);

    let hinge_load = inspect_cached_physics_joint(&hinge_runtime, "box").expect("hinge load");
    let slider_load = inspect_cached_physics_joint(&slider_runtime, "box").expect("slider load");
    assert!(
        hinge_load.torque > 0.0 && hinge_load.torque <= 2.001,
        "{hinge_load:?}"
    );
    assert!(
        slider_load.force > 0.0 && slider_load.force <= 3.001,
        "{slider_load:?}"
    );

    for root in [hinge_root, slider_root] {
        fs::remove_dir_all(root).expect("temporary bundle should be removed");
    }
}

#[test]
fn physics_should_apply_configured_gravity_and_ccd_substeps_and_honor_disabled_sleep() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    bundle.runtime_config = Some(
        serde_json::from_value(serde_json::json!({
            "schema": "threenative.runtime-config",
            "version": "0.1.0",
            "physics": { "gravity": [1, 0, 0] },
            "time": { "fixedDelta": 0.016666667, "paused": false },
            "window": { "height": 720, "width": 1280 }
        }))
        .expect("runtime config should deserialize"),
    );
    let body = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_mut())
        .expect("box body should exist");
    body.ccd = Some(
        serde_json::from_value(serde_json::json!({
            "enabled": true,
            "maxSubsteps": 7,
            "mode": "linear"
        }))
        .expect("ccd should deserialize"),
    );
    body.gravity_scale = Some(1.0);
    body.sleep_threshold = Some(0.0);
    body.velocity = Some([0.0, 0.0, 0.0]);
    let runtime_id = BTreeSet::new();

    for _ in 0..180 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);
    }

    assert!(body_position(&bundle)[0] > 1.0);
    assert_eq!(inspect_cached_physics_ccd_substeps(&runtime_id), Some(7));
    assert_eq!(
        inspect_cached_physics_body_sleeping(&runtime_id, "box"),
        Some(false)
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn physics_should_derive_contact_velocity_from_script_posed_kinematic_motion() {
    let root = write_falling_box_bundle();
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let platform = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "floor")
        .expect("platform should exist");
    platform.components.rigid_body = Some(
        serde_json::from_value(serde_json::json!({ "kind": "kinematic" }))
            .expect("kinematic body should deserialize"),
    );
    platform
        .components
        .collider
        .as_mut()
        .expect("platform collider should exist")
        .friction = Some(1.0);
    let box_entity = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .expect("box should exist");
    box_entity
        .components
        .collider
        .as_mut()
        .expect("box collider should exist")
        .friction = Some(1.0);
    box_entity
        .components
        .transform
        .as_mut()
        .expect("box transform should exist")
        .position = Some([0.0, 0.55, 0.0]);
    let mut runtime_id = BTreeSet::new();
    for _ in 0..60 {
        step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);
    }

    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "floor")
        .and_then(|entity| entity.components.transform.as_mut())
        .expect("platform transform should exist")
        .position = Some([0.1, 0.0, 0.0]);
    runtime_id.insert("floor".to_owned());
    step_bundle_physics_with_script_poses(&mut bundle, 1.0 / 60.0, &runtime_id);

    assert!(body_position(&bundle)[0] > 0.001);
    assert_eq!(
        bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "floor")
            .and_then(|entity| entity.components.transform.as_ref())
            .and_then(|transform| transform.position),
        Some([0.1, 0.0, 0.0])
    );
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

fn live_joint_bundle(root: &Path, kind: &str) -> threenative_loader::LoadedBundle {
    let mut bundle = load_bundle(root).expect("joint bundle should load");
    let anchor = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "floor")
        .expect("anchor should exist");
    anchor.id = "anchor".to_owned();
    anchor.components.rigid_body = Some(
        serde_json::from_value(serde_json::json!({ "kind": "static" }))
            .expect("static rigid body should deserialize"),
    );
    let anchor_collider = anchor
        .components
        .collider
        .as_mut()
        .expect("anchor collider should exist");
    anchor_collider.kind = "sphere".to_owned();
    anchor_collider.radius = Some(0.1);
    anchor_collider.trigger = Some(true);

    let body = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "box")
        .expect("joint body should exist");
    let collider = body
        .components
        .collider
        .as_mut()
        .expect("body collider should exist");
    collider.kind = "sphere".to_owned();
    collider.radius = Some(0.1);
    let rigid_body = body
        .components
        .rigid_body
        .as_mut()
        .expect("body rigid body should exist");
    rigid_body.gravity_scale = Some(if kind == "hinge" { 1.0 } else { 0.0 });
    rigid_body.velocity = Some(match kind {
        "slider" => [10.0, 0.0, 0.0],
        "suspension" => [0.0, 5.0, 0.0],
        _ => [0.0, 0.0, 0.0],
    });
    body.components.physics_joint = Some(
        serde_json::from_value(match kind {
            "fixed" => serde_json::json!({
                "anchor": [0, 0, 0],
                "breakForce": 1000,
                "connectedEntity": "anchor",
                "kind": "fixed"
            }),
            "hinge" => serde_json::json!({
                "anchor": [-1, 0, 0],
                "axis": [0, 0, 1],
                "connectedEntity": "anchor",
                "kind": "hinge"
            }),
            "slider" => serde_json::json!({
                "anchor": [0, 0, 0],
                "axis": [1, 0, 0],
                "connectedEntity": "anchor",
                "kind": "slider",
                "limits": { "max": 1, "min": -1 }
            }),
            _ => serde_json::json!({
                "anchor": [0, 0, 0],
                "axis": [0, 1, 0],
                "connectedEntity": "anchor",
                "damping": 8,
                "kind": "suspension",
                "stiffness": 40,
                "travel": 0.25
            }),
        })
        .expect("physics joint should deserialize"),
    );
    body.components
        .transform
        .as_mut()
        .expect("body transform should exist")
        .position = Some(if kind == "hinge" {
        [1.0, 0.0, 0.0]
    } else {
        [0.0, 0.0, 0.0]
    });
    bundle
}

fn body_position(bundle: &threenative_loader::LoadedBundle) -> [f32; 3] {
    bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.transform.as_ref())
        .and_then(|transform| transform.position)
        .expect("body should have a position")
}

fn queue_force_at_point(bundle: &mut threenative_loader::LoadedBundle, value: [f32; 3]) {
    bundle.world.resources.insert(
        "__threenativePhysicsAtPointCommands".to_owned(),
        serde_json::json!([{
            "entity": "box",
            "kind": "physics.addForceAtPoint",
            "point": [0, 0, 0],
            "value": value
        }]),
    );
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

fn write(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
