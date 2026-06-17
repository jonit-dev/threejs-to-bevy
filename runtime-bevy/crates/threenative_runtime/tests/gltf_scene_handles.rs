use threenative_runtime::gltf_scene_handles::{
    NativeGltfNodeHandle, NativeGltfNodeOperation, NativeGltfSceneNode, NativeGltfTransform,
    apply_gltf_scene_handle_operations,
};

#[test]
fn should_resolve_and_update_spawned_gltf_scene_handles() {
    let nodes = vec![NativeGltfSceneNode {
        asset_id: "model.level".to_owned(),
        extras: None,
        material: None,
        name: Some("Door".to_owned()),
        path: "/Root/Door".to_owned(),
        transform: NativeGltfTransform {
            position: Some([0.0, 0.0, 0.0]),
            rotation: None,
            scale: None,
        },
    }];
    let handles = vec![NativeGltfNodeHandle {
        asset_id: "model.level".to_owned(),
        id: "handle.door".to_owned(),
        instance_id: "level.instance".to_owned(),
        node_name: None,
        node_path: Some("/Root/Door".to_owned()),
    }];
    let operations = vec![
        NativeGltfNodeOperation::Visibility {
            handle: "handle.door".to_owned(),
            visible: false,
        },
        NativeGltfNodeOperation::Transform {
            handle: "handle.door".to_owned(),
            transform: NativeGltfTransform {
                position: Some([1.0, 2.0, 3.0]),
                rotation: None,
                scale: None,
            },
        },
    ];

    let observations = apply_gltf_scene_handle_operations(&nodes, &handles, &operations, true);
    let json = serde_json::to_value(observations).expect("serialize observations");

    assert_eq!(
        json,
        serde_json::json!([
            {
                "after": { "transform": { "position": [1.0, 2.0, 3.0] } },
                "before": { "transform": { "position": [0.0, 0.0, 0.0] } },
                "handle": "handle.door",
                "nodePath": "/Root/Door",
                "operation": "transform",
                "status": "applied"
            },
            {
                "after": { "visible": false },
                "before": { "visible": true },
                "handle": "handle.door",
                "nodePath": "/Root/Door",
                "operation": "visibility",
                "status": "applied"
            }
        ])
    );
}
