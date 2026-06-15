use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    animation::{AnimationPlugin, RepeatAnimation, graph::AnimationGraph},
    asset::AssetPlugin,
    gltf::GltfPlugin,
    pbr::{NotShadowCaster, NotShadowReceiver},
    prelude::*,
    render::{
        alpha::AlphaMode,
        mesh::{MeshVertexAttribute, VertexAttributeValues},
        render_resource::VertexFormat,
    },
    scene::ScenePlugin,
};
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::map_world::{
    NativeAnimationPlayback, advance_native_animation_playback, bind_native_animation_players,
    map_bundle_into_world,
};

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
    assert!(has_component::<NotShadowCaster>(
        app.world_mut(),
        "cube.visible"
    ));
    assert!(has_component::<NotShadowReceiver>(
        app.world_mut(),
        "cube.visible"
    ));
    assert_eq!(
        visibility_for(app.world_mut(), "capsule.hidden"),
        Some(Visibility::Hidden)
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_load_material_textures_through_asset_server() {
    let root = write_rendering_bundle();
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let albedo = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == "tex.albedo")
        .expect("albedo texture should be loaded");
    assert_eq!(albedo.wrap_s.as_deref(), Some("repeat"));
    assert_eq!(albedo.wrap_t.as_deref(), Some("mirroredRepeat"));
    assert_eq!(albedo.min_filter.as_deref(), Some("nearestMipmapLinear"));
    assert_eq!(albedo.mag_filter.as_deref(), Some("nearest"));
    assert_eq!(albedo.repeat, Some([4.0, 2.0]));
    assert_eq!(albedo.offset, Some([0.25, 0.5]));
    assert_eq!(albedo.center, Some([0.5, 0.5]));
    assert_eq!(albedo.rotation, Some(0.5));
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin {
            file_path: root.display().to_string(),
            ..Default::default()
        },
    ));
    app.init_asset::<Image>();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let material = material_for(app.world_mut(), "cube.visible");
    assert_ne!(
        material.base_color_texture,
        Some(Handle::<Image>::default())
    );
    assert_ne!(
        material.normal_map_texture,
        Some(Handle::<Image>::default())
    );
    assert_ne!(
        material.metallic_roughness_texture,
        Some(Handle::<Image>::default())
    );
    assert_ne!(material.emissive_texture, Some(Handle::<Image>::default()));
    assert_ne!(material.occlusion_texture, Some(Handle::<Image>::default()));
    assert_ne!(material.clearcoat_texture, Some(Handle::<Image>::default()));
    assert_ne!(
        material.clearcoat_roughness_texture,
        Some(Handle::<Image>::default())
    );
    assert_ne!(
        material.specular_transmission_texture,
        Some(Handle::<Image>::default())
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_runtime_antialias_to_msaa_resource() {
    let root = write_rendering_bundle();
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    assert_eq!(app.world().resource::<Msaa>(), &Msaa::Sample8);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_expanded_generated_primitive_catalog() {
    let root = write_primitive_catalog_bundle();
    let bundle = load_bundle(&root).expect("primitive catalog bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    for id in [
        "entity.cone",
        "entity.frustum",
        "entity.torus",
        "entity.circle",
        "entity.annulus",
        "entity.polygon",
        "entity.extruded",
    ] {
        assert_mesh_handle(app.world_mut(), id);
    }

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_custom_generated_mesh_attributes() {
    let root = write_custom_mesh_bundle();
    let bundle = load_bundle(&root).expect("custom mesh bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    assert_custom_mesh_attributes(app.world_mut(), "entity.custom");

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_attach_animation_playback_to_model_renderers() {
    let root = write_animated_model_bundle();
    let bundle = load_bundle(&root).expect("animated model bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let playback = animation_playback_for(app.world_mut(), "hero");
    assert_eq!(playback.asset, "model.hero");
    assert_eq!(playback.active_state, Some("idle".to_owned()));
    assert_eq!(playback.clip, "idle");
    assert_eq!(playback.source_clip, "idle");
    assert!(playback.loop_);
    assert!((playback.speed - 1.0).abs() < 0.01);
    assert_eq!(playback.time_seconds, 0.0);
    advance_native_animation_playback(app.world_mut(), 0.5);
    assert_eq!(
        animation_playback_for(app.world_mut(), "hero").time_seconds,
        0.5
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_spawn_gltf_scene_for_model_renderers_when_asset_server_exists() {
    let root = write_animated_model_bundle();
    let bundle = load_bundle(&root).expect("animated model bundle should load");
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin {
            file_path: root.display().to_string(),
            ..Default::default()
        },
        AnimationPlugin,
        ScenePlugin,
        GltfPlugin::default(),
    ));
    app.finish();
    app.cleanup();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let scene_roots = app
        .world_mut()
        .query::<(&ThreeNativeId, &Handle<Scene>, &Transform)>()
        .iter(app.world())
        .map(|(id, _scene, transform)| (id.0.clone(), transform.translation))
        .collect::<Vec<_>>();
    assert!(
        scene_roots
            .iter()
            .any(|(id, translation)| id == "hero" && *translation == Vec3::ZERO),
        "expected hero to be spawned as a Bevy SceneBundle from the GLTF asset, got {scene_roots:?}",
    );

    let placeholder_count = app
        .world_mut()
        .query::<(&ThreeNativeId, &Handle<Mesh>)>()
        .iter(app.world())
        .filter(|(id, _mesh)| id.0 == "hero")
        .count();
    assert_eq!(
        placeholder_count, 0,
        "GLTF-backed model renderers should not also spawn cuboid placeholders"
    );
    assert_eq!(
        animation_playback_for(app.world_mut(), "hero").asset,
        "model.hero"
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_bind_added_animation_players_to_model_renderer_clip() {
    let root = write_animated_model_bundle();
    let bundle = load_bundle(&root).expect("animated model bundle should load");
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        AssetPlugin {
            file_path: root.display().to_string(),
            ..Default::default()
        },
        AnimationPlugin,
        ScenePlugin,
        GltfPlugin::default(),
    ));
    app.add_systems(Update, bind_native_animation_players);
    app.finish();
    app.cleanup();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");
    let hero = entity_for_id(app.world_mut(), "hero");
    let player = app.world_mut().spawn(AnimationPlayer::default()).id();
    app.world_mut().entity_mut(hero).push_children(&[player]);

    app.update();

    assert!(
        app.world()
            .entity(player)
            .contains::<Handle<AnimationGraph>>(),
        "animation player should receive a generated graph for the selected glTF clip",
    );
    let player_ref = app.world().entity(player).get::<AnimationPlayer>().unwrap();
    let active = player_ref
        .playing_animations()
        .next()
        .map(|(_index, active)| active)
        .expect("animation player should be playing the selected clip");
    assert_eq!(active.repeat_mode(), RepeatAnimation::Forever);
    assert!((active.speed() - 1.0).abs() < 0.01);

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
    assert!((light.shadow_depth_bias - 0.001).abs() < 0.0001);
    assert!((light.shadow_normal_bias - 0.03).abs() < 0.0001);
}

fn entity_for_id(world: &mut World, id: &str) -> Entity {
    world
        .query::<(Entity, &ThreeNativeId)>()
        .iter(world)
        .find_map(|(entity, stable_id)| (stable_id.0 == id).then_some(entity))
        .expect("entity should exist")
}

fn assert_point_light(world: &mut World, id: &str) {
    let mut query = world.query::<(&ThreeNativeId, Option<&PointLight>)>();
    let light = query
        .iter(world)
        .find_map(|(stable_id, light)| (stable_id.0 == id).then_some(light).flatten())
        .expect("point light should be spawned");

    assert!((light.intensity - (2.0 * std::f32::consts::TAU * 2.0)).abs() < 0.01);
    assert!((light.range - 12.0).abs() < 0.01);
    assert!((light.shadow_depth_bias - 0.002).abs() < 0.0001);
    assert!((light.shadow_normal_bias - 0.04).abs() < 0.0001);
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
    assert!((light.shadow_depth_bias - 0.003).abs() < 0.0001);
    assert!((light.shadow_normal_bias - 0.05).abs() < 0.0001);
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
    let material = material_for(world, id);
    let color = material.base_color.to_srgba();

    assert!((color.red - 0x33 as f32 / 255.0).abs() < 0.01);
    assert!((color.green - 0x66 as f32 / 255.0).abs() < 0.01);
    assert!((color.blue - 0x99 as f32 / 255.0).abs() < 0.01);
    assert!((color.alpha - 0.65).abs() < 0.01);
    assert_eq!(material.alpha_mode, AlphaMode::Mask(0.35));
    assert!((material.emissive.blue - 2.5).abs() < 0.01);
    assert!(material.base_color_texture.is_some());
    assert!(material.emissive_texture.is_some());
    assert!(material.metallic_roughness_texture.is_some());
    assert!(material.normal_map_texture.is_some());
    assert!(material.occlusion_texture.is_some());
    assert!((material.clearcoat - 0.8).abs() < 0.01);
    assert!((material.clearcoat_perceptual_roughness - 0.25).abs() < 0.01);
    assert!((material.metallic - 0.25).abs() < 0.01);
    assert!((material.perceptual_roughness - 0.42).abs() < 0.01);
    assert!((material.reflectance - 0.7).abs() < 0.01);
    assert!((material.specular_transmission - 0.45).abs() < 0.01);
}

fn material_for(world: &mut World, id: &str) -> StandardMaterial {
    let handle = {
        let mut query = world.query::<(&ThreeNativeId, &Handle<StandardMaterial>)>();
        query
            .iter(world)
            .find_map(|(stable_id, handle)| (stable_id.0 == id).then_some(handle.clone()))
            .expect("entity material handle should be spawned")
    };
    world
        .resource::<Assets<StandardMaterial>>()
        .get(&handle)
        .expect("standard material should be registered")
        .clone()
}

fn assert_mesh_handle(world: &mut World, id: &str) {
    let handle = {
        let mut query = world.query::<(&ThreeNativeId, &Handle<Mesh>)>();
        query
            .iter(world)
            .find_map(|(stable_id, handle)| (stable_id.0 == id).then_some(handle.clone()))
            .expect("entity mesh handle should be spawned")
    };
    world
        .resource::<Assets<Mesh>>()
        .get(&handle)
        .expect("mesh asset should be registered");
}

fn assert_custom_mesh_attributes(world: &mut World, id: &str) {
    let handle = {
        let mut query = world.query::<(&ThreeNativeId, &Handle<Mesh>)>();
        query
            .iter(world)
            .find_map(|(stable_id, handle)| (stable_id.0 == id).then_some(handle.clone()))
            .expect("entity mesh handle should be spawned")
    };
    let mesh = world
        .resource::<Assets<Mesh>>()
        .get(&handle)
        .expect("mesh asset should be registered");
    assert!(matches!(
        mesh.attribute(Mesh::ATTRIBUTE_POSITION),
        Some(VertexAttributeValues::Float32x3(values)) if values.len() == 3
    ));
    assert!(matches!(
        mesh.attribute(Mesh::ATTRIBUTE_COLOR),
        Some(VertexAttributeValues::Float32x4(values)) if values.len() == 3
    ));
    assert!(matches!(
        mesh.attribute(Mesh::ATTRIBUTE_UV_1),
        Some(VertexAttributeValues::Float32x2(values)) if values == &[[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]
    ));
    let custom = MeshVertexAttribute::new(
        "Vertex_Custom_weight",
        custom_test_attribute_id("custom:weight"),
        VertexFormat::Float32,
    );
    assert!(matches!(
        mesh.attribute(custom),
        Some(VertexAttributeValues::Float32(values)) if values == &[0.0, 0.5, 1.0]
    ));
}

fn animation_playback_for(world: &mut World, id: &str) -> NativeAnimationPlayback {
    let mut query = world.query::<(&ThreeNativeId, &NativeAnimationPlayback)>();
    query
        .iter(world)
        .find_map(|(stable_id, playback)| (stable_id.0 == id).then_some(playback.clone()))
        .expect("animation playback should be attached")
}

fn custom_test_attribute_id(name: &str) -> usize {
    name.as_bytes().iter().fold(100_000usize, |hash, byte| {
        hash.wrapping_mul(16_777_619) ^ (*byte as usize)
    })
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
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "runtimeConfig": "runtime.config.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": { "antialias": "msaa8" },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
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
    { "id": "light.sun", "components": { "Light": { "kind": "directional", "color": "#ffcc88", "intensity": 2, "shadowBias": 0.001, "shadowNormalBias": 0.03 } } },
    { "id": "light.point", "components": { "Light": { "kind": "point", "color": "#ffffff", "intensity": 2, "range": 12, "shadowBias": 0.002, "shadowNormalBias": 0.04 } } },
    { "id": "light.spot", "components": { "Light": { "kind": "spot", "color": "#ffffff", "intensity": 3, "range": 16, "angle": 0.65, "shadowBias": 0.003, "shadowNormalBias": 0.05 } } },
    {
      "id": "cube.visible",
      "components": {
        "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.main", "visible": true, "castShadow": false, "receiveShadow": false },
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
    {
      "id": "tex.albedo",
      "kind": "texture",
      "format": "png",
      "path": "assets/albedo.png",
      "wrapS": "repeat",
      "wrapT": "mirroredRepeat",
      "minFilter": "nearestMipmapLinear",
      "magFilter": "nearest",
      "repeat": [4, 2],
      "offset": [0.25, 0.5],
      "center": [0.5, 0.5],
      "rotation": 0.5
    },
    { "id": "tex.normal", "kind": "texture", "format": "png", "path": "assets/normal.png" },
    { "id": "tex.mr", "kind": "texture", "format": "png", "path": "assets/metallic-roughness.png" },
    { "id": "tex.emissive", "kind": "texture", "format": "png", "path": "assets/emissive.png" },
    { "id": "tex.occlusion", "kind": "texture", "format": "png", "path": "assets/occlusion.png" },
    { "id": "tex.clearcoat", "kind": "texture", "format": "png", "path": "assets/clearcoat.png" },
    { "id": "tex.clearcoatRoughness", "kind": "texture", "format": "png", "path": "assets/clearcoat-roughness.png" },
    { "id": "tex.transmission", "kind": "texture", "format": "png", "path": "assets/transmission.png" }
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
    "alphaMode": "mask",
    "alphaCutoff": 0.35,
    "color": "#336699",
    "clearcoat": 0.8,
    "clearcoatRoughness": 0.25,
    "emissive": "#0000ff",
    "emissiveIntensity": 2.5,
    "opacity": 0.65,
    "baseColorTexture": "tex.albedo",
    "normalTexture": "tex.normal",
    "metallicRoughnessTexture": "tex.mr",
    "emissiveTexture": "tex.emissive",
    "occlusionTexture": "tex.occlusion",
    "clearcoatTexture": "tex.clearcoat",
    "clearcoatRoughnessTexture": "tex.clearcoatRoughness",
    "transmissionTexture": "tex.transmission",
    "roughness": 0.42,
    "metalness": 0.25,
    "specularIntensity": 0.7,
    "transmission": 0.45
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

fn write_primitive_catalog_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-primitives-{}",
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
  "name": "primitive-catalog",
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
    { "id": "entity.cone", "components": { "MeshRenderer": { "mesh": "mesh.cone", "material": "mat.main" }, "Transform": { "position": [0, 0, 0] } } },
    { "id": "entity.frustum", "components": { "MeshRenderer": { "mesh": "mesh.frustum", "material": "mat.main" }, "Transform": { "position": [1, 0, 0] } } },
    { "id": "entity.torus", "components": { "MeshRenderer": { "mesh": "mesh.torus", "material": "mat.main" }, "Transform": { "position": [2, 0, 0] } } },
    { "id": "entity.circle", "components": { "MeshRenderer": { "mesh": "mesh.circle", "material": "mat.main" }, "Transform": { "position": [3, 0, 0] } } },
    { "id": "entity.annulus", "components": { "MeshRenderer": { "mesh": "mesh.annulus", "material": "mat.main" }, "Transform": { "position": [4, 0, 0] } } },
    { "id": "entity.polygon", "components": { "MeshRenderer": { "mesh": "mesh.polygon", "material": "mat.main" }, "Transform": { "position": [5, 0, 0] } } },
    { "id": "entity.extruded", "components": { "MeshRenderer": { "mesh": "mesh.extruded", "material": "mat.main" }, "Transform": { "position": [6, 0, 0] } } }
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
    { "id": "mesh.cone", "kind": "mesh", "format": "generated", "primitive": "cone", "size": [0.5, 1] },
    { "id": "mesh.frustum", "kind": "mesh", "format": "generated", "primitive": "conicalFrustum", "size": [0.25, 0.5, 1] },
    { "id": "mesh.torus", "kind": "mesh", "format": "generated", "primitive": "torus", "size": [0.25, 0.75] },
    { "id": "mesh.circle", "kind": "mesh", "format": "generated", "primitive": "circle", "size": [0.5] },
    { "id": "mesh.annulus", "kind": "mesh", "format": "generated", "primitive": "annulus", "size": [0.25, 0.75] },
    { "id": "mesh.polygon", "kind": "mesh", "format": "generated", "primitive": "regularPolygon", "size": [0.5, 6] },
    { "id": "mesh.extruded", "kind": "mesh", "format": "generated", "primitive": "extrudedRectangle", "size": [1, 2, 0.5] }
  ]
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

fn write_custom_mesh_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-custom-mesh-{}",
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
  "name": "custom-mesh",
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
    { "id": "entity.custom", "components": { "MeshRenderer": { "mesh": "mesh.custom", "material": "mat.main" }, "Transform": { "position": [0, 0, 0] } } }
  ]
}"##,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [{
    "id": "mesh.custom",
    "kind": "mesh",
    "format": "generated",
    "primitive": "custom",
    "attributes": [
      { "itemSize": 3, "name": "position", "values": [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      { "itemSize": 2, "name": "uv1", "values": [0, 0, 1, 0, 0, 1] },
      { "itemSize": 4, "name": "color", "values": [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
      { "itemSize": 1, "name": "custom:weight", "values": [0, 0.5, 1] }
    ],
    "indices": [0, 1, 2]
  }]
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

fn write_animated_model_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-animated-model-{}",
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
  "name": "animated-model",
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
    { "id": "hero", "components": { "MeshRenderer": { "mesh": "model.hero", "material": "mat.main" }, "Transform": { "position": [0, 0, 0] } } }
  ]
}"##,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [{
    "id": "model.hero",
    "kind": "model",
    "format": "glb",
    "path": "assets/hero.glb",
    "animations": [
      { "id": "idle", "loop": true, "speed": 1 },
      { "id": "run", "loop": true, "sourceClip": "Armature|Run", "speed": 1.25 }
    ],
    "animationGraph": {
      "initialState": "idle",
      "parameters": [{ "id": "moving", "kind": "boolean", "default": false }],
      "states": [
        { "id": "idle", "clip": "idle" },
        { "id": "run", "clip": "run" }
      ]
    }
  }]
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
