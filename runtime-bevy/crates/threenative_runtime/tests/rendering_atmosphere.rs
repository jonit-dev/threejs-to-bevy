use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    core_pipeline::tonemapping::Tonemapping,
    pbr::{
        CascadeShadowConfig, DirectionalLightShadowMap, FogFalloff, FogSettings,
        ScreenSpaceAmbientOcclusionSettings, ShadowFilteringMethod, VolumetricFogSettings,
        VolumetricLight,
    },
    prelude::*,
    render::{
        alpha::AlphaMode, camera::Exposure, mesh::VertexAttributeValues, render_resource::Face,
        view::ColorGrading,
    },
};
use image::{ImageBuffer, Rgba};
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::{
    conformance::report_bevy_conformance,
    map_world::{
        NativeEnvironmentSkyDome, NativeEquirectSkyMaterial, NativeMaterialHandles,
        map_bundle_into_world,
    },
    rendering::{
        NativeEnvironmentMapHandles, NativeVolumetricsReport, apply_atmosphere_to_world,
        apply_environment_lighting_to_world, normalize_loaded_gltf_materials,
        normalize_textured_material, observe_atmosphere,
    },
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
            "runtimeConfig": "runtime.config.json",
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
        "runtime.config.json",
        r#"{
          "schema": "threenative.runtime-config",
          "version": "0.1.0",
          "renderer": { "antialias": "none", "screenSpaceGlobalIllumination": { "enabled": true, "quality": "high", "intensity": 1.0, "radius": 12.0 } },
          "time": { "fixedDelta": 0.016666667, "paused": false },
          "window": { "width": 1280, "height": 720 }
        }"#,
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
            "shadows": { "enabled": true, "mapSize": 1024, "maxDistance": 45, "cascadeCount": 1, "bias": -0.0005, "normalBias": 0.02, "receiverPolicy": "terrain-and-path" },
            "volumetrics": {
              "heightFog": { "enabled": true, "density": 0.2, "falloffHeight": 12, "baseHeight": 0, "color": [0.4, 0.5, 0.6] },
              "godRays": { "enabled": true, "intensity": 1.2, "density": 0.4, "maxDistance": 80, "quality": "high" }
            }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 },
          "sourceAssets": [],
          "instances": []
        }"##,
    );

    let mut bundle = load_bundle(&root).expect("atmosphere bundle should load");
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
    assert!((ambient.brightness - 0.236).abs() < 0.01);
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
    assert_eq!(
        app.world_mut()
            .query::<&VolumetricLight>()
            .iter(app.world())
            .count(),
        1
    );
    let light = &lights[0];
    assert!(light.0);
    assert!((light.1 - 3.2).abs() < 0.01);
    assert!((light.2 - 0.05).abs() < 0.0001);
    assert!((light.3 - 0.02).abs() < 0.001);
    assert!((light.4[0] - 0xff as f32 / 255.0).abs() < 0.01);
    assert!((light.4[1] - 0xd3 as f32 / 255.0).abs() < 0.01);
    assert!((light.4[2] - 0x9a as f32 / 255.0).abs() < 0.01);
    assert!((light.5 - 0.05).abs() < 0.001);
    assert_eq!(light.6, vec![45.0]);

    map_bundle_into_world(app.world_mut(), &bundle).expect("world should map");
    let mapped_ambient = app.world().resource::<AmbientLight>();
    assert!((mapped_ambient.brightness - 0.236).abs() < 0.01);
    assert_eq!(
        app.world_mut()
            .query::<&ScreenSpaceAmbientOcclusionSettings>()
            .iter(app.world())
            .count(),
        1
    );
    let ssgi_report = serde_json::to_value(report_bevy_conformance(
        app.world_mut(),
        &bundle,
        "ssgi-approximation",
    ))
    .expect("SSGI conformance report should serialize");
    let feature_reports = ssgi_report["runtimeConfig"]["renderer"]["featureReports"]
        .as_array()
        .expect("renderer feature reports should exist");
    let ssgi_feature = feature_reports
        .iter()
        .find(|feature| feature["feature"] == "renderer.screenSpaceGlobalIllumination")
        .expect("SSGI feature report should exist");
    assert_eq!(ssgi_feature["appliedMode"], "approximation");
    assert_eq!(ssgi_feature["status"], "baseline");
    assert!(ssgi_feature.get("diagnostic").is_none());
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
    let exposure = camera_color.2.exposure();
    assert!(
        (exposure - 1.75).abs() < 0.001,
        "expected calibrated atmosphere exposure 1.75, got {exposure}"
    );
    let fog_color = camera_color.3.color.to_srgba();
    assert!((fog_color.red - 0x9e as f32 / 255.0).abs() < 0.01);
    assert!((fog_color.green - 0xb6 as f32 / 255.0).abs() < 0.01);
    assert!((fog_color.blue - 0xaa as f32 / 255.0).abs() < 0.01);
    assert!(matches!(
        camera_color.3.falloff,
        FogFalloff::ExponentialSquared { density } if (density - 0.0182).abs() < 0.001
    ));
    let shadow_filter = app
        .world_mut()
        .query::<&ShadowFilteringMethod>()
        .iter(app.world())
        .next()
        .expect("atmosphere camera should map soft shadow filtering");
    assert!(matches!(*shadow_filter, ShadowFilteringMethod::Gaussian));
    let volumetric_fog = app
        .world_mut()
        .query::<&VolumetricFogSettings>()
        .iter(app.world())
        .next()
        .expect("atmosphere camera should receive volumetric settings");
    assert_eq!(volumetric_fog.step_count, 64);
    assert!((volumetric_fog.max_depth - 80.0).abs() < 0.001);
    assert!((volumetric_fog.density - 0.03).abs() < 0.001);
    assert!((volumetric_fog.light_intensity - 1.2).abs() < 0.001);
    let report = app.world().resource::<NativeVolumetricsReport>();
    assert!(report.god_rays_requested);
    assert!(report.god_rays_applied);
    assert_eq!(report.height_fog_mode, "homogeneous-medium-approximation");
    assert_eq!(report.ignored_base_height, Some(0.0));
    assert_eq!(report.ignored_falloff_height, Some(12.0));

    bundle
        .environment_scene
        .as_mut()
        .and_then(|scene| scene.atmosphere.as_mut())
        .expect("atmosphere should exist")
        .sun
        .casts_shadow = false;
    apply_atmosphere_to_world(app.world_mut(), &bundle);
    let fallback_report = report_bevy_conformance(app.world_mut(), &bundle, "volumetrics-fallback");
    let god_rays = fallback_report
        .environment
        .as_ref()
        .and_then(|environment| environment.volumetrics.as_ref())
        .and_then(|volumetrics| volumetrics.god_rays.as_ref())
        .expect("god rays report should exist");
    assert!(!god_rays.applied);
    assert_eq!(god_rays.reason.as_deref(), Some("shadow-map-unavailable"));
    bundle
        .environment_scene
        .as_mut()
        .and_then(|scene| scene.atmosphere.as_mut())
        .expect("atmosphere should exist")
        .sun
        .casts_shadow = true;

    apply_atmosphere_to_world(app.world_mut(), &bundle);
    assert_eq!(
        app.world_mut()
            .query::<&VolumetricLight>()
            .iter(app.world())
            .count(),
        1,
        "reapplying atmosphere should replace the owned sun instead of duplicating it"
    );
    bundle
        .environment_scene
        .as_mut()
        .and_then(|scene| scene.atmosphere.as_mut())
        .expect("atmosphere should exist")
        .volumetrics = None;
    apply_atmosphere_to_world(app.world_mut(), &bundle);
    assert_eq!(
        app.world_mut()
            .query::<&VolumetricLight>()
            .iter(app.world())
            .count(),
        0
    );
    assert_eq!(
        app.world_mut()
            .query::<&VolumetricFogSettings>()
            .iter(app.world())
            .count(),
        0
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn atmosphere_shadow_cascade_controls_should_map_and_report_native_approximation() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "atmosphere-cascade-controls",
          "requiredCapabilities": {},
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "runtimeConfig": "runtime.config.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            { "id": "camera.main", "components": { "Camera": { "kind": "perspective", "near": 0.1, "far": 150, "fovY": 60 }, "Transform": { "position": [0, 2, 8] } } }
          ]
        }"#,
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
        "runtime.config.json",
        r#"{
          "schema": "threenative.runtime-config",
          "version": "0.1.0",
          "renderer": { "antialias": "msaa4", "renderPath": "forward" },
          "time": { "fixedDelta": 0.016666666666666666, "paused": false },
          "window": { "height": 720, "width": 1280 }
        }"#,
    );
    write_json(
        &root,
        "environment.scene.json",
        r##"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "atmosphere": {
            "active": true,
            "id": "atmosphere.cascades",
            "sun": { "id": "sun.cascades", "direction": [-0.4, -0.8, -0.2], "color": "#ffffff", "intensity": 2, "castsShadow": true },
            "ambient": { "color": "#ffffff", "intensity": 0.4, "mode": "constant" },
            "sky": { "color": "#9eb6aa" },
            "colorManagement": { "exposure": 1, "outputColorSpace": "srgb", "textureColorSpace": "srgb", "toneMapping": "aces" },
            "shadows": {
              "enabled": true,
              "mapSize": 2048,
              "maxDistance": 100,
              "cascadeCount": 4,
              "cascadeBlendFraction": 1,
              "splitLambda": 0.25,
              "splitScheme": "practical",
              "stabilized": true,
              "bias": -0.0002,
              "normalBias": 0.015,
              "receiverPolicy": "terrain-and-path"
            }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );

    let bundle = load_bundle(&root).expect("cascade profile bundle should load");
    let observation = observe_atmosphere(&bundle);
    let observed_profile = observation
        .shadow_cascade_profile
        .expect("authored cascade controls should resolve a native report");
    assert_eq!(
        observed_profile.mode,
        "first-split-exponential-approximation"
    );
    assert_eq!(observed_profile.requested.cascade_blend_fraction, 1.0);
    assert!(observed_profile.applied.cascade_blend_fraction < 1.0);
    assert!(
        observed_profile
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("exponentially spaces intermediate"))
    );

    let mut app = App::new();
    apply_atmosphere_to_world(app.world_mut(), &bundle);
    let (cascade, applied_profile) = app
        .world_mut()
        .query::<(
            &CascadeShadowConfig,
            &threenative_runtime::rendering::NativeShadowCascadeProfileReport,
        )>()
        .iter(app.world())
        .next()
        .expect("atmosphere sun should carry cascade config and report");
    assert_eq!(cascade.bounds.len(), 4);
    assert!((cascade.bounds[3] - 100.0).abs() < 0.001);
    let uniform_first = 0.05 + (100.0 - 0.05) / 4.0;
    let logarithmic_first = 0.05 * (100.0_f32 / 0.05).powf(0.25);
    let expected_first = uniform_first + (logarithmic_first - uniform_first) * 0.25;
    assert!((cascade.bounds[0] - expected_first).abs() < 0.001);
    assert_eq!(
        cascade.overlap_proportion,
        applied_profile.applied.cascade_blend_fraction
    );
    assert!(cascade.overlap_proportion < 1.0);

    let report = report_bevy_conformance(app.world_mut(), &bundle, "cascade-controls");
    let report_json = serde_json::to_value(report).expect("conformance report should serialize");
    let cascade_report =
        &report_json["runtimeConfig"]["renderer"]["renderLook"]["shadowProfile"]["cascadeProfile"];
    assert_eq!(
        cascade_report["mode"],
        "first-split-exponential-approximation"
    );
    assert_eq!(cascade_report["requested"]["cascadeBlendFraction"], 1.0);
    assert!(
        cascade_report["applied"]["cascadeBlendFraction"]
            .as_f64()
            .is_some_and(|blend| blend < 1.0)
    );

    write_json(
        &root,
        "environment.scene.json",
        r##"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "atmosphere": {
            "active": true,
            "id": "atmosphere.cascades",
            "sun": { "id": "sun.cascades", "direction": [-0.4, -0.8, -0.2], "color": "#ffffff", "intensity": 2, "castsShadow": true },
            "ambient": { "color": "#ffffff", "intensity": 0.4, "mode": "constant" },
            "sky": { "color": "#9eb6aa" },
            "colorManagement": { "exposure": 1, "outputColorSpace": "srgb", "textureColorSpace": "srgb", "toneMapping": "aces" },
            "shadows": {
              "enabled": true,
              "mapSize": 2048,
              "maxDistance": 64,
              "cascadeCount": 2,
              "cascadeBlendFraction": 0.15,
              "splitLambda": 0.5,
              "splitScheme": "practical",
              "stabilized": true,
              "bias": -0.0002,
              "normalBias": 0.015,
              "receiverPolicy": "terrain-and-path"
            }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );
    let exact_bundle = load_bundle(&root).expect("exact cascade profile bundle should load");
    let mut exact_app = App::new();
    apply_atmosphere_to_world(exact_app.world_mut(), &exact_bundle);
    let (exact_cascade, exact_profile) = exact_app
        .world_mut()
        .query::<(
            &CascadeShadowConfig,
            &threenative_runtime::rendering::NativeShadowCascadeProfileReport,
        )>()
        .iter(exact_app.world())
        .next()
        .expect("two-cascade sun should carry exact cascade config and report");
    let uniform_first = 0.05 + (64.0 - 0.05) / 2.0;
    let logarithmic_first = 0.05 * (64.0_f32 / 0.05).sqrt();
    let expected_first = uniform_first + (logarithmic_first - uniform_first) * 0.5;
    assert_eq!(exact_profile.mode, "exact");
    assert_eq!(exact_profile.reason, None);
    assert_eq!(exact_cascade.bounds.len(), 2);
    assert!((exact_cascade.bounds[0] - expected_first).abs() < 0.001);
    assert!((exact_cascade.bounds[1] - 64.0).abs() < 0.001);
    assert!((exact_cascade.overlap_proportion - 0.15).abs() < 0.0001);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn atmosphere_shadow_distance_should_cover_authored_scene_from_camera() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "atmosphere-shadow-camera-span",
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
            { "id": "camera.main", "components": { "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 }, "Transform": { "position": [0, 2, 30] } } },
            { "id": "receiver", "components": { "Transform": { "position": [0, 0, 0] } } }
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
            "id": "atmosphere.test",
            "sun": { "id": "sun.test", "direction": [-0.4, -0.8, -0.2], "color": "#ffffff", "intensity": 2, "castsShadow": true },
            "ambient": { "color": "#ffffff", "intensity": 0.4, "mode": "constant" },
            "sky": { "color": "#9eb6aa" },
            "colorManagement": { "exposure": 1, "outputColorSpace": "srgb", "textureColorSpace": "srgb", "toneMapping": "aces" },
            "shadows": { "enabled": true, "mapSize": 2048, "maxDistance": 16, "cascadeCount": 1, "bias": -0.0002, "normalBias": 0.015, "receiverPolicy": "terrain-and-path" }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );

    let bundle = load_bundle(&root).expect("atmosphere bundle should load");
    let mut app = App::new();
    apply_atmosphere_to_world(app.world_mut(), &bundle);

    let cascade = app
        .world_mut()
        .query::<&CascadeShadowConfig>()
        .iter(app.world())
        .next()
        .expect("atmosphere sun should spawn cascade shadow config");
    assert_eq!(cascade.bounds.len(), 1);
    assert!(
        cascade.bounds[0] > 45.0,
        "shadow cascade should include camera-to-scene span plus authored extent, got {}",
        cascade.bounds[0]
    );

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn atmosphere_directional_shadows_should_follow_authored_shadow_flags() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "atmosphere-shadows-disabled",
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
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            {
              "id": "camera.main",
              "components": {
                "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 },
                "Transform": { "position": [0, 1, 4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
              }
            }
          ]
        }"#,
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
            "id": "atmosphere.test",
            "sun": { "id": "sun.test", "direction": [-0.4, -0.8, -0.2], "color": "#ffffff", "intensity": 2, "castsShadow": true },
            "ambient": { "color": "#ffffff", "intensity": 0.4, "mode": "constant" },
            "sky": { "color": "#9eb6aa" },
            "colorManagement": { "exposure": 1, "outputColorSpace": "srgb", "textureColorSpace": "srgb", "toneMapping": "aces" },
            "shadows": { "enabled": false, "mapSize": 2048, "maxDistance": 30, "cascadeCount": 2, "bias": -0.0002, "normalBias": 0.015, "receiverPolicy": "terrain-and-path" }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );

    let bundle = load_bundle(&root).expect("atmosphere bundle should load");
    let mut app = App::new();
    apply_atmosphere_to_world(app.world_mut(), &bundle);

    let shadow_map = app.world().resource::<DirectionalLightShadowMap>();
    assert_eq!(shadow_map.size, 2048);
    let lights = app
        .world_mut()
        .query::<(&DirectionalLight, &CascadeShadowConfig)>()
        .iter(app.world())
        .map(|(light, cascade)| {
            (
                light.shadows_enabled,
                light.shadow_depth_bias,
                light.shadow_normal_bias,
                cascade.bounds.clone(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(lights.len(), 1);
    assert!(!lights[0].0);
    assert!((lights[0].1 - 0.02).abs() < 0.0001);
    assert!((lights[0].2 - 0.015).abs() < 0.0001);
    assert_eq!(lights[0].3.len(), 2);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn environment_lighting_should_prefer_environment_map_over_skybox_for_ambient() {
    let root = temp_bundle_dir();
    fs::create_dir_all(root.join("assets")).expect("asset dir should be created");
    write_png(&root.join("assets/sky.png"), [24, 64, 220, 255]);
    write_png(&root.join("assets/env.png"), [240, 180, 90, 255]);
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "environment-map-priority",
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
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            {
              "id": "camera.main",
              "components": {
                "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 },
                "Transform": { "position": [0, 1, 4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }
              }
            }
          ]
        }"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
          "schema": "threenative.assets",
          "version": "0.1.0",
          "assets": [
            { "id": "tex.sky", "kind": "texture", "format": "png", "path": "assets/sky.png" },
            { "id": "tex.env", "kind": "texture", "format": "png", "path": "assets/env.png" }
          ]
        }"#,
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
          "skybox": { "mode": "equirect", "asset": "tex.sky", "intensity": 0.25 },
          "environmentMap": { "mode": "equirect", "asset": "tex.env", "intent": "reflection-and-irradiance", "intensity": 0.75 },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );

    let bundle = load_bundle(&root).expect("environment bundle should load");
    let mut app = App::new();
    let applied = apply_environment_lighting_to_world(app.world_mut(), &bundle);

    assert!(applied.skybox.as_ref().is_some_and(|skybox| skybox.applied));
    assert!(
        applied
            .environment_map
            .as_ref()
            .is_some_and(|environment_map| environment_map.applied)
    );
    assert!(!app.world().contains_resource::<AmbientLight>());
    assert!(
        app.world()
            .contains_resource::<NativeEnvironmentMapHandles>()
    );
    let native_map = app.world().resource::<NativeEnvironmentMapHandles>();
    assert!((native_map.intensity - 0.4125).abs() < 0.001);

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map into world");
    let mut camera_components = app.world_mut().query::<&Camera>();
    assert_eq!(camera_components.iter(app.world()).count(), 1);
    let mut cameras = app
        .world_mut()
        .query_filtered::<&EnvironmentMapLight, With<Camera>>();
    let camera_environment_maps = cameras.iter(app.world()).collect::<Vec<_>>();
    assert_eq!(camera_environment_maps.len(), 1);
    assert!((camera_environment_maps[0].intensity - 0.4125).abs() < 0.001);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn cubemap_environment_map_should_spawn_native_environment_light() {
    let root = temp_bundle_dir();
    fs::create_dir_all(root.join("assets")).expect("asset dir should be created");
    write_png(&root.join("assets/px.png"), [255, 0, 0, 255]);
    write_png(&root.join("assets/nx.png"), [0, 255, 0, 255]);
    write_png(&root.join("assets/py.png"), [0, 0, 255, 255]);
    write_png(&root.join("assets/ny.png"), [255, 255, 0, 255]);
    write_png(&root.join("assets/pz.png"), [255, 0, 255, 255]);
    write_png(&root.join("assets/nz.png"), [0, 255, 255, 255]);
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "cubemap-environment-map",
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
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "entities": [
            { "id": "camera.main", "components": { "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 } } }
          ]
        }"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
          "schema": "threenative.assets",
          "version": "0.1.0",
          "assets": [
            { "id": "tex.px", "kind": "texture", "format": "png", "path": "assets/px.png" },
            { "id": "tex.nx", "kind": "texture", "format": "png", "path": "assets/nx.png" },
            { "id": "tex.py", "kind": "texture", "format": "png", "path": "assets/py.png" },
            { "id": "tex.ny", "kind": "texture", "format": "png", "path": "assets/ny.png" },
            { "id": "tex.pz", "kind": "texture", "format": "png", "path": "assets/pz.png" },
            { "id": "tex.nz", "kind": "texture", "format": "png", "path": "assets/nz.png" }
          ]
        }"#,
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
          "environmentMap": {
            "mode": "cubemap",
            "intent": "reflection-and-irradiance",
            "intensity": 0.8,
            "faces": {
              "positiveX": "tex.px",
              "negativeX": "tex.nx",
              "positiveY": "tex.py",
              "negativeY": "tex.ny",
              "positiveZ": "tex.pz",
              "negativeZ": "tex.nz"
            }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );

    let bundle = load_bundle(&root).expect("cubemap environment bundle should load");
    let mut app = App::new();
    let applied = apply_environment_lighting_to_world(app.world_mut(), &bundle);

    assert!(
        applied
            .environment_map
            .as_ref()
            .is_some_and(|environment_map| environment_map.applied)
    );
    assert!(
        app.world()
            .contains_resource::<NativeEnvironmentMapHandles>()
    );
    let native_map = app.world().resource::<NativeEnvironmentMapHandles>();
    assert!((native_map.intensity - 0.44).abs() < 0.001);

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map into world");
    let mut cameras = app
        .world_mut()
        .query_filtered::<&EnvironmentMapLight, With<Camera>>();
    let camera_environment_maps = cameras.iter(app.world()).collect::<Vec<_>>();
    assert_eq!(camera_environment_maps.len(), 1);
    assert!((camera_environment_maps[0].intensity - 0.44).abs() < 0.001);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

#[test]
fn textured_gltf_materials_should_preserve_lit_cutout_rendering() {
    let mut material = StandardMaterial {
        base_color_texture: Some(Handle::default()),
        alpha_mode: AlphaMode::Mask(0.2),
        double_sided: false,
        cull_mode: Some(Face::Back),
        unlit: false,
        ..Default::default()
    };

    assert!(normalize_textured_material(&mut material));
    assert_eq!(material.alpha_mode, AlphaMode::Mask(0.2));
    assert!(material.double_sided);
    assert_eq!(material.cull_mode, None);
    assert!(!material.unlit);

    let mut untextured = StandardMaterial::default();
    assert!(!normalize_textured_material(&mut untextured));
    assert_eq!(untextured.alpha_mode, AlphaMode::Opaque);
}

#[test]
fn loaded_gltf_material_normalization_should_skip_authored_textured_materials() {
    let mut app = App::new();
    app.init_resource::<Assets<StandardMaterial>>();
    let authored = app
        .world_mut()
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.3, 0.4),
            base_color_texture: Some(Handle::default()),
            ..Default::default()
        });
    let loaded = app
        .world_mut()
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.3, 0.4),
            base_color_texture: Some(Handle::default()),
            ..Default::default()
        });
    app.insert_resource(NativeMaterialHandles(HashMap::from([(
        "mat.authored".to_owned(),
        authored.clone(),
    )])));
    app.add_systems(Update, normalize_loaded_gltf_materials);

    app.update();

    let materials = app.world().resource::<Assets<StandardMaterial>>();
    let authored_color = materials
        .get(&authored)
        .expect("authored material should exist")
        .base_color
        .to_srgba();
    let loaded_color = materials
        .get(&loaded)
        .expect("loaded material should exist")
        .base_color
        .to_srgba();
    assert!((authored_color.red - 0.2).abs() < 0.01);
    assert!((authored_color.green - 0.3).abs() < 0.01);
    assert!((authored_color.blue - 0.4).abs() < 0.01);
    assert!((loaded_color.red - 0.2).abs() < 0.01);
    assert!((loaded_color.green - 0.3).abs() < 0.01);
    assert!((loaded_color.blue - 0.4).abs() < 0.01);
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

#[test]
fn equirect_skybox_should_spawn_native_sky_dome() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "skybox",
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
        r#"{
          "schema": "threenative.world",
          "version": "0.1.0",
          "resources": { "ActiveCamera": { "entity": "camera.main" } },
          "entities": [
            {
              "id": "camera.main",
              "components": {
                "Camera": { "kind": "perspective", "near": 0.1, "far": 100, "fovY": 60 },
                "Transform": {
                  "position": [2, 4, 22],
                  "rotation": [0, 0, 0, 1],
                  "scale": [1, 1, 1]
                }
              }
            }
          ]
        }"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{
          "schema": "threenative.assets",
          "version": "0.1.0",
          "assets": [
            { "id": "tex.sky", "kind": "texture", "format": "jpeg", "path": "assets/sky.jpg" }
          ]
        }"#,
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
          "skybox": { "mode": "equirect", "asset": "tex.sky", "intensity": 0.42 },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 }
        }"##,
    );

    let bundle = load_bundle(&root).expect("skybox bundle should load");
    let mut app = App::new();
    app.add_plugins((MinimalPlugins, AssetPlugin::default()));
    app.init_asset::<Image>();
    app.init_asset::<Mesh>();
    app.init_asset::<StandardMaterial>();
    app.init_asset::<NativeEquirectSkyMaterial>();
    map_bundle_into_world(app.world_mut(), &bundle).expect("world should map");

    let camera_translation = app
        .world_mut()
        .query::<(&ThreeNativeId, &Transform)>()
        .iter(app.world())
        .find_map(|(id, transform)| (id.0 == "camera.main").then_some(transform.translation));
    assert_eq!(camera_translation, Some(Vec3::new(2.0, 4.0, 22.0)));

    let sky = app
        .world_mut()
        .query::<&NativeEnvironmentSkyDome>()
        .iter(app.world())
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(
        sky,
        vec![NativeEnvironmentSkyDome {
            asset: "tex.sky".to_owned(),
            mode: "equirect".to_owned(),
        }]
    );
    let sky_materials = app
        .world_mut()
        .query::<(
            &NativeEnvironmentSkyDome,
            &Handle<NativeEquirectSkyMaterial>,
        )>()
        .iter(app.world())
        .map(|(_, handle)| handle.clone())
        .collect::<Vec<_>>();
    let material_handles = app.world().resource::<Assets<NativeEquirectSkyMaterial>>();
    let sky_material_count = sky_materials
        .iter()
        .filter(|handle| material_handles.get(*handle).is_some())
        .count();
    assert_eq!(sky_material_count, 1);
    let sky_translation = app
        .world_mut()
        .query::<(&NativeEnvironmentSkyDome, &Transform)>()
        .iter(app.world())
        .map(|(_, transform)| transform.translation)
        .collect::<Vec<_>>();
    assert_eq!(sky_translation, vec![Vec3::new(2.0, 4.0, 22.0)]);
    let sky_mesh_handles = app
        .world_mut()
        .query::<(&NativeEnvironmentSkyDome, &Handle<Mesh>)>()
        .iter(app.world())
        .map(|(_, handle)| handle.clone())
        .collect::<Vec<_>>();
    let meshes = app.world().resource::<Assets<Mesh>>();
    let sky_mesh = meshes
        .get(&sky_mesh_handles[0])
        .expect("sky dome mesh should be stored");
    let positions = match sky_mesh.attribute(Mesh::ATTRIBUTE_POSITION) {
        Some(VertexAttributeValues::Float32x3(values)) => values,
        _ => panic!("sky dome should store float3 positions"),
    };
    let uvs = match sky_mesh.attribute(Mesh::ATTRIBUTE_UV_0) {
        Some(VertexAttributeValues::Float32x2(values)) => values,
        _ => panic!("sky dome should store float2 UVs"),
    };
    let equator_start = 64 * 257;
    let equator_end = equator_start + 256;
    assert_eq!(uvs[equator_start][0], 0.0);
    assert_eq!(uvs[equator_end][0], 1.0);
    assert!((positions[equator_start][0] - positions[equator_end][0]).abs() < 0.001);
    assert!(positions[equator_start][2].abs() < 0.001);
    assert!(positions[equator_end][2].abs() < 0.001);

    fs::remove_dir_all(root).expect("temp bundle should be removed");
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

fn write_png(path: &Path, rgba: [u8; 4]) {
    let image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_pixel(1, 1, Rgba(rgba));
    image.save(path).expect("png should be written");
}
