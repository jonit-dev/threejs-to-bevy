use std::{fs, path::Path};

use serde::Serialize;

pub fn write_pretty_json_report(
    output_path: impl AsRef<Path>,
    report: &impl Serialize,
) -> Result<(), Box<dyn std::error::Error>> {
    let output_path = output_path.as_ref();
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        output_path,
        format!("{}\n", serde_json::to_string_pretty(report)?),
    )?;
    Ok(())
}
