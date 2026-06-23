use bevy::prelude::*;
use bevy::render::{
    camera::RenderTarget,
    render_resource::{TextureFormat, TextureUsages},
};
use serde_json::json;
use threenative_loader::{AssetIr, WorldEntity, load_bundle};
use threenative_runtime::{
    map_world::map_bundle_into_world,
    render_targets::{NativeRenderTargetRegistry, camera_render_target, render_target_descriptor},
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
        masks: None,
        min_filter: None,
        morph_clips: None,
        morph_targets: None,
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
        skeleton: None,
    });
    bundle.assets.assets.push(AssetIr {
        id: "rt.depth".to_owned(),
        kind: "render-target".to_owned(),
        format: "depth24plus".to_owned(),
        width: Some(128.0),
        height: Some(96.0),
        usage: Some("depth".to_owned()),
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
        masks: None,
        min_filter: None,
        morph_clips: None,
        morph_targets: None,
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
        skeleton: None,
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
    bundle.world.entities.push(WorldEntity {
        id: "camera.depth".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "perspective",
                "near": 0.1,
                "far": 100,
                "target": { "kind": "depth", "asset": "rt.depth" }
            }
        }))
        .expect("depth camera should deserialize"),
    });

    let descriptor = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == "rt.monitor")
        .and_then(render_target_descriptor)
        .expect("descriptor");
    assert_eq!(descriptor, (256, 256, TextureFormat::Rgba8UnormSrgb));
    let depth_descriptor = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == "rt.depth")
        .and_then(render_target_descriptor)
        .expect("depth descriptor");
    assert_eq!(depth_descriptor, (128, 96, TextureFormat::Depth24Plus));

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
    let depth_camera = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == "camera.depth")
        .and_then(|entity| entity.components.camera.as_ref())
        .expect("depth camera");
    let depth_target = camera_render_target(depth_camera, &registry).expect("depth render target");
    assert!(matches!(depth_target, RenderTarget::Image(_)));
    let depth_handle = registry.images.get("rt.depth").expect("depth target image");
    let depth_image = app
        .world()
        .resource::<Assets<Image>>()
        .get(depth_handle)
        .expect("depth target image asset");
    assert_eq!(
        depth_image.texture_descriptor.format,
        TextureFormat::Depth24Plus
    );
    assert!(
        depth_image
            .texture_descriptor
            .usage
            .contains(TextureUsages::RENDER_ATTACHMENT)
    );
    assert!(
        !depth_image
            .texture_descriptor
            .usage
            .contains(TextureUsages::TEXTURE_BINDING)
    );
}

fn cube_fixture() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}
