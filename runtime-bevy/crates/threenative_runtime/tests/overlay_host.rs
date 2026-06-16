use std::path::Path;
use threenative_loader::{OverlayBridgeMessagesIr, OverlayIr, OverlaysIr};

use threenative_runtime::overlay_host::{
    create_native_overlay_host_plan, input_capture_policy, native_overlay_bounds,
    native_overlay_file_url, native_webview_backend_available, native_webview_backend_name,
    overlay_host_diagnostics,
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
            messages: OverlayBridgeMessagesIr::default(),
            target_profiles: vec!["desktop".to_owned()],
        }],
    }
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
fn bounds_pointer_overlay_without_covering_bevy_surface() {
    let plan = create_native_overlay_host_plan(Some(&make_overlays()), Path::new("/bundle"))
        .unwrap_or_else(|_| {
            Some(threenative_runtime::overlay_host::NativeOverlayHostPlan {
                backend: "test",
                mounts: vec![threenative_runtime::overlay_host::NativeOverlayMount {
                    entry_path: Path::new("/bundle/overlay/index.html").to_path_buf(),
                    id: "inventory".to_owned(),
                    input: input_capture_policy("pointer"),
                    transparent: true,
                    z_index: 20,
                }],
            })
        })
        .expect("overlay plan");
    let bounds = native_overlay_bounds(&plan.mounts[0], 1280.0, 720.0);

    assert_eq!(bounds.width, 242);
    assert_eq!(bounds.height, 207);
    assert_eq!(bounds.x, 1014);
    assert_eq!(bounds.y, 24);
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
