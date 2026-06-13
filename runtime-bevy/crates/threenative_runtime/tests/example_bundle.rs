use std::path::PathBuf;

use bevy::prelude::*;
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::map_world::map_bundle_into_world;

#[test]
fn should_map_canonical_example_bundle() {
    let bundle =
        load_bundle(canonical_example_bundle()).expect("canonical example bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("canonical example should map");

    let ids = app
        .world_mut()
        .query::<&ThreeNativeId>()
        .iter(app.world())
        .map(|id| id.0.as_str())
        .collect::<Vec<_>>();

    assert!(ids.contains(&"player.box"));
    assert!(ids.contains(&"world.floor"));
    assert!(ids.contains(&"marker.sphere"));
    assert!(ids.contains(&"camera.main"));
    assert!(ids.contains(&"light.key"));
}

fn canonical_example_bundle() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../examples/v1-canonical/dist/game.bundle")
}
