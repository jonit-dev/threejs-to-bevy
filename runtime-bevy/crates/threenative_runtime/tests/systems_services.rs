use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::json;
use threenative_loader::load_bundle;
use threenative_runtime::{
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot},
    systems_services::{
        NativeOverlapRequest, NativePointerRayHit, NativePointerRayRequest, NativePointerRayResult,
        NativeQueryShape, NativeRaycastHit, NativeRaycastRequest, NativeRaycastResult,
        NativeShapeCastRequest, animation_play_payload, overlap_primitive, pick_mesh, pointer_ray,
        raycast_primitive, shape_cast_primitive,
    },
};

#[test]
fn systems_services_should_raycast_primitive_floor() {
    let root = write_bundle("raycast-floor");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let snapshot = build_system_context_snapshot(&bundle, system, time());

    let result = raycast_primitive(
        &snapshot,
        &NativeRaycastRequest {
            direction: [0.0, -1.0, 0.0],
            ignore: vec!["player".to_owned()],
            layer: None,
            layers: Vec::new(),
            mask: Vec::new(),
            max_distance: 2.0,
            origin: [0.0, 1.0, 0.0],
        },
    );

    assert_eq!(
        result,
        NativeRaycastResult::Hit(NativeRaycastHit {
            distance: 0.95,
            entity: "floor".to_owned(),
            hit: true,
            normal: [0.0, 1.0, 0.0],
            point: [0.0, 0.05, 0.0],
        })
    );
    assert_eq!(
        serde_json::to_value(result).expect("raycast result should serialize"),
        json!({
            "distance": 0.95,
            "entity": "floor",
            "hit": true,
            "normal": [0.0, 1.0, 0.0],
            "point": [0.0, 0.05, 0.0],
        })
    );
}

#[test]
fn systems_services_should_overlap_with_portable_filters() {
    let root = write_bundle("overlap-filter");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let snapshot = build_system_context_snapshot(&bundle, system, time());

    let result = overlap_primitive(
        &snapshot,
        &NativeOverlapRequest {
            ignore: Vec::new(),
            layer: Some("player".to_owned()),
            layers: Vec::new(),
            mask: vec!["world".to_owned()],
            position: [0.0, 0.5, 0.0],
            shape: NativeQueryShape::Sphere { radius: 0.75 },
        },
    );

    assert_eq!(result.entities, vec!["floor".to_owned()]);
}

#[test]
fn systems_services_should_shape_cast_primitive_collider() {
    let root = write_bundle("shape-cast");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let snapshot = build_system_context_snapshot(&bundle, system, time());

    let result = shape_cast_primitive(
        &snapshot,
        &NativeShapeCastRequest {
            direction: [0.0, -1.0, 0.0],
            ignore: vec!["player".to_owned()],
            layer: None,
            layers: Vec::new(),
            mask: Vec::new(),
            max_distance: 2.0,
            origin: [0.0, 1.0, 0.0],
            shape: NativeQueryShape::Box {
                half_extents: [0.25, 0.25, 0.25],
            },
        },
    );

    assert_eq!(
        result,
        NativeRaycastResult::Hit(NativeRaycastHit {
            distance: 0.7,
            entity: "floor".to_owned(),
            hit: true,
            normal: [0.0, 1.0, 0.0],
            point: [0.0, 0.3, 0.0],
        })
    );
}

#[test]
fn systems_services_should_pick_mesh_renderer_bounds() {
    let root = write_bundle("pick-mesh");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let snapshot = build_system_context_snapshot(&bundle, system, time());

    let result = pick_mesh(
        &snapshot,
        &NativeRaycastRequest {
            direction: [0.0, 0.0, -1.0],
            ignore: Vec::new(),
            layer: None,
            layers: Vec::new(),
            mask: Vec::new(),
            max_distance: 10.0,
            origin: [0.0, 0.0, 2.0],
        },
    );

    assert_eq!(
        result,
        NativeRaycastResult::Hit(NativeRaycastHit {
            distance: 1.5,
            entity: "crate".to_owned(),
            hit: true,
            normal: [0.0, 0.0, 1.0],
            point: [0.0, 0.0, 0.5],
        })
    );
}

#[test]
fn systems_services_should_generate_pointer_ray_from_active_camera() {
    let root = write_bundle("pointer-ray");
    let bundle = load_bundle(&root).expect("bundle should load");
    let system = &bundle
        .systems
        .as_ref()
        .expect("systems should load")
        .systems[0];
    let snapshot = build_system_context_snapshot(&bundle, system, time());

    let result = pointer_ray(
        &snapshot,
        &NativePointerRayRequest {
            aspect: None,
            camera: None,
            max_distance: None,
            pointer: [0.5, 0.5],
        },
    );

    assert_eq!(
        result,
        NativePointerRayResult::Hit(NativePointerRayHit {
            direction: [0.0, 0.0, -1.0],
            hit: true,
            max_distance: 100.0,
            origin: [0.0, 0.0, 4.0],
        })
    );
}

#[test]
fn systems_services_should_log_animation_play_service_call() {
    assert_eq!(
        animation_play_payload("player", "run", json!({ "loop": true })),
        json!({
            "request": { "clip": "run", "entity": "player", "options": { "loop": true } },
            "result": { "accepted": true },
        })
    );
}

fn write_bundle(name: &str) -> PathBuf {
    let root = root(name);
    fs::create_dir_all(&root).expect("temp bundle should be created");
    write_json(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-services",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "camera.main",
      "components": {
        "Transform": { "position": [0, 0, 4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Camera": { "kind": "perspective", "fovY": 60, "near": 0.1, "far": 100 }
      }
    },
    {
      "id": "player",
      "components": {
        "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
      }
    },
    {
      "id": "floor",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "Collider": { "kind": "box", "layer": "world", "mask": ["player"], "size": [8, 0.1, 8] }
      }
    },
    {
      "id": "crate",
      "components": {
        "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
        "MeshRenderer": { "mesh": "mesh.crate", "material": "mat.crate" }
      }
    }
  ],
  "resources": {
    "ActiveCamera": { "entity": "camera.main" }
  }
}"#,
    );
    write_json(
        &root,
        "systems.ir.json",
        r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "raycast",
      "schedule": "fixedUpdate",
      "reads": ["Transform", "Collider", "MeshRenderer", "Camera"],
      "writes": [],
      "queries": [{ "with": ["Transform"], "without": [] }],
      "commands": [],
      "eventReads": [],
      "eventWrites": [],
      "services": ["physics.overlap", "physics.raycast", "physics.shapeCast", "picking.mesh", "picking.pointerRay"],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_raycast" }
    }
  ]
}"#,
    );
    write_common(&root);
    fs::write(
        root.join("scripts.bundle.js"),
        "export const systems = Object.freeze({});\n",
    )
    .expect("script bundle should be written");
    root
}

fn write_common(root: &Path) {
    write_json(
        root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[
  { "id": "mesh.crate", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] }
]}"#,
    );
    write_json(
        root,
        "materials.ir.json",
        r#"{"schema":"threenative.materials","version":"0.1.0","materials":[]}"#,
    );
    write_json(
        root,
        "target.profile.json",
        r#"{"schema":"threenative.target-profile","version":"0.1.0","targets":["desktop"]}"#,
    );
}

fn root(name: &str) -> PathBuf {
    let root =
        std::env::temp_dir().join(format!("tn-systems-services-{name}-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).expect("old temp bundle should be removed");
    }
    root
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}

fn time() -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta: 0.016,
        dt: 0.016,
        elapsed: 1.0,
        fixed_delta: 0.016,
        fixed_dt: 0.016,
        paused: false,
    }
}
