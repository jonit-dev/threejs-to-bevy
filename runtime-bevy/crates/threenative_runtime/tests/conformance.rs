use std::path::PathBuf;

use bevy::prelude::*;
use threenative_loader::load_bundle;
use threenative_runtime::{conformance::report_bevy_conformance, map_world::map_bundle_into_world};

#[test]
fn should_report_basic_scene_conformance_semantics() {
    let bundle = load_bundle(basic_scene_fixture()).expect("basic scene fixture should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("basic scene should map");
    let report = report_bevy_conformance(app.world_mut(), &bundle, "basic-scene");
    let report_json = serde_json::to_value(&report).expect("report should serialize");

    assert_eq!(report.fixture, "basic-scene");
    assert_eq!(report.runtime, "bevy");
    assert!(report.diagnostics.is_empty());

    let cube = report
        .entities
        .iter()
        .find(|entity| entity.id == "cube.child")
        .expect("cube entity should be reported");
    assert_eq!(
        cube.components,
        vec![
            "Hierarchy".to_owned(),
            "MeshRenderer".to_owned(),
            "Transform".to_owned()
        ]
    );
    assert_eq!(cube.parent.as_deref(), Some("scene.root"));
    assert_eq!(cube.mesh.as_deref(), Some("mesh.cube"));
    assert_eq!(cube.material.as_deref(), Some("mat.cube"));

    assert!(report.entities.iter().any(|entity| {
        entity.id == "camera.main"
            && entity
                .components
                .iter()
                .any(|component| component == "Camera")
    }));
    assert!(report.entities.iter().any(|entity| {
        entity.id == "light.key"
            && entity
                .light
                .as_ref()
                .is_some_and(|light| light.kind == "directional")
    }));
    assert_eq!(report_json["runtime"], "bevy");
    assert_eq!(report_json["entities"][0]["camera"].get("fov_y"), None);
    let camera = report_json["entities"]
        .as_array()
        .and_then(|entities| entities.iter().find(|entity| entity["id"] == "camera.main"))
        .expect("camera entity should be serialized");
    assert_eq!(camera["camera"]["fovY"], 60.0);
}

fn basic_scene_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance/basic-scene/game.bundle")
}
