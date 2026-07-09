use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use threenative_loader::load_bundle;
use threenative_runtime::systems_host::{
    NativeGameLoopRunOptions, NativeGameLoopState, run_native_systems_frame_with_input,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoopExpectations {
    interpolation: InterpolationExpectation,
    ordering: OrderingExpectation,
    scenarios: Vec<LoopScenario>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoopScenario {
    delta: f32,
    expected: LoopScenarioExpected,
    fixed_delta: f32,
    id: String,
    paused: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoopScenarioExpected {
    accumulator: f32,
    fixed: u64,
    frame: u64,
    post_update: u64,
    startup: u64,
    tick: u64,
    update: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InterpolationExpectation {
    expected_camera_x: f32,
    expected_rendered_mover_x: f32,
    expected_world_mover_x: f32,
    first_delta: f32,
    fixed_delta: f32,
    partial_delta: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderingExpectation {
    post_update_sees_update_writes: bool,
    schedules: Vec<String>,
}

#[test]
fn native_game_loop_should_satisfy_shared_loop_fixture_expectations() {
    let fixture = read_loop_expectations();

    for scenario in fixture.scenarios {
        let root = write_loop_state_bundle(&format!("loop-contract-{}", scenario.id));
        let mut bundle = load_bundle(&root).expect("scripted bundle should load");
        let mut state = NativeGameLoopState::default();
        let mut physics_steps = 0;

        run_native_systems_frame_with_input(
            &mut bundle,
            &mut state,
            loop_options(scenario.delta, scenario.fixed_delta, scenario.paused),
            |_bundle, _fixed_delta, _script_posed_entities| physics_steps += 1,
        )
        .expect("shared loop scenario should run");

        assert_eq!(count(&bundle, "startup"), scenario.expected.startup, "{}", scenario.id);
        assert_eq!(count(&bundle, "fixed"), scenario.expected.fixed, "{}", scenario.id);
        assert_eq!(count(&bundle, "update"), scenario.expected.update, "{}", scenario.id);
        assert_eq!(
            count(&bundle, "post"),
            scenario.expected.post_update,
            "{}",
            scenario.id
        );
        assert_eq!(physics_steps, scenario.expected.fixed, "{}", scenario.id);
        assert_eq!(state.frame, scenario.expected.frame, "{}", scenario.id);
        assert_eq!(state.tick, scenario.expected.tick, "{}", scenario.id);
        assert!(
            (state.accumulator - scenario.expected.accumulator).abs() < f32::EPSILON * 16.0,
            "{} accumulator {} != {}",
            scenario.id,
            state.accumulator,
            scenario.expected.accumulator
        );
    }

    assert_eq!(fixture.ordering.schedules, ["update", "postUpdate"]);
    assert!(fixture.ordering.post_update_sees_update_writes);
}

#[test]
fn native_game_loop_should_apply_shared_interpolation_and_ordering_expectations() {
    let fixture = read_loop_expectations();
    let root = write_interpolation_bundle("loop-contract-interpolation");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(
            fixture.interpolation.first_delta,
            fixture.interpolation.fixed_delta,
            false,
        ),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("first interpolation frame should run");
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(
            fixture.interpolation.partial_delta,
            fixture.interpolation.fixed_delta,
            false,
        ),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("partial interpolation frame should run");

    assert_eq!(
        entity_x(&bundle, "mover"),
        Some(fixture.interpolation.expected_world_mover_x)
    );
    assert_eq!(
        entity_x(&bundle, "camera"),
        Some(fixture.interpolation.expected_camera_x)
    );
    assert_eq!(
        fixture.interpolation.expected_rendered_mover_x,
        fixture.interpolation.expected_camera_x
    );

    let root = write_ordering_bundle("loop-contract-ordering");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut NativeGameLoopState::default(),
        loop_options(fixture.interpolation.fixed_delta, fixture.interpolation.fixed_delta, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("ordering frame should run");

    assert_eq!(entity_x(&bundle, "camera"), Some(20.0));
}

fn read_loop_expectations() -> LoopExpectations {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/loop-scheduling/expectations.json");
    serde_json::from_str(&fs::read_to_string(path).expect("loop expectations should be readable"))
        .expect("loop expectations should parse")
}

fn loop_options(delta: f32, fixed_delta: f32, paused: bool) -> NativeGameLoopRunOptions<'static> {
    NativeGameLoopRunOptions {
        delta,
        fixed_delta,
        input: None,
        paused,
    }
}

fn count(bundle: &threenative_loader::LoadedBundle, key: &str) -> u64 {
    bundle
        .world
        .resources
        .get("LoopCounts")
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0)
}

fn entity_x(bundle: &threenative_loader::LoadedBundle, id: &str) -> Option<f32> {
    bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == id)
        .and_then(|entity| entity.components.transform.as_ref())
        .and_then(|transform| transform.position)
        .map(|position| position[0])
}

fn write_loop_state_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "LoopCounts": { "fixed": 0, "post": 0, "startup": 0, "update": 0 }
  }
}"#,
    );
    write_loop_systems(&root);
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const bump = (ctx, key) => {
  const counts = ctx.resources.get("LoopCounts");
  counts[key] += 1;
  ctx.resources.set("LoopCounts", counts);
};
const system_boot = (ctx) => bump(ctx, "startup");
const system_tick = (ctx) => bump(ctx, "fixed");
const system_update = (ctx) => bump(ctx, "update");
const system_post = (ctx) => bump(ctx, "post");
export const systemIds = Object.freeze({
  "system_boot": "boot",
  "system_tick": "tick",
  "system_update": "update",
  "system_post": "post"
});
export const systems = Object.freeze({
  "system_boot": system_boot,
  "system_tick": system_tick,
  "system_update": system_update,
  "system_post": system_post
});
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_interpolation_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "mover", "components": { "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } } },
    { "id": "camera", "components": { "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } } }
  ],
  "resources": {}
}"#,
    );
    write_transform_systems(&root, "system_tick", "system_update");
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_tick = (ctx) => {
  const transform = ctx.entity("mover").transform();
  const position = transform.positionOr([0, 0, 0]);
  transform.setPosition([position[0] + 10, 0, 0]);
};
const system_update = (ctx) => {
  const mover = ctx.entity("mover").transform().positionOr([0, 0, 0]);
  ctx.entity("camera").transform().setPosition([mover[0], 0, 0]);
};
export const systemIds = Object.freeze({ "system_tick": "tick", "system_update": "update" });
export const systems = Object.freeze({ "system_tick": system_tick, "system_update": system_update });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_ordering_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "mover", "components": { "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } } },
    { "id": "camera", "components": { "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } } }
  ],
  "resources": {}
}"#,
    );
    write_ordering_systems(&root);
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_update = (ctx) => {
  ctx.entity("mover").transform().setPosition([20, 0, 0]);
};
const system_post = (ctx) => {
  const mover = ctx.entity("mover").transform().positionOr([0, 0, 0]);
  ctx.entity("camera").transform().setPosition([mover[0], 0, 0]);
};
export const systemIds = Object.freeze({ "system_update": "update", "system_post": "post" });
export const systems = Object.freeze({ "system_update": system_update, "system_post": system_post });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_loop_systems(root: &Path) {
    write_json(
        root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    { "name": "boot", "schedule": "startup", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_boot" } },
    { "name": "tick", "schedule": "fixedUpdate", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_tick" } },
    { "name": "update", "schedule": "update", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_update" } },
    { "name": "post", "schedule": "postUpdate", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_post" } }
  ]
}"#,
    );
}

fn write_transform_systems(root: &Path, fixed_export: &str, update_export: &str) {
    write_json(
        root,
        "systems.ir.json",
        &format!(
            r#"{{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {{ "name": "tick", "schedule": "fixedUpdate", "reads": ["Transform"], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": {{ "bundle": "scripts.bundle.js", "exportName": "{fixed_export}" }} }},
    {{ "name": "update", "schedule": "update", "reads": ["Transform"], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": {{ "bundle": "scripts.bundle.js", "exportName": "{update_export}" }} }}
  ]
}}"#
        ),
    );
}

fn write_ordering_systems(root: &Path) {
    write_json(
        root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    { "name": "update", "schedule": "update", "reads": ["Transform"], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_update" } },
    { "name": "post", "schedule": "postUpdate", "reads": ["Transform"], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_post" } }
  ]
}"#,
    );
}

fn write_base_bundle(root: &Path) {
    fs::create_dir_all(root).expect("temp bundle should be created");
    write_json(
        root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "loop-contract",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write_json(
        root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[]}"#,
    );
    write_json(
        root,
        "materials.ir.json",
        r#"{"schema":"threenative.materials","version":"0.1.0","materials":[]}"#,
    );
    write_json(
        root,
        "target.profile.json",
        r#"{"schema":"threenative.target-profile","version":"0.1.0","targets":["desktop"]}"#,
    );
}

fn root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("tn-game-loop-contract-{name}-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).expect("old temp bundle should be removed");
    }
    root
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
