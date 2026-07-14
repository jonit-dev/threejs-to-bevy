use std::path::{Path, PathBuf};

use bevy::prelude::Resource;
use threenative_loader::{OverlayIr, OverlaysIr};

use crate::overlay::{
    NativeOverlayBridge, NativeOverlayInputPolicy, OverlayDiagnostic, native_overlay_input_policy,
    report_unsupported_desktop_webview, sorted_overlay_mount_order,
};

pub fn overlay_host_diagnostics(
    overlays: Option<&OverlaysIr>,
    desktop_overlay_enabled: bool,
) -> Vec<OverlayDiagnostic> {
    if desktop_overlay_enabled {
        Vec::new()
    } else {
        report_unsupported_desktop_webview(overlays)
    }
}

pub fn input_capture_policy(input: &str) -> NativeOverlayInputPolicy {
    native_overlay_input_policy(input)
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeOverlayMount {
    pub entry_path: PathBuf,
    pub id: String,
    pub input: NativeOverlayInputPolicy,
    pub layout: Option<threenative_loader::OverlayLayoutIr>,
    pub transparent: bool,
    pub z_index: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeOverlayHostPlan {
    pub backend: &'static str,
    pub mounts: Vec<NativeOverlayMount>,
}

#[derive(Clone, Debug, PartialEq, Resource)]
pub struct NativeOverlayHostPlanResource(pub NativeOverlayHostPlan);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Resource)]
pub struct NativeOverlayInputCapture {
    pub keyboard: bool,
    pub pointer: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeOverlayBackendDescriptor {
    pub cargo_feature: &'static str,
    pub id: &'static str,
    pub package_manifest: &'static str,
}

pub const CEF_OSR_BACKEND: NativeOverlayBackendDescriptor = NativeOverlayBackendDescriptor {
    cargo_feature: "native-overlay-cef",
    id: "cef-osr",
    package_manifest: "cef-runtime-manifest.json",
};

#[derive(Debug, Resource)]
pub struct NativeOverlayBridgeResource {
    pub bridge: NativeOverlayBridge,
    pub overlays: OverlaysIr,
}

impl NativeOverlayBridgeResource {
    pub fn new(overlays: OverlaysIr) -> Self {
        Self {
            bridge: NativeOverlayBridge::new(),
            overlays,
        }
    }
}

pub fn create_native_overlay_host_plan(
    overlays: Option<&OverlaysIr>,
    bundle_path: &Path,
) -> Result<Option<NativeOverlayHostPlan>, Vec<OverlayDiagnostic>> {
    let Some(overlays) = overlays else {
        return Ok(None);
    };
    let desktop_overlays: Vec<&OverlayIr> = sorted_overlay_mount_order(overlays)
        .into_iter()
        .filter(|overlay| {
            overlay
                .target_profiles
                .iter()
                .any(|profile| profile == "desktop")
        })
        .collect();
    if desktop_overlays.is_empty() {
        return Ok(None);
    }
    if !native_webview_backend_available() {
        return Err(report_unsupported_desktop_webview(Some(overlays)));
    }
    Ok(Some(NativeOverlayHostPlan {
        backend: CEF_OSR_BACKEND.id,
        mounts: desktop_overlays
            .into_iter()
            .map(|overlay| NativeOverlayMount {
                entry_path: bundle_path.join(&overlay.entry),
                id: overlay.id.clone(),
                input: native_overlay_input_policy(&overlay.input),
                layout: overlay.layout.clone(),
                transparent: overlay.transparent,
                z_index: overlay.z_index,
            })
            .collect(),
    }))
}

pub const fn native_webview_backend_available() -> bool {
    cfg!(feature = "native-overlay-cef")
}

pub const fn native_webview_backend_name() -> &'static str {
    if cfg!(feature = "native-overlay-cef") {
        CEF_OSR_BACKEND.id
    } else {
        "unsupported"
    }
}

pub fn native_overlay_backend_descriptor() -> Option<&'static NativeOverlayBackendDescriptor> {
    native_webview_backend_available().then_some(&CEF_OSR_BACKEND)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeOverlayBounds {
    pub height: u32,
    pub width: u32,
    pub x: u32,
    pub y: u32,
}

pub fn native_overlay_input_rectangles(
    input: NativeOverlayInputPolicy,
    bounds: NativeOverlayBounds,
    input_regions: Option<&[NativeOverlayBounds]>,
) -> Vec<NativeOverlayBounds> {
    let full_bounds = NativeOverlayBounds {
        height: bounds.height,
        width: bounds.width,
        x: 0,
        y: 0,
    };
    if input.modal {
        return vec![full_bounds];
    }
    if !input.captures_pointer {
        return Vec::new();
    }
    let Some(input_regions) = input_regions else {
        return Vec::new();
    };
    input_regions
        .iter()
        .filter_map(|region| {
            let x = region.x.min(bounds.width);
            let y = region.y.min(bounds.height);
            let width = region.width.min(bounds.width.saturating_sub(x));
            let height = region.height.min(bounds.height.saturating_sub(y));
            (width > 0 && height > 0).then_some(NativeOverlayBounds {
                height,
                width,
                x,
                y,
            })
        })
        .collect()
}

pub fn native_overlay_bounds(
    mount: &NativeOverlayMount,
    parent_width: f32,
    parent_height: f32,
) -> NativeOverlayBounds {
    let parent_width = parent_width.max(1.0).round() as u32;
    let parent_height = parent_height.max(1.0).round() as u32;
    let Some(layout) = mount.layout.as_ref() else {
        return NativeOverlayBounds {
            height: parent_height,
            width: parent_width,
            x: 0,
            y: 0,
        };
    };
    NativeOverlayBounds {
        x: layout.x.max(0.0).round() as u32,
        y: layout.y.max(0.0).round() as u32,
        width: layout.width.max(1.0).round() as u32,
        height: layout.height.max(1.0).round() as u32,
    }
}
