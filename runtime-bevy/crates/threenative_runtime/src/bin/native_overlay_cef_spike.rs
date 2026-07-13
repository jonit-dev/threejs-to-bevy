use std::{env, path::PathBuf, process::ExitCode, time::Instant};

use threenative_runtime::{
    RuntimeOptions, app_from_bundle_with_options,
    overlay_cef::{
        CefOsrRuntime, CefSpikeFrameProbeConfig, dispatch_cef_subprocess,
        install_cef_spike_frame_probe, install_cef_spike_surface, overlay_entry_url,
    },
};

fn main() -> ExitCode {
    let process_started_at = Instant::now();
    if let Some(code) = dispatch_cef_subprocess() {
        return ExitCode::from(code as u8);
    }
    let Some(bundle_path) = env::args().nth(1) else {
        eprintln!("Usage: native_overlay_cef_spike <bundle-path>");
        return ExitCode::from(2);
    };
    let mode = env::var("TN_OVERLAY_CEF_SPIKE_MODE").unwrap_or_else(|_| "overlay".to_string());
    let mut app = match app_from_bundle_with_options(&bundle_path, RuntimeOptions::default()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    if let Some(config) = frame_probe_config(&mode)
        && let Err(error) = install_cef_spike_frame_probe(&mut app, config)
    {
        eprintln!("{error}");
        return ExitCode::from(1);
    }
    if mode == "overlay" {
        let loaded_bundle = match threenative_loader::load_bundle(&bundle_path) {
            Ok(bundle) => bundle,
            Err(error) => {
                eprintln!("TN_OVERLAY_CEF_RESOURCE_REJECTED: {error}");
                return ExitCode::from(1);
            }
        };
        let Some(overlays) = loaded_bundle.overlays else {
            eprintln!("TN_OVERLAY_CEF_RESOURCE_REJECTED: bundle declares no overlays");
            return ExitCode::from(1);
        };
        let Some(overlay_id) = overlays.overlays.first().map(|overlay| overlay.id.clone()) else {
            eprintln!("TN_OVERLAY_CEF_RESOURCE_REJECTED: bundle declares no overlay entry");
            return ExitCode::from(1);
        };
        let (_, url) = match overlay_entry_url(bundle_path.as_ref()) {
            Ok(entry) => entry,
            Err(error) => {
                eprintln!("{error}");
                return ExitCode::from(1);
            }
        };
        let cache_path = env::temp_dir().join("threenative-native-overlay-cef-spike");
        let runtime = match CefOsrRuntime::initialize(
            &url,
            1280,
            720,
            &cache_path,
            process_started_at,
            overlay_id,
        ) {
            Ok(runtime) => runtime,
            Err(error) => {
                eprintln!("{error}");
                return ExitCode::from(1);
            }
        };
        install_cef_spike_surface(&mut app, runtime, overlays, 1280, 720);
    } else if mode != "baseline" {
        eprintln!("TN_OVERLAY_CEF_FRAME_BASELINE_INVALID: unsupported probe mode {mode:?}");
        return ExitCode::from(1);
    }
    match app.run() {
        bevy::app::AppExit::Success => ExitCode::SUCCESS,
        bevy::app::AppExit::Error(code) => ExitCode::from(code.get()),
    }
}

fn frame_probe_config(mode: &str) -> Option<CefSpikeFrameProbeConfig> {
    let report_path = env::var_os("TN_OVERLAY_CEF_SPIKE_FRAME_REPORT").map(PathBuf::from)?;
    Some(CefSpikeFrameProbeConfig {
        baseline_report_path: env::var_os("TN_OVERLAY_CEF_SPIKE_BASELINE_REPORT")
            .map(PathBuf::from),
        mode: mode.to_string(),
        report_path,
        sample_frames: env_usize("TN_OVERLAY_CEF_SPIKE_FRAME_SAMPLES", 600),
        warmup_frames: env_usize("TN_OVERLAY_CEF_SPIKE_FRAME_WARMUP", 120),
    })
}

fn env_usize(name: &str, fallback: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(fallback)
}
