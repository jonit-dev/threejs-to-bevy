use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    animation::{AnimationPlugin, RepeatAnimation, graph::AnimationGraph},
    asset::AssetPlugin,
    core_pipeline::{
        bloom::{BloomCompositeMode, BloomSettings},
        dof::{DepthOfFieldMode, DepthOfFieldSettings},
        experimental::taa::TemporalAntiAliasSettings,
        fxaa::Fxaa,
        prepass::{DeferredPrepass, DepthPrepass, MotionVectorPrepass, NormalPrepass},
        smaa::SmaaSettings,
        tonemapping::Tonemapping,
    },
    gltf::GltfPlugin,
    pbr::{
        DefaultOpaqueRendererMethod, NotShadowCaster, NotShadowReceiver,
        ScreenSpaceAmbientOcclusionQualityLevel, ScreenSpaceAmbientOcclusionSettings,
        ScreenSpaceReflectionsSettings, irradiance_volume::IrradianceVolume,
    },
    prelude::*,
    render::{
        alpha::AlphaMode,
        camera::{Exposure, RenderTarget},
        mesh::{Indices, MeshVertexAttribute, VertexAttributeValues},
        render_resource::VertexFormat,
        view::{ColorGrading, visibility::RenderLayers},
    },
    scene::ScenePlugin,
};
use threenative_components::ThreeNativeId;
use threenative_loader::{BakedProbePayloadIr, LightProbeSourceIr, load_bundle};
use threenative_runtime::default_clear_color_for_bundle;
use threenative_runtime::map_world::{
    NativeAnimationPlayback, NativeAnimationServiceCommand, NativeAnimationServiceQueue,
    NativeEmissiveMarkerMask, NativePortableShaderMaterial, NativeShaderMaterialHandles,
    NativeShaderMaterialInstance, NativeShaderMaterialRegistry,
    THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY, advance_native_animation_playback,
    apply_native_animation_service_effects, bind_native_animation_players, map_bundle_into_world,
    trace_native_emissive_bloom,
};
use threenative_runtime::motion_blur_postprocess::NativeTemporalMotionBlur;
use threenative_runtime::rendering::{
    NativeParticleMaterialPolicy, NativeRenderedParticle, apply_environment_lighting_to_world,
    observe_environment_lighting, observe_rendered_particles,
};

mod support;
use support::load_conformance_fixture;

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
    assert_mesh_has_tangents(app.world_mut(), "cube.visible");
    assert_mesh_has_three_box_uvs(app.world_mut(), "cube.visible");
    assert_emissive_bloom_trace(app.world_mut());
    assert_extended_blend_material(app.world_mut(), "plane.glass");
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
fn should_report_native_skybox_and_environment_map_observations() {
    let fixture = load_conformance_fixture("rendering-lights");
    let observation = observe_environment_lighting(&fixture.bundle);

    assert_eq!(
        observation
            .skybox
            .as_ref()
            .map(|skybox| skybox.mode.as_str()),
        Some("cubemap")
    );
    assert_eq!(
        observation
            .environment_map
            .as_ref()
            .map(|environment_map| environment_map.intent.as_str()),
        Some("reflection-and-irradiance")
    );
    assert_eq!(observation.light_probes.len(), 1);

    let mut app = App::new();
    let applied = apply_environment_lighting_to_world(app.world_mut(), &fixture.bundle);
    assert!(applied.skybox.as_ref().is_some_and(|skybox| skybox.applied));
    assert!(app.world().contains_resource::<ClearColor>());
    assert!(!app.world().contains_resource::<AmbientLight>());

    let mut authored_app = App::new();
    authored_app.insert_resource(AmbientLight {
        color: Color::srgb(1.0, 1.0, 1.0),
        brightness: 0.4,
    });
    apply_environment_lighting_to_world(authored_app.world_mut(), &fixture.bundle);
    let authored_ambient = authored_app.world().resource::<AmbientLight>();
    assert!((authored_ambient.brightness - 0.4).abs() < 0.001);
}

#[test]
fn should_apply_baked_sh_probe_as_irradiance_volume() {
    let mut fixture = load_conformance_fixture("rendering-lights");
    let probe = fixture
        .bundle
        .environment_scene
        .as_mut()
        .and_then(|scene| scene.light_probes.first_mut())
        .expect("fixture should contain a light probe");
    let mut coefficients = vec![0.0; 27];
    coefficients[0] = 0.8;
    coefficients[1] = 0.1;
    coefficients[2] = 0.05;
    probe.source = LightProbeSourceIr::Baked(BakedProbePayloadIr {
        bake_version: 1,
        coefficients,
        format: "sh2".to_owned(),
        scene_content_hash: format!("sha256:{}", "a".repeat(64)),
    });

    let mut app = App::new();
    let applied = apply_environment_lighting_to_world(app.world_mut(), &fixture.bundle);
    map_bundle_into_world(app.world_mut(), &fixture.bundle)
        .expect("baked probe fixture should map");
    let observation = &applied.light_probes[0];

    assert!(observation.applied);
    assert_eq!(observation.mode, "irradiance-volume-sh2");
    assert!(app.world().get_resource::<AmbientLight>().is_none());
    let mut volumes = app.world_mut().query::<(&IrradianceVolume, &Transform)>();
    let (volume, transform) = volumes.single(app.world());
    assert_eq!(volume.intensity, 1.0);
    assert!(transform.scale.min_element() > 0.0);
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
fn should_map_portable_shader_materials_to_native_shader_registry() {
    let root = write_shader_material_bundle();
    let bundle = load_bundle(&root).expect("shader material bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let registry = app.world().resource::<NativeShaderMaterialRegistry>();
    let metadata = registry
        .0
        .get("mat.shader")
        .expect("shader material metadata should be registered");
    assert_eq!(metadata.language, "threenative-shader-v1");
    assert_eq!(metadata.fragment_outputs, vec!["alpha", "baseColor"]);
    assert_eq!(metadata.uniforms, vec!["cutoff", "waveHeight"]);
    assert_eq!(metadata.textures, vec!["albedo"]);
    assert_eq!(
        metadata
            .binding_layout
            .iter()
            .map(|binding| binding.name.as_str())
            .collect::<Vec<_>>(),
        vec!["cutoff", "waveHeight", "albedo"]
    );
    assert_eq!(
        metadata.wgsl_entry_points,
        vec!["vertex_main", "fragment_main"]
    );
    let metadata_fragment_outputs = metadata.fragment_outputs.clone();
    let metadata_uniforms = metadata.uniforms.clone();
    let metadata_textures = metadata.textures.clone();

    let shader_handles = app.world().resource::<NativeShaderMaterialHandles>();
    assert!(shader_handles.0.contains_key("mat.shader"));

    let mut query = app.world_mut().query::<(
        &ThreeNativeId,
        &NativeShaderMaterialInstance,
        &Handle<NativePortableShaderMaterial>,
    )>();
    let (_, instance, shader_handle) = query
        .iter(app.world())
        .find(|(id, _, _)| id.0 == "cube.shader")
        .expect("native shader material should be attached to rendered entity");
    assert_eq!(instance.material_id, "mat.shader");
    assert_eq!(instance.render_path, "native-portable-shader-material");
    assert_eq!(instance.fragment_outputs, metadata_fragment_outputs);
    assert_eq!(instance.uniforms, metadata_uniforms);
    assert_eq!(instance.textures, metadata_textures);
    assert_eq!(
        instance
            .binding_layout
            .iter()
            .map(|binding| binding.name.as_str())
            .collect::<Vec<_>>(),
        vec!["cutoff", "waveHeight", "albedo"]
    );
    let shader_materials = app
        .world()
        .resource::<Assets<NativePortableShaderMaterial>>();
    let shader_material = shader_materials
        .get(shader_handle)
        .expect("native shader material asset should be registered");
    assert_eq!(shader_material.material_id, "mat.shader");
    assert!(shader_material.base_color_texture.is_some());
    assert_eq!(shader_material.alpha_mode, AlphaMode::Mask(0.25));
    assert_eq!(shader_material.alpha_cutoff, Some(0.25));
    assert!(shader_material.uses_vertex_displacement);
    assert!((shader_material.displacement_amount - 0.2).abs() < 0.001);
    assert!((shader_material.base_color.alpha - 0.5).abs() < 0.001);
    let native_shader_source = include_str!("../src/native_portable_shader_material.wgsl");
    assert!(native_shader_source.contains("@vertex"));
    assert!(native_shader_source.contains("vertex.normal * displacement_amount"));

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
fn rendering_should_map_post_antialias_modes_to_camera_components() {
    for mode in ["fxaa", "taa", "smaa"] {
        let root = write_post_antialias_bundle(mode);
        let bundle = load_bundle(&root).expect("post antialias bundle should load");
        let mut app = App::new();

        map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

        assert_eq!(app.world().resource::<Msaa>(), &Msaa::Off);
        let camera = entity_for(app.world_mut(), "camera.ui");
        assert_eq!(app.world().get::<Fxaa>(camera).is_some(), mode == "fxaa");
        assert_eq!(
            app.world()
                .get::<TemporalAntiAliasSettings>(camera)
                .is_some(),
            mode == "taa"
        );
        assert_eq!(
            app.world().get::<SmaaSettings>(camera).is_some(),
            mode == "smaa"
        );

        fs::remove_dir_all(root).expect("temporary bundle should be removed");
    }
}

#[test]
fn rendering_should_map_runtime_bloom_to_camera() {
    let root = write_rendering_bundle();
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<&BloomSettings>();
    let bloom = query.single(app.world());
    assert!((bloom.intensity - (0.35 * 0.2)).abs() < 0.01);
    assert_eq!(bloom.composite_mode, BloomCompositeMode::Additive);
    assert!((bloom.prefilter_settings.threshold - 0.8).abs() < 0.01);
    assert!((bloom.prefilter_settings.threshold_softness - 0.32).abs() < 0.01);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_runtime_ambient_occlusion_to_native_camera() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {
    "antialias": "msaa4",
    "ambientOcclusion": { "enabled": true, "mode": "screen-space", "radius": 3, "intensity": 1.2, "quality": "medium" }
  },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let camera = entity_for(app.world_mut(), "camera.ui");
    let settings = app
        .world()
        .get::<ScreenSpaceAmbientOcclusionSettings>(camera)
        .expect("camera should have native SSAO settings");
    assert_eq!(
        settings.quality_level,
        ScreenSpaceAmbientOcclusionQualityLevel::Medium
    );
    assert!(app.world().get::<DepthPrepass>(camera).is_some());
    assert!(app.world().get::<NormalPrepass>(camera).is_some());

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_runtime_depth_of_field_to_native_camera() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {
    "antialias": "msaa4",
    "depthOfField": { "enabled": true, "focusDistance": 8, "aperture": 0.025, "maxBlur": 0.012 }
  },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let camera = entity_for(app.world_mut(), "camera.ui");
    let settings = app
        .world()
        .get::<DepthOfFieldSettings>(camera)
        .expect("camera should have native depth-of-field settings");
    assert_eq!(settings.mode, DepthOfFieldMode::Bokeh);
    assert!((settings.focal_distance - 8.0).abs() < 0.001);
    assert!((settings.aperture_f_stops - 0.16).abs() < 0.001);
    assert!((settings.max_circle_of_confusion_diameter - 30.72).abs() < 0.01);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_runtime_motion_blur_to_native_camera() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {
    "antialias": "msaa4",
    "motionBlur": { "enabled": true, "shutterAngle": 0.5 }
  },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let camera = entity_for(app.world_mut(), "camera.ui");
    let motion_blur = app
        .world()
        .get::<NativeTemporalMotionBlur>(camera)
        .expect("camera should have native temporal motion blur settings");
    assert!((motion_blur.previous_weight - 0.15).abs() < 0.001);
    assert!(motion_blur.reset);
    assert!(app.world().get::<DepthPrepass>(camera).is_none());
    assert!(app.world().get::<MotionVectorPrepass>(camera).is_none());

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_clamp_native_temporal_motion_blur_history_weight() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {
    "antialias": "msaa4",
    "motionBlur": { "enabled": true, "shutterAngle": 2.0 }
  },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let camera = entity_for(app.world_mut(), "camera.ui");
    let motion_blur = app
        .world()
        .get::<NativeTemporalMotionBlur>(camera)
        .expect("camera should have native temporal motion blur settings");
    assert!((motion_blur.previous_weight - 0.25).abs() < 0.001);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_runtime_screen_space_reflections_to_native_camera() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {
    "antialias": "msaa4",
    "screenSpaceReflections": { "enabled": true, "quality": "high", "roughnessLimit": 0.45 }
  },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let camera = entity_for(app.world_mut(), "camera.ui");
    let settings = app
        .world()
        .get::<ScreenSpaceReflectionsSettings>(camera)
        .expect("camera should have native screen-space reflection settings");
    assert!((settings.perceptual_roughness_threshold - 0.45).abs() < 0.001);
    assert!((settings.thickness - 0.02).abs() < 0.001);
    assert_eq!(settings.linear_steps, 32);
    assert!(app.world().get::<DepthPrepass>(camera).is_some());
    assert!(app.world().get::<DeferredPrepass>(camera).is_some());
    let default_render_method = app
        .world()
        .get_resource::<DefaultOpaqueRendererMethod>()
        .expect("SSR should configure deferred opaque rendering");
    assert!(format!("{default_render_method:?}").contains("Deferred"));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_balanced_render_look_to_native_bloom() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": { "antialias": "msaa4", "renderLook": { "version": 1, "profile": "balanced", "overrides": { "bloomIntensity": 0.45 } } },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<&BloomSettings>();
    let bloom = query.single(app.world());
    assert!((bloom.intensity - (0.45 * 0.2)).abs() < 0.01);
    assert_eq!(bloom.composite_mode, BloomCompositeMode::Additive);
    assert!((bloom.prefilter_settings.threshold - 0.85).abs() < 0.01);
    assert!((bloom.prefilter_settings.threshold_softness - 0.32).abs() < 0.01);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_cinematic_render_look_to_native_bloom() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": { "antialias": "msaa4", "renderLook": { "version": 1, "profile": "cinematic" } },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<&BloomSettings>();
    let bloom = query.single(app.world());
    assert!((bloom.intensity - (0.45 * 0.2)).abs() < 0.01);
    assert_eq!(bloom.composite_mode, BloomCompositeMode::Additive);
    assert!((bloom.prefilter_settings.threshold - 0.85).abs() < 0.01);
    assert!((bloom.prefilter_settings.threshold_softness - 0.32).abs() < 0.01);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_map_balanced_render_look_to_native_clear_color() {
    let root = write_rendering_bundle();
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let parity = default_clear_color_for_bundle(&bundle).to_srgba();
    assert!((parity.red - 17.0 / 255.0).abs() < 0.001);
    assert!((parity.green - 19.0 / 255.0).abs() < 0.001);
    assert!((parity.blue - 24.0 / 255.0).abs() < 0.001);

    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": { "antialias": "msaa4", "renderLook": { "version": 1, "profile": "balanced" } },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let balanced_bundle = load_bundle(&root).expect("balanced rendering bundle should load");
    let balanced = default_clear_color_for_bundle(&balanced_bundle).to_srgba();
    assert!((balanced.red - 56.0 / 255.0).abs() < 0.001);
    assert!((balanced.green - 189.0 / 255.0).abs() < 0.001);
    assert!((balanced.blue - 248.0 / 255.0).abs() < 0.001);

    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": { "antialias": "msaa4", "renderLook": { "version": 1, "profile": "cinematic" } },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let cinematic_bundle = load_bundle(&root).expect("cinematic rendering bundle should load");
    let cinematic = default_clear_color_for_bundle(&cinematic_bundle).to_srgba();
    assert!((cinematic.red - 143.0 / 255.0).abs() < 0.001);
    assert!((cinematic.green - 182.0 / 255.0).abs() < 0.001);
    assert!((cinematic.blue - 216.0 / 255.0).abs() < 0.001);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn rendering_should_preserve_parity_render_look_without_native_bloom() {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": { "antialias": "msaa4", "renderLook": { "version": 1, "profile": "parity" } },
  "time": { "fixedDelta": 0.016666666666666666, "paused": false },
  "window": { "height": 720, "width": 1280 }
}"#,
    );
    let bundle = load_bundle(&root).expect("rendering bundle should load");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app.world_mut().query::<&BloomSettings>();
    assert!(query.iter(app.world()).next().is_none());

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
fn rendering_should_map_procedural_mesh_binary_attributes() {
    let fixture = load_conformance_fixture("procedural-mesh");
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).expect("bundle should map");

    assert_procedural_mesh_attributes(app.world_mut(), "prop.tree.pine");
}

#[test]
fn should_spawn_rendered_particles_from_bounded_emitter_state() {
    let fixture = load_conformance_fixture("animation-graphs-particles");
    let observations = observe_rendered_particles(&fixture.bundle, 1.0);
    let mut app = App::new();

    map_bundle_into_world(app.world_mut(), &fixture.bundle).expect("bundle should map");

    assert_eq!(observations.len(), 1);
    assert_eq!(observations[0].asset, "model.hero");
    assert_eq!(observations[0].emitter, "dust");
    assert_eq!(observations[0].count, 12);
    let mut query = app
        .world_mut()
        .query::<(&NativeRenderedParticle, &NativeParticleMaterialPolicy)>();
    let rendered = query.iter(app.world()).collect::<Vec<_>>();
    assert_eq!(rendered.len(), 12);
    assert!(
        rendered
            .iter()
            .all(|(particle, _)| particle.emitter == "dust")
    );
    assert!(
        rendered
            .iter()
            .all(|(_, material)| material.base_color == "#f6c36a")
    );
    assert!(
        rendered
            .iter()
            .all(|(_, material)| (material.opacity - 0.82).abs() < 0.001)
    );
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

#[test]
fn rendering_should_apply_animation_play_service_to_native_animation_player() {
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
    app.init_resource::<NativeAnimationServiceQueue>();
    app.add_systems(
        Update,
        (
            bind_native_animation_players,
            apply_native_animation_service_effects,
        )
            .chain(),
    );
    app.finish();
    app.cleanup();

    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");
    let hero = entity_for_id(app.world_mut(), "hero");
    let player = app.world_mut().spawn(AnimationPlayer::default()).id();
    app.world_mut().entity_mut(hero).push_children(&[player]);

    app.update();
    app.world_mut()
        .resource_mut::<NativeAnimationServiceQueue>()
        .commands
        .push(NativeAnimationServiceCommand {
            active_state: Some("run".to_owned()),
            clip: "run".to_owned(),
            entity: "hero".to_owned(),
            loop_: true,
            source_clip: "Armature|Run".to_owned(),
            speed: 2.0,
        });
    app.update();

    let playback = animation_playback_for(app.world_mut(), "hero");
    assert_eq!(playback.clip, "run");
    assert_eq!(playback.source_clip, "Armature|Run");
    assert!((playback.speed - 2.5).abs() < 0.01);
    let player_ref = app.world().entity(player).get::<AnimationPlayer>().unwrap();
    let active = player_ref
        .playing_animations()
        .next()
        .map(|(_index, active)| active)
        .expect("animation player should be playing the requested service clip");
    assert_eq!(active.repeat_mode(), RepeatAnimation::Forever);
    assert!((active.speed() - 2.5).abs() < 0.01);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn assert_directional_light(world: &mut World, id: &str) {
    let mut query = world.query::<(&ThreeNativeId, Option<&DirectionalLight>)>();
    let light = query
        .iter(world)
        .find_map(|(stable_id, light)| (stable_id.0 == id).then_some(light).flatten())
        .expect("directional light should be spawned");

    assert!(
        (light.illuminance - (2.0 * THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY)).abs()
            < 0.01
    );
    let color = light.color.to_srgba();
    assert!((color.red - 1.0).abs() < 0.01);
    assert!((color.green - 0xcc as f32 / 255.0).abs() < 0.01);
    assert!((color.blue - 0x88 as f32 / 255.0).abs() < 0.01);
    assert!((light.shadow_depth_bias - 0.001).abs() < 0.0001);
    assert!((light.shadow_normal_bias - 0.03).abs() < 0.0001);
    assert!(!light.shadows_enabled);
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

    assert!((light.intensity - 2.0).abs() < 0.01);
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

    assert!((light.intensity - 3.0).abs() < 0.01);
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
    assert!((material.reflectance - 0.5 * 0.7_f32.sqrt()).abs() < 0.01);
    assert!((material.specular_transmission - 0.45).abs() < 0.01);
}

fn assert_emissive_bloom_trace(world: &mut World) {
    let observations = trace_native_emissive_bloom(world);
    assert_eq!(observations.len(), 2);
    let observation = observations
        .iter()
        .find(|observation| observation.entity_id == "cube.visible")
        .expect("cube should report emissive bloom");
    assert_eq!(observation.material_id, "mat.main");
    assert!(observation.enabled);
    assert!((observation.material_intensity - 0.8).abs() < 0.01);
    assert!((observation.threshold - 0.1).abs() < 0.01);
    assert!((observation.contribution - 0.144).abs() < 0.01);
    assert!(observation.exceeds_threshold);
}

fn assert_extended_blend_material(world: &mut World, id: &str) {
    let material = material_for(world, id);
    let color = material.base_color.to_srgba();

    assert!(material.unlit);
    assert_eq!(material.alpha_mode, AlphaMode::Blend);
    assert!((color.alpha - 0.35_f32.powf(1.9)).abs() < 0.01);
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

fn assert_procedural_mesh_attributes(world: &mut World, id: &str) {
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
        Some(VertexAttributeValues::Float32x3(values)) if values.len() == 228
    ));
    assert!(matches!(
        mesh.attribute(Mesh::ATTRIBUTE_NORMAL),
        Some(VertexAttributeValues::Float32x3(values)) if values.len() == 228
    ));
    assert!(matches!(
        mesh.attribute(Mesh::ATTRIBUTE_UV_0),
        Some(VertexAttributeValues::Float32x2(values)) if values.len() == 228
    ));
    assert!(matches!(
        mesh.attribute(Mesh::ATTRIBUTE_COLOR),
        Some(VertexAttributeValues::Float32x4(values)) if values.len() == 228
    ));
    assert!(matches!(mesh.indices(), Some(Indices::U32(indices)) if indices.len() == 630));
}

fn assert_mesh_has_tangents(world: &mut World, id: &str) {
    let mesh = mesh_for_id(world, id);
    assert!(
        mesh.attribute(Mesh::ATTRIBUTE_TANGENT).is_some(),
        "normal-mapped mesh should have generated tangents"
    );
}

fn assert_mesh_has_three_box_uvs(world: &mut World, id: &str) {
    let mesh = mesh_for_id(world, id);
    let uvs = mesh
        .attribute(Mesh::ATTRIBUTE_UV_0)
        .expect("box mesh should have uv0");
    let VertexAttributeValues::Float32x2(uvs) = uvs else {
        panic!("box uv0 should be float32x2");
    };
    assert_eq!(uvs.first().copied(), Some([0.0, 1.0]));
    assert_eq!(uvs.get(1).copied(), Some([1.0, 1.0]));
    assert_eq!(uvs.get(2).copied(), Some([0.0, 0.0]));
    assert_eq!(uvs.get(3).copied(), Some([1.0, 0.0]));
}

fn mesh_for_id(world: &mut World, id: &str) -> Mesh {
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
    mesh.clone()
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

fn entity_for(world: &mut World, id: &str) -> Entity {
    let mut query = world.query::<(Entity, &ThreeNativeId)>();
    query
        .iter(world)
        .find_map(|(entity, stable_id)| (stable_id.0 == id).then_some(entity))
        .expect("entity should exist")
}

fn write_shader_material_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-shader-material-{}",
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
  "name": "portable-shader",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write(
        &root,
        "target.profile.json",
        r#"{
  "schema": "threenative.target-profile",
  "version": "0.1.0",
  "targets": ["desktop"]
}"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [{
    "id": "cube.shader",
    "components": {
      "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.shader" }
    }
  }]
}"#,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    { "id": "mesh.cube", "kind": "mesh", "format": "generated", "primitive": "box", "size": [1, 1, 1] },
    { "id": "tex.albedo", "kind": "texture", "format": "png", "path": "assets/albedo.png" }
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
    "id": "mat.shader",
    "kind": "shader",
    "alphaMode": "mask",
    "alphaCutoff": 0.25,
    "color": "#ffffff",
    "outputs": ["baseColor", "alpha"],
    "program": {
      "language": "threenative-shader-v1",
      "fragment": {
        "outputs": {
          "baseColor": { "kind": "sampleTexture", "texture": "albedo" },
          "alpha": { "kind": "uniform", "uniform": "cutoff" }
        }
      },
      "vertex": {
        "displacement": {
          "axis": "normal",
          "amount": { "kind": "uniform", "uniform": "waveHeight" }
        }
      }
    },
    "textures": [{ "name": "albedo", "asset": "tex.albedo" }],
    "uniforms": [
      { "name": "cutoff", "type": "float", "default": 0.5 },
      { "name": "waveHeight", "type": "float", "default": 0.2 }
    ]
  }]
}"##,
    );
    root
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
  "requiredCapabilities": {},
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
  "renderer": { "antialias": "msaa8", "bloom": { "enabled": true, "intensity": 0.35, "threshold": 0.8 } },
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
      "id": "plane.glass",
      "components": {
        "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.extendedBlend", "visible": true },
        "Transform": { "position": [0, 0, 0], "scale": [1, 1, 1] }
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
    "emissiveBloom": { "enabled": true, "intensity": 0.8, "threshold": 0.1 },
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
  }, {
    "id": "mat.extendedBlend",
    "kind": "extended",
    "alphaMode": "blend",
    "color": "#9ed7ff",
    "extension": { "doubleSided": false, "preset": "unlitMasked" },
    "opacity": 0.35
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

fn write_post_antialias_bundle(mode: &str) -> PathBuf {
    let root = write_rendering_bundle();
    write(
        &root,
        "runtime.config.json",
        &format!(
            r#"{{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "renderer": {{ "antialias": "{mode}" }},
  "time": {{ "fixedDelta": 0.016666666666666666, "paused": false }},
  "window": {{ "height": 720, "width": 1280 }}
}}"#
        ),
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
  "requiredCapabilities": {},
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
  "requiredCapabilities": {},
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
  "requiredCapabilities": {},
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

#[test]
fn emissive_color_cards_should_preserve_standard_base_color() {
    let root = write_emissive_color_card_bundle();
    let bundle = load_bundle(&root).expect("emissive color card bundle should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let material = material_for(app.world_mut(), "swatch.red");
    assert!(!material.unlit);
    assert!(!material.fog_enabled);
    assert!(material.emissive_exposure_weight.abs() < 0.001);
    assert!(material.emissive.red > 0.0);
    assert!(material.emissive.red > material.emissive.green);
    assert!(material.emissive.red > material.emissive.blue);
    let color = material.base_color.to_srgba();
    assert!((color.red - 230.0 / 255.0).abs() < 0.01);
    assert!((color.green - 25.0 / 255.0).abs() < 0.01);
    assert!((color.blue - 75.0 / 255.0).abs() < 0.01);
}

#[test]
fn standard_emissive_markers_should_generate_native_mask_input() {
    let root = write_emissive_color_card_bundle();
    let bundle = load_bundle(&root).expect("emissive color card bundle should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mask = app
        .world()
        .get_resource::<NativeEmissiveMarkerMask>()
        .expect("marker-style emissive material should allocate mask target");
    assert_eq!(mask.width, 1280);
    assert_eq!(mask.height, 720);
    assert_eq!(mask.layer, 63);
    let mask_image = mask.image.clone();
    let mask_layer = mask.layer;

    let mut cameras = app
        .world_mut()
        .query::<(&Camera, &RenderLayers, Option<&Name>)>();
    let mask_camera = cameras
        .iter(app.world())
        .find(|(camera, layers, name)| {
            matches!(&camera.target, RenderTarget::Image(handle) if *handle == mask_image)
                && layers.intersects(&RenderLayers::layer(mask_layer))
                && name.is_some_and(|name| name.as_str() == "native.emissive-marker-mask-camera")
        })
        .expect("active camera should get an offscreen marker mask camera");
    assert!(mask_camera.0.is_active);

    let source_entity = app
        .world_mut()
        .query::<(Entity, &ThreeNativeId)>()
        .iter(app.world())
        .find_map(|(entity, id)| (id.0 == "swatch.red").then_some(entity))
        .expect("authored marker mesh should exist");
    let mut proxies = app
        .world_mut()
        .query::<(&Name, &RenderLayers, &Handle<StandardMaterial>, &Parent)>();
    let proxy = proxies
        .iter(app.world())
        .find(|(name, layers, _, _)| {
            name.as_str() == "swatch.red.emissive-mask"
                && layers.intersects(&RenderLayers::layer(mask_layer))
        })
        .expect("marker mesh should get a mask proxy on the private layer");
    let materials = app.world().resource::<Assets<StandardMaterial>>();
    let material = materials
        .get(proxy.2)
        .expect("mask proxy material should exist");
    assert!(material.unlit);
    assert!(!material.fog_enabled);
    assert_eq!(proxy.3.get(), source_entity);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn cameras_without_atmosphere_should_use_three_style_neutral_exposure() {
    let root = write_color_parity_camera_bundle();
    let bundle = load_bundle(&root).expect("color parity camera bundle should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app
        .world_mut()
        .query::<(&ThreeNativeId, &Tonemapping, &ColorGrading, &Exposure)>();
    let camera = query
        .iter(app.world())
        .find(|(stable_id, _, _, _)| stable_id.0 == "camera.color")
        .expect("color parity camera should be spawned");
    assert_eq!(*camera.1, Tonemapping::None);
    assert!((camera.2.global.exposure - 0.0).abs() < 0.001);
    assert!((camera.3.ev100 - 0.0).abs() < 0.001);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn cameras_should_map_runtime_color_grading_to_native_sections() {
    let root = write_runtime_color_grading_camera_bundle();
    let bundle = load_bundle(&root).expect("runtime color grading camera bundle should load");
    let mut app = App::new();
    map_bundle_into_world(app.world_mut(), &bundle).expect("bundle should map");

    let mut query = app
        .world_mut()
        .query::<(&ThreeNativeId, &Tonemapping, &ColorGrading, &Exposure)>();
    let camera = query
        .iter(app.world())
        .find(|(stable_id, _, _, _)| stable_id.0 == "camera.color")
        .expect("runtime color grading camera should be spawned");
    assert_eq!(*camera.1, Tonemapping::AcesFitted);
    assert!((camera.2.global.exposure - 0.0).abs() < 0.001);
    assert!((camera.2.global.post_saturation - (0.82 * 0.85)).abs() < 0.001);
    for section in camera.2.all_sections() {
        assert!((section.contrast - 1.14).abs() < 0.001);
    }
    assert!((camera.3.exposure() - 1.18).abs() < 0.001);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn write_color_parity_camera_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-color-parity-camera-{}",
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
  "name": "color-parity-camera",
  "requiredCapabilities": {},
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
    {
      "id": "camera.color",
      "components": {
        "Camera": { "kind": "orthographic", "near": 0.1, "far": 20, "size": 4.5 },
        "Transform": { "position": [0, 0, 5] }
      }
    }
  ],
  "resources": { "ActiveCamera": { "entity": "camera.color" } }
}"##,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    root
}

fn write_runtime_color_grading_camera_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-runtime-color-grading-camera-{}",
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
  "name": "runtime-color-grading-camera",
  "requiredCapabilities": {},
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
    "renderer": {
    "antialias": "msaa4",
    "colorGrading": { "contrast": 0.14, "exposure": 1.18, "saturation": 0.82, "toneMapping": "aces" }
  },
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
    {
      "id": "camera.color",
      "components": {
        "Camera": { "kind": "orthographic", "near": 0.1, "far": 20, "size": 4.5 },
        "Transform": { "position": [0, 0, 5] }
      }
    }
  ],
  "resources": { "ActiveCamera": { "entity": "camera.color" } }
}"##,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    root
}

fn write_emissive_color_card_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-rendering-emissive-card-{}",
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
  "name": "emissive-color-card",
  "requiredCapabilities": {},
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
    {
      "id": "camera.main",
      "components": {
        "Camera": { "kind": "orthographic", "near": 0.1, "far": 20, "size": 4.5 },
        "Transform": { "position": [0, 0, 5] }
      }
    },
    {
      "id": "swatch.red",
      "components": {
        "MeshRenderer": { "mesh": "mesh.plane", "material": "mat.red" },
        "Transform": { "position": [0, 0, 0] }
      }
    }
  ],
  "resources": { "ActiveCamera": { "entity": "camera.main" } }
}"##,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{
  "schema": "threenative.assets",
  "version": "0.1.0",
  "assets": [
    { "id": "mesh.plane", "kind": "mesh", "format": "generated", "primitive": "plane", "size": [1, 1] }
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
    "id": "mat.red",
    "kind": "standard",
    "color": "#e6194b",
    "emissive": "#e6194b",
    "emissiveIntensity": 1,
    "metalness": 0.05,
    "roughness": 0.4
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
