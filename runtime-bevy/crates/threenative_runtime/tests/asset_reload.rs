use threenative_runtime::asset_reload::unsupported_native_network_asset_reload;

#[test]
fn should_report_unsupported_native_network_asset_reload() {
    let report = unsupported_native_network_asset_reload(
        "tex.remote",
        "https://cdn.example.com/texture.png",
    );
    let json = serde_json::to_value(report).expect("serialize reload report");

    assert_eq!(
        json,
        serde_json::json!({
            "changedAssets": [
                {
                    "assetId": "tex.remote",
                    "change": "networkUnavailable",
                    "path": "https://cdn.example.com/texture.png"
                }
            ],
            "classification": "unsupported",
            "diagnostics": [
                {
                    "code": "TN_BEVY_ASSET_RELOAD_NETWORK_UNSUPPORTED",
                    "message": "Native asset reload cannot fetch network asset 'tex.remote' from 'https://cdn.example.com/texture.png'.",
                    "path": "https://cdn.example.com/texture.png",
                    "severity": "error",
                    "suggestion": "Use bundle-local assets for native reloads or rebuild for a web-only target."
                }
            ],
            "impactedHandles": [],
            "schema": "threenative.asset-reload",
            "statePolicy": "restart",
            "version": "0.1.0"
        })
    );
}
