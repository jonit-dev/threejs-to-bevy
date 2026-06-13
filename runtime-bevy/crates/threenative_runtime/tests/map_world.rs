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

fn cube_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}
