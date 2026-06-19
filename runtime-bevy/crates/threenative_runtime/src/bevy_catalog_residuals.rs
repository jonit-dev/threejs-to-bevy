use serde_json::{Value, json};

pub fn report_disabled_entity_query_participation(entity: &str, participates: bool) -> Value {
    json!({
        "entity": entity,
        "participatesInQueries": participates,
        "policy": "portable-participation-state",
        "rendererVisibility": "unchanged",
        "schema": "threenative.bevy-catalog.ecs",
        "version": "0.1.0"
    })
}

pub fn report_window_resize_and_scale_factor(width: u32, height: u32, scale_factor: f64) -> Value {
    json!({
        "diagnostics": [
            {
                "code": "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
                "message": "Portable runtime bundles are single-window; per-window targets remain diagnostic-only.",
                "path": "runtime.config.json/window/multiWindow",
                "severity": "error",
                "suggestion": "Use one declared primary window and route additional surfaces through portable UI or overlays."
            }
        ],
        "resize": {
            "height": height,
            "scaleFactor": scale_factor,
            "width": width
        },
        "schema": "threenative.bevy-catalog.window",
        "version": "0.1.0"
    })
}

pub fn unsupported_gltf_executable_extension_processor(extension: &str, path: &str) -> Value {
    json!({
        "code": "TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED",
        "message": format!("glTF extension '{extension}' uses an executable processor outside the portable import policy."),
        "path": path,
        "severity": "error",
        "suggestion": "Use schema-backed metadata transforms such as declared AnimationGraph import metadata."
    })
}

pub fn report_generated_asset_policy(asset_id: &str, schema: &str) -> Value {
    json!({
        "assetId": asset_id,
        "path": format!("artifacts/generated/{asset_id}.json"),
        "schema": schema,
        "status": "bundle-artifact"
    })
}
