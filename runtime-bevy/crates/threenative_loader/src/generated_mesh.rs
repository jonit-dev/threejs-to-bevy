use std::{fs, path::Path};

use crate::{AssetsManifest, LoadError, MeshAttributeIr, paths};

pub(crate) fn hydrate_generated_mesh_assets(
    assets: &mut AssetsManifest,
    bundle_path: &Path,
) -> Result<(), LoadError> {
    for asset in &mut assets.assets {
        if asset.kind != "mesh" || asset.primitive.as_deref() != Some("custom") {
            continue;
        }
        let Some(binary_attributes) = asset.binary_attributes.as_ref() else {
            continue;
        };
        let mut attributes = Vec::new();
        for attribute in binary_attributes {
            attributes.push(MeshAttributeIr {
                name: attribute.name.clone(),
                item_size: attribute.item_size,
                values: read_f32_payload(
                    bundle_path,
                    &attribute.path,
                    attribute.count * attribute.item_size,
                )?,
            });
        }
        asset.attributes = Some(attributes);
        if let Some(indices) = asset.binary_indices.as_ref() {
            asset.indices = Some(read_index_payload(
                bundle_path,
                &indices.path,
                indices.count,
                indices.format.as_str(),
            )?);
        }
    }
    Ok(())
}

fn read_f32_payload(bundle_path: &Path, file: &str, count: usize) -> Result<Vec<f32>, LoadError> {
    let bytes = read_binary(bundle_path, file)?;
    let expected = count * 4;
    if bytes.len() != expected {
        return Err(LoadError::InvalidGeneratedMeshPayload {
            path: file.to_owned(),
            message: format!(
                "expected {expected} bytes for float payload, found {}",
                bytes.len()
            ),
        });
    }
    let mut values = Vec::with_capacity(count);
    for chunk in bytes.chunks_exact(4).take(count) {
        values.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Ok(values)
}

fn read_index_payload(
    bundle_path: &Path,
    file: &str,
    count: usize,
    format: &str,
) -> Result<Vec<u32>, LoadError> {
    let bytes = read_binary(bundle_path, file)?;
    let mut values = Vec::with_capacity(count);
    let item_size = match format {
        "uint16" => 2,
        "uint32" => 4,
        other => {
            return Err(LoadError::InvalidGeneratedMeshPayload {
                path: file.to_owned(),
                message: format!("unsupported index format '{other}'"),
            });
        }
    };
    let expected = count * item_size;
    if bytes.len() != expected {
        return Err(LoadError::InvalidGeneratedMeshPayload {
            path: file.to_owned(),
            message: format!(
                "expected {expected} bytes for {format} index payload, found {}",
                bytes.len()
            ),
        });
    }
    if format == "uint16" {
        for chunk in bytes.chunks_exact(item_size) {
            values.push(u16::from_le_bytes([chunk[0], chunk[1]]) as u32);
        }
    } else {
        for chunk in bytes.chunks_exact(item_size) {
            values.push(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
        }
    }
    Ok(values)
}

fn read_binary(bundle_path: &Path, file: &str) -> Result<Vec<u8>, LoadError> {
    let path = paths::resolve_bundle_file(bundle_path, file)?;
    fs::read(&path).map_err(|source| LoadError::Read {
        path: path.display().to_string(),
        source,
    })
}
