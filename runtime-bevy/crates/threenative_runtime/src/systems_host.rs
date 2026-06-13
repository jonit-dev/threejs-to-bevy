use thiserror::Error;
use threenative_loader::LoadedBundle;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemsHostDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub severity: &'static str,
    pub system_id: Option<String>,
}

#[derive(Debug, Error)]
#[error("{code}: {message}")]
pub struct SystemsHostError {
    pub code: &'static str,
    pub message: String,
}

pub fn diagnose_native_system_host(bundle: &LoadedBundle) -> Vec<SystemsHostDiagnostic> {
    if bundle.manifest.entry.scripts.is_none() {
        return Vec::new();
    }

    let systems = bundle
        .systems
        .as_ref()
        .map(|systems| systems.systems.as_slice())
        .unwrap_or(&[]);

    if systems.is_empty() {
        return vec![SystemsHostDiagnostic {
            code: "TN_BEVY_SYSTEM_HOST_UNSUPPORTED",
            message: "Native TypeScript system hosting is gated in V2; use web preview or release approval for this bundle.".to_owned(),
            severity: "error",
            system_id: Some("<unknown>".to_owned()),
        }];
    }

    systems
        .iter()
        .map(|system| SystemsHostDiagnostic {
            code: "TN_BEVY_SYSTEM_HOST_UNSUPPORTED",
            message: format!(
                "Native TypeScript system hosting is gated in V2 for system '{}'; use web preview or release approval for this bundle.",
                system.name
            ),
            severity: "error",
            system_id: Some(system.name.clone()),
        })
        .collect()
}

pub fn ensure_native_system_host_supported(bundle: &LoadedBundle) -> Result<(), SystemsHostError> {
    let Some(diagnostic) = diagnose_native_system_host(bundle).into_iter().next() else {
        return Ok(());
    };

    Err(SystemsHostError {
        code: diagnostic.code,
        message: diagnostic.message,
    })
}
