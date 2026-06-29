use thiserror::Error;

mod bundle;
mod generated_mesh;
mod paths;
mod types;

pub use bundle::load_bundle;
pub use types::*;

#[derive(Debug, Error)]
pub enum LoadError {
    #[error("failed to read {path}: {source}")]
    Read {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse {path}: {source}")]
    Parse {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("invalid bundle path '{path}': {message}")]
    InvalidBundlePath { path: String, message: String },
    #[error("invalid generated mesh payload '{path}': {message}")]
    InvalidGeneratedMeshPayload { path: String, message: String },
    #[error("unsupported {schema} version '{version}'")]
    UnsupportedVersion { schema: String, version: String },
}
