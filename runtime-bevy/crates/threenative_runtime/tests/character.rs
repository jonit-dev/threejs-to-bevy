use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::character::{CharacterTraceAxis, trace_character_controllers};

mod support;
use support::load_conformance_fixture;

#[test]
fn character_trace_should_match_v7_conformance_fixture() {
    let fixture = load_conformance_fixture("advanced-physics-character");
    assert_eq!(fixture.name, "advanced-physics-character");
    assert!(
        fixture
            .bundle_path
            .ends_with("advanced-physics-character/game.bundle")
    );
    let trace = trace_character_controllers(
        &fixture.bundle,
        &[
            CharacterTraceAxis {
                id: "MoveX",
                value: 1.0,
            },
            CharacterTraceAxis {
                id: "MoveZ",
                value: 0.0,
            },
        ],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].entity, "player");
    assert_eq!(trace[0].start, [0.0, 1.0, 0.0]);
    assert_eq!(trace[0].desired, [3.0, 1.0, 0.0]);
    assert_eq!(trace[0].resolved, [0.0, 1.05, 0.0]);
    assert!(trace[0].grounded);
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].blocked_by, Some("wall".to_owned()));
}

#[test]
fn character_trace_should_move_and_ground_from_declared_axes() {
    let root = write_character_bundle();
    let bundle = load_bundle(&root).expect("character bundle should load");

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 0.5,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].entity, "player");
    assert_eq!(trace[0].start, [0.0, 1.0, 0.0]);
    assert_eq!(trace[0].desired, [1.0, 1.0, 0.0]);
    assert_eq!(trace[0].resolved, [1.0, 1.05, 0.0]);
    assert!(trace[0].grounded);
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].blocked_by, None);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_stop_before_blocking_collider() {
    let root = write_character_bundle();
    let bundle = load_bundle(&root).expect("character bundle should load");

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].entity, "player");
    assert_eq!(trace[0].blocked_by, Some("wall".to_owned()));
    assert_eq!(trace[0].desired, [2.0, 1.0, 0.0]);
    assert_eq!(trace[0].resolved, [0.0, 1.05, 0.0]);
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_not_block_on_declared_sensors() {
    let root = write_character_bundle();
    let mut bundle = load_bundle(&root).expect("character bundle should load");
    let wall = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "wall")
        .expect("wall should exist");
    wall.components
        .collider
        .as_mut()
        .expect("wall collider should exist")
        .sensor = Some(serde_json::json!({ "interactionKind": "zone" }));

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].resolved, [2.0, 1.05, 0.0]);
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_apply_collision_masks_symmetrically() {
    let root = write_character_bundle();
    let mut bundle = load_bundle(&root).expect("character bundle should load");
    for entity in &mut bundle.world.entities {
        let collider = entity
            .components
            .collider
            .as_mut()
            .expect("fixture entities should have colliders");
        match entity.id.as_str() {
            "player" => {
                collider.layer = Some("player".to_owned());
                collider.mask = Some(vec!["terrain".to_owned(), "obstacle".to_owned()]);
            }
            "floor" => {
                collider.layer = Some("terrain".to_owned());
                collider.mask = Some(vec!["player".to_owned()]);
            }
            "wall" => {
                collider.layer = Some("obstacle".to_owned());
                collider.mask = Some(vec!["npc".to_owned()]);
            }
            _ => {}
        }
    }

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].resolved, [2.0, 1.05, 0.0]);
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_use_authored_mesh_collider_bounds() {
    let root = write_character_bundle();
    let mut bundle = load_bundle(&root).expect("character bundle should load");
    let wall = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "wall")
        .expect("wall should exist");
    wall.components.collider = Some(
        serde_json::from_value(serde_json::json!({
            "kind": "mesh",
            "mesh": {
                "bounds": { "size": [4.0, 2.0, 1.0] },
                "source": "mesh.wall",
                "triangleCount": 12
            }
        }))
        .expect("mesh collider should deserialize"),
    );
    wall.components
        .transform
        .as_mut()
        .expect("wall transform should exist")
        .position = Some([4.0, 1.0, 0.0]);

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace[0].blocked_by, Some("wall".to_owned()));
    assert_eq!(trace[0].resolved, [0.0, 1.05, 0.0]);
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_step_onto_low_blockers() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "step",
      "components": {
        "Collider": { "kind": "box", "size": [1, 0.4, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2, 0.2, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2,
          "stepOffset": 0.5
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].ground_entity, Some("step".to_owned()));
    assert_eq!(trace[0].resolved, [2.0, 1.4, 0.0]);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_enter_low_step_contacts_before_center_reaches_tread() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "step",
      "components": {
        "Collider": { "kind": "box", "size": [1, 0.4, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [1.2, 0.2, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, -0.05, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2,
          "stepOffset": 0.5
        },
        "Collider": { "center": [0, 1, 0], "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 0, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");

    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        0.3,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].resolved, [0.6, 0.0, 0.0]);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_climb_sequential_risers() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "step.01",
      "components": {
        "Collider": { "kind": "box", "size": [1, 0.4, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2, 0.2, 0] }
      }
    },
    {
      "id": "step.02",
      "components": {
        "Collider": { "kind": "box", "size": [1, 0.8, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [4, 0.4, 0] }
      }
    },
    {
      "id": "step.03",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1.2, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [6, 0.6, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [12, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2,
          "stepOffset": 0.5
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let mut bundle = load_bundle(&root).expect("character bundle should load");
    let mut grounded_steps = Vec::new();
    let mut resolved_y = Vec::new();

    for _ in 0..3 {
        let trace = trace_character_controllers(
            &bundle,
            &[CharacterTraceAxis {
                id: "MoveX",
                value: 1.0,
            }],
            1.0,
        );
        grounded_steps.push(trace[0].ground_entity.clone());
        resolved_y.push(trace[0].resolved[1]);
        let player = bundle
            .world
            .entities
            .iter_mut()
            .find(|entity| entity.id == "player")
            .expect("player entity should exist");
        player.components.transform = Some(threenative_loader::TransformComponent {
            position: Some(trace[0].resolved),
            rotation: None,
            scale: None,
        });
    }

    assert_eq!(
        grounded_steps,
        vec![
            Some("step.01".to_owned()),
            Some("step.02".to_owned()),
            Some("step.03".to_owned())
        ]
    );
    assert_approx_eq(resolved_y[0], 1.4);
    assert_approx_eq(resolved_y[1], 1.8);
    assert_approx_eq(resolved_y[2], 2.2);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_report_ledges_and_moving_platforms() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "platform",
      "components": {
        "Collider": { "kind": "box", "size": [1, 0.1, 6] },
        "RigidBody": { "kind": "kinematic", "velocity": [0.25, 0, 0] },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");

    let carried = trace_character_controllers(&bundle, &[], 2.0);
    assert_eq!(carried[0].ground_entity, Some("platform".to_owned()));
    assert_eq!(carried[0].platform_delta, Some([0.5, 0.0, 0.0]));
    assert_eq!(carried[0].resolved, [0.5, 1.05, 0.0]);

    let ledge = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );
    assert!(!ledge[0].grounded);
    assert_eq!(ledge[0].ground_entity, None);
    assert_eq!(ledge[0].resolved, [2.0, 1.0, 0.0]);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_apply_slope_limits() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "ramp",
      "components": {
        "Collider": { "kind": "box", "size": [4, 1, 2], "slope": { "axis": "x", "direction": 1, "rise": 1, "run": 2 } },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2, 0.5, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "slopeLimit": 45,
          "speed": 2
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");
    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].ground_entity, Some("ramp".to_owned()));
    assert_eq!(trace[0].resolved, [2.0, 1.5, 0.0]);
    let slope = trace[0]
        .slope
        .as_ref()
        .expect("ramp slope should be reported");
    assert_eq!(slope.entity, "ramp");
    assert_eq!(slope.angle, 26.56505);
    assert_eq!(slope.axis, "x");
    assert_eq!(slope.direction, 1);
    assert_eq!(slope.rise, 1.0);
    assert_eq!(slope.run, 2.0);
    assert!(slope.walkable);

    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "steep-ramp",
      "components": {
        "Collider": { "kind": "box", "size": [4, 2, 2], "slope": { "axis": "x", "direction": 1, "rise": 2, "run": 1 } },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2, 1, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "slopeLimit": 35,
          "speed": 2
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");
    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace[0].blocked_by, Some("steep-ramp".to_owned()));
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].resolved, [0.0, 1.05, 0.0]);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_walk_humanoid_course_ramp_dimensions() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "ramp.main",
      "components": {
        "Collider": { "kind": "box", "layer": "world", "size": [2.5, 0.28, 2.4], "slope": { "axis": "z", "direction": -1, "rise": 0.48, "run": 2.4 } },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2.15, 0.28, 2.6] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "slopeLimit": 28,
          "speed": 2
        },
        "Collider": { "center": [0, 0.9, 0], "height": 1.8, "kind": "capsule", "layer": "player", "radius": 0.34 },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [2.15, 0, 3.95] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");
    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveZ",
            value: -1.0,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].entity, "player");
    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].ground_entity, Some("ramp.main".to_owned()));
    assert!(
        trace[0].resolved[1] > 0.4,
        "expected feet-origin resolved Y to rise on ramp, got {}",
        trace[0].resolved[1]
    );
    assert_approx_eq(trace[0].resolved[2], 1.95);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_push_light_dynamic_bodies_and_block_heavy_bodies() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "light-crate",
      "components": {
        "Collider": { "kind": "box", "layer": "pushable", "size": [1, 2, 1] },
        "RigidBody": { "kind": "dynamic", "mass": 2 },
        "Transform": { "position": [2, 1, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "pushPolicy": { "allowedLayers": ["pushable"], "blockedWhenTooHeavy": true, "enabled": true, "impulseScale": 1, "maxPushMass": 10, "minMoveSpeed": 0.1 },
          "speed": 2
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");
    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].blocked_by, None);
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].resolved, [2.0, 1.05, 0.0]);
    let pushed = trace[0]
        .pushed
        .as_ref()
        .expect("light dynamic body should be pushed");
    assert_eq!(pushed.entity, "light-crate");
    assert_eq!(pushed.impulse, [2.0, 0.0, 0.0]);
    assert_eq!(pushed.position, [4.0, 1.0, 0.0]);
    assert_eq!(trace[0].pushes.len(), 1);
    assert_eq!(trace[0].pushes[0].entity, "light-crate");

    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "heavy-crate",
      "components": {
        "Collider": { "kind": "box", "layer": "pushable", "size": [1, 2, 1] },
        "RigidBody": { "kind": "dynamic", "mass": 50 },
        "Transform": { "position": [2, 1, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "pushPolicy": { "allowedLayers": ["pushable"], "blockedWhenTooHeavy": true, "enabled": true, "maxPushMass": 10 },
          "speed": 2
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");
    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].blocked_by, Some("heavy-crate".to_owned()));
    assert_eq!(trace[0].ground_entity, Some("floor".to_owned()));
    assert_eq!(trace[0].pushed, None);
    assert_eq!(trace[0].resolved, [0.0, 1.05, 0.0]);
    assert_eq!(trace[0].too_heavy, Some("heavy-crate".to_owned()));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn character_trace_should_filter_contacts_by_layer_and_phase() {
    let root = write_character_bundle();
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "ramp",
      "components": {
        "Collider": { "contact": { "phases": ["stay"] }, "kind": "box", "layer": "world", "material": "stone", "size": [6, 1, 6], "slope": { "axis": "x", "direction": 1, "rise": 1, "run": 3 } },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0.5, 0] }
      }
    },
    {
      "id": "crate",
      "components": {
        "Collider": { "contact": { "phases": ["begin"] }, "kind": "box", "layer": "pushable", "material": "wood", "size": [1, 1, 1] },
        "RigidBody": { "kind": "dynamic", "mass": 1 },
        "Transform": { "position": [2, 2.3333333, 0] }
      }
    },
    {
      "id": "ignored",
      "components": {
        "Collider": { "contact": { "phases": ["begin", "stay"] }, "kind": "box", "layer": "ignored", "material": "glass", "size": [1, 1, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2, 2.3333333, 1.2] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "pushPolicy": { "allowedLayers": ["pushable"], "enabled": true, "maxPushMass": 5 },
          "slopeLimit": 30,
          "speed": 2
        },
        "Collider": { "contact": { "phases": ["begin", "stay"] }, "kind": "box", "layer": "player", "mask": ["pushable", "world"], "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 2.3333333, 0] }
      }
    }
  ]
}"#,
    );
    let bundle = load_bundle(&root).expect("character bundle should load");
    let trace = trace_character_controllers(
        &bundle,
        &[CharacterTraceAxis {
            id: "MoveX",
            value: 1.0,
        }],
        1.0,
    );

    assert_eq!(trace.len(), 1);
    assert_eq!(trace[0].contacts.len(), 2);
    assert_eq!(trace[0].contacts[0].phase, "begin");
    assert_eq!(trace[0].contacts[0].self_entity, "player");
    assert_eq!(trace[0].contacts[0].other, "crate");
    assert_eq!(trace[0].contacts[0].material, Some("wood".to_owned()));
    assert_eq!(trace[0].contacts[0].normal, Some([-1.0, 0.0, 0.0]));
    assert_eq!(trace[0].contacts[0].point, Some([2.0, 2.333333, 0.0]));
    assert_eq!(trace[0].contacts[1].phase, "stay");
    assert_eq!(trace[0].contacts[1].self_entity, "player");
    assert_eq!(trace[0].contacts[1].other, "ramp");
    assert_eq!(trace[0].contacts[1].material, Some("stone".to_owned()));
    assert_eq!(trace[0].contacts[1].point, Some([2.0, 0.833333, 0.0]));
    assert_eq!(trace[0].ground_entity, Some("ramp".to_owned()));
    assert_eq!(trace[0].pushes.len(), 1);
    assert_eq!(trace[0].pushes[0].entity, "crate");

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn write_character_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-character-trace-{}",
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
  "name": "character-trace",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "input": "input.ir.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
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
      "id": "wall",
      "components": {
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [2, 1, 0] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Collider": { "kind": "box", "size": [6, 0.1, 6] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2
        },
        "Collider": { "kind": "box", "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0, 1, 0] }
      }
    },
    {
      "id": "pickup",
      "components": {
        "Collider": { "kind": "sphere", "radius": 0.5, "trigger": true },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [1, 1, 0] }
      }
    }
  ]
}"#,
    );
    write(
        &root,
        "input.ir.json",
        r#"{
  "schema": "threenative.input",
  "version": "0.1.0",
  "actions": [],
  "axes": [
    { "id": "MoveX", "negative": [{ "device": "keyboard", "code": "KeyA" }], "positive": [{ "device": "keyboard", "code": "KeyD" }] },
    { "id": "MoveZ", "negative": [{ "device": "keyboard", "code": "KeyW" }], "positive": [{ "device": "keyboard", "code": "KeyS" }] }
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

fn assert_approx_eq(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 0.0001,
        "expected {actual} to be approximately {expected}"
    );
}
