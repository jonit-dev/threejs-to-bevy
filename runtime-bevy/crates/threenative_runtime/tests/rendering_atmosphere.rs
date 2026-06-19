use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    core_pipeline::tonemapping::Tonemapping,
    pbr::{CascadeShadowConfig, DirectionalLightShadowMap, FogFalloff, FogSettings},
    prelude::*,
    render::{alpha::AlphaMode, camera::Exposure, render_resource::Face, view::ColorGrading},
};
use threenative_loader::load_bundle;
use threenative_runtime::{
    map_world::map_bundle_into_world,
    rendering::{apply_atmosphere_to_world, normalize_textured_material, observe_atmosphere},
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
          "requiredCapabilities": {},
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
        r##"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            { "id": "camera.main", "components": { "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 } } },
            { "id": "ambient.world", "components": { "Light": { "kind": "ambient", "color": "#8fb2a5", "intensity": 0.8 }, "Transform": { "position": [0, 0, 0] } } },
            { "id": "sun.world", "components": { "Light": { "kind": "directional", "color": "#ffd39a", "intensity": 3.2 }, "Transform": { "position": [-0.4, -0.8, -0.2] } } }
          ]
        }"##,
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
            "sky": { "color": "#9eb6aa", "horizonColor": "#d6c39d" },
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
    assert_eq!(observation.exposure, Some(1.05));
    assert_eq!(observation.fog_color.as_deref(), Some("#9eb6aa"));
    assert_eq!(observation.fog_density, Some(0.028));
    assert_eq!(observation.fog_mode.as_deref(), Some("exponential"));
    assert_eq!(observation.output_color_space.as_deref(), Some("srgb"));
    assert_eq!(observation.shadow_bias, Some(-0.0005));
    assert_eq!(observation.shadow_cascade_count, Some(1));
    assert_eq!(observation.shadow_max_distance, Some(45.0));
    assert_eq!(observation.shadow_map_size, Some(1024));
    assert_eq!(observation.shadow_normal_bias, Some(0.02));
    assert_eq!(observation.sky_horizon_color.as_deref(), Some("#d6c39d"));
    assert_eq!(observation.texture_color_space.as_deref(), Some("srgb"));
    assert_eq!(observation.tone_mapping.as_deref(), Some("aces"));
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
    assert!(!light.0);
    assert!((light.1 - (3.2 / 1.05 * 1.45)).abs() < 0.01);
    assert!((light.2 - 0.005).abs() < 0.001);
    assert!((light.3 - 0.02).abs() < 0.001);
    assert!((light.4[0] - 0xff as f32 / 255.0).abs() < 0.01);
    assert!((light.4[1] - 0xd3 as f32 / 255.0).abs() < 0.01);
    assert!((light.4[2] - 0x9a as f32 / 255.0).abs() < 0.01);
    assert!((light.5 - 0.05).abs() < 0.001);
    assert_eq!(light.6, vec![45.0]);

    map_bundle_into_world(app.world_mut(), &bundle).expect("world should map");
    let mapped_ambient = app.world().resource::<AmbientLight>();
    assert!((mapped_ambient.brightness - 0.8).abs() < 0.01);
    let mapped_directional_count = app
        .world_mut()
        .query::<&DirectionalLight>()
        .iter(app.world())
        .count();
    assert_eq!(mapped_directional_count, 1);
    let camera_color = app
        .world_mut()
        .query::<(&Tonemapping, &ColorGrading, &Exposure, &FogSettings)>()
        .iter(app.world())
        .next()
        .expect("camera color management should exist");
    assert_eq!(*camera_color.0, Tonemapping::AcesFitted);
    assert!((camera_color.1.global.exposure - 0.0).abs() < 0.001);
    assert!((camera_color.1.global.post_saturation - 1.0).abs() < 0.001);
    assert!((camera_color.2.exposure() - 1.05).abs() < 0.001);
    let fog_color = camera_color.3.color.to_srgba();
    assert!((fog_color.red - 0x9e as f32 / 255.0).abs() < 0.01);
    assert!((fog_color.green - 0xb6 as f32 / 255.0).abs() < 0.01);
    assert!((fog_color.blue - 0xaa as f32 / 255.0).abs() < 0.01);
    assert!(matches!(
        camera_color.3.falloff,
        FogFalloff::Exponential { density } if (density - 0.028).abs() < 0.001
    ));

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
    assert!(material.double_sided);
    assert_eq!(material.cull_mode, None);
    assert!(!material.unlit);
    assert!(material.normal_map_texture.is_some());

    let mut untextured = StandardMaterial::default();
    assert!(!normalize_textured_material(&mut untextured));
    assert_eq!(untextured.alpha_mode, AlphaMode::Opaque);
}

#[test]
fn extended_unlit_textured_materials_should_not_be_normalized() {
    let mut material = StandardMaterial {
        base_color: Color::srgb(0.25, 0.75, 0.42),
        base_color_texture: Some(Handle::default()),
        unlit: true,
        alpha_mode: AlphaMode::Mask(0.45),
        ..Default::default()
    };

    assert!(!normalize_textured_material(&mut material));
    let base_color = material.base_color.to_srgba();
    assert!((base_color.red - 0.25).abs() < 0.01);
    assert!((base_color.green - 0.75).abs() < 0.01);
    assert!((base_color.blue - 0.42).abs() < 0.01);
    assert_eq!(material.alpha_mode, AlphaMode::Mask(0.45));
}

#[test]
fn textured_gltf_materials_should_render_cutout_backfaces_for_foliage() {
    let mut material = StandardMaterial {
        base_color_texture: Some(Handle::default()),
        alpha_mode: AlphaMode::Mask(0.2),
        ..Default::default()
    };

    assert!(normalize_textured_material(&mut material));
    assert_eq!(material.alpha_mode, AlphaMode::Mask(0.2));
    assert!(material.double_sided);
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
