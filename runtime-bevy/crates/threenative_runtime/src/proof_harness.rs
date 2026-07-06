use std::{fs, path::Path};

use bevy::{input::ButtonInput, prelude::*};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::input::portable_key_code;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct NativeProofHarnessCommandStream {
    pub schema: String,
    pub version: String,
    #[serde(default)]
    pub commands: Vec<NativeProofHarnessCommand>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct NativeProofHarnessCommand {
    pub tick: u64,
    #[serde(flatten)]
    pub action: NativeProofHarnessAction,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NativeProofHarnessAction {
    Key { code: String, pressed: bool },
    Exit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeProofHarnessOptions {
    pub command_stream_path: String,
    pub readiness_out_path: String,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeProofHarnessState {
    commands: Vec<NativeProofHarnessCommand>,
    readiness_out_path: String,
    tick: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct NativeProofHarnessReadiness {
    pub schema: &'static str,
    pub version: &'static str,
    pub ok: bool,
    pub tick: u64,
    pub diagnostics: Vec<NativeProofHarnessDiagnostic>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct NativeProofHarnessDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Error)]
pub enum NativeProofHarnessError {
    #[error("failed to read native proof harness stream '{path}': {source}")]
    ReadStream {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse native proof harness stream '{path}': {source}")]
    ParseStream {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("native proof harness stream '{path}' has unsupported schema '{schema}'")]
    UnsupportedSchema { path: String, schema: String },
    #[error("failed to write native proof harness readiness '{path}': {source}")]
    WriteReadiness {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to serialize native proof harness readiness '{path}': {source}")]
    SerializeReadiness {
        path: String,
        #[source]
        source: serde_json::Error,
    },
}

impl NativeProofHarnessState {
    pub fn from_stream(
        stream: NativeProofHarnessCommandStream,
        readiness_out_path: impl Into<String>,
    ) -> Self {
        Self {
            commands: stream.commands,
            readiness_out_path: readiness_out_path.into(),
            tick: 0,
        }
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }
}

pub fn install_native_proof_harness(
    app: &mut App,
    options: NativeProofHarnessOptions,
) -> Result<(), NativeProofHarnessError> {
    let stream = load_native_proof_harness_stream(&options.command_stream_path)?;
    app.insert_resource(NativeProofHarnessState::from_stream(
        stream,
        options.readiness_out_path,
    ));
    app.add_systems(
        PreUpdate,
        apply_native_proof_harness_commands.before(crate::input::capture_native_input),
    );
    Ok(())
}

pub fn load_native_proof_harness_stream(
    path: impl AsRef<Path>,
) -> Result<NativeProofHarnessCommandStream, NativeProofHarnessError> {
    let path = path.as_ref();
    let path_label = path.display().to_string();
    let source =
        fs::read_to_string(path).map_err(|source| NativeProofHarnessError::ReadStream {
            path: path_label.clone(),
            source,
        })?;
    let stream: NativeProofHarnessCommandStream =
        serde_json::from_str(&source).map_err(|source| NativeProofHarnessError::ParseStream {
            path: path_label.clone(),
            source,
        })?;
    if stream.schema != "threenative.native-proof-harness" {
        return Err(NativeProofHarnessError::UnsupportedSchema {
            path: path_label,
            schema: stream.schema,
        });
    }
    Ok(stream)
}

pub fn apply_native_proof_harness_commands(
    mut state: ResMut<NativeProofHarnessState>,
    mut keyboard: ResMut<ButtonInput<KeyCode>>,
    mut exit: EventWriter<AppExit>,
) {
    let tick = state.tick;
    let mut diagnostics = Vec::new();
    let commands = state
        .commands
        .iter()
        .filter(|command| command.tick == tick)
        .cloned()
        .collect::<Vec<_>>();
    for command in commands {
        match command.action {
            NativeProofHarnessAction::Key { code, pressed } => {
                if let Some(key_code) = portable_key_code(&code) {
                    if pressed {
                        keyboard.press(key_code);
                    } else {
                        keyboard.release(key_code);
                    }
                } else {
                    diagnostics.push(NativeProofHarnessDiagnostic {
                        code: "TN_NATIVE_PROOF_INPUT_UNSUPPORTED".to_owned(),
                        message: format!("Keyboard code '{code}' is not portable."),
                        severity: "error".to_owned(),
                    });
                }
            }
            NativeProofHarnessAction::Exit => {
                exit.send(AppExit::Success);
            }
        }
    }
    let ok = diagnostics
        .iter()
        .all(|diagnostic| diagnostic.severity != "error");
    let readiness = NativeProofHarnessReadiness {
        schema: "threenative.native-proof-readiness",
        version: "0.1.0",
        ok,
        tick,
        diagnostics,
    };
    if let Err(error) = write_native_proof_harness_readiness(&state.readiness_out_path, &readiness)
    {
        error!("{error}");
    }
    state.tick += 1;
}

pub fn write_native_proof_harness_readiness(
    path: impl AsRef<Path>,
    readiness: &NativeProofHarnessReadiness,
) -> Result<(), NativeProofHarnessError> {
    let path = path.as_ref();
    let path_label = path.display().to_string();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| NativeProofHarnessError::WriteReadiness {
            path: path_label.clone(),
            source,
        })?;
    }
    let json = serde_json::to_string_pretty(readiness).map_err(|source| {
        NativeProofHarnessError::SerializeReadiness {
            path: path_label.clone(),
            source,
        }
    })?;
    fs::write(path, format!("{json}\n")).map_err(|source| NativeProofHarnessError::WriteReadiness {
        path: path_label,
        source,
    })
}
