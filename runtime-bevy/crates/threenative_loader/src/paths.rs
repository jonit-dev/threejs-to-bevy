use std::path::{Path, PathBuf};

use crate::LoadError;

pub(crate) fn resolve_bundle_file(bundle_path: &Path, file: &str) -> Result<PathBuf, LoadError> {
    validate_bundle_relative_path(file)?;
    Ok(bundle_path.join(file))
}

fn validate_bundle_relative_path(file: &str) -> Result<(), LoadError> {
    if file.is_empty() {
        return invalid_bundle_path(file, "path must be non-empty");
    }
    if file.starts_with('/') || file.starts_with('\\') {
        return invalid_bundle_path(file, "path must be relative");
    }
    if file.contains('\\') {
        return invalid_bundle_path(file, "path must use POSIX separators");
    }
    let first_segment = file.split('/').next().unwrap_or_default();
    if first_segment.contains(':') {
        return invalid_bundle_path(file, "path must not include a URL scheme or drive prefix");
    }
    if file
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return invalid_bundle_path(
            file,
            "path must not contain empty, current, or parent segments",
        );
    }
    Ok(())
}

fn invalid_bundle_path(file: &str, message: &str) -> Result<(), LoadError> {
    Err(LoadError::InvalidBundlePath {
        path: file.to_owned(),
        message: message.to_owned(),
    })
}
