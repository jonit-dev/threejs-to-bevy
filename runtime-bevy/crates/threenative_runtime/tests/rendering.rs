use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::prelude::*;
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::map_world::map_bundle_into_world;

#[test]
fn rendering_should_map_visibility_and_v2_lights() {
    let root = write_rendering_bundle();
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    assert!(has_component::<PointLight>(app.world_mut(), "light.point"));
    assert!(has_component::<SpotLight>(app.world_mut(), "light.spot"));
    assert!(has_orthographic_camera(app.world_mut(), "camera.ui"));
    assert_eq!(
        visibility_for(app.world_mut(), "capsule.hidden"),
        Some(Visibility::Hidden)
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn has_component<T: Component>(world: &mut World, id: &str) -> bool {
    let mut query = world.query::<(&ThreeNativeId, Option<&T>)>();
    query
        .iter(world)
        .any(|(stable_id, component)| stable_id.0 == id && component.is_some())
}

fn has_orthographic_camera(world: &mut World, id: &str) -> bool {
    let mut query = world.query::<(&ThreeNativeId, Option<&Projection>)>();
    query.iter(world).any(|(stable_id, projection)| {
        stable_id.0 == id
            && matches!(
                projection,
                Some(Projection::Orthographic(OrthographicProjection { .. }))
            )
    })
}

fn visibility_for(world: &mut World, id: &str) -> Option<Visibility> {
    let mut query = world.query::<(&ThreeNativeId, Option<&Visibility>)>();
    query.iter(world).find_map(|(stable_id, visibility)| {
        if stable_id.0 == id {
            visibility.copied()
        } else {
            None
        }
    })
}

fn write_rendering_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary bundle directory should be created");
    write(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "rendering",
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write(
        &root,
        "world.ir.json",
        r##"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "camera.ui", "components": { "Camera": { "kind": "orthographic", "near": 0.1, "far": 100, "size": 4 } } },
    { "id": "light.point", "components": { "Light": { "kind": "point", "color": "#ffffff", "intensity": 2 } } },
    { "id": "light.spot", "components": { "Light": { "kind": "spot", "color": "#ffffff", "intensity": 3 } } },
    {
      "id": "capsule.hidden",
      "components": {
        "MeshRenderer": { "mesh": "mesh.capsule", "material": "mat.main", "visible": false },
        "Transform": { "position": [0, 0, 0] },
        "Visibility": { "visible": false }
      }
    }
  ]
}"##,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [{ "id": "mesh.capsule", "kind": "mesh", "format": "generated", "primitive": "capsule", "size": [0.4, 1.2] }]
}"#,
    );
    write(
        &root,
        "materials.ir.json",
        r##"{
  "schema": "threenative.materials",
  "version": "0.1.0",
  "materials": [{ "id": "mat.main", "kind": "standard", "color": "#ffffff" }]
}"##,
    );
    write(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    root
}

fn write(root: &PathBuf, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
