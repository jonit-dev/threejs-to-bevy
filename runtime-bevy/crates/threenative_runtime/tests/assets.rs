use threenative_loader::{AssetIr, AssetsManifest};
use threenative_runtime::assets::resolve_asset_manifest;

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
            bounds: None,
            center: None,
            indices: None,
            mag_filter: None,
            min_filter: None,
            offset: None,
            particle_emitters: None,
            primitive: None,
            path: Some("assets/player.glb".to_owned()),
            repeat: None,
            rotation: None,
            size: None,
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
