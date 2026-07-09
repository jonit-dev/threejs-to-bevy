use std::{collections::BTreeMap, path::PathBuf};

use serde_json::Value;
use threenative_loader::load_bundle;
use threenative_runtime::animation::{
    AnimationRuntimeController, AnimationRuntimePlayOptions, AnimationTraceInput,
    ParticleRuntimeController,
    trace_animation_graphs,
};

mod support;

use support::load_conformance_fixture;

#[test]
fn animation_trace_should_match_v7_graph_and_particle_fixture() {
    let fixture = load_conformance_fixture("animation-graphs-particles");
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
    assert_eq!(observation.queued_events[0].event, "Footstep");
    assert_eq!(observation.queued_events[0].payload.asset, "model.hero");
    assert_eq!(observation.queued_events[0].payload.clip, "run");
    assert_eq!(observation.queued_events[0].payload.state, "run");
    assert_eq!(observation.queued_events[0].payload.at_seconds, 0.25);
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
    assert!(trace[0].queued_events.is_empty());
}

#[test]
fn should_return_active_runtime_state_when_animation_is_playing() {
    let mut animation = AnimationRuntimeController::default();

    let started = animation.play(
        "player",
        "run",
        AnimationRuntimePlayOptions {
            active_state: Some("locomotion.run".to_owned()),
            blend_elapsed_seconds: None,
            blend_seconds: None,
            duration_seconds: Some(2.0),
            loop_: Some(true),
            source_clip: Some("Armature|Run".to_owned()),
            speed: Some(1.25),
        },
    );

    assert!(started.active);
    assert_eq!(started.entity, "player");
    assert_eq!(started.clip, "run");
    assert_eq!(started.source_clip, "Armature|Run");
    assert_eq!(started.loop_, true);
    assert_eq!(started.speed, 1.25);
    assert_eq!(started.normalized_time, 0.0);
    animation.advance(0.5);

    let queried = animation.query("player", Some("run"));
    assert_eq!(queried.active_state, "locomotion.run");
    assert_eq!(queried.time_seconds, 0.625);
    assert_eq!(queried.normalized_time, 0.3125);
    assert!(!queried.stopped);
}

#[test]
fn should_report_blend_weights_during_graph_transition() {
    let mut animation = AnimationRuntimeController::default();

    animation.play(
        "player",
        "idle",
        AnimationRuntimePlayOptions {
            duration_seconds: Some(2.0),
            ..AnimationRuntimePlayOptions::default()
        },
    );
    animation.play(
        "player",
        "run",
        AnimationRuntimePlayOptions {
            blend_seconds: Some(0.4),
            duration_seconds: Some(1.0),
            ..AnimationRuntimePlayOptions::default()
        },
    );
    animation.advance(0.2);

    let blend = animation
        .query("player", Some("run"))
        .blend
        .expect("blend state should be active");
    assert_eq!(blend.from_clip, "idle");
    assert_eq!(blend.to_clip, "run");
    assert_eq!(blend.duration_seconds, 0.4);
    assert_eq!(blend.elapsed_seconds, 0.2);
    assert_eq!(blend.from_weight, 0.5);
    assert_eq!(blend.to_weight, 0.5);
    assert!(!blend.complete);
}

#[test]
fn should_execute_bounded_particle_burst_command() {
    let fixture = load_conformance_fixture("animation-graphs-particles");
    let mut particles = ParticleRuntimeController::from_bundle(&fixture.bundle);

    let emitted = particles.execute(
        "emit",
        "model.hero",
        "dust",
        Some(99),
        Some("impact"),
    );

    assert_eq!(emitted.accepted, true);
    assert_eq!(emitted.active, true);
    assert_eq!(emitted.asset, "model.hero");
    assert_eq!(emitted.command, "emit");
    assert_eq!(emitted.count, 64);
    assert_eq!(emitted.emitter, "dust");
    assert_eq!(emitted.max_particles, 64);
    assert_eq!(emitted.seed, 510767767);
    assert_eq!(emitted.status, "emitted");
    let expired = particles.advance_fixed_ticks(30, 1.0 / 60.0);
    assert_eq!(expired.len(), 1);
    assert_eq!(expired[0].active, false);
    assert_eq!(expired[0].count, 0);

    let playing = particles.execute("play", "model.hero", "dust", None, Some("7"));
    assert_eq!(playing.active, true);
    assert_eq!(playing.command, "play");
    assert_eq!(playing.count, 6);
    assert_eq!(playing.seed, 7);
    assert_eq!(playing.status, "played");
    assert_eq!(particles.advance_fixed_ticks(30, 1.0 / 60.0), vec![playing]);

    let cleared = particles.execute("clear", "model.hero", "dust", None, None);
    assert_eq!(cleared.active, false);
    assert_eq!(cleared.count, 0);
    assert_eq!(cleared.status, "cleared");
    assert!(particles.snapshot().is_empty());
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
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["web", "desktop"] }"#,
    )
    .expect("target profile should be written");
    std::fs::write(root.join("assets/hero.glb"), b"placeholder").expect("asset should be written");
    root
}
