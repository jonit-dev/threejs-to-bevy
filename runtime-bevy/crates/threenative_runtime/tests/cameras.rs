use bevy::prelude::*;
use bevy::render::camera::ClearColorConfig;
use serde_json::json;
use threenative_components::ThreeNativeId;
use threenative_loader::{load_bundle, WorldEntity};
use ::threenative_runtime::{
    cameras::{
        build_render_layer_map, render_layers_for_names, update_native_camera_helpers,
    },
    map_world::map_bundle_into_world,
};

#[test]
fn should_map_ordered_cameras_to_bevy_camera_order_and_viewport() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.world.entities.push(WorldEntity {
        id: "camera.left".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "perspective",
                "near": 0.1,
                "far": 100,
                "order": 1,
                "viewport": [0.0, 0.0, 0.5, 1.0],
                "clear": { "mode": "color", "color": "#ff0000" }
            }
        }))
        .expect("camera components should deserialize"),
    });
    bundle.world.entities.push(WorldEntity {
        id: "camera.right".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "perspective",
                "near": 0.1,
                "far": 100,
                "order": 2,
                "viewport": [0.5, 0.0, 0.5, 1.0],
                "clear": { "mode": "none" }
            }
        }))
        .expect("camera components should deserialize"),
    });
    bundle.world.resources.insert(
        "ActiveCameras".to_owned(),
        json!({ "cameras": ["camera.left", "camera.right"] }),
    );

    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<(&ThreeNativeId, &Camera)>();
    let mut cameras = query
        .iter(app.world())
        .map(|(id, camera)| (id.0.clone(), camera.clone()))
        .collect::<Vec<_>>();
    cameras.sort_by(|left, right| left.0.cmp(&right.0));

    let left = cameras
        .iter()
        .find(|(id, _)| id == "camera.left")
        .map(|(_, camera)| camera)
        .expect("left camera should exist");
    let right = cameras
        .iter()
        .find(|(id, _)| id == "camera.right")
        .map(|(_, camera)| camera)
        .expect("right camera should exist");

    assert_eq!(left.order, 1_isize);
    assert_eq!(right.order, 2_isize);
    assert!(left.is_active);
    assert!(right.is_active);
    assert!(matches!(left.clear_color, ClearColorConfig::Custom(_)));
    assert!(matches!(right.clear_color, ClearColorConfig::None));
    let left_viewport = left.viewport.as_ref().expect("left viewport");
    let right_viewport = right.viewport.as_ref().expect("right viewport");
    assert_eq!(left_viewport.physical_position, UVec2::new(0, 0));
    assert_eq!(left_viewport.physical_size, UVec2::new(640, 720));
    assert_eq!(right_viewport.physical_position, UVec2::new(640, 0));
    assert_eq!(right_viewport.physical_size, UVec2::new(640, 720));
}

#[test]
fn should_apply_follow_helper_before_rendering() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.world.entities.push(WorldEntity {
        id: "player.main".to_owned(),
        components: serde_json::from_value(json!({
            "Transform": { "position": [10.0, 0.0, 0.0] }
        }))
        .expect("player transform should deserialize"),
    });
    bundle.world.entities.push(WorldEntity {
        id: "camera.follow".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "perspective",
                "near": 0.1,
                "far": 100,
                "follow": {
                    "target": "player.main",
                    "offset": [0.0, 2.0, -4.0],
                    "smoothing": 12.0
                }
            },
            "Transform": { "position": [0.0, 0.0, 0.0] }
        }))
        .expect("follow camera should deserialize"),
    });
    bundle
        .world
        .resources
        .insert("ActiveCamera".to_owned(), json!({ "entity": "camera.follow" }));

    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");
    app.add_systems(Update, update_native_camera_helpers);
    for _ in 0..30 {
        app.update();
    }

    let mut query = app.world_mut().query::<(&ThreeNativeId, &Transform)>();
    let transform = query
        .iter(app.world())
        .find_map(|(id, transform)| (id.0 == "camera.follow").then_some(*transform))
        .expect("follow camera transform should exist");

    assert!(transform.translation.x > 5.0);
    assert!(transform.translation.x < 10.0);
    assert!(transform.translation.y > 0.0);
    assert!(transform.translation.z < 0.0);
}

#[test]
fn should_map_render_layer_names_consistently() {
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.world.entities.push(WorldEntity {
        id: "cube.minimap".to_owned(),
        components: serde_json::from_value(json!({
            "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.cube" },
            "RenderLayers": { "layers": ["minimap"] }
        }))
        .expect("minimap entity should deserialize"),
    });
    bundle.world.entities.push(WorldEntity {
        id: "camera.minimap".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "orthographic",
                "near": 0.1,
                "far": 100,
                "size": 4,
                "layers": ["minimap"]
            }
        }))
        .expect("minimap camera should deserialize"),
    });

    let layer_map = build_render_layer_map(&bundle);
    let entity_layers = render_layers_for_names(&layer_map, &["minimap".to_owned()]);
    let camera_layers = render_layers_for_names(&layer_map, &["minimap".to_owned()]);

    assert_eq!(entity_layers, camera_layers);
    assert!(layer_map.allocation.get("minimap").is_some());
    assert_eq!(layer_map.allocation.get("default"), Some(&0));
}

#[test]
fn should_apply_a_custom_projection_matrix_to_a_native_camera() {
    let matrix = [
        1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.002, -0.2002, 0.0, 0.0, -1.0, 0.0,
    ];
    let mut bundle = load_bundle(cube_fixture()).expect("cube fixture should load");
    bundle.world.entities.push(WorldEntity {
        id: "camera.custom".to_owned(),
        components: serde_json::from_value(json!({
            "Camera": {
                "kind": "perspective",
                "near": 0.1,
                "far": 100,
                "projection": {
                    "kind": "matrix",
                    "handedness": "right",
                    "matrix": matrix
                }
            }
        }))
        .expect("custom projection camera should deserialize"),
    });
    bundle
        .world
        .resources
        .insert("ActiveCamera".to_owned(), json!({ "entity": "camera.custom" }));

    let mut app = App::new();
    app.init_resource::<Assets<Image>>();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<&threenative_runtime::render_targets::NativeCustomProjection>();
    let projection = query
        .iter(app.world())
        .next()
        .expect("custom projection component");
    assert_eq!(projection.0, matrix);
}

fn cube_fixture() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/cube-scene/game.bundle")
}
