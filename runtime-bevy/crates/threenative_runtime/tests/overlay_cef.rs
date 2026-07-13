use threenative_runtime::overlay_cef::{
    CEF_DESKTOP_BLINK_SETTINGS, CefPaintFrame, CefPaintQueue, CefSpikeFrameProbe,
    CefSpikeFrameProbeConfig, apply_paint_to_image, build_cef_spike_frame_report,
    cef_spike_bridge_script, cef_spike_frame_stats, compare_cef_spike_frame_stats,
    dispatch_cef_subprocess_with, hide_native_ui_fallback_for_cef,
    normalize_bgra_premultiplied_to_rgba, receive_cef_spike_game_message,
};

#[test]
fn should_advertise_desktop_pointer_capabilities_for_css_hover() {
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("primaryHoverType=2"));
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("availableHoverTypes=2"));
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("primaryPointerType=4"));
    assert!(CEF_DESKTOP_BLINK_SETTINGS.contains("availablePointerTypes=4"));
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

    assert!(script.contains("TN_OVERLAY_CEF_IPC:"));
    assert!(script.contains("chess-side-select"));
    assert!(script.contains("__threenativeDispatchOverlaySnapshot"));
    assert!(!script.contains("playerSide: payload.side"));
    assert!(!script.contains("chess:captures"));
}
