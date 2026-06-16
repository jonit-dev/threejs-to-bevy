use threenative_loader::{
    AssetIr, AssetsManifest, EnvironmentInstanceIr, EnvironmentPathIr, EnvironmentSceneIr,
    EnvironmentSourceAssetIr,
};
use threenative_runtime::assets::{resolve_asset_manifest, trace_asset_load_synchronization};

#[test]
fn assets_should_load_asset_manifest_entries() {
    let assets = AssetsManifest {
        schema: "threenative.assets".to_owned(),
        version: "0.1.0".to_owned(),
        assets: vec![AssetIr {
            id: "model.player".to_owned(),
            kind: "model".to_owned(),
            format: "glb".to_owned(),
            animation_graph: None,
            animations: None,
            attributes: None,
            binary_attributes: None,
            binary_indices: None,
            bounds: None,
            budget: None,
            center: None,
            generation: None,
            height: None,
            indices: None,
            mag_filter: None,
            min_filter: None,
            offset: None,
            particle_emitters: None,
            primitive: None,
            path: Some("assets/player.glb".to_owned()),
            repeat: None,
            rotation: None,
            sample_count: None,
            size: None,
            topology: None,
            usage: None,
            width: None,
            wrap_s: None,
            wrap_t: None,
        }],
    };

    let resolved = resolve_asset_manifest(&assets);

    assert_eq!(
        resolved
            .get("model.player")
            .map(|asset| asset.path.as_str()),
        Some("assets/player.glb")
    );
}

#[test]
fn asset_load_trace_should_sort_assets_and_model_scene_refs_deterministically() {
    let assets = AssetsManifest {
        schema: "threenative.assets".to_owned(),
        version: "0.1.0".to_owned(),
        assets: vec![
            make_asset("texture.hero", "texture", "png", "assets/hero.png"),
            make_asset("model.tree.low", "model", "gltf", "assets/tree-low.gltf"),
            make_asset("model.tree", "model", "gltf", "assets/tree.gltf"),
        ],
    };
    let environment = EnvironmentSceneIr {
        schema: "threenative.environment-scene".to_owned(),
        version: "0.1.0".to_owned(),
        atmosphere: None,
        controller: None,
        terrain: None,
        path: EnvironmentPathIr {
            id: "path.main".to_owned(),
            points: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]],
            width: 1.0,
            clearing_radius: None,
        },
        source_assets: vec![EnvironmentSourceAssetIr {
            id: "env.tree".to_owned(),
            asset: "model.tree".to_owned(),
            category: "tree".to_owned(),
            lod: vec![threenative_loader::EnvironmentLodLevelIr {
                asset: "model.tree.low".to_owned(),
                min_distance: 20.0,
                max_distance: 80.0,
            }],
        }],
        instances: vec![
            EnvironmentInstanceIr {
                id: "tree.b".to_owned(),
                source_asset: "env.tree".to_owned(),
                position: [1.0, 0.0, 0.0],
                rotation: None,
                scale: None,
                kind: Some("scatter".to_owned()),
                tags: Vec::new(),
            },
            EnvironmentInstanceIr {
                id: "tree.a".to_owned(),
                source_asset: "env.tree".to_owned(),
                position: [0.0, 0.0, 0.0],
                rotation: None,
                scale: None,
                kind: Some("hero".to_owned()),
                tags: Vec::new(),
            },
        ],
        scatter: Vec::new(),
        bookmarks: Vec::new(),
    };

    let trace = trace_asset_load_synchronization(&assets, Some(&environment));
    let json = serde_json::to_value(trace).expect("serialize trace");

    assert_eq!(
        json,
        serde_json::json!({
            "assets": [
                { "format": "gltf", "id": "model.tree", "kind": "model", "loadIndex": 0, "path": "assets/tree.gltf", "phase": "resolved" },
                { "format": "gltf", "id": "model.tree.low", "kind": "model", "loadIndex": 1, "path": "assets/tree-low.gltf", "phase": "resolved" },
                { "format": "png", "id": "texture.hero", "kind": "texture", "loadIndex": 2, "path": "assets/hero.png", "phase": "resolved" }
            ],
            "barrier": { "id": "bundle.requiredAssets", "modelSceneCount": 1, "status": "ready", "total": 3 },
            "gltfScenes": [
                {
                    "asset": "model.tree",
                    "category": "tree",
                    "instanceIds": ["tree.a", "tree.b"],
                    "lodAssets": ["model.tree.low"],
                    "sourceAsset": "env.tree"
                }
            ]
        })
    );
}

fn make_asset(id: &str, kind: &str, format: &str, path: &str) -> AssetIr {
    AssetIr {
        id: id.to_owned(),
        kind: kind.to_owned(),
        format: format.to_owned(),
        animation_graph: None,
        animations: None,
        attributes: None,
        binary_attributes: None,
        binary_indices: None,
        bounds: None,
        budget: None,
        center: None,
        generation: None,
        height: None,
        indices: None,
        mag_filter: None,
        min_filter: None,
        offset: None,
        particle_emitters: None,
        primitive: None,
        path: Some(path.to_owned()),
        repeat: None,
        rotation: None,
        sample_count: None,
        size: None,
        topology: None,
        usage: None,
        width: None,
        wrap_s: None,
        wrap_t: None,
    }
}
