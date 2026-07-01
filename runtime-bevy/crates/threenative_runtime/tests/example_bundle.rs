mod support;

use bevy::prelude::*;
use threenative_components::ThreeNativeId;
use threenative_runtime::map_world::map_bundle_into_world;

#[test]
fn should_map_basic_scene_conformance_bundle() {
    let fixture = support::load_conformance_fixture("basic-scene");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle)
        .expect("basic scene conformance fixture should map");

    let ids = app
        .world_mut()
        .query::<&ThreeNativeId>()
        .iter(app.world())
        .map(|id| id.0.as_str())
        .collect::<Vec<_>>();

    assert!(ids.contains(&"scene.root"));
    assert!(ids.contains(&"cube.child"));
    assert!(ids.contains(&"capsule.actor"));
    assert!(ids.contains(&"cylinder.actor"));
    assert!(ids.contains(&"camera.main"));
    assert!(ids.contains(&"light.key"));
}
