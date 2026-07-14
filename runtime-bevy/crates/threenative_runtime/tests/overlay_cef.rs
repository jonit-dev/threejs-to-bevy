#![cfg(feature = "native-overlay-cef")]

use threenative_runtime::overlay_cef::{
    CEF_DESKTOP_BLINK_SETTINGS, CefPaintFrame, CefPaintQueue, CefSpikeFrameProbe,
    CefSpikeFrameProbeConfig, advance_snapshot_delivery, apply_paint_to_image,
    apply_paint_to_image_if_current, build_cef_spike_frame_report, cef_input_position,
    cef_key_values, cef_modal_probe_script, cef_overlay_url_allowed, cef_process_crash_diagnostic,
    cef_spike_bridge_script, cef_spike_frame_stats, cef_spike_modal_probe_script,
    cef_surface_physical_extent, compare_cef_spike_frame_stats, dispatch_cef_subprocess_with,
    hide_native_ui_fallback_for_cef, normalize_bgra_premultiplied_to_rgba,
    receive_cef_spike_game_message, resolve_cef_overlay_resource, select_topmost_cef_surface,
};

#[test]
fn should_advertise_desktop_pointer_capabilities_for_css_hover() {
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("primaryHoverType=2"));
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("availableHoverTypes=2"));
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("primaryPointerType=4"));
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("availablePointerTypes=4"));
}

#[test]
fn should_select_cef_osr_for_a_declared_desktop_overlay() {
    let overlays = serde_json::from_value(serde_json::json!({
        "schema": "threenative.overlays",
        "version": "0.2.0",
        "overlays": [{
            "entry": "overlay/index.html",
            "id": "hud",
            "input": "pointer",
            "messages": { "gameToOverlay": [], "overlayToGame": [] },
            "targetProfiles": ["desktop"],
            "transparent": true,
            "zIndex": 10
        }]
    }))
    .unwrap();

    let plan = threenative_runtime::overlay_host::create_native_overlay_host_plan(
        Some(&overlays),
        std::path::Path::new("/tmp/example.bundle"),
    )
    .unwrap()
    .unwrap();
    let descriptor =
        threenative_runtime::overlay_host::native_overlay_backend_descriptor().unwrap();

    assert_eq!(descriptor.id, "cef-osr");
    assert_eq!(descriptor.cargo_feature, "native-overlay-cef");
    assert_eq!(descriptor.package_manifest, "cef-runtime-manifest.json");
    assert_eq!(plan.backend, descriptor.id);
}

#[test]
fn should_select_the_topmost_visible_surface_that_claims_a_pointer() {
    let selected = select_topmost_cef_surface(&[
        ("hud", 10, true, true),
        ("dialog", 30, true, true),
        ("tooltip", 40, false, true),
        ("passive", 50, true, false),
    ]);

    assert_eq!(selected, Some("dialog"));
}

#[test]
fn should_break_equal_z_index_ties_by_stable_mount_order() {
    let selected =
        select_topmost_cef_surface(&[("first", 20, true, true), ("second", 20, true, true)]);

    assert_eq!(selected, Some("second"));
}

#[test]
fn should_map_hidpi_css_extent_to_physical_overlay_pixels() {
    assert_eq!(cef_surface_physical_extent(800, 450, 1.5), (1200, 675));
    assert_eq!(cef_surface_physical_extent(800, 450, 0.0), (800, 450));
}

#[test]
fn should_reject_an_impossible_overlay_input_mapping() {
    let bounds = threenative_runtime::overlay_host::NativeOverlayBounds {
        x: 12,
        y: 20,
        width: 300,
        height: 180,
    };
    assert_eq!(
        cef_input_position(bevy::prelude::Vec2::new(42.0, 50.0), bounds).unwrap(),
        bevy::prelude::Vec2::new(30.0, 30.0)
    );
    assert!(
        cef_input_position(bevy::prelude::Vec2::new(f32::NAN, 50.0), bounds)
            .unwrap_err()
            .starts_with("TN_OVERLAY_CEF_INPUT_MAPPING_INVALID:")
    );
}

#[test]
fn should_emit_a_stable_renderer_crash_diagnostic() {
    assert_eq!(
        cef_process_crash_diagnostic("hud", 3, "renderer exited"),
        "TN_OVERLAY_CEF_PROCESS_CRASHED: overlay=\"hud\", status=3, renderer exited"
    );
}

#[test]
fn should_serve_a_normalized_bundle_local_asset() {
    let root =
        std::env::temp_dir().join(format!("threenative-cef-resource-{}", std::process::id()));
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::write(root.join("assets/app.js"), "export const ready = true;").unwrap();

    let (path, mime_type) = resolve_cef_overlay_resource(
        &root,
        "threenative-overlay://bundle/assets/./app.js?version=1",
    )
    .unwrap();

    assert_eq!(path, root.join("assets/app.js").canonicalize().unwrap());
    assert_eq!(mime_type, "text/javascript");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn should_reject_traversal_and_remote_navigation() {
    let root = std::env::temp_dir().join(format!(
        "threenative-cef-resource-reject-{}",
        std::process::id()
    ));
    std::fs::create_dir_all(&root).unwrap();

    for request in [
        "threenative-overlay://bundle/../secret.txt",
        "threenative-overlay://bundle/%2e%2e/secret.txt",
        "https://example.com/index.html",
    ] {
        let error = resolve_cef_overlay_resource(&root, request).unwrap_err();
        assert!(error.contains("TN_OVERLAY_CEF_RESOURCE_REJECTED"));
        assert!(error.contains(request));
    }
    assert!(cef_overlay_url_allowed(
        "threenative-overlay://bundle/index.html"
    ));
    assert!(!cef_overlay_url_allowed("https://example.com/index.html"));
    assert!(!cef_overlay_url_allowed("file:///tmp/index.html"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn should_dispatch_a_cef_helper_without_initializing_bevy() {
    let bevy_initialized = std::cell::Cell::new(false);
    let exit_code = dispatch_cef_subprocess_with(|| 7, || bevy_initialized.set(true));

    assert_eq!(exit_code, Some(7));
    assert!(!bevy_initialized.get());
}

#[test]
fn should_preserve_transparent_pixels_when_normalizing_bgra_paint() {
    let rgba =
        normalize_bgra_premultiplied_to_rgba(&[0, 0, 0, 0, 10, 20, 30, 255, 10, 20, 30, 128]);
    assert_eq!(rgba, vec![0, 0, 0, 0, 30, 20, 10, 255, 60, 40, 20, 128]);
}

#[test]
fn should_keep_only_the_newest_paint_when_producer_outruns_bevy() {
    let mut queue = CefPaintQueue::default();
    queue
        .push_bgra_premultiplied(1, 1, &[1, 2, 3, 255])
        .unwrap();
    queue
        .push_bgra_premultiplied(1, 1, &[4, 5, 6, 255])
        .unwrap();

    assert_eq!(queue.pending_len(), 1);
    assert_eq!(queue.metrics().accepted, 2);
    assert_eq!(queue.metrics().copy_micros.len(), 2);
    assert_eq!(queue.metrics().dropped, 1);
    assert_eq!(queue.take_latest().unwrap().rgba, vec![6, 5, 4, 255]);
    assert_eq!(queue.pending_len(), 0);
}

#[test]
fn should_bound_paint_timing_samples() {
    let mut queue = CefPaintQueue::default();
    for value in 0..2_100_u32 {
        queue
            .push_bgra_premultiplied(1, 1, &[value as u8, 2, 3, 255])
            .unwrap();
    }

    assert_eq!(queue.metrics().accepted, 2_100);
    assert_eq!(queue.metrics().copy_micros.len(), 2_048);
}

#[test]
fn should_reuse_a_recycled_full_frame_buffer() {
    let mut queue = CefPaintQueue::default();
    queue
        .push_bgra_premultiplied(2, 1, &[1, 2, 3, 255, 4, 5, 6, 255])
        .unwrap();
    let first = queue.take_latest().unwrap();
    let allocation = first.rgba.as_ptr();
    queue.recycle(first.rgba);

    queue
        .push_bgra_premultiplied(2, 1, &[7, 8, 9, 255, 10, 11, 12, 255])
        .unwrap();
    let second = queue.take_latest().unwrap();

    assert_eq!(second.rgba.as_ptr(), allocation);
    assert_eq!(second.rgba, vec![9, 8, 7, 255, 12, 11, 10, 255]);
}

#[test]
fn should_reject_malformed_paint_buffers() {
    let error = CefPaintQueue::default()
        .push_bgra_premultiplied(2, 2, &[0; 15])
        .unwrap_err();
    assert!(error.contains("TN_OVERLAY_CEF_PAINT_INVALID"));
}

#[test]
fn should_replace_dynamic_texture_without_stale_mip_levels() {
    let mut image = bevy::render::texture::Image::default();
    image.texture_descriptor.mip_level_count = 4;
    apply_paint_to_image(
        &mut image,
        CefPaintFrame {
            generation: 0,
            width: 2,
            height: 1,
            rgba: vec![1, 2, 3, 4, 5, 6, 7, 8],
        },
    );

    assert_eq!(image.texture_descriptor.mip_level_count, 1);
    assert_eq!(image.texture_descriptor.size.width, 2);
    assert_eq!(image.texture_descriptor.size.height, 1);
    assert_eq!(image.data, vec![1, 2, 3, 4, 5, 6, 7, 8]);
}

#[test]
fn should_discard_a_stale_paint_after_resize() {
    let mut image = bevy::render::texture::Image::new_fill(
        bevy::render::render_resource::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        bevy::render::render_resource::TextureDimension::D2,
        &[9, 9, 9, 9],
        bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb,
        bevy::render::render_asset::RenderAssetUsages::default(),
    );

    assert!(!apply_paint_to_image_if_current(
        &mut image,
        CefPaintFrame {
            generation: 2,
            width: 1,
            height: 1,
            rgba: vec![1, 2, 3, 4],
        },
        3,
    ));
    assert_eq!(image.data, vec![9, 9, 9, 9]);
}

#[test]
fn should_compare_overlay_and_baseline_frame_distributions() {
    let baseline = cef_spike_frame_stats(&[10_000, 20_000, 30_000, 40_000]).unwrap();
    let overlay = cef_spike_frame_stats(&[12_000, 23_000, 34_000, 45_000]).unwrap();
    let delta = compare_cef_spike_frame_stats(&overlay, &baseline);

    assert_eq!(baseline.count, 4);
    assert_eq!(baseline.p50_ms, 20.0);
    assert_eq!(delta.mean_ms, 3.5);
    assert_eq!(delta.p95_ms, 5.0);
    assert_eq!(delta.p99_ms, 5.0);
}

#[test]
fn should_reject_a_frame_probe_with_a_mismatched_viewport() {
    let config = CefSpikeFrameProbeConfig {
        baseline_report_path: None,
        mode: "baseline".to_string(),
        report_path: "unused.json".into(),
        sample_frames: 2,
        warmup_frames: 1,
    };
    let error = build_cef_spike_frame_report(&config, 1_440, 900, &[16_000, 17_000]).unwrap_err();

    assert!(error.contains("TN_OVERLAY_CEF_FRAME_BASELINE_INVALID"));
    assert!(error.contains("1280x720"));
}

#[test]
fn should_sample_completed_frames_only_after_warmup() {
    let start = std::time::Instant::now();
    let mut probe = CefSpikeFrameProbe::new(CefSpikeFrameProbeConfig {
        baseline_report_path: None,
        mode: "baseline".to_string(),
        report_path: "unused.json".into(),
        sample_frames: 3,
        warmup_frames: 2,
    });

    assert!(!probe.observe_frame_start(start));
    assert!(!probe.observe_frame_start(start + std::time::Duration::from_millis(10)));
    assert!(!probe.observe_frame_start(start + std::time::Duration::from_millis(20)));
    assert!(!probe.observe_frame_start(start + std::time::Duration::from_millis(30)));
    assert!(!probe.observe_frame_start(start + std::time::Duration::from_millis(40)));
    assert!(probe.observe_frame_start(start + std::time::Duration::from_millis(50)));
    assert_eq!(probe.sample_count(), 3);
}

#[test]
fn should_reject_a_baseline_with_a_mismatched_sample_policy() {
    let path = std::env::temp_dir().join(format!(
        "threenative-cef-frame-baseline-{}.json",
        std::process::id()
    ));
    let baseline_config = CefSpikeFrameProbeConfig {
        baseline_report_path: None,
        mode: "baseline".to_string(),
        report_path: path.clone(),
        sample_frames: 2,
        warmup_frames: 2,
    };
    let baseline =
        build_cef_spike_frame_report(&baseline_config, 1_280, 720, &[16_000, 17_000]).unwrap();
    threenative_runtime::trace_report::write_pretty_json_report(&path, &baseline).unwrap();
    let overlay_config = CefSpikeFrameProbeConfig {
        baseline_report_path: Some(path.clone()),
        mode: "overlay".to_string(),
        report_path: "unused.json".into(),
        sample_frames: 2,
        warmup_frames: 3,
    };

    let error =
        build_cef_spike_frame_report(&overlay_config, 1_280, 720, &[16_500, 17_500]).unwrap_err();
    let _ = std::fs::remove_file(path);

    assert!(error.contains("TN_OVERLAY_CEF_FRAME_BASELINE_INVALID"));
    assert!(error.contains("does not match"));
}

#[test]
fn should_hide_retained_ui_only_after_cef_is_ready() {
    let mut world = bevy::prelude::World::new();
    let retained_root = world
        .spawn((
            bevy::prelude::NodeBundle::default(),
            threenative_runtime::ui::NativeUiKind("stack".to_string()),
        ))
        .id();
    let scene_node = world.spawn(bevy::prelude::SpatialBundle::default()).id();

    assert_eq!(hide_native_ui_fallback_for_cef(&mut world), 1);
    assert_eq!(
        world.get::<bevy::prelude::Visibility>(retained_root),
        Some(&bevy::prelude::Visibility::Hidden)
    );
    assert_eq!(
        world.get::<bevy::prelude::Visibility>(scene_node),
        Some(&bevy::prelude::Visibility::Inherited)
    );
}

#[test]
fn should_route_a_cef_side_choice_into_the_native_game_bridge() {
    let overlays = serde_json::from_value(serde_json::json!({
        "schema": "threenative.overlays",
        "version": "0.2.0",
        "overlays": [{
            "entry": "overlay/index.html",
            "id": "chess-side-select",
            "input": "modal",
            "messages": {
                "gameToOverlay": [],
                "overlayToGame": [{
                    "name": "chess:choose-side",
                    "schema": {
                        "fields": { "side": "string" },
                        "kind": "object",
                        "required": ["side"]
                    }
                }]
            },
            "targetProfiles": ["web"],
            "transparent": true,
            "zIndex": 30
        }]
    }))
    .unwrap();
    let mut bridge = threenative_runtime::overlay_host::NativeOverlayBridgeResource::new(overlays);

    assert!(
        receive_cef_spike_game_message(
            r#"{"overlayId":"chess-side-select","type":"chess:choose-side","payload":{"side":"black"}}"#,
            "chess-side-select",
            &mut bridge,
        )
        .unwrap()
    );
    let events = bridge.bridge.drain_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].message_type, "chess:choose-side");
    assert_eq!(events[0].payload, serde_json::json!({ "side": "black" }));
}

#[test]
fn should_install_a_real_cef_bridge_without_fabricating_game_snapshots() {
    let script = cef_spike_bridge_script("chess-side-select").unwrap();

    assert!(script.contains("__threenativeOverlaySend"));
    assert!(!script.contains("console.info(`TN_OVERLAY_CEF_IPC:"));
    assert!(script.contains("chess-side-select"));
    assert!(script.contains("__threenativeDispatchOverlaySnapshot"));
    assert!(!script.contains("playerSide: payload.side"));
    assert!(!script.contains("chess:captures"));
}

#[test]
fn should_require_ten_complete_modal_probe_transitions() {
    let script = cef_spike_modal_probe_script();

    assert!(script.contains("transitionCount = 10"));
    assert!(script.contains("settings removal"));
    assert!(script.contains("transitions: transitionCount"));
    assert!(script.contains("completed: false"));
}

#[test]
fn should_generate_a_hundred_transition_memory_probe() {
    let script = cef_modal_probe_script(100);

    assert!(script.contains("transitionCount = 100"));
    assert!(script.contains("transitionCount >= 100"));
}

#[test]
fn should_retry_the_first_failed_snapshot_without_skipping_sequences() {
    use threenative_runtime::overlay::OverlayBridgeEnvelope;

    let snapshots = [1_u64, 2, 3].map(|sequence| OverlayBridgeEnvelope {
        overlay_id: "hud".to_string(),
        message_type: "game:snapshot".to_string(),
        payload: serde_json::json!({ "sequence": sequence }),
        sequence,
        timestamp: 0,
    });
    let mut attempted = Vec::new();
    let cursor = advance_snapshot_delivery(0, &snapshots, |snapshot| {
        attempted.push(snapshot.sequence);
        snapshot.sequence != 2
    });

    assert_eq!(attempted, vec![1, 2]);
    assert_eq!(cursor, 1);
    let mut retried = Vec::new();
    let cursor = advance_snapshot_delivery(cursor, &snapshots, |snapshot| {
        retried.push(snapshot.sequence);
        true
    });
    assert_eq!(retried, vec![2, 3]);
    assert_eq!(cursor, 3);
}

#[test]
fn should_install_live_pointer_region_reporting_in_the_cef_bridge() {
    let script = cef_spike_bridge_script("hud").unwrap();

    assert!(script.contains("data-threenative-interactive"));
    assert!(script.contains("overlay:set-input-regions"));
    assert!(script.contains("MutationObserver"));
    assert!(script.contains("ResizeObserver"));
}

#[test]
fn should_translate_keyboard_characters_and_navigation_keys_for_cef() {
    use bevy::input::keyboard::Key;

    assert_eq!(cef_key_values(&Key::Character("b".into())), (66, 98));
    assert_eq!(cef_key_values(&Key::Enter), (13, 0));
    assert_eq!(cef_key_values(&Key::ArrowLeft), (37, 0));
    assert_eq!(cef_key_values(&Key::Escape), (27, 0));
}
