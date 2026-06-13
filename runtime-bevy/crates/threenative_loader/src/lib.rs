use std::{collections::HashMap, fs, path::Path};

use serde::Deserialize;
use thiserror::Error;

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
    #[error("unsupported {schema} version '{version}'")]
    UnsupportedVersion { schema: String, version: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleManifest {
    pub schema: String,
    pub version: String,
    pub name: String,
    pub entry: BundleEntry,
    pub files: BundleFiles,
}

#[derive(Debug, Deserialize)]
pub struct BundleEntry {
    pub scripts: Option<String>,
    pub systems: Option<String>,
    pub world: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleFiles {
    pub assets: String,
    pub input: Option<String>,
    pub materials: String,
    pub runtime_config: Option<String>,
    pub target_profile: String,
}

#[derive(Debug)]
pub struct LoadedBundle {
    pub assets: AssetsManifest,
    pub input: Option<InputIr>,
    pub manifest: BundleManifest,
    pub materials: MaterialsIr,
    pub runtime_config: Option<RuntimeConfigIr>,
    pub systems: Option<SystemsIr>,
    pub target_profile: TargetProfile,
    pub world: WorldIr,
}

#[derive(Debug, Deserialize)]
pub struct WorldIr {
    pub schema: String,
    pub version: String,
    pub entities: Vec<WorldEntity>,
    #[serde(default)]
    pub resources: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct WorldEntity {
    pub id: String,
    pub components: EntityComponents,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EntityComponents {
    pub camera: Option<CameraComponent>,
    pub hierarchy: Option<HierarchyComponent>,
    pub light: Option<LightComponent>,
    pub mesh_renderer: Option<MeshRendererComponent>,
    pub transform: Option<TransformComponent>,
    pub visibility: Option<VisibilityComponent>,
}

#[derive(Debug, Deserialize)]
pub struct TransformComponent {
    pub position: Option<[f32; 3]>,
    pub rotation: Option<[f32; 4]>,
    pub scale: Option<[f32; 3]>,
}

#[derive(Debug, Deserialize)]
pub struct MeshRendererComponent {
    pub mesh: String,
    pub material: String,
    pub visible: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CameraComponent {
    pub kind: String,
    #[serde(rename = "fovY")]
    pub fov_y: Option<f32>,
    pub near: f32,
    pub far: f32,
    pub priority: Option<i32>,
    pub size: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct LightComponent {
    pub kind: String,
    pub color: ColorIr,
    pub intensity: f32,
}

#[derive(Debug, Deserialize)]
pub struct HierarchyComponent {
    pub parent: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VisibilityComponent {
    pub visible: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum ColorIr {
    Hex(String),
    Rgb([f32; 3]),
}

#[derive(Debug, Deserialize)]
pub struct MaterialsIr {
    pub schema: String,
    pub version: String,
    pub materials: Vec<MaterialIr>,
}

#[derive(Debug, Deserialize)]
pub struct MaterialIr {
    pub id: String,
    pub kind: String,
    pub color: ColorIr,
    pub metalness: Option<f32>,
    pub roughness: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct AssetsManifest {
    pub schema: String,
    pub version: String,
    pub assets: Vec<AssetIr>,
}

#[derive(Debug, Deserialize)]
pub struct AssetIr {
    pub id: String,
    pub kind: String,
    pub format: String,
    pub primitive: Option<String>,
    pub path: Option<String>,
    pub size: Option<Vec<f32>>,
}

#[derive(Debug, Deserialize)]
pub struct TargetProfile {
    pub schema: String,
    pub version: String,
    pub targets: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SystemsIr {
    pub schema: String,
    pub version: String,
    pub systems: Vec<SystemIr>,
}

#[derive(Debug, Deserialize)]
pub struct SystemIr {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct InputIr {
    pub schema: String,
    pub version: String,
    pub actions: Vec<InputActionIr>,
    pub axes: Vec<InputAxisIr>,
}

#[derive(Debug, Deserialize)]
pub struct InputActionIr {
    pub id: String,
    pub bindings: Vec<InputBindingIr>,
}

#[derive(Debug, Deserialize)]
pub struct InputAxisIr {
    pub id: String,
    #[serde(default)]
    pub negative: Vec<InputBindingIr>,
    #[serde(default)]
    pub positive: Vec<InputBindingIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "device")]
pub enum InputBindingIr {
    #[serde(rename = "keyboard")]
    Keyboard { code: String },
    #[serde(rename = "pointer")]
    Pointer { button: Option<u8>, axis: Option<String> },
    #[serde(rename = "touch")]
    Touch { control: String, axis: Option<String> },
    #[serde(rename = "gamepad")]
    Gamepad { control: String, required: Option<bool> },
}

#[derive(Debug, Deserialize)]
pub struct RuntimeConfigIr {
    pub schema: String,
    pub version: String,
    pub time: RuntimeTimeConfig,
    pub window: RuntimeWindowConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTimeConfig {
    pub fixed_delta: f32,
    pub paused: bool,
}

#[derive(Debug, Deserialize)]
pub struct RuntimeWindowConfig {
    pub width: f32,
    pub height: f32,
    pub title: Option<String>,
}

pub fn load_bundle(bundle_path: impl AsRef<Path>) -> Result<LoadedBundle, LoadError> {
    let bundle_path = bundle_path.as_ref();
    let manifest: BundleManifest = read_json(bundle_path, "manifest.json")?;
    ensure_supported(&manifest.schema, &manifest.version)?;

    let world: WorldIr = read_json(bundle_path, &manifest.entry.world)?;
    ensure_supported(&world.schema, &world.version)?;
    let materials: MaterialsIr = read_json(bundle_path, &manifest.files.materials)?;
    ensure_supported(&materials.schema, &materials.version)?;
    let assets: AssetsManifest = read_json(bundle_path, &manifest.files.assets)?;
    ensure_supported(&assets.schema, &assets.version)?;
    let target_profile: TargetProfile = read_json(bundle_path, &manifest.files.target_profile)?;
    ensure_supported(&target_profile.schema, &target_profile.version)?;
    let input = match manifest.files.input.as_ref() {
        Some(file) => {
            let input: InputIr = read_json(bundle_path, file)?;
            ensure_supported(&input.schema, &input.version)?;
            Some(input)
        }
        None => None,
    };
    let runtime_config = match manifest.files.runtime_config.as_ref() {
        Some(file) => {
            let config: RuntimeConfigIr = read_json(bundle_path, file)?;
            ensure_supported(&config.schema, &config.version)?;
            Some(config)
        }
        None => None,
    };
    let systems = match manifest.entry.systems.as_ref() {
        Some(file) => {
            let systems: SystemsIr = read_json(bundle_path, file)?;
            ensure_supported(&systems.schema, &systems.version)?;
            Some(systems)
        }
        None => None,
    };

    Ok(LoadedBundle {
        assets,
        input,
        manifest,
        materials,
        runtime_config,
        systems,
        target_profile,
        world,
    })
}

fn read_json<T: for<'de> Deserialize<'de>>(bundle_path: &Path, file: &str) -> Result<T, LoadError> {
    let path = bundle_path.join(file);
    let contents = fs::read_to_string(&path).map_err(|source| LoadError::Read {
        path: path.display().to_string(),
        source,
    })?;
    serde_json::from_str(&contents).map_err(|source| LoadError::Parse {
        path: path.display().to_string(),
        source,
    })
}

fn ensure_supported(schema: &str, version: &str) -> Result<(), LoadError> {
    if version.split('.').next() == Some("0") {
        return Ok(());
    }

    Err(LoadError::UnsupportedVersion {
        schema: schema.to_owned(),
        version: version.to_owned(),
    })
}
