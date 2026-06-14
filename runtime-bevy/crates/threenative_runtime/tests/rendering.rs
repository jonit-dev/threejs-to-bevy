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
    assert_directional_light(app.world_mut(), "light.sun");
    assert_point_light(app.world_mut(), "light.point");
    assert_spot_light(app.world_mut(), "light.spot");
    assert!(has_orthographic_camera(app.world_mut(), "camera.ui"));
    assert_transform(
        app.world_mut(),
        "cube.visible",
        [1.0, 2.0, 3.0],
        [2.0, 2.0, 2.0],
    );
    assert_material(app.world_mut(), "cube.visible");
    assert_eq!(
        visibility_for(app.world_mut(), "capsule.hidden"),
        Some(Visibility::Hidden)
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn assert_directional_light(world: &mut World, id: &str) {
    let mut query = world.query::<(&ThreeNativeId, Option<&DirectionalLight>)>();
    let light = query
        .iter(world)
        .find_map(|(stable_id, light)| (stable_id.0 == id).then_some(light).flatten())
        .expect("directional light should be spawned");

    assert!((light.illuminance - 4.0).abs() < 0.01);
    let color = light.color.to_srgba();
    assert!((color.red - 1.0).abs() < 0.01);
    assert!((color.green - 0xcc as f32 / 255.0).abs() < 0.01);
    assert!((color.blue - 0x88 as f32 / 255.0).abs() < 0.01);
}

fn assert_point_light(world: &mut World, id: &str) {
    let mut query = world.query::<(&ThreeNativeId, Option<&PointLight>)>();
    let light = query
        .iter(world)
        .find_map(|(stable_id, light)| (stable_id.0 == id).then_some(light).flatten())
        .expect("point light should be spawned");

    assert!((light.intensity - (2.0 * std::f32::consts::TAU * 2.0)).abs() < 0.01);
    assert!((light.range - 12.0).abs() < 0.01);
}

fn assert_spot_light(world: &mut World, id: &str) {
    let mut query = world.query::<(&ThreeNativeId, Option<&SpotLight>)>();
    let light = query
        .iter(world)
        .find_map(|(stable_id, light)| (stable_id.0 == id).then_some(light).flatten())
        .expect("spot light should be spawned");

    assert!((light.intensity - (3.0 * std::f32::consts::TAU * 2.0)).abs() < 0.01);
    assert!((light.range - 16.0).abs() < 0.01);
    assert!((light.outer_angle - 0.65).abs() < 0.01);
}

fn assert_transform(world: &mut World, id: &str, translation: [f32; 3], scale: [f32; 3]) {
    let mut query = world.query::<(&ThreeNativeId, &Transform)>();
    let transform = query
        .iter(world)
        .find_map(|(stable_id, transform)| (stable_id.0 == id).then_some(transform))
        .expect("entity transform should be spawned");

    assert_eq!(transform.translation, Vec3::from_array(translation));
    assert_eq!(transform.scale, Vec3::from_array(scale));
}

fn assert_material(world: &mut World, id: &str) {
    let handle = {
        let mut query = world.query::<(&ThreeNativeId, &Handle<StandardMaterial>)>();
        query
            .iter(world)
            .find_map(|(stable_id, handle)| (stable_id.0 == id).then_some(handle.clone()))
            .expect("entity material handle should be spawned")
    };
    let material = world
        .resource::<Assets<StandardMaterial>>()
        .get(&handle)
        .expect("standard material should be registered");
    let color = material.base_color.to_srgba();

    assert!((color.red - 0x33 as f32 / 255.0).abs() < 0.01);
    assert!((color.green - 0x66 as f32 / 255.0).abs() < 0.01);
    assert!((color.blue - 0x99 as f32 / 255.0).abs() < 0.01);
    assert!(material.base_color_texture.is_some());
    assert!(material.emissive_texture.is_some());
    assert!(material.metallic_roughness_texture.is_some());
    assert!(material.normal_map_texture.is_some());
    assert!(material.occlusion_texture.is_some());
    assert!((material.metallic - 0.25).abs() < 0.01);
    assert!((material.perceptual_roughness - 0.42).abs() < 0.01);
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
    { "id": "light.sun", "components": { "Light": { "kind": "directional", "color": "#ffcc88", "intensity": 2 } } },
    { "id": "light.point", "components": { "Light": { "kind": "point", "color": "#ffffff", "intensity": 2, "range": 12 } } },
    { "id": "light.spot", "components": { "Light": { "kind": "spot", "color": "#ffffff", "intensity": 3, "range": 16, "angle": 0.65 } } },
    {
      "id": "cube.visible",
      "components": {
        "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.main", "visible": true },
        "Transform": { "position": [1, 2, 3], "rotation": [0, 0, 0, 1], "scale": [2, 2, 2] }
      }
    },
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
  "assets": [
    { "id": "mesh.cube", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] },
    { "id": "mesh.capsule", "kind": "mesh", "format": "generated", "primitive": "capsule", "size": [0.4, 1.2] },
    { "id": "tex.albedo", "kind": "texture", "format": "png", "path": "assets/albedo.png" },
    { "id": "tex.normal", "kind": "texture", "format": "png", "path": "assets/normal.png" },
    { "id": "tex.mr", "kind": "texture", "format": "png", "path": "assets/metallic-roughness.png" },
    { "id": "tex.emissive", "kind": "texture", "format": "png", "path": "assets/emissive.png" },
    { "id": "tex.occlusion", "kind": "texture", "format": "png", "path": "assets/occlusion.png" }
  ]
}"#,
    );
    write(
        &root,
        "materials.ir.json",
        r##"{
  "schema": "threenative.materials",
  "version": "0.1.0",
  "materials": [{
    "id": "mat.main",
    "kind": "standard",
    "color": "#336699",
    "baseColorTexture": "tex.albedo",
    "normalTexture": "tex.normal",
    "metallicRoughnessTexture": "tex.mr",
    "emissiveTexture": "tex.emissive",
    "occlusionTexture": "tex.occlusion",
    "roughness": 0.42,
    "metalness": 0.25
  }]
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
