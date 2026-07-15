use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use threenative_loader::{LoadedBundle, LocalDataIr, WorldEntity, WorldIr};

pub const MAX_PERSISTENCE_RECORD_BYTES: usize = 1024 * 1024;
pub const MAX_PERSISTENCE_SLOTS: usize = 32;
pub const MAX_PERSISTENCE_SETTINGS: usize = 128;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct NativePersistenceRecord {
    pub app_version: String,
    pub components: BTreeMap<String, BTreeMap<String, Value>>,
    pub resources: BTreeMap<String, Value>,
    pub schema: String,
    pub schema_version: u32,
    pub settings: BTreeMap<String, Value>,
    pub slot: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct NativeSettingsRecord {
    schema: String,
    settings: BTreeMap<String, Value>,
    version: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativePersistenceNamespace {
    pub app: String,
    pub target_profile: String,
}

impl NativePersistenceNamespace {
    pub fn new(app: &str, target_profile: &str) -> Result<Self, NativePersistenceStorageError> {
        Ok(Self {
            app: validate_namespace_segment(app)?.to_owned(),
            target_profile: validate_namespace_segment(target_profile)?.to_owned(),
        })
    }

    pub fn from_bundle(bundle: &LoadedBundle) -> Result<Self, NativePersistenceStorageError> {
        let target = if bundle.target_profile.targets.is_empty() {
            "default".to_owned()
        } else {
            bundle.target_profile.targets.join("+")
        };
        Self::new(&bundle.manifest.name, &target)
    }
}

#[derive(Debug, Error)]
pub enum NativePersistenceStorageError {
    #[error("TN_PERSISTENCE_ATOMIC_COMMIT_FAILED: {0}")]
    AtomicCommit(String),
    #[error("TN_PERSISTENCE_RECORD_CORRUPT: {0}")]
    Corrupt(String),
    #[error("TN_PERSISTENCE_RECORD_TOO_LARGE: record is {actual} bytes; maximum is {maximum}")]
    RecordTooLarge { actual: usize, maximum: usize },
    #[error("TN_PERSISTENCE_NAMESPACE_ESCAPE: namespace segment '{0}' is not contained")]
    NamespaceEscape(String),
    #[error("TN_PERSISTENCE_STORAGE_IO_FAILED: {0}")]
    Io(#[from] std::io::Error),
    #[error("TN_PERSISTENCE_RECORD_INVALID: {0}")]
    InvalidRecord(String),
}

pub trait NativePersistenceStorage {
    fn delete(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<bool, NativePersistenceStorageError>;
    fn load(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<Option<Vec<u8>>, NativePersistenceStorageError>;
    fn save(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
        bytes: &[u8],
    ) -> Result<(), NativePersistenceStorageError>;
}

type NativePersistenceRecordKey = (String, String, String);
type NativeMemoryPersistenceRecords = BTreeMap<NativePersistenceRecordKey, Vec<u8>>;

#[derive(Clone, Debug, Default)]
pub struct NativeMemoryPersistenceStorage {
    records: Arc<Mutex<NativeMemoryPersistenceRecords>>,
}

impl NativePersistenceStorage for NativeMemoryPersistenceStorage {
    fn delete(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<bool, NativePersistenceStorageError> {
        validate_namespace_segment(slot)?;
        Ok(self
            .records
            .lock()
            .expect("memory persistence mutex poisoned")
            .remove(&(
                namespace.app.clone(),
                namespace.target_profile.clone(),
                slot.to_owned(),
            ))
            .is_some())
    }

    fn load(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<Option<Vec<u8>>, NativePersistenceStorageError> {
        validate_namespace_segment(slot)?;
        Ok(self
            .records
            .lock()
            .expect("memory persistence mutex poisoned")
            .get(&(
                namespace.app.clone(),
                namespace.target_profile.clone(),
                slot.to_owned(),
            ))
            .cloned())
    }

    fn save(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
        bytes: &[u8],
    ) -> Result<(), NativePersistenceStorageError> {
        validate_namespace_segment(slot)?;
        ensure_bounded(bytes)?;
        self.records
            .lock()
            .expect("memory persistence mutex poisoned")
            .insert(
                (
                    namespace.app.clone(),
                    namespace.target_profile.clone(),
                    slot.to_owned(),
                ),
                bytes.to_vec(),
            );
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct NativeFilePersistenceStorage {
    root: PathBuf,
    fail_before_rename: bool,
}

impl NativeFilePersistenceStorage {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            fail_before_rename: false,
        }
    }

    pub fn with_failed_commit(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            fail_before_rename: true,
        }
    }

    pub fn default_root() -> PathBuf {
        if let Some(root) = std::env::var_os("THREENATIVE_PERSISTENCE_ROOT") {
            return PathBuf::from(root);
        }
        if let Some(root) = std::env::var_os("XDG_DATA_HOME") {
            return PathBuf::from(root).join("threenative").join("persistence");
        }
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(".local/share/threenative/persistence");
        }
        std::env::temp_dir().join("threenative/persistence")
    }

    fn path(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<PathBuf, NativePersistenceStorageError> {
        validate_namespace_segment(slot)?;
        let path = self
            .root
            .join(&namespace.app)
            .join(&namespace.target_profile)
            .join(format!("{slot}.json"));
        if path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(NativePersistenceStorageError::NamespaceEscape(
                slot.to_owned(),
            ));
        }
        Ok(path)
    }
}

impl NativePersistenceStorage for NativeFilePersistenceStorage {
    fn delete(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<bool, NativePersistenceStorageError> {
        let path = self.path(namespace, slot)?;
        match fs::remove_file(path) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.into()),
        }
    }

    fn load(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
    ) -> Result<Option<Vec<u8>>, NativePersistenceStorageError> {
        let path = self.path(namespace, slot)?;
        let file = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let mut bytes = Vec::new();
        file.take((MAX_PERSISTENCE_RECORD_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        ensure_bounded(&bytes)?;
        Ok(Some(bytes))
    }

    fn save(
        &self,
        namespace: &NativePersistenceNamespace,
        slot: &str,
        bytes: &[u8],
    ) -> Result<(), NativePersistenceStorageError> {
        ensure_bounded(bytes)?;
        let path = self.path(namespace, slot)?;
        let parent = path.parent().expect("persistence slot has a parent");
        fs::create_dir_all(parent)?;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let stage = parent.join(format!(".{slot}.{nonce}.stage"));
        let write_result = (|| {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&stage)?;
            file.write_all(bytes)?;
            file.sync_all()?;
            if self.fail_before_rename {
                return Err(NativePersistenceStorageError::AtomicCommit(
                    "injected failure before rename".to_owned(),
                ));
            }
            fs::rename(&stage, &path)?;
            File::open(parent)?.sync_all()?;
            Ok(())
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&stage);
        }
        write_result
    }
}

pub fn record_from_world(
    local_data: &LocalDataIr,
    world: &WorldIr,
    slot: &str,
    settings: BTreeMap<String, Value>,
) -> Result<NativePersistenceRecord, NativePersistenceStorageError> {
    let slot_spec = local_data
        .save_slots
        .iter()
        .find(|candidate| candidate.id == slot)
        .ok_or_else(|| {
            NativePersistenceStorageError::InvalidRecord(format!("slot '{slot}' is not declared"))
        })?;
    let resource_ids = local_data
        .resources
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let component_ids = local_data
        .components
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let resources = world
        .resources
        .iter()
        .filter(|(id, _)| resource_ids.contains(id.as_str()))
        .map(|(id, value)| (id.clone(), value.clone()))
        .collect();
    let components = world
        .entities
        .iter()
        .filter_map(|entity| {
            let values = entity
                .components
                .values()
                .into_iter()
                .filter(|(id, _)| component_ids.contains(id.as_str()))
                .collect::<BTreeMap<_, _>>();
            (!values.is_empty()).then_some((entity.id.clone(), values))
        })
        .collect();
    let record = NativePersistenceRecord {
        app_version: slot_spec.app_version.clone(),
        components,
        resources,
        schema: "threenative.persistence-record".to_owned(),
        schema_version: slot_spec.schema_version,
        settings,
        slot: slot.to_owned(),
        version: "0.1.0".to_owned(),
    };
    validate_record(local_data, &record)?;
    Ok(record)
}

pub fn validate_record(
    local_data: &LocalDataIr,
    record: &NativePersistenceRecord,
) -> Result<(), NativePersistenceStorageError> {
    if local_data.save_slots.len() > MAX_PERSISTENCE_SLOTS {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "declared save slot count exceeds {MAX_PERSISTENCE_SLOTS}"
        )));
    }
    if record.schema != "threenative.persistence-record" || record.version != "0.1.0" {
        return Err(NativePersistenceStorageError::InvalidRecord(
            "unsupported persistence envelope schema/version".to_owned(),
        ));
    }
    let slot = local_data
        .save_slots
        .iter()
        .find(|slot| slot.id == record.slot)
        .ok_or_else(|| {
            NativePersistenceStorageError::InvalidRecord(format!(
                "slot '{}' is not declared",
                record.slot
            ))
        })?;
    if record.app_version != slot.app_version {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "app version '{}' does not match declared '{}'",
            record.app_version, slot.app_version
        )));
    }
    if record.schema_version > slot.schema_version {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "schema version {} is newer than declared {}",
            record.schema_version, slot.schema_version
        )));
    }
    let resources = local_data
        .resources
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if let Some(id) = record
        .resources
        .keys()
        .find(|id| !resources.contains(id.as_str()))
    {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "resource '{id}' is not declared for persistence"
        )));
    }
    let components = local_data
        .components
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if let Some(id) = record
        .components
        .values()
        .flat_map(|values| values.keys())
        .find(|id| !components.contains(id.as_str()))
    {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "component '{id}' is not declared for persistence"
        )));
    }
    let settings = local_data
        .settings
        .iter()
        .map(|entry| entry.key.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if record.settings.len() > MAX_PERSISTENCE_SETTINGS {
        return Err(NativePersistenceStorageError::InvalidRecord(
            "settings count exceeds the adapter limit".to_owned(),
        ));
    }
    if let Some(key) = record
        .settings
        .keys()
        .find(|key| !settings.contains(key.as_str()))
    {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "setting '{key}' is not declared"
        )));
    }
    for (key, value) in &record.settings {
        let spec = local_data
            .settings
            .iter()
            .find(|setting| setting.key == *key)
            .expect("setting key was checked");
        validate_setting_value(spec, value)?;
    }
    Ok(())
}

pub fn decode_record(
    local_data: &LocalDataIr,
    bytes: &[u8],
) -> Result<NativePersistenceRecord, NativePersistenceStorageError> {
    ensure_bounded(bytes)?;
    let record = decode_record_envelope(bytes)?;
    validate_record(local_data, &record)?;
    Ok(record)
}

pub fn decode_record_envelope(
    bytes: &[u8],
) -> Result<NativePersistenceRecord, NativePersistenceStorageError> {
    ensure_bounded(bytes)?;
    serde_json::from_slice(bytes)
        .map_err(|error| NativePersistenceStorageError::Corrupt(error.to_string()))
}

pub fn apply_record_to_world(
    local_data: &LocalDataIr,
    record: &NativePersistenceRecord,
    world: &mut WorldIr,
) -> Result<(), NativePersistenceStorageError> {
    validate_record(local_data, record)?;
    let mut resources = world.resources.clone();
    resources.extend(record.resources.clone());
    let mut entities = world.entities.clone();
    for entity in &mut entities {
        if let Some(components) = record.components.get(&entity.id) {
            apply_saved_components(entity, components)?;
        }
    }
    world.resources = resources;
    world.entities = entities;
    Ok(())
}

fn apply_saved_components(
    entity: &mut WorldEntity,
    components: &BTreeMap<String, Value>,
) -> Result<(), NativePersistenceStorageError> {
    for (name, value) in components {
        let object = value.as_object().ok_or_else(|| {
            NativePersistenceStorageError::InvalidRecord(format!(
                "component '{name}' on entity '{}' is not an object",
                entity.id
            ))
        })?;
        if entity.components.storage(name) == Some("custom") {
            entity.components.extra.insert(name.clone(), value.clone());
        } else {
            entity.components.patch(name, object).map_err(|error| {
                NativePersistenceStorageError::InvalidRecord(format!(
                    "component '{name}' on entity '{}' cannot be restored: {error}",
                    entity.id
                ))
            })?;
        }
    }
    Ok(())
}

pub fn save_settings(
    storage: &impl NativePersistenceStorage,
    namespace: &NativePersistenceNamespace,
    local_data: &LocalDataIr,
    settings: BTreeMap<String, Value>,
) -> Result<(), NativePersistenceStorageError> {
    let allowed = local_data
        .settings
        .iter()
        .map(|setting| setting.key.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if let Some(key) = settings.keys().find(|key| !allowed.contains(key.as_str())) {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "setting '{key}' is not declared"
        )));
    }
    for (key, value) in &settings {
        let spec = local_data
            .settings
            .iter()
            .find(|setting| setting.key == *key)
            .expect("setting key was checked");
        validate_setting_value(spec, value)?;
    }
    let bytes = serde_json::to_vec_pretty(&NativeSettingsRecord {
        schema: "threenative.persistence-settings".to_owned(),
        settings,
        version: "0.1.0".to_owned(),
    })
    .map_err(|error| NativePersistenceStorageError::InvalidRecord(error.to_string()))?;
    storage.save(namespace, "settings", &bytes)
}

pub fn load_settings(
    storage: &impl NativePersistenceStorage,
    namespace: &NativePersistenceNamespace,
    local_data: &LocalDataIr,
) -> Result<BTreeMap<String, Value>, NativePersistenceStorageError> {
    let defaults = || {
        local_data
            .settings
            .iter()
            .map(|setting| (setting.key.clone(), setting.default_value.clone()))
            .collect::<BTreeMap<_, _>>()
    };
    let Some(bytes) = storage.load(namespace, "settings")? else {
        return Ok(defaults());
    };
    let record: NativeSettingsRecord = serde_json::from_slice(&bytes)
        .map_err(|error| NativePersistenceStorageError::Corrupt(error.to_string()))?;
    if record.schema != "threenative.persistence-settings" || record.version != "0.1.0" {
        return Err(NativePersistenceStorageError::InvalidRecord(
            "unsupported settings envelope schema/version".to_owned(),
        ));
    }
    let mut settings = defaults();
    let allowed = local_data
        .settings
        .iter()
        .map(|setting| setting.key.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if let Some(key) = record
        .settings
        .keys()
        .find(|key| !allowed.contains(key.as_str()))
    {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "setting '{key}' is not declared"
        )));
    }
    for (key, value) in record.settings {
        let spec = local_data
            .settings
            .iter()
            .find(|setting| setting.key == key)
            .expect("setting key was checked");
        validate_setting_value(spec, &value)?;
        settings.insert(key, value);
    }
    Ok(settings)
}

fn ensure_bounded(bytes: &[u8]) -> Result<(), NativePersistenceStorageError> {
    if bytes.len() > MAX_PERSISTENCE_RECORD_BYTES {
        return Err(NativePersistenceStorageError::RecordTooLarge {
            actual: bytes.len(),
            maximum: MAX_PERSISTENCE_RECORD_BYTES,
        });
    }
    Ok(())
}

fn validate_namespace_segment(value: &str) -> Result<&str, NativePersistenceStorageError> {
    let valid = !value.is_empty()
        && value != "."
        && value != ".."
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'+'));
    if valid {
        Ok(value)
    } else {
        Err(NativePersistenceStorageError::NamespaceEscape(
            value.to_owned(),
        ))
    }
}

fn validate_setting_value(
    setting: &threenative_loader::LocalDataSettingIr,
    value: &Value,
) -> Result<(), NativePersistenceStorageError> {
    let kind_valid = match setting.kind.as_str() {
        "boolean" => value.is_boolean(),
        "number" => value.as_f64().is_some_and(f64::is_finite),
        "string" | "enum" => value.is_string(),
        _ => false,
    };
    if !kind_valid {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "setting '{}' does not match kind '{}'",
            setting.key, setting.kind
        )));
    }
    if let Some(number) = value.as_f64()
        && (setting.min.is_some_and(|minimum| number < minimum)
            || setting.max.is_some_and(|maximum| number > maximum))
    {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "setting '{}' is outside its declared range",
            setting.key
        )));
    }
    if !setting.enum_values.is_empty()
        && !value.as_str().is_some_and(|value| {
            setting
                .enum_values
                .iter()
                .any(|candidate| candidate == value)
        })
    {
        return Err(NativePersistenceStorageError::InvalidRecord(format!(
            "setting '{}' is outside its declared enum",
            setting.key
        )));
    }
    Ok(())
}

pub fn storage_file_path(
    root: &Path,
    namespace: &NativePersistenceNamespace,
    slot: &str,
) -> PathBuf {
    root.join(&namespace.app)
        .join(&namespace.target_profile)
        .join(format!("{slot}.json"))
}
