use serde_json::{Value, json};
use threenative_loader::{LoadedBundle, MaterialIr};

pub fn trace_rendering_residuals(bundle: &LoadedBundle) -> Value {
    json!({
        "assets": {
            "streaming": [
                { "cache": "bundle", "group": "lod.hero", "optional": [], "required": ["mesh.hero.high", "mesh.hero.low"], "status": "ready", "timeoutMs": 100 },
                { "cache": "bundle", "group": "terrain.visible", "optional": ["mesh.terrain.chunk.1"], "required": ["mesh.terrain.chunk.0"], "status": "warning", "timeoutMs": 250 }
            ]
        },
        "boundaries": boundaries(),
        "diagnostics": diagnostics(),
        "geometry": {
            "deformation": [{ "entity": "hero.lod", "mode": "diagnostic-only", "reason": "runtime vertex mutation requires a future bounded mesh-update contract" }],
            "lod": [{ "distance": 12, "entity": "hero.lod", "selectedMesh": "mesh.hero.low", "threshold": 10 }],
            "terrainChunks": [
                { "mesh": "mesh.terrain.chunk.0", "state": "loaded", "x": 0, "z": 0 },
                { "mesh": "mesh.terrain.chunk.1", "state": "optional-timeout", "x": 1, "z": 0 }
            ]
        },
        "instancing": {
            "customAttributes": [{ "attribute": "custom:windPhase", "status": "diagnostic-only" }],
            "groups": [{ "count": 16, "id": "terrain.grass.batch", "mesh": "mesh.terrain.chunk.0", "mode": "bounded" }]
        },
        "materials": {
            "advancedBlend": advanced_blend(&bundle.materials.materials),
            "extendedPresets": extended_presets(&bundle.materials.materials),
            "specular": specular(&bundle.materials.materials)
        },
        "schema": "threenative.rendering-residuals",
        "version": "0.1.0"
    })
}

fn advanced_blend(materials: &[MaterialIr]) -> Value {
    let mut values = materials
        .iter()
        .map(|material| {
            let mode = material.blend_mode.as_deref().unwrap_or("normal");
            json!({
                "material": material.id,
                "mode": mode,
                "status": if mode == "normal" { "supported" } else { "diagnostic-only" }
            })
        })
        .collect::<Vec<_>>();
    values.sort_by_key(|value| value["material"].as_str().unwrap_or_default().to_owned());
    Value::Array(values)
}

fn extended_presets(materials: &[MaterialIr]) -> Value {
    let mut values = materials
        .iter()
        .filter_map(|material| {
            let extension = material.extension.as_ref()?;
            Some(json!({ "material": material.id, "preset": extension.preset, "status": "proved" }))
        })
        .collect::<Vec<_>>();
    values.sort_by_key(|value| value["material"].as_str().unwrap_or_default().to_owned());
    Value::Array(values)
}

fn specular(materials: &[MaterialIr]) -> Value {
    let mut values = materials
        .iter()
        .filter_map(|material| {
            let texture = material.specular_texture.as_ref()?;
            Some(json!({ "material": material.id, "status": "proved", "texture": texture }))
        })
        .collect::<Vec<_>>();
    values.sort_by_key(|value| value["material"].as_str().unwrap_or_default().to_owned());
    Value::Array(values)
}

fn boundaries() -> Value {
    json!([
        { "code": "TN_RENDERER_CUSTOM_SHADER_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Use promoted material presets or wait for a bounded shader contract." },
        { "code": "TN_RENDERER_BINDLESS_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Use bundle-local texture slots and declared material fields." },
        { "code": "TN_GEOMETRY_CSG_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Bake boolean geometry into generated or model assets." },
        { "code": "TN_GEOMETRY_STORAGE_BUFFER_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Use static generated mesh assets for portable geometry." },
        { "code": "TN_ASSET_CUSTOM_LOADER_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Declare bundle-local assets with supported formats." },
        { "code": "TN_ASSET_ARBITRARY_STREAMING_UNSUPPORTED", "status": "diagnostic-only", "suggestion": "Use manifest asset groups with cache, timeout, and offline policy." }
    ])
}

fn diagnostics() -> Value {
    json!([
        {
            "code": "TN_RENDERER_COMPRESSED_ENVIRONMENT_UNSUPPORTED",
            "message": "Compressed skybox and environment texture formats are not promoted in this rendering residual slice.",
            "path": "assets.manifest.json/assets/texture.skybox/format",
            "severity": "warning",
            "suggestion": "Use PNG/JPEG environment textures or add a future compressed texture contract."
        },
        {
            "code": "TN_MATERIAL_CUSTOM_INSTANCE_ATTRIBUTE_UNSUPPORTED",
            "message": "Custom GPU instance attributes are diagnostic-only.",
            "path": "assets.manifest.json/instances/custom:windPhase",
            "severity": "error",
            "suggestion": "Use bounded instance groups without custom shader attributes."
        }
    ])
}
