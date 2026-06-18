use serde_json::json;
use threenative_loader::{MaterialsIr, WorldIr};
use threenative_runtime::{NativeSceneDiagnosticSeverity, native_scene_startup_diagnostics};

#[test]
fn should_diagnose_when_scene_has_renderers_but_no_camera_or_light() {
    let world: WorldIr = serde_json::from_value(json!({
        "schema": "threenative.world",
        "version": "0.1.0",
        "entities": [
            {
                "id": "cube.main",
                "components": {
                    "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.main" },
                    "Transform": { "position": [0, 0, 0] }
                }
            }
        ],
        "resources": {}
    }))
    .expect("world should parse");
    let materials: MaterialsIr = serde_json::from_value(json!({
        "schema": "threenative.materials",
        "version": "0.1.0",
        "materials": [{ "id": "mat.main", "kind": "standard", "color": "#ffffff" }]
    }))
    .expect("materials should parse");

    let diagnostics = native_scene_startup_diagnostics(&world, &materials);
    let codes = diagnostics
        .iter()
        .map(|diagnostic| diagnostic.code)
        .collect::<Vec<_>>();
    let severities = diagnostics
        .iter()
        .map(|diagnostic| diagnostic.severity.clone())
        .collect::<Vec<_>>();

    assert_eq!(
        codes,
        vec!["TN_BEVY_CAMERA_MISSING", "TN_BEVY_LIGHT_MISSING"]
    );
    assert_eq!(
        severities,
        vec![
            NativeSceneDiagnosticSeverity::Error,
            NativeSceneDiagnosticSeverity::Warning,
        ]
    );
}

#[test]
fn should_warn_when_camera_exists_without_active_camera_resource() {
    let world: WorldIr = serde_json::from_value(json!({
        "schema": "threenative.world",
        "version": "0.1.0",
        "entities": [
            {
                "id": "camera.main",
                "components": {
                    "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 }
                }
            },
            {
                "id": "light.key",
                "components": {
                    "Light": { "kind": "directional", "color": "#ffffff", "intensity": 2 }
                }
            },
            {
                "id": "cube.main",
                "components": {
                    "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.main" },
                    "Transform": { "position": [0, 0, 0] }
                }
            }
        ],
        "resources": {}
    }))
    .expect("world should parse");
    let materials: MaterialsIr = serde_json::from_value(json!({
        "schema": "threenative.materials",
        "version": "0.1.0",
        "materials": [{ "id": "mat.main", "kind": "standard", "color": "#ffffff" }]
    }))
    .expect("materials should parse");

    let warnings = native_scene_startup_diagnostics(&world, &materials);

    assert_eq!(warnings.len(), 1);
    assert_eq!(warnings[0].code, "TN_BEVY_ACTIVE_CAMERA_MISSING");
    assert_eq!(warnings[0].severity, NativeSceneDiagnosticSeverity::Warning);
}

#[test]
fn should_error_when_active_camera_references_non_camera_entity() {
    let world: WorldIr = serde_json::from_value(json!({
        "schema": "threenative.world",
        "version": "0.1.0",
        "entities": [
            {
                "id": "camera.main",
                "components": {
                    "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 }
                }
            },
            {
                "id": "cube.main",
                "components": {
                    "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.main" },
                    "Transform": { "position": [0, 0, 0] }
                }
            },
            {
                "id": "light.key",
                "components": {
                    "Light": { "kind": "directional", "color": "#ffffff", "intensity": 2 }
                }
            }
        ],
        "resources": { "ActiveCamera": { "entity": "cube.main" } }
    }))
    .expect("world should parse");
    let materials: MaterialsIr = serde_json::from_value(json!({
        "schema": "threenative.materials",
        "version": "0.1.0",
        "materials": [{ "id": "mat.main", "kind": "standard", "color": "#ffffff" }]
    }))
    .expect("materials should parse");

    let diagnostics = native_scene_startup_diagnostics(&world, &materials);

    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, "TN_BEVY_ACTIVE_CAMERA_INVALID");
    assert_eq!(
        diagnostics[0].severity,
        NativeSceneDiagnosticSeverity::Error
    );
}

#[test]
fn should_not_warn_for_viewable_scene() {
    let world: WorldIr = serde_json::from_value(json!({
        "schema": "threenative.world",
        "version": "0.1.0",
        "entities": [
            {
                "id": "camera.main",
                "components": {
                    "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 }
                }
            },
            {
                "id": "light.key",
                "components": {
                    "Light": { "kind": "directional", "color": "#ffffff", "intensity": 2 }
                }
            },
            {
                "id": "cube.main",
                "components": {
                    "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.main" },
                    "Transform": { "position": [0, 0, 0] }
                }
            }
        ],
        "resources": { "ActiveCamera": { "entity": "camera.main" } }
    }))
    .expect("world should parse");
    let materials: MaterialsIr = serde_json::from_value(json!({
        "schema": "threenative.materials",
        "version": "0.1.0",
        "materials": [{ "id": "mat.main", "kind": "standard", "color": "#ffffff" }]
    }))
    .expect("materials should parse");

    assert!(native_scene_startup_diagnostics(&world, &materials).is_empty());
}
