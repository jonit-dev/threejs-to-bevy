use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    prelude::*,
    render::{
        camera::RenderTarget,
        render_resource::{TextureFormat, TextureUsages},
    },
};
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::{
    conformance::report_bevy_conformance,
    map_world::map_bundle_into_world,
    rendering::contact_shadows::{
        NATIVE_CONTACT_SHADOW_BLUR_WEIGHTS, NativeContactShadowPrivate, NativeContactShadowReport,
        NativeContactShadows, advance_native_contact_shadow_frames,
        native_contact_shadow_height_occupancy, refresh_native_contact_shadow_pipelines,
        sync_native_contact_shadow_anchors, trace_native_contact_shadows,
    },
};

#[test]
fn native_contact_shadows_should_build_bounded_private_capture_and_blur_pipeline() {
    let root = write_contact_shadow_bundle();
    let bundle = load_bundle(&root).expect("contact shadow bundle should load");
    assert_eq!(
        bundle.world.entities[1]
            .components
            .contact_shadows
            .as_ref()
            .expect("static contact shadows should parse")
            .resolution,
        512
    );

    let mut app = App::new();
    app.add_plugins(TransformPlugin);
    map_bundle_into_world(app.world_mut(), &bundle).expect("contact shadow bundle should map");

    let reports = trace_native_contact_shadows(app.world_mut());
    assert_eq!(reports.len(), 2);
    let static_report = report(&reports, "contact.static");
    assert_eq!(static_report.requested_resolution, 512);
    assert_eq!(static_report.applied_resolution, 512);
    assert_eq!(static_report.update_mode, "static");
    assert_eq!(static_report.height, 4.0);
    assert_eq!(static_report.capture_count, 1);
    assert_eq!(static_report.active_pass_count, 0);
    assert_eq!(static_report.private_entity_count, 1);
    assert!(
        static_report
            .private_roles
            .contains(&"composite-plane".to_owned())
    );
    assert!(
        static_report
            .private_roles
            .iter()
            .all(|role| role != "caster-proxy:ground")
    );
    assert!(
        static_report
            .private_roles
            .iter()
            .all(|role| role != "caster-proxy:caster.dynamic")
    );

    let dynamic_report = report(&reports, "contact.dynamic");
    assert_eq!(dynamic_report.requested_resolution, 1024);
    assert_eq!(dynamic_report.applied_resolution, 256);
    assert_eq!(dynamic_report.update_mode, "dynamic");
    assert!(
        dynamic_report
            .private_roles
            .contains(&"caster-proxy:caster.dynamic".to_owned())
    );

    let private_entities = app
        .world_mut()
        .query::<(&NativeContactShadowPrivate, Option<&ThreeNativeId>)>()
        .iter(app.world())
        .map(|(private, id)| (private.clone(), id.cloned()))
        .collect::<Vec<_>>();
    assert_eq!(private_entities.len(), 8);
    assert!(private_entities.iter().all(|(_, id)| id.is_none()));

    let image_targets = app
        .world_mut()
        .query::<(&Camera, &NativeContactShadowPrivate)>()
        .iter(app.world())
        .filter_map(|(camera, private)| match &camera.target {
            RenderTarget::Image(image) => Some((private.role.clone(), image.clone())),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(image_targets.len(), 3);
    let images = app.world().resource::<Assets<Image>>();
    for (_, target) in image_targets {
        let image = images.get(&target).expect("private target should exist");
        assert_eq!(
            image.texture_descriptor.format,
            TextureFormat::Rgba8UnormSrgb
        );
        assert!(
            image
                .texture_descriptor
                .usage
                .contains(TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING)
        );
    }

    let capture_proxy_materials = app
        .world_mut()
        .query::<(&NativeContactShadowPrivate, &Handle<StandardMaterial>)>()
        .iter(app.world())
        .filter(|(private, _)| private.role.starts_with("caster-proxy:"))
        .map(|(private, material)| (private.owner.clone(), material.clone()))
        .collect::<Vec<_>>();
    assert_eq!(capture_proxy_materials.len(), 1);
    let materials = app.world().resource::<Assets<StandardMaterial>>();
    for (owner, handle) in &capture_proxy_materials {
        let material = materials
            .get(handle)
            .expect("capture proxy material should exist");
        assert!(material.unlit);
        assert_eq!(owner, "contact.dynamic");
        let linear = material.base_color.to_linear();
        assert!((linear.red - 1.0).abs() < 0.000_001);
        assert!((linear.green - 1.0).abs() < 0.000_001);
        assert!((linear.blue - 1.0).abs() < 0.000_001);
    }
    assert_eq!(native_contact_shadow_height_occupancy(0.0, 4.0), 1.0);
    assert_eq!(native_contact_shadow_height_occupancy(2.0, 4.0), 0.5);
    assert_eq!(native_contact_shadow_height_occupancy(4.0, 4.0), 0.0);
    let kernel_sum = NATIVE_CONTACT_SHADOW_BLUR_WEIGHTS[4]
        + 2.0 * NATIVE_CONTACT_SHADOW_BLUR_WEIGHTS[..4].iter().sum::<f32>();
    assert!((kernel_sum - 1.0).abs() < 0.00001);
    assert_eq!(app.world().resource::<Assets<Image>>().len(), 4);
    let standard_material_count = app.world().resource::<Assets<StandardMaterial>>().len();
    refresh_native_contact_shadow_pipelines(app.world_mut());
    assert_eq!(app.world().resource::<Assets<Image>>().len(), 4);
    assert_eq!(
        app.world().resource::<Assets<StandardMaterial>>().len(),
        standard_material_count
    );
    sync_native_contact_shadow_anchors(app.world_mut());
    app.update();
    let composite_positions = app
        .world_mut()
        .query::<(&NativeContactShadowPrivate, &GlobalTransform)>()
        .iter(app.world())
        .filter(|(private, _)| private.role == "composite-plane")
        .map(|(private, transform)| (private.owner.clone(), transform.translation().x))
        .collect::<Vec<_>>();
    assert!(
        composite_positions
            .iter()
            .any(|(owner, x)| { owner == "contact.static" && (*x + 20.0).abs() < 0.001 })
    );
    assert!(
        composite_positions
            .iter()
            .any(|(owner, x)| { owner == "contact.dynamic" && (*x - 20.0).abs() < 0.001 })
    );

    advance_native_contact_shadow_frames(app.world_mut(), 9);
    let settled = trace_native_contact_shadows(app.world_mut());
    let static_report = report(&settled, "contact.static");
    assert_eq!(static_report.capture_count, 1);
    assert_eq!(static_report.update_count, 1);
    assert_eq!(static_report.active_pass_count, 0);
    let dynamic_report = report(&settled, "contact.dynamic");
    assert_eq!(dynamic_report.capture_count, 9);
    assert_eq!(dynamic_report.update_count, 9);
    assert_eq!(dynamic_report.active_pass_count, 3);

    let static_active_cameras = app
        .world_mut()
        .query::<(&Camera, &NativeContactShadowPrivate)>()
        .iter(app.world())
        .filter(|(_, private)| {
            private.owner == "contact.static" && private.role.ends_with("camera")
        })
        .filter(|(camera, _)| camera.is_active)
        .count();
    assert_eq!(static_active_cameras, 0);

    let conformance = report_bevy_conformance(app.world_mut(), &bundle, "contact-shadows");
    let json = serde_json::to_value(conformance).expect("report should serialize");
    let contact_reports = json["contactShadows"]
        .as_array()
        .expect("contact shadows should serialize as an array");
    let static_json = contact_reports
        .iter()
        .find(|report| report["entityId"] == "contact.static")
        .expect("static report should serialize");
    let dynamic_json = contact_reports
        .iter()
        .find(|report| report["entityId"] == "contact.dynamic")
        .expect("dynamic report should serialize");
    assert_eq!(static_json["activePassCount"], 0);
    assert_eq!(static_json["captureCount"], 1);
    assert_eq!(dynamic_json["activePassCount"], 3);

    let carrier_count = app
        .world_mut()
        .query::<(&ThreeNativeId, &NativeContactShadows)>()
        .iter(app.world())
        .count();
    assert_eq!(carrier_count, 2);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn report<'a>(reports: &'a [NativeContactShadowReport], id: &str) -> &'a NativeContactShadowReport {
    reports
        .iter()
        .find(|report| report.entity_id == id)
        .expect("contact shadow report should exist")
}

fn write_contact_shadow_bundle() -> PathBuf {
    let root = temp_bundle_dir();
    write(
        &root,
        "manifest.json",
        r#"{
      "schema": "threenative.bundle",
      "version": "0.1.0",
      "name": "contact-shadows",
      "requiredCapabilities": {},
      "entry": { "world": "world.ir.json" },
      "files": {
        "assets": "assets.manifest.json",
        "materials": "materials.ir.json",
        "runtimeConfig": "runtime.config.json",
        "targetProfile": "target.profile.json"
      }
    }"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{
      "schema": "threenative.world",
      "version": "0.1.0",
      "entities": [
        {
          "id": "caster",
          "components": {
            "Transform": { "position": [-20, 1, 0] },
            "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.cube", "castShadow": true, "receiveShadow": true }
          }
        },
        {
          "id": "contact.static",
          "components": {
            "Transform": { "position": [-20, 0, 0] },
            "ContactShadows": { "size": [10, 8], "height": 4, "resolution": 512, "softness": 1.5, "opacity": 0.6, "updateMode": "static" }
          }
        },
        {
          "id": "contact.dynamic",
          "components": {
            "Transform": { "position": [20, 0, 0] },
            "ContactShadows": { "size": [12, 12], "height": 6, "resolution": 1024, "softness": 2, "opacity": 0.7, "updateMode": "dynamic" }
          }
        },
        {
          "id": "ground",
          "components": {
            "Transform": { "position": [0, -0.1, 0], "scale": [10, 0.1, 10] },
            "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.cube", "castShadow": false, "receiveShadow": true }
          }
        },
        {
          "id": "caster.dynamic",
          "components": {
            "Transform": { "position": [20, 1, 0] },
            "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.cube", "castShadow": true, "receiveShadow": true }
          }
        },
        {
          "id": "caster.boundary",
          "components": {
            "Transform": { "position": [-25.4, 1, 0] },
            "MeshRenderer": { "mesh": "mesh.cube", "material": "mat.cube", "castShadow": true, "receiveShadow": true }
          }
        }
      ]
    }"#,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{
      "schema": "threenative.assets",
      "version": "0.1.0",
      "assets": [{ "id": "mesh.cube", "kind": "mesh", "format": "primitive", "primitive": "box", "size": [1, 2, 1] }]
    }"#,
    );
    write(
        &root,
        "materials.ir.json",
        r##"{
      "schema": "threenative.materials",
      "version": "0.1.0",
      "materials": [{ "id": "mat.cube", "kind": "standard", "color": "#ffffff" }]
    }"##,
    );
    write(
        &root,
        "runtime.config.json",
        r#"{
      "schema": "threenative.runtime-config",
      "version": "0.1.0",
      "renderer": {
        "antialias": "msaa4",
        "renderLook": { "version": 1, "profile": "parity", "overrides": { "shadowQuality": "low" } }
      },
      "time": { "fixedDelta": 0.016666666666666666, "paused": false },
      "window": { "height": 720, "width": 1280 }
    }"#,
    );
    write(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    root
}

fn temp_bundle_dir() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("threenative-contact-shadows-{nonce}"));
    fs::create_dir_all(&root).expect("temporary bundle should be created");
    root
}

fn write(root: &PathBuf, name: &str, contents: &str) {
    fs::write(root.join(name), contents).expect("bundle file should be written");
}
