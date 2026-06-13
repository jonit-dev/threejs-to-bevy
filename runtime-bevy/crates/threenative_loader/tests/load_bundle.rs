use std::path::PathBuf;

use threenative_loader::load_bundle;

#[test]
fn should_load_cube_fixture_bundle() {
    let bundle = load_bundle(cube_fixture()).expect("cube fixture should load");

    assert_eq!(bundle.manifest.name, "cube-scene");
    assert!(
        bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "cube.main" && entity.components.mesh_renderer.is_some())
    );
    assert!(
        bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "camera.main" && entity.components.camera.is_some())
    );
    assert!(
        bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == "light.key" && entity.components.light.is_some())
    );
}

fn cube_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}
