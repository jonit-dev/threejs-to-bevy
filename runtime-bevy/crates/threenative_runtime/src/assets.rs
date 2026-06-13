use std::collections::HashMap;

use threenative_loader::{AssetIr, AssetsManifest};

#[derive(Debug, PartialEq)]
pub struct NativeAssetRef {
    pub id: String,
    pub path: String,
}

pub fn resolve_asset_manifest(manifest: &AssetsManifest) -> HashMap<String, NativeAssetRef> {
    manifest
        .assets
        .iter()
        .filter_map(resolve_asset)
        .map(|asset| (asset.id.clone(), asset))
        .collect()
}

fn resolve_asset(asset: &AssetIr) -> Option<NativeAssetRef> {
    asset.path.as_ref().map(|path| NativeAssetRef {
        id: asset.id.clone(),
        path: path.clone(),
    })
}
