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

pub fn report_query_combinations(mut entities: Vec<&str>, limit: usize) -> Value {
    entities.sort_unstable();
    let mut observations = Vec::new();
    'outer: for left in 0..entities.len() {
        for right in (left + 1)..entities.len() {
            if observations.len() >= limit {
                break 'outer;
            }
            observations.push(json!({
                "a": entities[left],
                "b": entities[right],
                "order": observations.len() + 1
            }));
        }
    }
    json!({
        "observations": observations,
        "schema": "threenative.bevy-catalog.ecs.query-combinations",
        "version": "0.1.0"
    })
}

pub fn report_window_resize_and_scale_factor(width: u32, height: u32, scale_factor: f64) -> Value {
    json!({
        "diagnostics": [
            {
                "code": "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
                "message": "Custom cursor images and cursor animation are diagnostic-only until a portable cursor policy exists.",
                "path": "bevy-catalog-residuals.json/uiWindow/windowPolicy/cursorImage",
                "severity": "error",
                "suggestion": "Use the portable primary-window runtime configuration or a target-specific adapter."
            },
            {
                "code": "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
                "message": "Low-power present mode and background throttling are host policies outside the portable runtime contract.",
                "path": "bevy-catalog-residuals.json/uiWindow/windowPolicy/lowPowerPresentMode",
                "severity": "error",
                "suggestion": "Use the portable primary-window runtime configuration or a target-specific adapter."
            },
            {
                "code": "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
                "message": "Runtime clear-color/window background mutation is not promoted without shared web/native observation evidence.",
                "path": "bevy-catalog-residuals.json/uiWindow/windowPolicy/clearColorRuntimeUpdate",
                "severity": "error",
                "suggestion": "Use the portable primary-window runtime configuration or a target-specific adapter."
            },
            {
                "code": "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
                "message": "Portable runtime bundles are single-window; per-window targets remain diagnostic-only.",
                "path": "bevy-catalog-residuals.json/uiWindow/windowPolicy/multiWindow",
                "severity": "error",
                "suggestion": "Use the portable primary-window runtime configuration or a target-specific adapter."
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

pub fn report_gltf_metadata_transform_policy(extension: &str, transform: &str) -> Value {
    json!({
        "extension": extension,
        "processor": "metadata",
        "schema": "threenative.bevy-catalog.assets.gltf-metadata-transform",
        "transform": transform,
        "version": "0.1.0"
    })
}

pub fn target_profile_output_diagnostic(output: &str, targets: Vec<&str>, path: &str) -> Value {
    let required_target = if output == "web" { "web" } else { "desktop" };
    let suggestion = if required_target == "web" {
        "Add 'web' to target.profile.json targets or choose a non-web output."
    } else {
        "Add 'desktop' to target.profile.json targets for offline, native, or package outputs."
    };
    json!({
        "code": "TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED",
        "message": format!("Target profile for '{output}' output must include '{required_target}'."),
        "path": path,
        "severity": "error",
        "suggestion": suggestion,
        "target": output,
        "value": targets
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
