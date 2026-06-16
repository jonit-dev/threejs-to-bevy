use bevy::prelude::*;
use bevy::render::{
    camera::RenderTarget,
    render_resource::TextureFormat,
};
use serde_json::json;
use threenative_loader::{load_bundle, AssetIr, WorldEntity};
use threenative_runtime::{
    map_world::map_bundle_into_world,
    render_targets::{camera_render_target, render_target_descriptor, NativeRenderTargetRegistry},
};

#[test]
fn should_map_camera_target_to_bevy_image_output() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.assets.assets.push(AssetIr {
        id: "rt.monitor".to_owned(),
        kind: "render-target".to_owned(),
        format: "rgba8".to_owned(),
        width: Some(256.0),
        height: Some(256.0),
        usage: Some("color".to_owned()),
        animations: None,
        animation_graph: None,
        attributes: None,
        binary_attributes: None,
        binary_indices: None,
        bounds: None,
        budget: None,
        center: None,
        generation: None,
        indices: None,
        mag_filter: None,
        min_filter: None,
        offset: None,
        particle_emitters: None,
        primitive: None,
        path: None,
        repeat: None,
        rotation: None,
        size: None,
        topology: None,
        wrap_s: None,
        wrap_t: None,
        sample_count: None,
    });
    bundle.world.entities.push(WorldEntity {
        id: "camera.monitor".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "perspective",
                "near": 0.1,
                "far": 100,
                "target": { "kind": "texture", "asset": "rt.monitor" }
            }
        }))
        .expect("monitor camera should deserialize"),
    });

    let descriptor = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == "rt.monitor")
        .and_then(render_target_descriptor)
        .expect("descriptor");
    assert_eq!(descriptor, (256, 256, TextureFormat::Rgba8UnormSrgb));

    let mut app = App::new();
    app.init_resource::<Assets<Image>>();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");
    let registry = app.world().resource::<NativeRenderTargetRegistry>();
    let camera = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "camera.monitor")
        .and_then(|entity| entity.components.camera.as_ref())
        .expect("monitor camera");
    let target = camera_render_target(camera, &registry).expect("render target");
    assert!(matches!(target, RenderTarget::Image(_)));
}

fn cube_fixture() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}
