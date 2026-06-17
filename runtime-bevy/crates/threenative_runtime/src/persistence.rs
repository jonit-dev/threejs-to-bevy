use threenative_loader::LocalDataIr;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativePersistenceDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: String,
}

pub fn diagnose_native_persistence_migration(
    local_data: &LocalDataIr,
    save_schema_version: u32,
) -> Vec<NativePersistenceDiagnostic> {
    let current_version = local_data
        .migration
        .as_ref()
        .map(|migration| migration.current_version)
        .or_else(|| local_data.save_slots.iter().map(|slot| slot.schema_version).max())
        .unwrap_or(1);

    if save_schema_version > current_version {
        return vec![NativePersistenceDiagnostic {
            code: "TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE",
            message: format!(
                "Save schema version {save_schema_version} is newer than local data version {current_version}."
            ),
            path: "local-data.ir.json/migration/currentVersion".to_owned(),
        }];
    }

    if save_schema_version == current_version {
        return Vec::new();
    }

    let migrators = local_data
        .migration
        .as_ref()
        .map(|migration| migration.migrators.as_slice())
        .unwrap_or(&[]);
    let mut diagnostics = Vec::new();
    for version in save_schema_version..current_version {
        if !migrators.contains(&version) {
            diagnostics.push(NativePersistenceDiagnostic {
                code: "TN_PERSISTENCE_MIGRATOR_MISSING",
                message: format!("Save schema version {version} cannot migrate to {}.", version + 1),
                path: "local-data.ir.json/migration/migrators".to_owned(),
            });
        }
    }
    diagnostics
}
