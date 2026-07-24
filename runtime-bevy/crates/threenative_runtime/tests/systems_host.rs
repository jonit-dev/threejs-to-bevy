use std::{
    fs,
    path::{Path, PathBuf},
};

use bevy::{
    app::{App, PreUpdate},
    input::{ButtonInput, mouse::MouseMotion},
    prelude::{KeyCode, MouseButton},
    window::CursorMoved,
};
use threenative_loader::{
    EntityComponents, InputActionIr, InputAxisIr, InputBindingIr, InputIr, LoadedBundle,
    WorldEntity, load_bundle,
};
use threenative_runtime::{
    input::{NativeInputMap, NativeInputState, capture_native_input, map_keyboard_event},
    physics::step_bundle_physics_with_script_poses,
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot},
    systems_host::{
        NativeEntityLifecycleRuntimeState, NativeGameLoopRunOptions, NativeGameLoopState,
        diagnose_native_system_host, ensure_native_system_host_supported,
        run_native_systems_frame_with_input, run_native_systems_once,
        run_native_systems_once_with_input, unsupported_native_system_host_diagnostic,
    },
};

#[test]
fn systems_host_game_loop_should_publish_live_rapier_collision_phases() {
    let root = write_live_collision_bundle("live-collision-events");
    let mut bundle = load_bundle(&root).expect("physics bundle should load");
    let mut state = NativeGameLoopState::default();

    for expected_phase in ["enter", "stay"] {
        run_native_systems_frame_with_input(
            &mut bundle,
            &mut state,
            loop_options(0.1, 0.1, false),
            step_bundle_physics_with_script_poses,
        )
        .expect("physics frame should run");
        assert_eq!(
            bundle.world.events["CollisionEvent"][0]["phase"],
            serde_json::json!(expected_phase),
            "collision queue: {:?}",
            bundle.world.events
        );
        assert_eq!(
            bundle.world.events["TriggerEvent"][0]["phase"],
            serde_json::json!(expected_phase)
        );
    }

    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "mover")
        .and_then(|entity| entity.components.transform.as_mut())
        .expect("mover transform should exist")
        .position = Some([4.0, 0.55, 0.0]);
    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "visitor")
        .and_then(|entity| entity.components.transform.as_mut())
        .expect("visitor transform should exist")
        .position = Some([12.0, 0.0, 0.0]);
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.1, false),
        step_bundle_physics_with_script_poses,
    )
    .expect("separation frame should run");

    assert_eq!(
        bundle.world.events["CollisionEvent"][0]["phase"],
        serde_json::json!("exit")
    );
    assert_eq!(
        bundle.world.events["TriggerEvent"][0]["phase"],
        serde_json::json!("exit")
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_call_quickjs_system_export() {
    let root = write_bundle("call-export", "system_movePlayer");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let system = bundle
        .systems
        .as_ref()
        .and_then(|systems| systems.systems.first())
        .expect("system should exist");
    let snapshot = build_system_context_snapshot(&bundle, system, time());
    assert_eq!(snapshot.entities.len(), 1);
    assert_eq!(snapshot.entities[0].id, "player");
    assert!(snapshot.entities[0].components.contains_key("Transform"));
    assert_eq!(
        snapshot.default_query["with"],
        serde_json::json!(["Transform"])
    );
    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    let transform = bundle.world.entities[0]
        .components
        .transform
        .as_ref()
        .expect("transform should still exist");
    assert_eq!(transform.position, Some([0.016, 0.0, 0.0]));
    assert_eq!(run.logs[0].schema, "threenative.web-system-effects");
    assert_eq!(run.logs[0].entries[0].kind, "patch");
    assert_eq!(run.logs[0].entries[0].system, "movePlayer");
}

#[test]
fn systems_host_should_apply_declared_cosmetic_transform_without_replacing_base_pose() {
    let root = write_context_ergonomics_bundle("cosmetic-transform");
    let systems_path = root.join("systems.ir.json");
    let systems = fs::read_to_string(&systems_path)
        .expect("systems should be readable")
        .replace(
            r#""writes": ["Transform"]"#,
            r#""writes": ["Transform", "CosmeticTransform"]"#,
        );
    fs::write(systems_path, systems).expect("cosmetic access should be declared");
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_ergonomics = (ctx) => {
  ctx.entity("player").transform().setLocalOffset({
    position: [0, 0.25, 0],
    rotation: [0, 0, 0.1, 0.995]
  });
};
export const systemIds = Object.freeze({ "system_ergonomics": "ergonomics" });
export const systems = Object.freeze({ "system_ergonomics": system_ergonomics });
"#,
    )
    .expect("cosmetic script should be written");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("declared cosmetic write should run");

    let player = &bundle.world.entities[0];
    assert_eq!(player.components.transform.as_ref().unwrap().position, Some([0.0, 0.0, 0.0]));
    assert_eq!(
        player.components.extra.get("CosmeticTransform"),
        Some(&serde_json::json!({
            "position": [0, 0.25, 0],
            "rotation": [0, 0, 0.1, 0.995],
            "scale": [1, 1, 1]
        })),
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_reject_undeclared_cosmetic_transform_write() {
    let root = write_context_ergonomics_bundle("cosmetic-transform-undeclared");
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_ergonomics = (ctx) => {
  ctx.entity("player").transform().setLocalOffset({ position: [0, 0.25, 0] });
};
export const systemIds = Object.freeze({ "system_ergonomics": "ergonomics" });
export const systems = Object.freeze({ "system_ergonomics": system_ergonomics });
"#,
    )
    .expect("cosmetic script should be written");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let error = run_native_systems_once(&mut bundle, time())
        .expect_err("undeclared cosmetic write should fail");

    assert!(error.to_string().contains("TN_BEVY_SYSTEM_WRITE_UNDECLARED"));
    assert!(!bundle.world.entities[0].components.extra.contains_key("CosmeticTransform"));
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_tick_countdown_and_fire_one_limit_event_per_cycle() {
    let root = write_countdown_bundle("countdown");
    let mut bundle = load_bundle(&root).expect("countdown bundle should load");
    let mut state = NativeGameLoopState::default();

    let run = run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.1, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("countdown frame should run");
    assert_eq!(
        run.emitted_events["Race.limit"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        bundle.world.resources["Race"]["remaining"],
        serde_json::json!(0.0)
    );
    assert_eq!(
        bundle.world.events["Race.limit"].as_array().map(Vec::len),
        Some(1)
    );

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.1, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("second countdown frame should run");
    assert_eq!(
        bundle.world.events["Race.limit"].as_array().map(Vec::len),
        Some(1)
    );

    bundle
        .world
        .resources
        .get_mut("Race")
        .and_then(serde_json::Value::as_object_mut)
        .expect("race resource")
        .insert("restartToken".to_owned(), serde_json::json!(1));
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.1, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("restart countdown frame should run");
    assert_eq!(
        bundle.world.events["Race.limit"].as_array().map(Vec::len),
        Some(2)
    );
}

#[test]
fn systems_host_should_observe_native_lifecycle_after_bundle_reconciliation() {
    let root = write_countdown_bundle("lifecycle-state");
    let mut bundle = load_bundle(&root).expect("bundle should load");
    let mut lifecycle = NativeEntityLifecycleRuntimeState::default();
    lifecycle.begin_tick(&bundle, 0);
    bundle.world.entities.push(WorldEntity {
        components: EntityComponents::default(),
        id: "coin.01".to_owned(),
        tags: vec!["coin".to_owned()],
    });
    lifecycle.observe(&bundle);
    assert_eq!(lifecycle.snapshot().spawned, vec!["coin.01"]);

    bundle
        .world
        .entities
        .retain(|entity| entity.id != "coin.01");
    lifecycle.observe(&bundle);
    assert_eq!(lifecycle.snapshot().despawned, vec!["coin.01"]);
}

#[test]
fn systems_host_should_error_on_undeclared_explicit_query() {
    let root = write_undeclared_query_bundle("undeclared-query");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let error = run_native_systems_once(&mut bundle, time())
        .expect_err("undeclared explicit query should fail loudly");

    assert_eq!(error.code, "TN_BEVY_SYSTEM_SCRIPT_EXECUTION_FAILED");
    assert!(
        error.message.contains("TN_SCRIPT_QUERY_UNDECLARED"),
        "unexpected error message: {}",
        error.message
    );
    assert!(
        error
            .message
            .contains("context.query({\"with\":[\"Camera\"],\"without\":[]})"),
        "error should name the undeclared query: {}",
        error.message
    );
    assert!(
        error.message.contains("Declared queries"),
        "error should include the declared query set: {}",
        error.message
    );
}

#[test]
fn systems_host_should_pass_time_resource_to_quickjs_system() {
    let root = write_bundle("time-context", "system_movePlayer");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    let transform = bundle.world.entities[0]
        .components
        .transform
        .as_ref()
        .expect("transform should still exist");
    assert_eq!(transform.position, Some([0.016, 0.0, 0.0]));
}

#[test]
fn systems_host_should_apply_declared_resource_write() {
    let root = write_resource_bundle("resource-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");
    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&serde_json::json!({ "value": 3 }))
    );
    assert_eq!(run.logs[0].entries[0].kind, "resource");
    assert_eq!(run.logs[0].entries[0].resource.as_deref(), Some("Score"));
    assert_eq!(
        run.logs[0].entries[0].value,
        Some(serde_json::json!({ "value": 3 }))
    );
    let observations = run
        .resource_observations
        .iter()
        .map(|observation| {
            (
                observation.kind.as_str(),
                observation.resource.as_str(),
                observation.system.as_str(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        observations,
        vec![
            ("load", "Score", "score"),
            ("read", "Score", "score"),
            ("write", "Score", "score"),
        ]
    );
}

#[test]
fn systems_host_should_expose_context_ergonomics_helpers() {
    let root = write_context_ergonomics_bundle("context-ergonomics");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let input = InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Boost".to_owned(),
            bindings: vec![InputBindingIr::Keyboard {
                code: "KeyB".to_owned(),
            }],
        }],
        axes: vec![InputAxisIr {
            id: "MoveX".to_owned(),
            negative: vec![InputBindingIr::Keyboard {
                code: "KeyA".to_owned(),
            }],
            positive: vec![InputBindingIr::Keyboard {
                code: "KeyD".to_owned(),
            }],
            value: None,
        }],
        controls_settings: None,
        persisted_binding_overrides: Vec::new(),
    };
    let mut state = NativeInputState::default();
    map_keyboard_event(&input, "KeyD", true, &mut state);
    map_keyboard_event(&input, "KeyB", true, &mut state);

    run_native_systems_once_with_input(&mut bundle, time(), Some(&state))
        .expect("system should run");

    assert_eq!(
        bundle.world.resources.get("RallyState"),
        Some(&serde_json::json!({
            "button": true,
            "camera": "camera.main",
            "down": true,
            "dt": 0.016,
            "energy": 5,
            "hp": 1,
            "lap": 1,
            "missing": true,
            "move": [1, 0],
            "speed": 1,
            "time": 1,
            "up": false
        }))
    );
    let transform = bundle.world.entities[0]
        .components
        .transform
        .as_ref()
        .expect("transform should still exist");
    assert_eq!(transform.position, Some([1.0, 0.0, 0.0]));
}

#[test]
fn script_context_should_match_pending_write_and_input_edge_fixture() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/ir/fixtures/contracts/scripting/pending-writes.json"
    ))
    .expect("pending-write fixture should parse");
    let root = write_pending_write_context_bundle("pending-write-context");
    let mut bundle = load_bundle(&root).expect("pending-write bundle should load");
    let input = InputIr {
        schema: "threenative.input".to_owned(),
        version: "0.1.0".to_owned(),
        actions: vec![InputActionIr {
            id: "Jump".to_owned(),
            bindings: vec![InputBindingIr::Keyboard {
                code: "Space".to_owned(),
            }],
        }],
        axes: vec![],
        controls_settings: None,
        persisted_binding_overrides: vec![],
    };
    let mut app = App::new();
    app.add_event::<MouseMotion>();
    app.add_event::<CursorMoved>();
    app.insert_resource(ButtonInput::<KeyCode>::default());
    app.insert_resource(ButtonInput::<MouseButton>::default());
    app.insert_resource(NativeInputMap(input));
    app.init_resource::<NativeInputState>();
    app.add_systems(PreUpdate, capture_native_input);

    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .press(KeyCode::Space);
    app.update();
    let first = app.world().resource::<NativeInputState>().clone();
    let first_run = run_native_systems_once_with_input(&mut bundle, time(), Some(&first))
        .expect("press tick should run");
    app.update();
    let held = app.world().resource::<NativeInputState>().clone();
    run_native_systems_once_with_input(&mut bundle, time(), Some(&held))
        .expect("held tick should run");
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .release(KeyCode::Space);
    app.update();
    let released = app.world().resource::<NativeInputState>().clone();
    run_native_systems_once_with_input(&mut bundle, time(), Some(&released))
        .expect("release tick should run");

    let report = bundle
        .world
        .resources
        .get("Trace")
        .expect("trace resource should be written");
    assert_eq!(
        report["positionReads"],
        fixture["expected"]["positionReads"]
    );
    assert_eq!(
        report["componentReads"],
        fixture["expected"]["componentReads"]
    );
    assert_eq!(report["inputTicks"], fixture["expected"]["inputTicks"]);
    let effect_order = first_run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.component.clone())
        .collect::<Vec<_>>();
    let mut canonical_expected_order = fixture["expected"]["effectOrder"]
        .as_array()
        .expect("effect order should be an array")
        .iter()
        .map(|value| {
            value
                .as_str()
                .expect("component should be a string")
                .to_owned()
        })
        .collect::<Vec<_>>();
    canonical_expected_order.sort();
    assert_eq!(effect_order, canonical_expected_order);
    assert_eq!(
        report["componentReads"][2],
        fixture["expected"]["componentReads"][2]
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_query_native_entities_by_tag() {
    let root = write_tag_context_bundle("tag-context");
    let mut bundle = load_bundle(&root).expect("tag bundle should load");
    run_native_systems_once(&mut bundle, time()).expect("tag system should run");
    assert_eq!(
        bundle.world.resources.get("TagReport"),
        Some(&serde_json::json!({ "count": 1, "ids": ["coin"] }))
    );
}

#[test]
fn systems_host_should_run_native_patrol_trace_on_fixed_ticks() {
    let root = write_patrol_bundle("patrol");
    let mut bundle = load_bundle(&root).expect("patrol bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.5, 0.5, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("patrol frame should run");
    assert_eq!(entity_position(&bundle, "guard"), Some([0.5, 0.0, 0.0]));

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.5, 0.5, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("second patrol frame should run");
    assert_eq!(entity_position(&bundle, "guard"), Some([1.0, 0.0, 0.0]));
}

#[test]
fn systems_host_should_run_native_state_machine_event_once() {
    let root = write_state_machine_bundle("state-machine");
    let mut bundle = load_bundle(&root).expect("state machine bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.1, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("state machine frame should run");
    assert_eq!(
        bundle.world.entities[0]
            .components
            .state_machine
            .as_ref()
            .and_then(|machine| machine.current.as_deref()),
        Some("chase")
    );

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.1, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("second state machine frame should run");
    assert_eq!(
        bundle.world.entities[0]
            .components
            .state_machine
            .as_ref()
            .and_then(|machine| machine.current.as_deref()),
        Some("chase")
    );
}

#[test]
fn systems_host_should_not_expose_forbidden_ambient_apis() {
    let root = write_ambient_api_probe_bundle("ambient-api-probe");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AmbientReport"),
        Some(&serde_json::json!({
            "document": "undefined",
            "fetch": "undefined",
            "process": "undefined",
            "require": "undefined",
            "setTimeout": "undefined",
            "window": "undefined",
            "worker": "undefined"
        }))
    );
}

#[test]
fn systems_host_should_expose_mesh_picking_service() {
    let root = write_picking_bundle("picking-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");
    assert_eq!(
        bundle.world.resources.get("PickReport"),
        Some(&serde_json::json!({ "entity": "crate", "hit": true }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| entry.kind == "service" && entry.service.as_deref() == Some("picking.mesh"))
        .expect("picking service call should be logged");
    assert_eq!(service_entry.kind, "service");
    assert_eq!(service_entry.service.as_deref(), Some("picking.mesh"));
}

#[test]
fn systems_host_should_expose_pointer_ray_service() {
    let root = write_picking_bundle("pointer-ray-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PickReport"),
        Some(&serde_json::json!({ "entity": "crate", "hit": true }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(service_names, vec!["picking.mesh", "picking.pointerRay"]);
}

#[test]
fn systems_host_should_expose_asset_lookup_and_load_service() {
    let root = write_asset_service_bundle("asset-service-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AssetReport"),
        Some(&serde_json::json!({
            "first": "mesh.crate",
            "loaded": true,
            "missing": "missing",
            "total": 1
        }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| entry.kind == "service" && entry.service.as_deref() == Some("assets.load"))
        .expect("asset load service call should be logged");
    assert_eq!(service_entry.service.as_deref(), Some("assets.load"));
}

#[test]
fn systems_host_should_expose_character_move_service() {
    let root = write_character_service_bundle("character-move-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("CharacterReport"),
        Some(&serde_json::json!({
            "entity": "player",
            "grounded": true,
            "ground": "floor",
            "resolved": [1, 0.05, 0]
        }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| entry.kind == "service" && entry.service.as_deref() == Some("character.move"))
        .expect("character move service call should be logged");
    assert_eq!(service_entry.service.as_deref(), Some("character.move"));
    let expected_request = serde_json::json!({
        "entity": "player",
        "options": { "direction": [1, 0], "fixedDelta": 0.5, "speed": 2 }
    });
    assert_eq!(
        service_entry
            .payload
            .as_ref()
            .and_then(|payload| payload.get("request")),
        Some(&expected_request)
    );
}

#[test]
fn systems_host_should_enter_low_step_contact_before_center_reaches_tread() {
    let root = write_character_step_service_bundle("character-step-leading-edge");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("CharacterReport"),
        Some(&serde_json::json!({
            "blockedBy": null,
            "ground": "floor",
            "resolved": [0.6, 0, 0]
        }))
    );
}

#[test]
fn systems_host_should_patch_character_pushed_entity_outside_default_query() {
    let root = write_character_push_service_bundle("character-push-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PushReport"),
        Some(&serde_json::json!({
            "ballPosition": [4, 1, 0],
            "pushed": "light-crate",
            "queryIds": ["player"]
        }))
    );
    assert_eq!(
        entity_position(&bundle, "light-crate"),
        Some([4.0, 1.0, 0.0])
    );
}

#[test]
fn systems_host_should_translate_humanoid_course_player_from_keyboard_forward() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../examples/humanoid-physics-course/dist/humanoid-physics-course.bundle");
    let mut bundle = load_bundle(&root).expect("humanoid course bundle should load");
    let input = bundle
        .input
        .clone()
        .expect("humanoid course should include input");
    let mut state = NativeInputState::default();
    map_keyboard_event(&input, "KeyW", true, &mut state);
    assert_eq!(state.axis("MoveZ"), -1.0);

    let before = entity_position(&bundle, "player").expect("player should have a transform");
    let run = run_native_systems_frame_with_input(
        &mut bundle,
        &mut NativeGameLoopState::new(false),
        NativeGameLoopRunOptions {
            delta: 1.0 / 60.0,
            fixed_delta: 1.0 / 60.0,
            input: Some(&state),
            paused: false,
        },
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("humanoid course systems should run");
    let after = entity_position(&bundle, "player").expect("player should still have a transform");

    assert!(
        after[2] < before[2] - 0.001,
        "expected KeyW to move player forward on -Z, before={before:?}, after={after:?}, logs={:?}",
        run.logs
    );
}

#[test]
fn systems_host_should_expose_physics_raycast_service() {
    let root = write_physics_raycast_service_bundle("physics-raycast-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    let run = run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(1.0 / 60.0, 1.0 / 60.0, false),
        step_bundle_physics_with_script_poses,
    )
    .expect("system should synchronously query retained Rapier");

    assert_eq!(
        bundle.world.resources.get("RaycastReport"),
        Some(&serde_json::json!({
            "distance": 3.5,
            "entity": "wall",
            "hit": true,
            "point": [0, 1, -3.5]
        }))
    );
    let service_entry = run.logs[0]
        .entries
        .iter()
        .find(|entry| {
            entry.kind == "service" && entry.service.as_deref() == Some("physics.raycast")
        })
        .expect("physics raycast service call should be logged");
    let expected_request = serde_json::json!({
        "direction": [0, 0, -2],
        "ignore": ["player"],
        "mask": ["world"],
        "maxDistance": 10,
        "origin": [0, 1, 0]
    });
    assert_eq!(
        service_entry
            .payload
            .as_ref()
            .and_then(|payload| payload.get("request")),
        Some(&expected_request)
    );
}

#[test]
fn systems_host_physics_queries_should_use_retained_rapier_compound_children() {
    let root = write_live_compound_query_bundle("live-compound-query-context");
    let mut bundle = load_bundle(&root).expect("scripted compound bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(1.0 / 60.0, 1.0 / 60.0, false),
        step_bundle_physics_with_script_poses,
    )
    .expect("all physics services should synchronously query retained Rapier");

    let report = bundle
        .world
        .resources
        .get("LiveQueryReport")
        .expect("query report should be written");
    assert_eq!(report["ray"]["entity"], "wall");
    assert_eq!(report["ray"]["child"], "left");
    assert_eq!(report["ray"]["hit"], true);
    assert_eq!(report["gap"], serde_json::json!({ "hit": false }));
    assert_eq!(
        report["wrongQueryLayer"],
        serde_json::json!({ "hit": false })
    );
    assert_eq!(report["shape"]["entity"], "wall");
    assert_eq!(report["shape"]["child"], "left");
    assert_eq!(
        report["overlap"],
        serde_json::json!({ "entities": ["wall"] })
    );
}

#[test]
fn systems_host_physics_queries_should_reject_hosts_without_a_retained_world() {
    let root = write_physics_raycast_service_bundle("physics-query-without-live-world");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let error = run_native_systems_once(&mut bundle, time())
        .expect_err("snapshot-only host must not fabricate a conservative physics hit");

    assert_eq!(error.code, "TN_BEVY_SYSTEM_SCRIPT_EXECUTION_FAILED");
    assert!(
        error
            .message
            .contains("TN_BEVY_PHYSICS_QUERY_WORLD_UNAVAILABLE")
    );
}

#[test]
fn systems_host_should_expose_physics_sensor_service() {
    let root = write_physics_sensor_service_bundle("physics-sensor-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("SensorReport"),
        Some(&serde_json::json!({
            "occupants": ["player"],
            "phase": "enter",
            "sensor": "hazard"
        }))
    );
}

#[test]
fn systems_host_should_preserve_sensor_phases_across_native_fixed_ticks() {
    let root = write_physics_sensor_service_bundle("physics-sensor-phases");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(1.0 / 60.0, 1.0 / 60.0, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("enter tick should run");
    assert_eq!(
        bundle
            .world
            .resources
            .get("SensorReport")
            .and_then(|value| value.get("phase")),
        Some(&serde_json::json!("enter"))
    );

    bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == "player")
        .expect("player should exist")
        .components
        .transform
        .as_mut()
        .expect("player transform should exist")
        .position = Some([20.0, 0.02, 4.15]);
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(1.0 / 60.0, 1.0 / 60.0, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("exit tick should run");
    assert_eq!(
        bundle
            .world
            .resources
            .get("SensorReport")
            .and_then(|value| value.get("phase")),
        Some(&serde_json::json!("exit"))
    );
}

#[test]
fn systems_host_should_expose_audio_facade() {
    let root = write_audio_facade_service_bundle("audio-facade-context");
    let mut bundle = load_bundle(&root).expect("audio facade bundle should load");
    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AudioReport"),
        Some(&serde_json::json!({
            "playbackId": "sound.hit#1",
            "playStatus": "playing",
            "stopStatus": "stopped"
        }))
    );
    let service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    assert_eq!(service_names, vec!["audio.play", "audio.stop"]);
}

#[test]
fn systems_host_should_expose_persistence_and_settings_facades() {
    let root = write_persistence_settings_bundle("persistence-settings-context");
    let mut bundle = load_bundle(&root).expect("persistence settings bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PersistenceReport"),
        Some(&serde_json::json!({
            "difficulty": "hard",
            "loadedScore": 7,
            "saved": true,
            "slots": ["slot.auto"],
            "volume": 0.5
        }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(
        service_names,
        vec![
            "persistence.listSlots",
            "persistence.load",
            "persistence.save",
            "settings.get",
            "settings.get",
            "settings.set",
        ]
    );
}

#[test]
fn systems_host_should_expose_retained_ui_facade() {
    let root = write_ui_facade_bundle("ui-facade-context");
    let mut bundle = load_bundle(&root).expect("ui facade bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("UiReport"),
        Some(&serde_json::json!({
            "action": "StartGame",
            "disabled": true,
            "focused": true,
            "previousFocus": "play",
            "value": 0.75
        }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(
        service_names,
        vec![
            "ui.activate",
            "ui.focus",
            "ui.read",
            "ui.read",
            "ui.setDisabled",
            "ui.setValue",
        ]
    );
}

#[test]
fn systems_host_should_expose_animation_query_and_stop_services() {
    let root = write_animation_control_service_bundle("animation-control-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("AnimationReport"),
        Some(&serde_json::json!({
            "active": true,
            "clip": "run",
            "entity": "player",
            "postStopActive": false,
            "postStopReason": "requested",
            "stopped": true
        }))
    );
    let mut service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    service_names.sort();
    assert_eq!(
        service_names,
        vec![
            "animation.play",
            "animation.query",
            "animation.query",
            "animation.stop"
        ]
    );
}

#[test]
fn systems_host_should_expose_bounded_particle_command_services() {
    let root = write_particle_service_bundle("particle-command-context");
    let mut bundle = load_bundle(&root).expect("particle command bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("ParticleReport"),
        Some(&serde_json::json!({
            "burstCount": 8,
            "burstStatus": "burst",
            "clearStatus": "cleared",
            "emitCount": 8,
            "emitStatus": "emitted",
            "playCount": 4,
            "playStatus": "played",
            "resetStatus": "reset",
            "startCount": 4,
            "startStatus": "started",
            "stopStatus": "stopped"
        }))
    );
    let service_names: Vec<_> = run.logs[0]
        .entries
        .iter()
        .filter_map(|entry| entry.service.as_deref())
        .collect();
    assert_eq!(
        service_names,
        vec![
            "particles.burst",
            "particles.clear",
            "particles.emit",
            "particles.play",
            "particles.reset",
            "particles.start",
            "particles.stop"
        ]
    );
}

#[test]
fn should_stop_animation_state_when_stop_service_is_called() {
    let root = write_animation_control_service_bundle("animation-control-stop-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");
    let post_stop_query = run.logs[0]
        .entries
        .iter()
        .filter(|entry| {
            entry.kind == "service" && entry.service.as_deref() == Some("animation.query")
        })
        .filter_map(|entry| entry.payload.as_ref())
        .filter_map(|payload| payload.get("result"))
        .find(|result| {
            result.get("active") == Some(&serde_json::json!(false))
                && result.get("stopReason") == Some(&serde_json::json!("requested"))
        })
        .expect("post-stop query result should be logged");

    assert_eq!(
        post_stop_query,
        &serde_json::json!({
            "active": false,
            "activeState": "run",
            "clip": "run",
            "entity": "player",
            "loop": true,
            "normalizedTime": 0,
            "sourceClip": "run",
            "speed": 1.5,
            "stopped": true,
            "stopReason": "requested",
            "timeSeconds": 0
        })
    );
}

#[test]
fn systems_host_should_expose_seeded_random_helpers() {
    let root = write_random_bundle("random-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    let first = bundle
        .world
        .resources
        .get("RandomReport")
        .expect("random report should be written")
        .clone();
    let mut second_bundle = load_bundle(&root).expect("scripted bundle should load again");
    run_native_systems_once(&mut second_bundle, time()).expect("system should run again");
    assert_eq!(
        second_bundle.world.resources.get("RandomReport"),
        Some(&first)
    );
}

#[test]
fn systems_host_should_expose_timer_helpers() {
    let root = write_timer_bundle("timer-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("TimerReport"),
        Some(&serde_json::json!({
            "done": true,
            "elapsed": 1.5,
            "progress": 0.75,
            "ready": false,
            "remaining": 0.5
        }))
    );
}

#[test]
fn systems_host_should_flush_delayed_commands_after_fixed_ticks() {
    let root = write_delayed_command_bundle("delayed-command-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("first fixed tick should enqueue delayed command");
    assert!(
        !bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "marker")
    );

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("second fixed tick should keep command pending");
    assert!(
        !bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "marker")
    );

    let run = run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("third fixed tick should flush delayed command");

    let marker = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "marker")
        .expect("delayed command should spawn marker");
    assert!(marker.components.transform.is_some());
    assert!(run.logs.iter().any(|log| {
        log.entries.iter().any(|entry| {
            entry.kind == "command"
                && entry.command.as_deref() == Some("spawn")
                && entry.entity.as_deref() == Some("marker")
                && entry.tick == 2
        })
    }));
    assert_eq!(
        state
            .delayed_command_observations
            .iter()
            .map(|observation| observation.status.as_str())
            .collect::<Vec<_>>(),
        vec!["enqueued", "pending", "flushed"]
    );
}

#[test]
fn systems_host_should_apply_query_metadata() {
    let root = write_query_metadata_bundle("query-metadata-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("QueryReport"),
        Some(&serde_json::json!({ "ids": ["player"] }))
    );
}

#[test]
fn systems_host_should_run_startup_before_update() {
    let root = write_startup_bundle("startup-order");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("systems should run");

    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&serde_json::json!({ "value": 6 }))
    );
    assert_eq!(run.logs.len(), 2);
    assert_eq!(run.logs[0].entries[0].system, "bootScore");
    assert_eq!(run.logs[0].entries[0].schedule, "startup");
    assert_eq!(run.logs[1].entries[0].system, "score");
    assert_eq!(run.logs[1].entries[0].schedule, "update");
}

#[test]
fn systems_host_should_run_startup_once_when_native_loop_advances_multiple_frames() {
    let root = write_loop_state_bundle("loop-startup-once");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();
    let mut physics_steps = 0;

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| physics_steps += 1,
    )
    .expect("first frame should run");
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| physics_steps += 1,
    )
    .expect("second frame should run");

    assert_eq!(
        bundle.world.resources.get("LoopCounts"),
        Some(&serde_json::json!({
            "fixed": 2,
            "post": 2,
            "startup": 1,
            "update": 2
        }))
    );
    assert_eq!(physics_steps, 2);
    assert_eq!(state.frame, 2);
    assert_eq!(state.tick, 2);
    assert!(state.startup_complete);
}

#[test]
fn systems_host_should_run_fixed_update_once_per_accumulated_fixed_tick() {
    let root = write_loop_state_bundle("loop-fixed-accumulator");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();
    let mut physics_steps = 0;

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.6, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| physics_steps += 1,
    )
    .expect("frame should run");

    assert_eq!(
        bundle.world.resources.get("LoopCounts"),
        Some(&serde_json::json!({
            "fixed": 2,
            "post": 1,
            "startup": 1,
            "update": 1
        }))
    );
    assert_eq!(physics_steps, 2);
    assert!((state.accumulator - 0.1).abs() < f32::EPSILON * 8.0);
    assert_eq!(state.tick, 2);
    assert_eq!(state.frame, 1);
}

#[test]
fn systems_host_should_consume_fixed_update_body_writes_in_the_same_physics_tick() {
    let root = write_fixed_physics_command_bundle("loop-fixed-physics-command");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(1.0, 1.0, false),
        step_bundle_physics_with_script_poses,
    )
    .expect("fixed physics frame should run");

    assert!(
        entity_position(&bundle, "box").unwrap()[0] > 1.9,
        "fixed-update velocity must affect the current solver step"
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_consume_fixed_update_impulses_in_the_same_physics_tick() {
    let root = write_fixed_physics_impulse_bundle("loop-fixed-physics-impulse");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        step_bundle_physics_with_script_poses,
    )
    .expect("fixed physics frame should run");

    assert!(
        entity_position(&bundle, "box").unwrap()[0] > 0.24,
        "fixed-update impulse must affect the current solver step"
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_apply_point_force_and_impulse_in_the_same_fixed_tick() {
    let root = write_fixed_physics_at_point_bundle("loop-fixed-physics-at-point");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        step_bundle_physics_with_script_poses,
    )
    .expect("fixed point-force frame should run");

    let body = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "box")
        .and_then(|entity| entity.components.rigid_body.as_ref())
        .expect("dynamic body should remain");
    assert!(body.velocity.expect("linear velocity")[0] > 1.2);
    assert!(body.angular_velocity.expect("angular velocity")[2] < -1.0);
    assert_eq!(
        bundle.world.resources.get("PointCommandReport"),
        Some(&serde_json::json!({
            "force": { "accepted": true, "entity": "box", "status": "applied" },
            "impulse": { "accepted": true, "entity": "box", "status": "applied" },
            "missingPoint": { "accepted": false, "entity": "box", "status": "invalid-vector" }
        }))
    );
    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn systems_host_should_clamp_fixed_update_catchup_steps() {
    let root = write_loop_state_bundle("loop-fixed-clamp");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();
    let mut physics_steps = 0;

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(10.0, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| physics_steps += 1,
    )
    .expect("frame should run");

    assert_eq!(
        bundle.world.resources.get("LoopCounts"),
        Some(&serde_json::json!({
            "fixed": 5,
            "post": 1,
            "startup": 1,
            "update": 1
        }))
    );
    assert_eq!(physics_steps, 5);
    assert_eq!(state.accumulator, 0.0);
    assert_eq!(state.tick, 5);
    assert_eq!(state.frame, 1);
}

#[test]
fn systems_host_should_skip_gameplay_schedules_while_native_loop_is_paused() {
    let root = write_loop_state_bundle("loop-paused");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();
    let mut physics_steps = 0;

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(1.0, 0.25, true),
        |_bundle, _fixed_delta, _script_posed_entities| physics_steps += 1,
    )
    .expect("paused frame should be accounted");

    assert_eq!(
        bundle.world.resources.get("LoopCounts"),
        Some(&serde_json::json!({
            "fixed": 0,
            "post": 0,
            "startup": 0,
            "update": 0
        }))
    );
    assert_eq!(physics_steps, 0);
    assert_eq!(state.elapsed, 1.0);
    assert_eq!(state.accumulator, 0.0);
    assert_eq!(state.frame, 1);
    assert_eq!(state.tick, 0);
    assert!(!state.startup_complete);
    assert!(state.paused);
}

#[test]
fn systems_host_should_carry_script_posed_entities_to_next_physics_step() {
    let root = write_bundle("loop-script-pose-skip", "system_movePlayer");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    let run = run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.1, 0.25, false),
        |_bundle, _fixed_delta, script_posed_entities| {
            assert!(script_posed_entities.is_empty());
        },
    )
    .expect("first frame should run update");

    assert!(run.transform_patches.contains("player"));
    assert!(state.script_posed_entities.contains("player"));

    let mut saw_script_pose = false;
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, script_posed_entities| {
            saw_script_pose = script_posed_entities.contains("player");
        },
    )
    .expect("second frame should run physics");

    assert!(saw_script_pose);
    assert!(state.script_posed_entities.contains("player"));
}

#[test]
fn systems_host_should_expose_interpolated_fixed_transforms_to_update_reads() {
    let root = write_interpolated_update_read_bundle("loop-interpolated-update-read");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");
    let mut state = NativeGameLoopState::default();

    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.25, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("first frame should run");
    run_native_systems_frame_with_input(
        &mut bundle,
        &mut state,
        loop_options(0.125, 0.25, false),
        |_bundle, _fixed_delta, _script_posed_entities| {},
    )
    .expect("partial frame should run");

    assert_eq!(entity_position(&bundle, "mover"), Some([10.0, 0.0, 0.0]));
    assert_eq!(entity_position(&bundle, "camera"), Some([5.0, 0.0, 0.0]));
}

#[test]
fn systems_host_should_run_systems_using_ordering_constraints() {
    let root = write_ordering_bundle("ordering-constraints");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("systems should run");

    assert_eq!(
        bundle.world.resources.get("Order"),
        Some(&serde_json::json!({ "values": ["collectInput", "applyDamage", "score"] }))
    );
    assert_eq!(run.logs.len(), 3);
    assert_eq!(run.logs[0].entries[0].system, "collectInput");
    assert_eq!(run.logs[1].entries[0].system, "applyDamage");
    assert_eq!(run.logs[2].entries[0].system, "score");
}

#[test]
fn systems_host_should_reconcile_spawned_entities_events_and_resources_across_schedules() {
    let root = write_gameplay_host_bundle("gameplay-host");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("systems should run");

    assert!(
        bundle
            .world
            .entities
            .iter()
            .all(|entity| entity.id != "marker")
    );
    assert_eq!(
        bundle.world.resources.get("Score"),
        Some(&serde_json::json!({ "events": 2, "health": 1 }))
    );
    assert!(!bundle.world.events.contains_key("Spawned"));
}

#[test]
fn systems_host_should_expose_fixed_trace_tasks_and_channels() {
    let root = write_task_channel_bundle("task-channel");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let run = run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert!(!bundle.world.events.contains_key("LifecycleEvent"));
    assert_eq!(run.logs[0].entries[0].kind, "event");
    assert_eq!(
        run.logs[0].entries[0].payload,
        Some(serde_json::json!({ "phase": "next", "taskChannel": "lifecycle", "taskCount": 1 }))
    );
}

#[test]
fn systems_host_should_expose_plugin_composition_metadata() {
    let root = write_plugin_bundle("plugin-context");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    run_native_systems_once(&mut bundle, time()).expect("system should run");

    assert_eq!(
        bundle.world.resources.get("PluginReport"),
        Some(&serde_json::json!({
            "group": "gameplay",
            "hasCore": true,
            "pluginCount": 1,
            "systemCount": 1
        }))
    );
}

#[test]
fn systems_host_should_reject_missing_export() {
    let root = write_bundle("missing-export", "missing_export");
    let mut bundle = load_bundle(&root).expect("scripted bundle should load");

    let error =
        run_native_systems_once(&mut bundle, time()).expect_err("missing export should fail");

    assert_eq!(error.code, "TN_BEVY_SYSTEM_EXPORT_MISSING");
    assert!(error.message.contains("movePlayer"));
    assert!(error.message.contains("missing_export"));
}

#[test]
fn systems_host_should_allow_bundle_without_script_host() {
    let root = write_bundle_without_scripts("without-scripts");
    let bundle = load_bundle(&root).expect("bundle should load");

    assert!(diagnose_native_system_host(&bundle).is_empty());
    ensure_native_system_host_supported(&bundle).expect("bundle without scripts should run");
}

#[test]
fn systems_host_should_keep_unsupported_diagnostic_for_unavailable_builds() {
    let diagnostic = unsupported_native_system_host_diagnostic("movePlayer");

    assert_eq!(diagnostic.code, "TN_BEVY_SYSTEM_HOST_UNSUPPORTED");
    assert_eq!(diagnostic.severity, "error");
    assert_eq!(diagnostic.system_id.as_deref(), Some("movePlayer"));
    assert!(diagnostic.message.contains("QuickJS host"));
}

fn loop_options(delta: f32, fixed_delta: f32, paused: bool) -> NativeGameLoopRunOptions<'static> {
    NativeGameLoopRunOptions {
        delta,
        fixed_delta,
        input: None,
        paused,
    }
}

fn write_loop_state_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
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
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "boot",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["LoopCounts"],
      "resourceWrites": ["LoopCounts"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_boot" }
    },
    {
      "name": "tick",
      "schedule": "fixedUpdate",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["LoopCounts"],
      "resourceWrites": ["LoopCounts"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_tick" }
    },
    {
      "name": "update",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["LoopCounts"],
      "resourceWrites": ["LoopCounts"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_update" }
    },
    {
      "name": "post",
      "schedule": "postUpdate",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["LoopCounts"],
      "resourceWrites": ["LoopCounts"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_post" }
    }
  ]
}"#,
    );
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

fn write_fixed_physics_command_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [{
    "id": "box",
    "components": {
      "Collider": { "kind": "box", "size": [1, 1, 1] },
      "RigidBody": { "gravityScale": 0, "kind": "dynamic", "velocity": [0, 0, 0] },
      "Transform": { "position": [0, 0, 0] }
    }
  }],
  "resources": {}
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [{
    "name": "accelerate",
    "schedule": "fixedUpdate",
    "reads": [],
    "writes": ["RigidBody"],
    "queries": [],
    "commands": [],
    "eventReads": [],
    "eventWrites": [],
    "resourceReads": [],
    "resourceWrites": [],
    "services": [],
    "script": { "bundle": "scripts.bundle.js", "exportName": "system_accelerate" }
  }]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_accelerate = (ctx) => {
  ctx.entity("box").patch("RigidBody", { velocity: [2, 0, 0] });
};
export const systemIds = Object.freeze({ "system_accelerate": "accelerate" });
export const systems = Object.freeze({ "system_accelerate": system_accelerate });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_fixed_physics_impulse_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [{
    "id": "box",
    "components": {
      "Collider": { "kind": "box", "size": [1, 1, 1] },
      "RigidBody": { "gravityScale": 0, "kind": "dynamic", "mass": 2, "velocity": [0, 0, 0] },
      "Transform": { "position": [0, 0, 0] }
    }
  }],
  "resources": {}
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [{
    "name": "impulse",
    "schedule": "fixedUpdate",
    "reads": [],
    "writes": [],
    "queries": [],
    "commands": [],
    "eventReads": [],
    "eventWrites": [],
    "resourceReads": [],
    "resourceWrites": [],
    "services": ["physics.applyImpulse"],
    "script": { "bundle": "scripts.bundle.js", "exportName": "system_impulse" }
  }]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_impulse = (ctx) => {
  ctx.physics.applyImpulse("box", [2, 0, 0]);
};
export const systemIds = Object.freeze({ "system_impulse": "impulse" });
export const systems = Object.freeze({ "system_impulse": system_impulse });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_fixed_physics_at_point_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [{
    "id": "box",
    "components": {
      "Collider": { "kind": "box", "size": [1, 1, 1] },
      "RigidBody": { "gravityScale": 0, "kind": "dynamic", "mass": 2, "velocity": [0, 0, 0] },
      "Transform": { "position": [0, 0, 0] }
    }
  }],
  "resources": { "PointCommandReport": {} }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [{
    "name": "pointCommands",
    "schedule": "fixedUpdate",
    "reads": [],
    "writes": [],
    "queries": [],
    "commands": [],
    "eventReads": [],
    "eventWrites": [],
    "resourceReads": ["PointCommandReport"],
    "resourceWrites": ["PointCommandReport"],
    "services": ["physics.addForceAtPoint", "physics.applyImpulseAtPoint"],
    "script": { "bundle": "scripts.bundle.js", "exportName": "system_pointCommands" }
  }]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_pointCommands = (ctx) => {
  ctx.resources.set("PointCommandReport", {
    force: ctx.physics.addForceAtPoint("box", [2, 0, 0], [0, 1, 0]),
    impulse: ctx.physics.applyImpulseAtPoint("box", [2, 0, 0], [0, 1, 0]),
    missingPoint: ctx.physics.applyImpulseAtPoint("box", [2, 0, 0])
  });
};
export const systemIds = Object.freeze({ "system_pointCommands": "pointCommands" });
export const systems = Object.freeze({ "system_pointCommands": system_pointCommands });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_interpolated_update_read_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
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
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "tick",
      "schedule": "fixedUpdate",
      "reads": ["Transform"],
      "writes": ["Transform"],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_tick" }
    },
    {
      "name": "updateCamera",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": ["Transform"],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_updateCamera" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_tick = (ctx) => {
  const transform = ctx.entity("mover").transform();
  const position = transform.position;
  transform.position = [position[0] + 10, 0, 0];
};
const system_updateCamera = (ctx) => {
  const moverPosition = ctx.entity("mover").transform().position;
  ctx.entity("camera").transform().position = [moverPosition[0], 0, 0];
};
export const systemIds = Object.freeze({ "system_tick": "tick", "system_updateCamera": "updateCamera" });
export const systems = Object.freeze({ "system_tick": system_tick, "system_updateCamera": system_updateCamera });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_startup_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Score": { "value": 3 }
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "score",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_score" }
    },
    {
      "name": "bootScore",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_bootScore" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_bootScore = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 1 });
};
const system_score = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 2 });
};
export const systemIds = Object.freeze({ "system_bootScore": "bootScore", "system_score": "score" });
export const systems = Object.freeze({ "system_bootScore": system_bootScore, "system_score": system_score });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_resource_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Score": { "value": 1 }
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "score",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_score" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_score = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 2 });
};
export const systemIds = Object.freeze({ "system_score": "score" });
export const systems = Object.freeze({ "system_score": system_score });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_ambient_api_probe_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {}
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "ambientProbe",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": ["AmbientReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_ambientProbe" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_ambientProbe = (ctx) => {
  ctx.resources.set("AmbientReport", {
    document: typeof globalThis.document,
    fetch: typeof globalThis.fetch,
    process: typeof globalThis.process,
    require: typeof globalThis.require,
    setTimeout: typeof globalThis.setTimeout,
    window: typeof globalThis.window,
    worker: typeof globalThis.Worker
  });
};
export const systemIds = Object.freeze({ "system_ambientProbe": "ambientProbe" });
export const systems = Object.freeze({ "system_ambientProbe": system_ambientProbe });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_ordering_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Order": { "values": [] }
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "score",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Order"],
      "resourceWrites": ["Order"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_score" }
    },
    {
      "name": "applyDamage",
      "schedule": "update",
      "after": ["collectInput"],
      "before": ["score"],
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Order"],
      "resourceWrites": ["Order"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_applyDamage" }
    },
    {
      "name": "collectInput",
      "schedule": "update",
      "before": ["applyDamage"],
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Order"],
      "resourceWrites": ["Order"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_collectInput" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const append = (ctx, value) => {
  const order = ctx.resources.get("Order");
  ctx.resources.set("Order", { values: [...order.values, value] });
};
const system_score = (ctx) => append(ctx, "score");
const system_applyDamage = (ctx) => append(ctx, "applyDamage");
const system_collectInput = (ctx) => append(ctx, "collectInput");
export const systems = Object.freeze({
  "system_score": system_score,
  "system_applyDamage": system_applyDamage,
  "system_collectInput": system_collectInput
});
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_picking_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[
  { "id": "mesh.crate", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] }
]}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "camera.main",
      "components": {
        "Transform": { "position": [0, 0, 4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Camera": { "kind": "perspective", "fovY": 60, "near": 0.1, "far": 100 }
      }
    },
    {
      "id": "crate",
      "components": {
        "Transform": { "position": [0, 0.05, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "MeshRenderer": { "mesh": "mesh.crate", "material": "mat.crate" }
      }
    }
  ],
  "resources": {
    "ActiveCamera": { "entity": "camera.main" },
    "PickReport": { "hit": false }
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "pick",
      "schedule": "update",
      "reads": ["Transform", "MeshRenderer", "Camera"],
      "writes": [],
      "queries": [
        { "with": ["Transform", "MeshRenderer"], "without": [] },
        { "with": ["Camera"], "without": [] }
      ],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": ["PickReport"],
      "services": ["picking.mesh", "picking.pointerRay"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_pick" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_pick = (ctx) => {
  const ray = ctx.picking.pointerRay({ pointer: [0.5, 0.5] });
  const result = ray.hit ? ctx.picking.mesh(ray) : { hit: false };
  ctx.resources.set("PickReport", { hit: result.hit, entity: result.hit ? result.entity : null });
};
export const systemIds = Object.freeze({ "system_pick": "pick" });
export const systems = Object.freeze({ "system_pick": system_pick });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_asset_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[
  { "id": "mesh.crate", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] }
]}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "AssetReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportAssets",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["AssetReport"],
      "resourceWrites": ["AssetReport"],
      "services": ["assets.load"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportAssets" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportAssets = (ctx) => {
  const list = ctx.assets.list();
  const ready = ctx.assets.load("mesh.crate");
  const missing = ctx.assets.load("mesh.missing");
  ctx.resources.set("AssetReport", {
    first: ctx.assets.get("mesh.crate").id,
    loaded: ready.accepted && ready.asset.id === "mesh.crate",
    missing: missing.status,
    total: list.length
  });
};
export const systemIds = Object.freeze({ "system_reportAssets": "reportAssets" });
export const systems = Object.freeze({ "system_reportAssets": system_reportAssets });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_character_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "floor",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [8, 0.1, 8], "layer": "world", "mask": ["player"] },
        "RigidBody": { "kind": "static" }
      }
    },
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, -0.1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "center": [0, 0.9, 0], "height": 1.8, "kind": "capsule", "layer": "player", "mask": ["world"], "radius": 0.25 },
        "RigidBody": { "kind": "kinematic" },
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2,
          "stepOffset": 0.25
        }
      }
    }
  ],
  "resources": {
    "CharacterReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "moveCharacter",
      "schedule": "update",
      "reads": ["Transform", "Collider", "RigidBody", "CharacterController"],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["CharacterReport"],
      "resourceWrites": ["CharacterReport"],
      "services": ["character.move"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_moveCharacter" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_moveCharacter = (ctx) => {
  const result = ctx.character.move("player", { direction: [1, 0], fixedDelta: 0.5, speed: 2 });
  const rounded = result.resolved.map((value) => Number(value.toFixed(6)));
  ctx.resources.set("CharacterReport", {
    entity: result.entity,
    grounded: result.grounded,
    ground: result.groundEntity,
    resolved: rounded
  });
};
export const systemIds = Object.freeze({ "system_moveCharacter": "moveCharacter" });
export const systems = Object.freeze({ "system_moveCharacter": system_moveCharacter });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_character_step_service_bundle(name: &str) -> PathBuf {
    let root = write_character_service_bundle(name);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "floor",
      "components": {
        "Transform": { "position": [0, -0.05, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [6, 0.1, 6], "layer": "world", "mask": ["player"] },
        "RigidBody": { "kind": "static" }
      }
    },
    {
      "id": "step",
      "components": {
        "Transform": { "position": [1.2, 0.2, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [1, 0.4, 1], "layer": "world", "mask": ["player"] },
        "RigidBody": { "kind": "static" }
      }
    },
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "center": [0, 1, 0], "kind": "box", "size": [1, 2, 1], "layer": "player", "mask": ["world"] },
        "RigidBody": { "kind": "kinematic" },
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "speed": 2,
          "stepOffset": 0.5
        }
      }
    }
  ],
  "resources": {
    "CharacterReport": {}
  }
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_moveCharacter = (ctx) => {
  const result = ctx.character.move("player", { direction: [1, 0], fixedDelta: 0.3, speed: 2 });
  ctx.resources.set("CharacterReport", {
    blockedBy: result.blockedBy ?? null,
    ground: result.groundEntity,
    resolved: result.resolved.map((value) => Number(value.toFixed(6)))
  });
};
export const systemIds = Object.freeze({ "system_moveCharacter": "moveCharacter" });
export const systems = Object.freeze({ "system_moveCharacter": system_moveCharacter });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_character_push_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "floor",
      "components": {
        "Transform": { "position": [0, -0.1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [8, 0.1, 8], "layer": "world", "mask": ["player"] },
        "RigidBody": { "kind": "static" }
      }
    },
    {
      "id": "light-crate",
      "components": {
        "Transform": { "position": [2, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "layer": "pushable", "size": [1, 2, 1] },
        "RigidBody": { "kind": "dynamic", "mass": 2 }
      }
    },
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "layer": "player", "mask": ["world", "pushable"], "size": [1, 2, 1] },
        "RigidBody": { "kind": "kinematic" },
        "CharacterController": {
          "blocking": true,
          "grounding": "raycast",
          "moveXAxis": "MoveX",
          "moveZAxis": "MoveZ",
          "pushPolicy": { "allowedLayers": ["pushable"], "blockedWhenTooHeavy": true, "enabled": true, "impulseScale": 1, "maxPushMass": 10, "minMoveSpeed": 0.1 },
          "speed": 2
        },
        "CoursePlayer": { "enabled": true }
      }
    }
  ],
  "resources": {
    "PushReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "pushCharacter",
      "schedule": "update",
      "reads": ["CoursePlayer"],
      "writes": ["Transform"],
      "queries": [{ "with": ["CoursePlayer"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["PushReport"],
      "resourceWrites": ["PushReport"],
      "services": ["character.move"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_pushCharacter" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_pushCharacter = (ctx) => {
  const queryIds = ctx.query().map((entity) => entity.id);
  const result = ctx.character.move("player", { direction: [1, 0], fixedDelta: 1, speed: 2 });
  const target = result.pushed && ctx.entity(result.pushed.entity);
  if (target) {
    target.transform().setPose(result.pushed.position, [0, 0, 0, 1]);
  }
  ctx.resources.set("PushReport", {
    ballPosition: ctx.entity("light-crate").get("Transform").position,
    pushed: result.pushed ? result.pushed.entity : null,
    queryIds
  });
};
export const systemIds = Object.freeze({ "system_pushCharacter": "pushCharacter" });
export const systems = Object.freeze({ "system_pushCharacter": system_pushCharacter });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_physics_raycast_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [0.5, 1, 0.5], "layer": "player", "mask": ["world"] }
      }
    },
    {
      "id": "wall",
      "components": {
        "Transform": { "position": [0, 1, -4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "size": [2, 2, 1], "layer": "world", "mask": ["player"] },
        "RigidBody": { "kind": "static" }
      }
    }
  ],
  "resources": {
    "RaycastReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "raycastPhysics",
      "schedule": "update",
      "reads": ["Transform", "Collider"],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["RaycastReport"],
      "resourceWrites": ["RaycastReport"],
      "services": ["physics.raycast"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_raycastPhysics" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_raycastPhysics = (ctx) => {
  const result = ctx.physics.raycast({
    direction: [0, 0, -2],
    ignore: ["player"],
    mask: ["world"],
    maxDistance: 10,
    origin: [0, 1, 0]
  });
  ctx.resources.set("RaycastReport", {
    distance: result.distance,
    entity: result.entity,
    hit: result.hit,
    point: result.point
  });
};
export const systemIds = Object.freeze({ "system_raycastPhysics": "raycastPhysics" });
export const systems = Object.freeze({ "system_raycastPhysics": system_raycastPhysics });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_live_compound_query_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "wall",
      "components": {
        "Transform": { "position": [0, 1, -4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "CompoundCollider": {
          "children": [
            { "id": "left", "filter": { "layer": "world", "mask": ["player"] }, "localPose": { "position": [-0.75, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.25 } },
            { "id": "right", "filter": { "layer": "secret", "mask": ["npc"] }, "localPose": { "position": [0.75, 0, 0] }, "shape": { "kind": "sphere", "radius": 0.25 } }
          ]
        },
        "RigidBody": { "kind": "static" }
      }
    }
  ],
  "resources": { "LiveQueryReport": {} }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "queryLiveCompound",
      "schedule": "update",
      "reads": ["CompoundCollider", "Transform"],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["LiveQueryReport"],
      "resourceWrites": ["LiveQueryReport"],
      "services": ["physics.overlap", "physics.raycast", "physics.shapeCast"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_queryLiveCompound" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_queryLiveCompound = (ctx) => {
  const filter = { mask: ["world"] };
  ctx.resources.set("LiveQueryReport", {
    gap: ctx.physics.raycast({ ...filter, direction: [0, 0, -1], maxDistance: 10, origin: [0, 1, 0] }),
    overlap: ctx.physics.overlap({ ...filter, position: [-0.75, 1, -4], shape: { kind: "sphere", radius: 0.3 } }),
    ray: ctx.physics.raycast({ ...filter, direction: [0, 0, -1], maxDistance: 10, origin: [-0.75, 1, 0] }),
    shape: ctx.physics.shapeCast({ ...filter, direction: [0, 0, -1], maxDistance: 10, origin: [-0.75, 1, 0], shape: { kind: "sphere", radius: 0.25 } }),
    wrongQueryLayer: ctx.physics.raycast({ direction: [0, 0, -1], layer: "npc", mask: ["world"], maxDistance: 10, origin: [-0.75, 1, 0] })
  });
};
export const systemIds = Object.freeze({ "system_queryLiveCompound": "queryLiveCompound" });
export const systems = Object.freeze({ "system_queryLiveCompound": system_queryLiveCompound });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_physics_sensor_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "hazard",
      "components": {
        "Transform": { "position": [0.5, 0.72, 4.15], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "layer": "hazard", "mask": ["player"], "sensor": { "interactionKind": "hazard", "phases": ["enter", "stay", "exit"], "trackOccupants": true }, "size": [1.55, 0.2, 0.28], "trigger": true },
        "RigidBody": { "kind": "kinematic" },
        "KinematicMover": { "axis": "x", "mode": "sine", "radius": 1, "speed": 1 }
      }
    },
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0.5, 0.02, 4.15], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "center": [0, 0.9, 0], "height": 1.8, "kind": "capsule", "layer": "player", "mask": ["hazard"], "radius": 0.32 },
        "CoursePlayer": { "hits": 0 }
      }
    }
  ],
  "resources": {
    "SensorReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "sensorPhysics",
      "schedule": "update",
      "reads": ["CoursePlayer", "KinematicMover"],
      "writes": [],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["SensorReport"],
      "resourceWrites": ["SensorReport"],
      "services": ["physics.sensor"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_sensorPhysics" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_sensorPhysics = (ctx) => {
  const result = ctx.physics.sensor({ sensor: "hazard", phases: ["enter", "stay", "exit"] });
  const event = result.events[0] || {};
  ctx.resources.set("SensorReport", {
    occupants: event.occupants || [],
    phase: event.phase || "",
    sensor: event.sensor || ""
  });
};
export const systemIds = Object.freeze({ "system_sensorPhysics": "sensorPhysics" });
export const systems = Object.freeze({ "system_sensorPhysics": system_sensorPhysics });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_audio_facade_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "audio-facade",
  "requiredCapabilities": {},
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json",
    "scripts": "scripts.bundle.js",
    "audio": "audio.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    { "id": "hit.sound", "kind": "audio", "format": "wav", "path": "assets/hit.wav" }
  ]
}"#,
    );
    fs::create_dir_all(root.join("assets")).expect("assets dir should exist");
    fs::write(root.join("assets/hit.wav"), b"").expect("audio asset should exist");
    write_json(
        &root,
        "audio.ir.json",
        r#"{
  "schema": "threenative.audio",
  "version": "0.1.0",
  "music": [],
  "oneShots": [{ "id": "sound.hit", "asset": "hit.sound", "event": "DamageEvent", "volume": 0.75 }]
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": { "AudioReport": {} }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "scriptAudio": [{ "id": "sound.hit" }],
  "systems": [
    {
      "name": "audioFacade",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["AudioReport"],
      "resourceWrites": ["AudioReport"],
      "services": ["audio.play", "audio.stop"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_audioFacade" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_audioFacade = (ctx) => {
  const play = ctx.audio.play("sound.hit", { entity: "player" });
  const stop = ctx.audio.stop(play.playbackId);
  ctx.resources.set("AudioReport", {
    playbackId: play.playbackId,
    playStatus: play.status,
    stopStatus: stop.status
  });
};
export const systemIds = Object.freeze({ "system_audioFacade": "audioFacade" });
export const systems = Object.freeze({ "system_audioFacade": system_audioFacade });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_animation_control_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "player",
      "components": {
        "PlayerState": { "hp": 3 },
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    }
  ],
  "resources": {
    "AnimationReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "animationControls",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["AnimationReport"],
      "resourceWrites": ["AnimationReport"],
      "services": ["animation.play", "animation.query", "animation.stop"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_animationControls" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_animationControls = (ctx) => {
  ctx.animation.play("player", "run", { durationSeconds: 2, loop: true, speed: 1.5 });
  const query = ctx.animation.query("player", "run");
  const stop = ctx.animation.stop("player");
  const postStop = ctx.animation.query("player", "run");
  ctx.resources.set("AnimationReport", {
    active: query.active,
    clip: query.clip,
    entity: query.entity,
    postStopActive: postStop.active,
    postStopReason: postStop.stopReason,
    stopped: stop.stopped
  });
};
export const systemIds = Object.freeze({ "system_animationControls": "animationControls" });
export const systems = Object.freeze({ "system_animationControls": system_animationControls });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_random_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Random": { "seed": "arena-1" },
    "RandomReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportRandom",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Random", "RandomReport"],
      "resourceWrites": ["RandomReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportRandom" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportRandom = (ctx) => {
  ctx.resources.set("RandomReport", {
    float: ctx.random.float(),
    range: ctx.random.range(10, 20),
    int: ctx.random.int(1, 6),
    bool: ctx.random.bool(0.75),
    pick: ctx.random.pick(["a", "b", "c"])
  });
};
export const systemIds = Object.freeze({ "system_reportRandom": "reportRandom" });
export const systems = Object.freeze({ "system_reportRandom": system_reportRandom });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_timer_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "TimerReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportTimers",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["TimerReport"],
      "resourceWrites": ["TimerReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportTimers" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportTimers = (ctx) => {
  ctx.resources.set("TimerReport", {
    done: ctx.timers.done(-0.5, 1.25),
    elapsed: ctx.timers.elapsed(-0.5),
    progress: ctx.timers.progress(-0.5, 2),
    ready: ctx.timers.ready(0.25, 1),
    remaining: ctx.timers.remaining(-0.5, 2)
  });
};
export const systemIds = Object.freeze({ "system_reportTimers": "reportTimers" });
export const systems = Object.freeze({ "system_reportTimers": system_reportTimers });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_delayed_command_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Started": { "value": false }
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "queueMarker",
      "schedule": "fixedUpdate",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "delayedCommands": [
        {
          "id": "spawnMarker",
          "maxDelayTicks": 3,
          "ownership": { "kind": "scene", "id": "arena" },
          "cancelPolicy": "drop",
          "command": { "kind": "spawn", "entity": "marker", "components": ["Transform"] }
        }
      ],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Started"],
      "resourceWrites": ["Started"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_queueMarker" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_queueMarker = (ctx) => {
  const started = ctx.resources.get("Started", { value: false });
  if (!started.value) {
    ctx.schedule.afterTicks({ id: "spawnMarker", delayTicks: 2 });
    ctx.resources.set("Started", { value: true });
  }
};
export const systemIds = Object.freeze({ "system_queueMarker": "queueMarker" });
export const systems = Object.freeze({ "system_queueMarker": system_queueMarker });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_query_metadata_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "enemy.b", "components": { "Transform": { "position": [0, 0, 0] } } },
    { "id": "enemy.a", "components": { "Transform": { "position": [0, 0, 0] }, "Health": { "current": 1 } } },
    { "id": "player", "components": { "Transform": { "position": [0, 0, 0] } } },
    { "id": "enemy.c", "components": { "Transform": { "position": [0, 0, 0] } } }
  ],
  "resources": {
    "__changed": { "entities": { "enemy.b": ["Transform"], "player": ["Transform"] } },
    "QueryReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportQuery",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": [],
      "queries": [
        { "with": ["Transform"], "without": ["Health"], "changed": ["Transform"], "orderBy": "id", "offset": 1, "limit": 1 }
      ],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["QueryReport"],
      "resourceWrites": ["QueryReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportQuery" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportQuery = (ctx) => {
  ctx.resources.set("QueryReport", { ids: ctx.query().map((entity) => entity.id) });
};
export const systemIds = Object.freeze({ "system_reportQuery": "reportQuery" });
export const systems = Object.freeze({ "system_reportQuery": system_reportQuery });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_gameplay_host_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "Score": { "value": 0 }
  },
  "events": {
    "Spawned": []
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "seedMarker",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [
        { "kind": "spawn", "entity": "marker", "components": ["Health"] },
        { "kind": "emitEvent", "event": "Spawned" }
      ],
      "eventReads": [],
      "eventWrites": ["Spawned"],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_seedMarker" }
    },
    {
      "name": "consumeMarker",
      "schedule": "update",
      "reads": ["Health"],
      "writes": [],
      "queries": [{ "with": ["Health"], "without": [] }],
      "commands": [
        { "kind": "despawn", "entity": "marker" }
      ],
      "eventReads": ["Spawned"],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["Score"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_consumeMarker" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_seedMarker = (ctx) => {
  ctx.commands.spawn("marker", { Health: { current: 1 } });
  ctx.events.emit("Spawned", { via: "direct" });
  ctx.commands.emitEvent("Spawned", { via: "command" });
};
const system_consumeMarker = (ctx) => {
  const marker = ctx.query({ with: ["Health"], without: [] })[0];
  ctx.resources.set("Score", {
    events: ctx.events.read("Spawned").length,
    health: marker.get("Health").current
  });
  ctx.commands.despawn(marker.id);
};
export const systemIds = Object.freeze({ "system_seedMarker": "seedMarker", "system_consumeMarker": "consumeMarker" });
export const systems = Object.freeze({ "system_seedMarker": system_seedMarker, "system_consumeMarker": system_consumeMarker });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_task_channel_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "events": {
    "LifecycleEvent": [{ "phase": "seed" }]
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "channels": [
    { "id": "lifecycle", "event": "LifecycleEvent", "delivery": "fixed-trace" }
  ],
  "tasks": [
    { "id": "lifecycleHandoff", "schedule": "update", "mode": "fixed-trace", "channel": "lifecycle" }
  ],
  "systems": [
    {
      "name": "channelHandoff",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": ["LifecycleEvent"],
      "eventWrites": ["LifecycleEvent"],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_channelHandoff" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_channelHandoff = (ctx) => {
  const task = ctx.tasks.list()[0];
  ctx.channels.send("lifecycle", {
    phase: "next",
    taskChannel: ctx.tasks.channel("lifecycleHandoff"),
    taskCount: ctx.channels.read(task.channel).length
  });
};
export const systemIds = Object.freeze({ "system_channelHandoff": "channelHandoff" });
export const systems = Object.freeze({ "system_channelHandoff": system_channelHandoff });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_plugin_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "PluginReport": {}
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "plugins": [
    { "id": "core", "systems": ["reportPlugins"] }
  ],
  "pluginGroups": [
    { "id": "gameplay", "plugins": ["core"] }
  ],
  "systems": [
    {
      "name": "reportPlugins",
      "schedule": "startup",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["PluginReport"],
      "resourceWrites": ["PluginReport"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportPlugins" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportPlugins = (ctx) => {
  const group = ctx.plugins.group("gameplay");
  const plugin = ctx.plugins.list()[0];
  ctx.resources.set("PluginReport", {
    group: group.id,
    hasCore: ctx.plugins.has("core"),
    pluginCount: group.plugins.length,
    systemCount: plugin.systems.length
  });
};
export const systemIds = Object.freeze({ "system_reportPlugins": "reportPlugins" });
export const systems = Object.freeze({ "system_reportPlugins": system_reportPlugins });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_persistence_settings_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "persistence-settings",
  "requiredCapabilities": {},
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json",
    "scripts": "scripts.bundle.js",
    "localData": "local-data.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "localData": "local-data.ir.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json"
  }
}"#,
    );
    write_json(
        &root,
        "local-data.ir.json",
        r#"{
  "schema": "threenative.local-data",
  "version": "0.1.0",
  "resources": [{ "id": "Score", "schema": { "kind": "object", "fields": { "value": "number" } } }],
  "components": [],
  "settings": [
    { "key": "volume", "kind": "number", "group": "audio", "defaultValue": 0.5, "min": 0, "max": 1 },
    { "key": "difficulty", "kind": "enum", "group": "game", "defaultValue": "normal", "enumValues": ["normal", "hard"] }
  ],
  "saveSlots": [{ "id": "slot.auto", "schemaVersion": 1, "appVersion": "0.1.0" }]
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "resources": { "Score": { "value": 7 } },
  "entities": []
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportPersistence",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["Score"],
      "resourceWrites": ["PersistenceReport"],
      "services": ["persistence.listSlots", "persistence.save", "persistence.load", "settings.set", "settings.get"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportPersistence" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportPersistence = (ctx) => {
  const slots = ctx.persistence.listSlots();
  const saved = ctx.persistence.save("slot.auto");
  const loaded = ctx.persistence.load("slot.auto");
  ctx.settings.set("difficulty", "hard");
  ctx.resources.set("PersistenceReport", {
    difficulty: ctx.settings.get("difficulty"),
    loadedScore: loaded.record.resources.Score.value,
    saved: saved.accepted,
    slots,
    volume: ctx.settings.get("volume")
  });
};
export const systemIds = Object.freeze({ "system_reportPersistence": "reportPersistence" });
export const systems = Object.freeze({ "system_reportPersistence": system_reportPersistence });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_ui_facade_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "ui-facade",
  "requiredCapabilities": {},
  "entry": {
    "world": "world.ir.json",
    "systems": "systems.ir.json",
    "scripts": "scripts.bundle.js",
    "ui": "ui.ir.json"
  },
  "files": {
    "assets": "assets.manifest.json",
    "materials": "materials.ir.json",
    "targetProfile": "target.profile.json",
    "ui": "ui.ir.json"
  }
}"#,
    );
    write_json(
        &root,
        "ui.ir.json",
        r#"{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "focusOrder": ["play", "settings.volume"],
  "root": {
    "id": "root",
    "kind": "column",
    "children": [
      { "id": "play", "kind": "button", "label": "Play", "action": "StartGame" },
      { "id": "settings.volume", "kind": "bar", "value": 0.5, "focusable": true }
    ]
  }
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{"schema":"threenative.world","version":"0.1.0","entities":[]}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "reportUi",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": ["UiReport"],
      "services": ["ui.activate", "ui.focus", "ui.read", "ui.setDisabled", "ui.setValue"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_reportUi" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_reportUi = (ctx) => {
  const focus = ctx.ui.focus("settings.volume");
  const activated = ctx.ui.activate("play");
  ctx.ui.setValue("settings.volume", 0.75);
  const value = ctx.ui.read("settings.volume");
  ctx.ui.setDisabled("settings.volume", true);
  const disabled = ctx.ui.read("settings.volume");
  ctx.resources.set("UiReport", {
    action: activated.action,
    disabled: disabled.disabled,
    focused: value.focused,
    previousFocus: focus.previous,
    value: value.value
  });
};
export const systemIds = Object.freeze({ "system_reportUi": "reportUi" });
export const systems = Object.freeze({ "system_reportUi": system_reportUi });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn entity_position(bundle: &LoadedBundle, entity_id: &str) -> Option<[f32; 3]> {
    bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)
        .and_then(|entity| entity.components.transform.as_ref())
        .and_then(|transform| transform.position)
}

fn write_bundle(name: &str, export_name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    }
  ]
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        &format!(
            r#"{{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {{
      "name": "movePlayer",
      "schedule": "update",
      "reads": ["Transform"],
      "writes": ["Transform"],
      "queries": [{{ "with": ["Transform"], "without": [] }}],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": [],
      "resourceWrites": [],
      "services": [],
      "script": {{ "bundle": "scripts.bundle.js", "exportName": "{export_name}" }}
    }}
  ]
}}"#,
        ),
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const Transform = Object.freeze({ name: "Transform" });
const system_movePlayer = (ctx) => {
  const entity = ctx.query()[0];
  const transform = entity.get(Transform);
  entity.patch(Transform, { position: [transform.position[0] + ctx.time.fixedDt, 0, 0] });
};
export const systemIds = Object.freeze({ "system_movePlayer": "movePlayer" });
export const systems = Object.freeze({ "system_movePlayer": system_movePlayer });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_undeclared_query_bundle(name: &str) -> PathBuf {
    let root = write_bundle(name, "system_movePlayer");
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const Transform = Object.freeze({ name: "Transform" });
const system_movePlayer = (ctx) => {
  ctx.query({ with: ["Camera"], without: [] });
};
export const systemIds = Object.freeze({ "system_movePlayer": "movePlayer" });
export const systems = Object.freeze({ "system_movePlayer": system_movePlayer });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_context_ergonomics_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "resources": {
    "RallyState": { "lap": 1, "speed": 0 }
  },
  "entities": [
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    },
    {
      "id": "camera.main",
      "components": {
        "Camera": { "kind": "perspective", "near": 0.1, "far": 100 },
        "Transform": { "position": [0, 2, 5], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    }
  ]
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "ergonomics",
      "schedule": "update",
      "reads": ["Camera", "PlayerState", "Transform"],
      "writes": ["Transform"],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["RallyState"],
      "resourceWrites": ["RallyState"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_ergonomics" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_ergonomics = (ctx) => {
  const player = ctx.entity("player");
  const ids = ctx.entities.byId({ camera: "camera.main", missing: "missing" });
  const current = ctx.resources.get("RallyState", { lap: 0, speed: 0 });
  const playerState = player.get("PlayerState", { hp: 1, energy: 5 });
  const speed = ctx.input.getAxis("MoveX");
  ctx.resources.patch("RallyState", {
    button: ctx.input.getButton("Boost"),
    camera: ids.camera.id,
    down: ctx.input.getButtonDown("Boost"),
    dt: ctx.time.fixedDeltaTime,
    energy: playerState.energy,
    hp: playerState.hp,
    lap: current.lap,
    missing: ids.missing === undefined,
    move: ctx.input.getAxis2("MoveX", "MoveZ"),
    speed,
    time: ctx.time.time,
    up: ctx.input.getButtonUp("Boost")
  });
  player.transform().position = [player.transform().position[0] + speed, 0, 0];
};
export const systemIds = Object.freeze({ "system_ergonomics": "ergonomics" });
export const systems = Object.freeze({ "system_ergonomics": system_ergonomics });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_pending_write_context_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [{
    "id": "player",
    "components": {
      "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
      "PlayerState": { "hp": 3, "status": "ready" }
    }
  }],
  "resources": { "Trace": { "componentReads": [], "inputTicks": [], "positionReads": [] } }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [{
    "name": "trace",
    "schedule": "update",
    "reads": ["PlayerState", "Transform"],
    "writes": ["PlayerState", "Transform"],
    "queries": [{ "with": ["Transform"], "without": [] }],
    "commands": [],
    "eventReads": [],
    "eventWrites": [],
    "resourceReads": ["Trace"],
    "resourceWrites": ["Trace"],
    "services": [],
    "script": { "bundle": "scripts.bundle.js", "exportName": "system_trace" }
  }]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_trace = (ctx) => {
  const report = ctx.resources.get("Trace");
  if (report.positionReads.length === 0) {
    const player = ctx.entity("player");
    report.positionReads.push(player.transform().position);
    report.componentReads.push(player.get("PlayerState"));
    player.transform().setPosition([2, 3, 4]);
    report.positionReads.push(ctx.entity("player").transform().position);
    player.patch("PlayerState", { hp: 2 });
    report.componentReads.push(player.get("PlayerState"));
    player.patch("PlayerState", { status: "moving" });
    report.componentReads.push(player.components.PlayerState);
  }
  report.inputTicks.push({
    action: ctx.input.action("Jump"),
    pressed: ctx.input.pressed("Jump"),
    released: ctx.input.released("Jump")
  });
  ctx.resources.set("Trace", report);
};
export const systemIds = Object.freeze({ "system_trace": "trace" });
export const systems = Object.freeze({ "system_trace": system_trace });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_tag_context_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "resources": { "TagReport": {} },
  "entities": [
    { "id": "coin", "tags": ["coin"], "components": { "Transform": { "position": [0, 0, 0] } } },
    { "id": "wall", "tags": ["wall"], "components": { "Transform": { "position": [1, 0, 0] } } }
  ]
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [{
    "name": "tagQuery",
    "schedule": "update",
    "reads": [],
    "writes": [],
    "queries": [],
    "commands": [],
    "eventReads": [],
    "eventWrites": [],
    "resourceReads": ["TagReport"],
    "resourceWrites": ["TagReport"],
    "services": [],
    "script": { "bundle": "scripts.bundle.js", "exportName": "system_tagQuery" }
  }]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_tagQuery = (ctx) => {
  ctx.resources.set("TagReport", {
    count: ctx.entities.countTag("coin"),
    ids: ctx.entities.withTag("coin").map((entity) => entity.id)
  });
};
export const systemIds = Object.freeze({ "system_tagQuery": "tagQuery" });
export const systems = Object.freeze({ "system_tagQuery": system_tagQuery });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_particle_service_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    fs::create_dir_all(root.join("assets")).expect("asset dir should exist");
    fs::write(root.join("assets/hero.glb"), "model").expect("model should be written");
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    {
      "format": "glb",
      "id": "model.hero",
      "kind": "model",
      "particleEmitters": [{ "id": "dust", "lifetimeSeconds": 0.5, "maxParticles": 8, "ratePerSecond": 8, "shape": "point" }],
      "path": "assets/hero.glb"
    }
  ]
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": { "ParticleReport": {} }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "particleCommands",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["ParticleReport"],
      "resourceWrites": ["ParticleReport"],
      "services": ["particles.play", "particles.emit", "particles.clear", "particles.start", "particles.burst", "particles.stop", "particles.reset"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_particleCommands" }
    }
  ]
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        r#"const system_particleCommands = (ctx) => {
  const played = ctx.particles.play("model.hero", "dust", { seed: 7 });
  const emitted = ctx.particles.emit("model.hero", "dust", { count: 99, seed: "impact" });
  const cleared = ctx.particles.clear("model.hero", "dust");
  const started = ctx.particles.start("model.hero", "dust", { seed: 7 });
  const burst = ctx.particles.burst("model.hero", "dust", { count: 99, seed: "impact" });
  const stopped = ctx.particles.stop("model.hero", "dust");
  const reset = ctx.particles.reset("model.hero", "dust");
  ctx.resources.set("ParticleReport", {
    burstCount: burst.count,
    burstStatus: burst.status,
    clearStatus: cleared.status,
    emitCount: emitted.count,
    emitStatus: emitted.status,
    playCount: played.count,
    playStatus: played.status,
    resetStatus: reset.status,
    startCount: started.count,
    startStatus: started.status,
    stopStatus: stopped.status
  });
};
export const systemIds = Object.freeze({ "system_particleCommands": "particleCommands" });
export const systems = Object.freeze({ "system_particleCommands": system_particleCommands });
"#,
    )
    .expect("script bundle should be written");
    root
}

fn write_bundle_without_scripts(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, false);
    write_json(
        &root,
        "world.ir.json",
        r#"{"schema":"threenative.world","version":"0.1.0","entities":[]}"#,
    );
    root
}

fn write_live_collision_bundle(name: &str) -> PathBuf {
    let root = write_bundle_without_scripts(name);
    fs::write(
        root.join("world.ir.json"),
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "wall",
      "components": {
        "Collider": { "kind": "box", "size": [4, 0.1, 4] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "mover",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "dynamic" },
        "Transform": { "position": [0, 0.55, 0] }
      }
    },
    {
      "id": "trigger",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1], "trigger": true },
        "Transform": { "position": [8, 0, 0] }
      }
    },
    {
      "id": "visitor",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [8.25, 0, 0] }
      }
    }
  ],
  "resources": {},
  "events": { "CollisionEvent": [], "TriggerEvent": [] },
  "prefabs": []
}"#,
    )
    .expect("live collision world should be written");
    root
}

fn write_countdown_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": { "Race": { "remaining": 0.1, "restartToken": 0, "running": true } }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "countdowns": [{ "autostart": true, "direction": "down", "event": "Race.limit", "field": "remaining", "id": "race", "limit": 0.1, "resource": "Race" }],
  "systems": []
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        "export const systems = Object.freeze({});\n",
    )
    .expect("script bundle should be written");
    root
}

fn write_patrol_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [{
    "id": "guard",
    "components": {
      "Transform": { "position": [0, 0, 0] },
      "Patrol": {
        "mode": "loop",
        "speed": 1,
        "waypoints": [[0, 0, 0], [1, 0, 0], [1, 0, 1]],
        "faceHeading": true
      }
    }
  }]
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": []
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        "export const systems = Object.freeze({});\n",
    )
    .expect("script bundle should be written");
    root
}

fn write_state_machine_bundle(name: &str) -> PathBuf {
    let root = root(name);
    write_base_bundle(&root, true);
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "events": { "Go": [{}] },
  "entities": [{
    "id": "guard",
    "components": {
      "StateMachine": {
        "initial": "idle",
        "states": ["idle", "chase"],
        "transitions": [{
          "from": "idle",
          "to": "chase",
          "trigger": { "kind": "event", "event": "Go" }
        }]
      }
    }
  }]
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": []
}"#,
    );
    fs::write(
        root.join("scripts.bundle.js"),
        "export const systems = Object.freeze({});\n",
    )
    .expect("script bundle should be written");
    root
}

fn write_base_bundle(root: &Path, with_scripts: bool) {
    fs::create_dir_all(root).expect("temp bundle should be created");
    write_json(
        root,
        "manifest.json",
        if with_scripts {
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-host",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#
        } else {
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-host",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#
        },
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
    let root = std::env::temp_dir().join(format!("tn-systems-host-{name}-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).expect("old temp bundle should be removed");
    }
    root
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}

fn time() -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta: 0.016,
        dt: 0.016,
        elapsed: 1.0,
        fixed_delta: 0.016,
        fixed_dt: 0.016,
        paused: false,
    }
}
