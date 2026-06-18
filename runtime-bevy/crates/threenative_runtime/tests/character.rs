use std::{
    fs,
    path::PathBuf,
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

fn write(root: &PathBuf, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
