use std::path::PathBuf;

use bevy::prelude::*;
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::map_world::map_bundle_into_world;

#[test]
fn should_spawn_stable_ids_for_cube_fixture() {
    let bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let ids = app
        .world_mut()
        .query::<&ThreeNativeId>()
        .iter(app.world())
        .map(|id| id.0.as_str())
        .collect::<Vec<_>>();

    assert!(ids.contains(&"cube.main"));
    assert!(ids.contains(&"camera.main"));
    assert!(ids.contains(&"light.key"));
}

#[test]
fn should_report_missing_material_with_stable_diagnostic_shape() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.materials.materials.clear();
    let mut app = App::new();

    let error = map_bundle_into_world(app.world_mut(), &bundle)
        .expect_err("missing material should fail mapping");

    assert_eq!(error.code(), "TN_BEVY_MATERIAL_REFERENCE_MISSING");
    assert_eq!(
        error.path(),
        "world.ir.json/entities/cube.main/components/MeshRenderer/material"
    );
    assert!(error.suggestion().contains("materials.ir.json"));
}

#[test]
fn should_report_missing_mesh_with_stable_diagnostic_shape() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.assets.assets.clear();
    let mut app = App::new();

    let error =
        map_bundle_into_world(app.world_mut(), &bundle).expect_err("missing mesh should fail");

    assert_eq!(error.code(), "TN_BEVY_MESH_REFERENCE_MISSING");
    assert_eq!(
        error.path(),
        "world.ir.json/entities/cube.main/components/MeshRenderer/mesh"
    );
    assert!(error.suggestion().contains("assets.manifest.json"));
}

fn cube_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}
