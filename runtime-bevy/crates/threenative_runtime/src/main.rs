use std::{env, process::ExitCode};

use threenative_runtime::{
    RuntimeOptions, app_from_bundle_with_options, proof_harness::NativeProofHarnessOptions,
};

fn main() -> ExitCode {
    let Some(invocation) = RuntimeInvocation::parse(env::args().skip(1)) else {
        eprintln!(
            "Usage: threenative_runtime <bundle-path> [--proof-harness <commands.json> --readiness-out <readiness.json> [--audit-writes]]"
        );
        return ExitCode::from(2);
    };

    match app_from_bundle_with_options(invocation.bundle_path, invocation.options) {
        Ok(mut app) => {
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
    options: RuntimeOptions,
}

impl RuntimeInvocation {
    fn parse(args: impl Iterator<Item = String>) -> Option<Self> {
        let mut bundle_path = None;
        let mut proof_harness = None;
        let mut readiness_out = None;
        let mut audit_writes = false;
        let mut args = args.peekable();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--proof-harness" => proof_harness = args.next(),
                "--readiness-out" => readiness_out = args.next(),
                "--audit-writes" => audit_writes = true,
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
            options: RuntimeOptions { proof_harness },
        })
    }
}
