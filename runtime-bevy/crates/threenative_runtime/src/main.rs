use std::{env, process::ExitCode};

use bevy::prelude::*;
use threenative_runtime::{
    RuntimeOptions, app_from_bundle_with_options, overlay_host,
    proof_harness::NativeProofHarnessOptions,
};

fn main() -> ExitCode {
    #[cfg(feature = "native-overlay-cef")]
    if let Some(code) = threenative_runtime::overlay_cef::dispatch_cef_subprocess() {
        return ExitCode::from(code as u8);
    }
    let mut args = env::args().skip(1);
    if args.next().as_deref() == Some("--capabilities") {
        let mut cargo_features = overlay_host::native_overlay_backend_descriptor()
            .map(|descriptor| vec![descriptor.cargo_feature])
            .unwrap_or_default();
        #[cfg(feature = "native-performance-trace")]
        cargo_features.push("native-performance-trace");
        println!(
            "{}",
            serde_json::json!({
                "schema": "threenative.runtime-capabilities",
                "version": "0.1.0",
                "cargoFeatures": cargo_features,
                "nativeWebview": {
                    "available": overlay_host::native_webview_backend_available(),
                    "backend": overlay_host::native_webview_backend_name(),
                },
            })
        );
        return ExitCode::SUCCESS;
    }
    let Some(invocation) = RuntimeInvocation::parse(env::args().skip(1)) else {
        eprintln!(
            "Usage: threenative_runtime --capabilities | <bundle-path> [--headless] [--exit-after-seconds <seconds>] [--proof-harness <commands.json> --readiness-out <readiness.json> [--audit-writes]]"
        );
        return ExitCode::from(2);
    };

    if invocation.headless {
        eprintln!(
            r#"{{"code":"TN_PLAYTEST_NATIVE_HEADLESS_UNSUPPORTED","gate":"waived-headless","message":"The bundled Bevy runtime does not yet support offscreen headless playtest rendering.","severity":"warning"}}"#
        );
        return ExitCode::SUCCESS;
    }

    match app_from_bundle_with_options(invocation.bundle_path, invocation.options) {
        Ok(mut app) => {
            if let Some(seconds) = invocation.exit_after_seconds {
                app.insert_resource(RuntimeExitAfterSeconds(seconds))
                    .add_systems(Update, exit_runtime_after_profile_duration);
            }
            app.run();
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}

struct RuntimeInvocation {
    bundle_path: String,
    exit_after_seconds: Option<f32>,
    headless: bool,
    options: RuntimeOptions,
}

impl RuntimeInvocation {
    fn parse(args: impl Iterator<Item = String>) -> Option<Self> {
        let mut bundle_path = None;
        let mut proof_harness = None;
        let mut readiness_out = None;
        let mut audit_writes = false;
        let mut exit_after_seconds = None;
        let mut headless = false;
        let mut args = args.peekable();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--proof-harness" => proof_harness = args.next(),
                "--readiness-out" => readiness_out = args.next(),
                "--audit-writes" => audit_writes = true,
                "--exit-after-seconds" => {
                    exit_after_seconds = Some(
                        args.next()?
                            .parse::<f32>()
                            .ok()
                            .filter(|value| *value > 0.0)?,
                    )
                }
                "--headless" => headless = true,
                _ if bundle_path.is_none() => bundle_path = Some(arg),
                _ => return None,
            }
        }
        let proof_harness = match (proof_harness, readiness_out) {
            (Some(command_stream_path), Some(readiness_out_path)) => {
                Some(NativeProofHarnessOptions {
                    audit_writes,
                    command_stream_path,
                    readiness_out_path,
                })
            }
            (None, None) if !audit_writes => None,
            _ => return None,
        };
        Some(Self {
            bundle_path: bundle_path?,
            exit_after_seconds,
            headless,
            options: RuntimeOptions { proof_harness },
        })
    }
}

#[derive(Resource)]
struct RuntimeExitAfterSeconds(f32);

fn exit_runtime_after_profile_duration(
    deadline: Res<RuntimeExitAfterSeconds>,
    time: Res<Time>,
    mut exits: EventWriter<AppExit>,
) {
    if time.elapsed_seconds() >= deadline.0 {
        exits.send(AppExit::Success);
    }
}
