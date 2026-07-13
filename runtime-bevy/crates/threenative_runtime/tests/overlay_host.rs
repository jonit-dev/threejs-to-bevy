use std::path::Path;
use threenative_loader::{OverlayBridgeMessagesIr, OverlayIr, OverlayLayoutIr, OverlaysIr};

#[cfg(feature = "native-webview")]
use threenative_runtime::overlay_host::{
    NativeWebviewAttachment, native_overlay_initialization_script, native_webview_attachment,
};
use threenative_runtime::overlay_host::{
    create_native_overlay_host_plan, input_capture_policy, native_overlay_bounds,
    native_overlay_file_url, native_overlay_input_rectangles, native_overlay_snapshot_script,
    native_webview_backend_available, native_webview_backend_name, overlay_host_diagnostics,
};
#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
use threenative_runtime::overlay_host::{
    native_overlay_host_clear_color, native_overlay_screen_position,
};

#[test]
fn reports_unsupported_desktop_overlay_webview_capability() {
    let overlays = make_overlays();
    let diagnostics = overlay_host_diagnostics(Some(&overlays), false);

    assert_eq!(diagnostics[0].code, "TN_OVERLAY_TARGET_UNSUPPORTED");
}

fn make_overlays() -> OverlaysIr {
    OverlaysIr {
        schema: "threenative.overlays".to_owned(),
        version: "0.1.0".to_owned(),
        overlays: vec![OverlayIr {
            id: "inventory".to_owned(),
            entry: "overlay/index.html".to_owned(),
            transparent: true,
            z_index: 20,
            input: "pointer".to_owned(),
            layout: None,
            messages: OverlayBridgeMessagesIr::default(),
            target_profiles: vec!["desktop".to_owned()],
        }],
    }
}

#[test]
fn native_host_ignores_web_only_overlays() {
    let mut overlays = make_overlays();
    overlays.overlays[0].target_profiles = vec!["web".to_owned()];

    assert_eq!(
        create_native_overlay_host_plan(Some(&overlays), Path::new("/bundle")),
        Ok(None)
    );
}

#[test]
fn maps_overlay_input_capture_modes() {
    assert!(!input_capture_policy("none").captures_pointer);
    assert!(!input_capture_policy("keyboard").captures_pointer);
    assert!(input_capture_policy("pointer").captures_pointer);
    assert!(input_capture_policy("pointer-and-keyboard").captures_keyboard);
    assert!(input_capture_policy("modal").modal);
}

#[test]
fn limits_pointer_capture_to_reported_interactive_regions() {
    let bounds = threenative_runtime::overlay_host::NativeOverlayBounds {
        height: 720,
        width: 1280,
        x: 0,
        y: 0,
    };
    let reported = [
        threenative_runtime::overlay_host::NativeOverlayBounds {
            height: 62,
            width: 184,
            x: 1072,
            y: 552,
        },
        threenative_runtime::overlay_host::NativeOverlayBounds {
            height: 80,
            width: 300,
            x: 1200,
            y: 700,
        },
    ];

    assert_eq!(
        native_overlay_input_rectangles(input_capture_policy("pointer"), bounds, Some(&reported)),
        vec![
            reported[0],
            threenative_runtime::overlay_host::NativeOverlayBounds {
                height: 20,
                width: 80,
                x: 1200,
                y: 700,
            },
        ]
    );
    assert!(
        native_overlay_input_rectangles(input_capture_policy("pointer"), bounds, Some(&[]))
            .is_empty()
    );
    assert!(
        native_overlay_input_rectangles(input_capture_policy("pointer"), bounds, None).is_empty()
    );
    assert_eq!(
        native_overlay_input_rectangles(input_capture_policy("modal"), bounds, Some(&reported)),
        vec![bounds]
    );
    assert!(
        native_overlay_input_rectangles(input_capture_policy("none"), bounds, Some(&reported))
            .is_empty()
    );
}

#[test]
fn builds_safe_snapshot_delivery_script_for_native_webview() {
    let script = native_overlay_snapshot_script(
        "chess:captures",
        &serde_json::json!({ "white": "</script>" }),
        42,
    );

    assert!(script.contains("__threenativeDispatchOverlaySnapshot"));
    assert!(script.contains("\"chess:captures\""));
    assert!(script.ends_with(", 42);"));
}

#[cfg(feature = "native-webview")]
#[test]
fn native_overlay_bridge_replays_snapshots_without_injecting_example_layout_css() {
    let script = native_overlay_initialization_script("chess-side-select");

    assert!(script.contains("for (const snapshot of this._snapshots.values())"));
    assert!(script.contains("listener(snapshot.type, snapshot.payload"));
    assert!(script.contains("[data-threenative-interactive]"));
    assert!(script.contains("overlay:set-input-regions"));
    assert!(!script.contains("reallocateSurface"));
    assert!(!script.contains("forceFullRepaint"));
    assert!(!script.contains("242px"));
    assert!(!script.contains(".inventory"));
}

#[test]
fn bounds_unpositioned_overlay_to_the_full_bevy_surface() {
    let plan = create_native_overlay_host_plan(Some(&make_overlays()), Path::new("/bundle"))
        .unwrap_or_else(|_| {
            Some(threenative_runtime::overlay_host::NativeOverlayHostPlan {
                backend: "test",
                mounts: vec![threenative_runtime::overlay_host::NativeOverlayMount {
                    entry_path: Path::new("/bundle/overlay/index.html").to_path_buf(),
                    id: "inventory".to_owned(),
                    input: input_capture_policy("pointer"),
                    layout: None,
                    transparent: true,
                    z_index: 20,
                }],
            })
        })
        .expect("overlay plan");
    let bounds = native_overlay_bounds(&plan.mounts[0], 1280.0, 720.0);

    assert_eq!(
        (bounds.x, bounds.y, bounds.width, bounds.height),
        (0, 0, 1280, 720)
    );
    let resized = native_overlay_bounds(&plan.mounts[0], 1000.0, 640.0);
    assert_eq!(
        (resized.x, resized.y, resized.width, resized.height),
        (0, 0, 1000, 640)
    );
}

#[test]
fn uses_authored_native_overlay_layout_rectangle() {
    let mount = threenative_runtime::overlay_host::NativeOverlayMount {
        entry_path: Path::new("/bundle/overlay/index.html").to_path_buf(),
        id: "inventory".to_owned(),
        input: input_capture_policy("pointer"),
        layout: Some(OverlayLayoutIr {
            height: 180.0,
            width: 320.0,
            x: 12.0,
            y: 16.0,
        }),
        transparent: true,
        z_index: 20,
    };
    let bounds = native_overlay_bounds(&mount, 1280.0, 720.0);
    assert_eq!(
        (bounds.x, bounds.y, bounds.width, bounds.height),
        (12, 16, 320, 180)
    );
}

#[cfg(not(feature = "native-webview"))]
#[test]
fn native_overlay_host_default_build_reports_unsupported() {
    let overlays = make_overlays();
    let result = create_native_overlay_host_plan(Some(&overlays), Path::new("/bundle"));

    assert!(result.is_err());
    assert!(!native_webview_backend_available());
    assert_eq!(native_webview_backend_name(), "unsupported");
    assert_eq!(
        result.err().unwrap()[0].code,
        "TN_OVERLAY_TARGET_UNSUPPORTED"
    );
}

#[cfg(feature = "native-webview")]
#[test]
fn native_overlay_host_feature_prepares_wry_mounts() {
    let overlays = make_overlays();
    let result = create_native_overlay_host_plan(Some(&overlays), Path::new("/bundle"))
        .expect("host supported");
    let plan = result.expect("desktop overlay plan");

    assert!(native_webview_backend_available());
    assert_eq!(native_webview_backend_name(), "wry");
    assert_eq!(plan.backend, "wry");
    assert_eq!(
        plan.mounts[0].entry_path,
        Path::new("/bundle/overlay/index.html")
    );
    let _builder = threenative_runtime::overlay_host::create_wry_webview_builder(&plan.mounts[0]);
}

#[test]
fn native_overlay_host_uses_bundle_local_file_urls() {
    assert_eq!(
        native_overlay_file_url(Path::new("/bundle/overlay/dist/index.html")),
        "file:///bundle/overlay/dist/index.html"
    );
}

#[cfg(all(
    feature = "native-webview",
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )
))]
#[test]
fn native_overlay_webview_uses_a_synchronized_transparent_host_window() {
    assert_eq!(
        native_webview_attachment(),
        NativeWebviewAttachment::SynchronizedOverlayWindow
    );
    assert_eq!(native_overlay_screen_position(120, 80, 14, 22), (134, 102));
    assert_eq!(
        native_overlay_host_clear_color(true),
        Some([0.0, 0.0, 0.0, 0.0])
    );
    assert_eq!(native_overlay_host_clear_color(false), None);
}
