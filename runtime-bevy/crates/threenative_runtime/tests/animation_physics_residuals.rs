use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::animation_physics_residuals::trace_animation_physics_residuals;

#[test]
fn should_report_morph_target_weight_at_sampled_frame() {
    let root = write_residual_bundle("animation-residuals");
    let bundle = load_bundle(&root).expect("residual bundle should load");

    let report = trace_animation_physics_residuals(&bundle);

    assert_eq!(report.animation.morph_targets[0].asset, "model.hero");
    assert_eq!(report.animation.morph_targets[0].clip, "smile");
    assert_eq!(report.animation.morph_targets[0].target, "Smile");
    assert_eq!(report.animation.morph_targets[0].time_seconds, 0.5);
    assert_eq!(report.animation.morph_targets[0].weight, 0.5);
    assert_eq!(report.animation.masks[0].clips, vec!["wave".to_owned()]);
    assert_eq!(report.animation.vfx_commands[0].asset, "model.hero");
    assert_eq!(report.animation.vfx_commands[0].emitter, "dust");
    assert_eq!(report.animation.vfx_commands[0].count, 4);
}

#[test]
fn should_ground_character_on_authored_sloped_mesh_terrain() {
    let root = write_residual_bundle("mesh-grounding");
    let bundle = load_bundle(&root).expect("residual bundle should load");

    let report = trace_animation_physics_residuals(&bundle);

    assert_eq!(report.physics.character_grounding[0].entity, "player");
    assert_eq!(
        report.physics.character_grounding[0].ground_entity,
        Some("ramp".to_owned())
    );
    assert_eq!(
        report.physics.character_grounding[0].resolved,
        [2.0, 1.0, 0.0]
    );
}

#[test]
fn should_report_crowd_steering_separation() {
    let root = write_residual_bundle("navigation-residuals");
    let bundle = load_bundle(&root).expect("residual bundle should load");

    let report = trace_animation_physics_residuals(&bundle);

    assert_eq!(report.navigation.off_mesh_links[0].id, "jump.a.b");
    assert_eq!(report.navigation.crowd[0].position, [0.0, 0.0, 0.0]);
    assert_eq!(report.navigation.crowd[1].position, [0.25, 0.0, 0.0]);
}

fn write_residual_bundle(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should be valid")
            .as_nanos()
    ));
    fs::create_dir_all(root.join("assets")).expect("asset dir should be created");
    fs::write(root.join("assets/hero.glb"), "model").expect("model should be written");
    fs::write(
        root.join("manifest.json"),
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "animation-physics-residuals",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}
"#,
    )
    .expect("manifest should be written");
    fs::write(
        root.join("assets.manifest.json"),
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    {
      "animations": [{ "id": "wave", "mask": "upperBody" }],
      "format": "glb",
      "id": "model.hero",
      "kind": "model",
      "masks": [{ "id": "upperBody", "joints": ["Spine", "Arm.L", "Arm.R"] }],
      "morphClips": [{ "id": "smile", "target": "Smile", "keyframes": [{ "timeSeconds": 0, "weight": 0 }, { "timeSeconds": 1, "weight": 1 }] }],
      "morphTargets": [{ "defaultWeight": 0, "id": "Smile" }],
      "particleEmitters": [{ "id": "dust", "lifetimeSeconds": 0.5, "maxParticles": 8, "ratePerSecond": 8, "shape": "point" }],
      "path": "assets/hero.glb",
      "skeleton": { "joints": ["Root", "Spine", "Arm.L", "Arm.R"] }
    }
  ]
}
"#,
    )
    .expect("assets should be written");
    fs::write(
        root.join("materials.ir.json"),
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }
"#,
    )
    .expect("materials should be written");
    fs::write(
        root.join("target.profile.json"),
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["web", "desktop"] }
"#,
    )
    .expect("target should be written");
    fs::write(
        root.join("world.ir.json"),
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "floor", "components": { "Transform": { "position": [0, 0, 0] }, "RigidBody": { "kind": "static" }, "Collider": { "kind": "box", "size": [12, 0.2, 8] } } },
    { "id": "ramp", "components": { "Transform": { "position": [2, 0.5, 0] }, "RigidBody": { "kind": "static" }, "Collider": { "kind": "box", "size": [4, 1, 2], "slope": { "axis": "x", "direction": 1, "rise": 1, "run": 2 } } } },
    { "id": "player", "components": { "Transform": { "position": [0, 1, 0] }, "Collider": { "kind": "box", "size": [1, 1, 1] }, "CharacterController": { "blocking": true, "grounding": "raycast", "moveXAxis": "MoveX", "moveZAxis": "MoveZ", "slopeLimit": 45, "speed": 2 } } }
  ],
  "resources": {
    "Navigation": {
      "agentRadius": 0.4,
      "crowd": {
        "maxAgents": 4,
        "separationRadius": 0.25,
        "agents": [
          { "id": "agent.a", "position": [0, 0, 0], "goal": [2, 0, 0] },
          { "id": "agent.b", "position": [0, 0, 0], "goal": [2, 0, 0] }
        ]
      },
      "dynamicRebake": { "intervalMs": 100, "maxObstacles": 4, "maxRegions": 8 },
      "offMeshLinks": [{ "id": "jump.a.b", "from": "a", "to": "b", "cost": 1 }],
      "regions": [
        { "id": "a", "center": [0, 0, 0], "points": [[-1, -1], [1, -1], [1, 1], [-1, 1]], "neighbors": ["b"] },
        { "id": "b", "center": [2, 0, 0], "points": [[1, -1], [3, -1], [3, 1], [1, 1]], "neighbors": ["a"] }
      ],
      "queries": [{ "id": "path.a.b", "start": [0, 0, 0], "goal": [2, 0, 0] }]
    }
  }
}
"#,
    )
    .expect("world should be written");
    root
}
