use std::{collections::BTreeMap, path::PathBuf};

use serde_json::Value;
use threenative_loader::load_bundle;
use threenative_runtime::animation::{AnimationTraceInput, trace_animation_graphs};

mod support;

use support::load_conformance_fixture;

#[test]
fn animation_trace_should_match_v7_graph_and_particle_fixture() {
    let fixture = load_conformance_fixture("v7-animation-graphs-particles");
    let mut parameters = BTreeMap::new();
    parameters.insert("moving".to_owned(), Value::from(true));

    let trace = trace_animation_graphs(
        &fixture.bundle,
        &AnimationTraceInput {
            fixed_delta: 0.5,
            parameters,
        },
    );

    assert_eq!(trace.len(), 1);
    let observation = &trace[0];
    assert_eq!(observation.asset, "model.hero");
    assert_eq!(observation.initial_state, "idle");
    assert_eq!(observation.active_state, "run");
    assert_eq!(observation.clip, "run");
    assert_eq!(
        observation.parameters.get("moving"),
        Some(&Value::from(true))
    );
    assert_eq!(observation.transition.as_ref().unwrap().from, "idle");
    assert_eq!(observation.transition.as_ref().unwrap().to, "run");
    assert_eq!(
        observation.transition.as_ref().unwrap().blend_seconds,
        Some(0.15)
    );
    assert_eq!(observation.events[0].event, "Footstep");
    assert_eq!(observation.events[0].at_seconds, 0.25);
    assert_eq!(observation.particles[0].id, "dust");
    assert_eq!(observation.particles[0].spawned, 6);
}

#[test]
fn animation_trace_should_keep_initial_state_when_parameter_does_not_match() {
    let root = write_animation_bundle();
    let bundle = load_bundle(&root).expect("animation bundle should load");

    let trace = trace_animation_graphs(
        &bundle,
        &AnimationTraceInput {
            fixed_delta: 0.5,
            parameters: BTreeMap::new(),
        },
    );

    assert_eq!(trace[0].active_state, "idle");
    assert_eq!(trace[0].clip, "idle");
    assert!(trace[0].transition.is_none());
    assert!(trace[0].events.is_empty());
}

fn write_animation_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-animation-trace-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos()
    ));
    std::fs::create_dir_all(root.join("assets")).expect("bundle dirs should be created");
    std::fs::write(
        root.join("manifest.json"),
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "animation-trace",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": {
    "assets": "assets.manifest.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    )
    .expect("manifest should be written");
    std::fs::write(
        root.join("assets.manifest.json"),
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    {
      "id": "model.hero",
      "kind": "model",
      "format": "glb",
      "path": "assets/hero.glb",
      "animations": [
        { "id": "idle", "loop": true, "speed": 1 },
        { "id": "run", "loop": true, "speed": 1.25 }
      ],
      "animationGraph": {
        "initialState": "idle",
        "parameters": [{ "id": "moving", "kind": "boolean", "default": false }],
        "states": [
          { "id": "idle", "clip": "idle" },
          { "id": "run", "clip": "run", "events": [{ "event": "Footstep", "atSeconds": 0.25 }] }
        ],
        "transitions": [
          { "from": "idle", "to": "run", "blendSeconds": 0.15, "when": { "parameter": "moving", "equals": true } }
        ]
      }
    }
  ]
}"#,
    )
    .expect("assets should be written");
    std::fs::write(
        root.join("world.ir.json"),
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    )
    .expect("world should be written");
    std::fs::write(
        root.join("materials.ir.json"),
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    )
    .expect("materials should be written");
    std::fs::write(
        root.join("target.profile.json"),
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["web", "bevy"] }"#,
    )
    .expect("target profile should be written");
    std::fs::write(root.join("assets/hero.glb"), b"placeholder").expect("asset should be written");
    root
}
