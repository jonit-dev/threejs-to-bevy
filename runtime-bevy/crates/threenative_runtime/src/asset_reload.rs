use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetReloadReport {
    pub changed_assets: Vec<NativeAssetReloadChange>,
    pub classification: String,
    pub diagnostics: Vec<NativeAssetReloadDiagnostic>,
    pub impacted_handles: Vec<String>,
    pub schema: String,
    pub state_policy: String,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetReloadChange {
    pub asset_id: String,
    pub change: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetReloadDiagnostic {
    pub code: String,
    pub message: String,
    pub path: String,
    pub severity: String,
    pub suggestion: String,
}

pub fn unsupported_native_network_asset_reload(
    asset_id: &str,
    url: &str,
) -> NativeAssetReloadReport {
    NativeAssetReloadReport {
        changed_assets: vec![NativeAssetReloadChange {
            asset_id: asset_id.to_owned(),
            change: "networkUnavailable".to_owned(),
            path: url.to_owned(),
        }],
        classification: "unsupported".to_owned(),
        diagnostics: vec![NativeAssetReloadDiagnostic {
            code: "TN_BEVY_ASSET_RELOAD_NETWORK_UNSUPPORTED".to_owned(),
            message: format!(
                "Native asset reload cannot fetch network asset '{asset_id}' from '{url}'."
            ),
            path: url.to_owned(),
            severity: "error".to_owned(),
            suggestion:
                "Use bundle-local assets for native reloads or rebuild for a web-only target."
                    .to_owned(),
        }],
        impacted_handles: Vec::new(),
        schema: "threenative.asset-reload".to_owned(),
        state_policy: "restart".to_owned(),
        version: "0.1.0".to_owned(),
    }
}
