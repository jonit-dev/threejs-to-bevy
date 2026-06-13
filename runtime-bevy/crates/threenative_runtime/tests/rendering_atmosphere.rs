use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    pbr::{CascadeShadowConfig, DirectionalLightShadowMap},
    prelude::*,
    render::{alpha::AlphaMode, render_resource::Face},
};
use threenative_loader::load_bundle;
use threenative_runtime::rendering::{
    apply_atmosphere_to_world, normalize_textured_material, observe_atmosphere,
};

#[test]
fn rendering_should_map_atmosphere_profile_to_bevy_observation() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "atmosphere",
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write_json(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write_json(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    write_json(
        &root,
        "environment.scene.json",
        r##"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "atmosphere": {
            "active": true,
            "id": "atmosphere.forest",
            "sun": { "id": "sun.forest", "direction": [-0.4, -0.8, -0.2], "color": "#ffd39a", "intensity": 3.2, "castsShadow": true },
            "ambient": { "color": "#8fb2a5", "intensity": 0.8, "mode": "constant" },
            "fog": { "enabled": true, "mode": "exponential", "color": "#9eb6aa", "density": 0.028 },
            "sky": { "color": "#9eb6aa" },
            "colorManagement": { "exposure": 1.05, "outputColorSpace": "srgb", "textureColorSpace": "srgb", "toneMapping": "aces" },
            "shadows": { "enabled": true, "mapSize": 1024, "maxDistance": 45, "cascadeCount": 1, "bias": -0.0005, "normalBias": 0.02, "receiverPolicy": "terrain-and-path" }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 },
          "sourceAssets": [],
          "instances": []
        }"##,
    );

    let bundle = load_bundle(&root).expect("atmosphere bundle should load");
    let observation = observe_atmosphere(&bundle);

    assert_eq!(observation.profile_id.as_deref(), Some("atmosphere.forest"));
    assert_eq!(observation.fog_mode.as_deref(), Some("exponential"));
    assert_eq!(observation.shadow_map_size, Some(1024));
    assert_eq!(observation.diagnostics, Vec::<String>::new());

    let mut app = App::new();
    apply_atmosphere_to_world(app.world_mut(), &bundle);
    let clear = app.world().resource::<ClearColor>().0.to_srgba();
    assert!((clear.red - 0x9e as f32 / 255.0).abs() < 0.01);
    assert!((clear.green - 0xb6 as f32 / 255.0).abs() < 0.01);
    assert!((clear.blue - 0xaa as f32 / 255.0).abs() < 0.01);
    let ambient = app.world().resource::<AmbientLight>();
    assert!((ambient.brightness - 0.8).abs() < 0.01);
    let shadow_map = app.world().resource::<DirectionalLightShadowMap>();
    assert_eq!(shadow_map.size, 1024);
    let lights = app
        .world_mut()
        .query::<(&DirectionalLight, &CascadeShadowConfig)>()
        .iter(app.world())
        .map(|(light, cascade)| {
            let color = light.color.to_srgba();
            (
                light.shadows_enabled,
                light.illuminance,
                light.shadow_depth_bias,
                light.shadow_normal_bias,
                [color.red, color.green, color.blue],
                cascade.minimum_distance,
                cascade.bounds.clone(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(lights.len(), 1);
    let light = &lights[0];
    assert!(light.0);
    assert!((light.1 - 1120.0).abs() < 0.01);
    assert!((light.2 - 0.005).abs() < 0.001);
    assert!((light.3 - 0.02).abs() < 0.001);
    assert!((light.4[0] - 0xff as f32 / 255.0).abs() < 0.01);
    assert!((light.4[1] - 0xd3 as f32 / 255.0).abs() < 0.01);
    assert!((light.4[2] - 0x9a as f32 / 255.0).abs() < 0.01);
    assert!((light.5 - 0.05).abs() < 0.001);
    assert_eq!(light.6, vec![45.0]);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn textured_gltf_materials_should_preserve_lit_cutout_rendering() {
    let mut material = StandardMaterial {
        base_color_texture: Some(Handle::default()),
        normal_map_texture: Some(Handle::default()),
        alpha_mode: AlphaMode::Mask(0.35),
        double_sided: false,
        cull_mode: Some(Face::Back),
        unlit: false,
        ..Default::default()
    };

    assert!(normalize_textured_material(&mut material));
    let base_color = material.base_color.to_srgba();
    assert!((base_color.red - 1.0).abs() < 0.01);
    assert!((base_color.green - 1.0).abs() < 0.01);
    assert!((base_color.blue - 1.0).abs() < 0.01);
    assert_eq!(material.alpha_mode, AlphaMode::Mask(0.2));
    assert!(!material.double_sided);
    assert_eq!(material.cull_mode, None);
    assert!(!material.unlit);
    assert!(material.normal_map_texture.is_some());

    let mut untextured = StandardMaterial::default();
    assert!(!normalize_textured_material(&mut untextured));
    assert_eq!(untextured.alpha_mode, AlphaMode::Opaque);
}

#[test]
fn textured_gltf_materials_should_render_cutout_backfaces_without_normal_flipping() {
    let mut material = StandardMaterial {
        base_color_texture: Some(Handle::default()),
        alpha_mode: AlphaMode::Mask(0.2),
        ..Default::default()
    };

    assert!(normalize_textured_material(&mut material));
    assert_eq!(material.alpha_mode, AlphaMode::Mask(0.2));
    assert!(!material.double_sided);
    assert_eq!(material.cull_mode, None);
}

fn temp_bundle_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tn-atmosphere-loader-{stamp}"));
    fs::create_dir_all(&path).expect("temp bundle dir should be created");
    path
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle json should be written");
}
