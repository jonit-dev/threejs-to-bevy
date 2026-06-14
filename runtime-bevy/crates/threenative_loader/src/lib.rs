use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
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
    pub audio: Option<String>,
    #[serde(rename = "environmentScene")]
    pub environment_scene: Option<String>,
    pub scripts: Option<String>,
    pub systems: Option<String>,
    pub ui: Option<String>,
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
    pub bundle_path: PathBuf,
    pub assets: AssetsManifest,
    pub audio: Option<AudioIr>,
    pub environment_scene: Option<EnvironmentSceneIr>,
    pub input: Option<InputIr>,
    pub manifest: BundleManifest,
    pub materials: MaterialsIr,
    pub runtime_config: Option<RuntimeConfigIr>,
    pub systems: Option<SystemsIr>,
    pub target_profile: TargetProfile,
    pub ui: Option<UiIr>,
    pub world: WorldIr,
}

#[derive(Debug, Deserialize)]
pub struct WorldIr {
    pub schema: String,
    pub version: String,
    pub entities: Vec<WorldEntity>,
    #[serde(default)]
    pub events: HashMap<String, serde_json::Value>,
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
    pub collider: Option<ColliderComponent>,
    pub hierarchy: Option<HierarchyComponent>,
    pub light: Option<LightComponent>,
    pub mesh_renderer: Option<MeshRendererComponent>,
    pub rigid_body: Option<RigidBodyComponent>,
    pub transform: Option<TransformComponent>,
    pub visibility: Option<VisibilityComponent>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
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
    pub range: Option<f32>,
    pub angle: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct HierarchyComponent {
    pub parent: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RigidBodyComponent {
    pub kind: String,
    pub mass: Option<f32>,
    pub velocity: Option<[f32; 3]>,
}

#[derive(Debug, Deserialize)]
pub struct ColliderComponent {
    pub kind: String,
    pub height: Option<f32>,
    pub layer: Option<String>,
    pub mask: Option<Vec<String>>,
    pub radius: Option<f32>,
    pub size: Option<[f32; 3]>,
    pub trigger: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct VisibilityComponent {
    pub visible: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
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
#[serde(rename_all = "camelCase")]
pub struct MaterialIr {
    pub id: String,
    pub kind: String,
    pub color: ColorIr,
    pub base_color_texture: Option<String>,
    pub emissive_texture: Option<String>,
    pub metalness: Option<f32>,
    pub metallic_roughness_texture: Option<String>,
    pub normal_texture: Option<String>,
    pub occlusion_texture: Option<String>,
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
    pub animations: Option<Vec<AnimationClipIr>>,
    #[serde(rename = "animationGraph")]
    pub animation_graph: Option<AnimationGraphIr>,
    pub bounds: Option<AssetBoundsIr>,
    #[serde(rename = "particleEmitters")]
    pub particle_emitters: Option<Vec<ParticleEmitterIr>>,
    pub primitive: Option<String>,
    pub path: Option<String>,
    pub size: Option<Vec<f32>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationClipIr {
    pub id: String,
    #[serde(rename = "loop")]
    pub loop_: Option<bool>,
    pub source_clip: Option<String>,
    pub speed: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationGraphIr {
    pub initial_state: String,
    pub parameters: Option<Vec<AnimationGraphParameterIr>>,
    pub states: Vec<AnimationGraphStateIr>,
    pub transitions: Option<Vec<AnimationGraphTransitionIr>>,
}

#[derive(Debug, Deserialize)]
pub struct AnimationGraphParameterIr {
    pub id: String,
    pub kind: String,
    pub default: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct AnimationGraphStateIr {
    pub id: String,
    pub clip: String,
    pub events: Option<Vec<AnimationEventIr>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationEventIr {
    pub event: String,
    pub at_seconds: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationGraphTransitionIr {
    pub from: String,
    pub to: String,
    pub blend_seconds: Option<f32>,
    pub when: AnimationTransitionConditionIr,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTransitionConditionIr {
    pub parameter: String,
    pub equals: Option<serde_json::Value>,
    pub greater_than: Option<f32>,
    pub less_than: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleEmitterIr {
    pub id: String,
    pub lifetime_seconds: f32,
    pub max_particles: u32,
    pub radius: Option<f32>,
    pub rate_per_second: f32,
    pub shape: String,
}

#[derive(Debug, Deserialize)]
pub struct AssetBoundsIr {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

#[derive(Debug, Deserialize)]
pub struct TargetProfile {
    pub schema: String,
    pub version: String,
    pub targets: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemsIr {
    #[serde(default)]
    pub lifecycle: Option<SystemsLifecycleIr>,
    pub schema: String,
    pub version: String,
    pub systems: Vec<SystemIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemsLifecycleIr {
    #[serde(default, rename = "appStates")]
    pub app_states: Vec<SystemAppStateIr>,
    #[serde(default, rename = "computedStates")]
    pub computed_states: Vec<SystemComputedStateIr>,
    #[serde(rename = "hotReload")]
    pub hot_reload: String,
    pub replay: String,
    pub state: String,
    #[serde(default)]
    pub substates: Vec<SystemSubstateIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemStateSourceIr {
    pub field: String,
    pub resource: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemAppStateIr {
    pub id: String,
    pub initial: String,
    pub source: SystemStateSourceIr,
    pub values: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemComputedStateIr {
    pub fallback: String,
    pub id: String,
    pub source: SystemStateSourceIr,
    pub values: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemSubstateIr {
    pub fallback: String,
    pub id: String,
    pub parent: String,
    #[serde(rename = "parentValue")]
    pub parent_value: String,
    pub source: SystemStateSourceIr,
    pub values: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemIr {
    pub name: String,
    #[serde(default)]
    pub commands: Vec<SystemCommandIr>,
    #[serde(default, rename = "eventReads")]
    pub event_reads: Vec<String>,
    #[serde(default, rename = "eventWrites")]
    pub event_writes: Vec<String>,
    #[serde(default)]
    pub queries: Vec<SystemQueryIr>,
    #[serde(default)]
    pub reads: Vec<String>,
    #[serde(default, rename = "resourceReads")]
    pub resource_reads: Vec<String>,
    #[serde(default, rename = "resourceWrites")]
    pub resource_writes: Vec<String>,
    #[serde(default)]
    pub schedule: String,
    pub script: Option<SystemScriptIr>,
    #[serde(default)]
    pub services: Vec<String>,
    #[serde(default)]
    pub writes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum SystemCommandIr {
    #[serde(rename = "addComponent")]
    AddComponent { component: String, entity: String },
    #[serde(rename = "despawn")]
    Despawn { entity: String },
    #[serde(rename = "emitEvent")]
    EmitEvent { event: String },
    #[serde(rename = "removeComponent")]
    RemoveComponent { component: String, entity: String },
    #[serde(rename = "setComponent")]
    SetComponent { component: String, entity: String },
    #[serde(rename = "spawn")]
    Spawn {
        components: Vec<String>,
        entity: String,
    },
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemQueryIr {
    #[serde(default)]
    pub with: Vec<String>,
    #[serde(default)]
    pub without: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemScriptIr {
    pub bundle: String,
    #[serde(rename = "exportName")]
    pub export_name: String,
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
    Pointer {
        button: Option<u8>,
        axis: Option<String>,
    },
    #[serde(rename = "touch")]
    Touch {
        control: String,
        axis: Option<String>,
    },
    #[serde(rename = "gamepad")]
    Gamepad {
        control: String,
        required: Option<bool>,
    },
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

#[derive(Debug, Deserialize)]
pub struct UiIr {
    pub schema: String,
    pub version: String,
    #[serde(rename = "focusOrder")]
    pub focus_order: Option<Vec<String>>,
    #[serde(rename = "inputActions")]
    pub input_actions: Option<UiInputActionsIr>,
    #[serde(rename = "safeArea")]
    pub safe_area: Option<UiSafeAreaIr>,
    pub root: UiNodeIr,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiNodeIr {
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub text: Option<String>,
    pub action: Option<String>,
    pub focusable: Option<bool>,
    pub navigation: Option<UiNavigationIr>,
    pub value: Option<f32>,
    pub max: Option<f32>,
    #[serde(default)]
    pub children: Vec<UiNodeIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiNavigationIr {
    pub down: Option<String>,
    pub left: Option<String>,
    pub right: Option<String>,
    pub up: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiInputActionsIr {
    pub activate: Option<String>,
    pub cancel: Option<String>,
    pub next: Option<String>,
    pub previous: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct UiSafeAreaIr {
    pub edges: Option<Vec<String>>,
    pub mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioIr {
    pub schema: String,
    pub version: String,
    #[serde(default)]
    pub buses: Vec<AudioBusIr>,
    #[serde(default)]
    pub emitters: Vec<AudioEmitterIr>,
    #[serde(default)]
    pub listeners: Vec<AudioListenerIr>,
    #[serde(default)]
    pub music: Vec<AudioMusicIr>,
    #[serde(default)]
    pub one_shots: Vec<AudioOneShotIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioBusIr {
    pub id: String,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioListenerIr {
    pub id: String,
    pub position: [f32; 3],
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioEmitterIr {
    pub id: String,
    pub position: [f32; 3],
    pub radius: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioOneShotIr {
    pub id: String,
    pub asset: String,
    pub bus: Option<String>,
    pub emitter: Option<String>,
    pub event: String,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioMusicIr {
    pub id: String,
    pub asset: String,
    pub autoplay: Option<bool>,
    pub bus: Option<String>,
    #[serde(rename = "loop")]
    pub looped: Option<bool>,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSceneIr {
    pub schema: String,
    pub version: String,
    pub atmosphere: Option<AtmosphereProfileIr>,
    pub controller: Option<FirstPersonControllerIr>,
    pub terrain: Option<EnvironmentTerrainIr>,
    pub path: EnvironmentPathIr,
    #[serde(default)]
    pub source_assets: Vec<EnvironmentSourceAssetIr>,
    #[serde(default)]
    pub instances: Vec<EnvironmentInstanceIr>,
    #[serde(default)]
    pub scatter: Vec<EnvironmentScatterSpecIr>,
    #[serde(default)]
    pub bookmarks: Vec<EnvironmentBookmarkIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstPersonControllerIr {
    pub camera: String,
    pub height: f32,
    pub max_speed: f32,
    pub acceleration: f32,
    pub sensitivity: f32,
    pub pointer_lock: String,
    pub collision_profile: Option<String>,
    pub pitch: FirstPersonPitchIr,
    pub input: FirstPersonInputIr,
}

#[derive(Clone, Debug, Deserialize)]
pub struct FirstPersonPitchIr {
    pub min: f32,
    pub max: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstPersonInputIr {
    pub forward: String,
    pub backward: String,
    pub left: String,
    pub right: String,
    pub sprint: Option<String>,
    pub look_x: String,
    pub look_y: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentTerrainIr {
    pub id: String,
    pub bounds: EnvironmentBoundsIr,
    pub height_mode: String,
    #[serde(default)]
    pub control_points: Vec<[f32; 3]>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct EnvironmentBoundsIr {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentPathIr {
    pub id: String,
    pub points: Vec<[f32; 3]>,
    pub width: f32,
    pub clearing_radius: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSourceAssetIr {
    pub id: String,
    pub asset: String,
    pub category: String,
    #[serde(default)]
    pub lod: Vec<EnvironmentLodLevelIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentLodLevelIr {
    pub asset: String,
    pub min_distance: f32,
    pub max_distance: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInstanceIr {
    pub id: String,
    pub source_asset: String,
    pub position: [f32; 3],
    pub rotation: Option<[f32; 4]>,
    pub scale: Option<[f32; 3]>,
    pub kind: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentScatterSpecIr {
    pub id: String,
    #[serde(default)]
    pub asset_ids: Vec<String>,
    pub seed: i64,
    pub count: Option<u32>,
    pub density: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentBookmarkIr {
    pub id: String,
    pub position: [f32; 3],
    pub yaw: f32,
    pub pitch: f32,
    #[serde(default)]
    pub expected_tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereProfileIr {
    pub id: String,
    pub active: bool,
    pub sun: AtmosphereSunIr,
    pub ambient: AtmosphereAmbientIr,
    pub fog: Option<AtmosphereFogIr>,
    pub sky: AtmosphereSkyIr,
    pub color_management: AtmosphereColorManagementIr,
    pub shadows: AtmosphereShadowsIr,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereSunIr {
    pub id: String,
    pub direction: [f32; 3],
    pub color: ColorIr,
    pub intensity: f32,
    pub casts_shadow: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtmosphereAmbientIr {
    pub color: ColorIr,
    pub intensity: f32,
    pub mode: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AtmosphereFogIr {
    pub color: ColorIr,
    pub enabled: bool,
    pub mode: String,
    pub density: Option<f32>,
    pub near: Option<f32>,
    pub far: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereSkyIr {
    pub color: ColorIr,
    pub horizon_color: Option<ColorIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereColorManagementIr {
    pub exposure: f32,
    pub output_color_space: String,
    pub texture_color_space: String,
    pub tone_mapping: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereShadowsIr {
    pub enabled: bool,
    pub map_size: u32,
    pub max_distance: f32,
    pub cascade_count: u32,
    pub bias: f32,
    pub normal_bias: f32,
    pub receiver_policy: String,
}

pub fn load_bundle(bundle_path: impl AsRef<Path>) -> Result<LoadedBundle, LoadError> {
    let requested_bundle_path = bundle_path.as_ref();
    let canonical_bundle_path =
        fs::canonicalize(requested_bundle_path).map_err(|source| LoadError::Read {
            path: requested_bundle_path.display().to_string(),
            source,
        })?;
    let bundle_path = canonical_bundle_path.as_path();
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
    let ui = match manifest.entry.ui.as_ref() {
        Some(file) => {
            let ui: UiIr = read_json(bundle_path, file)?;
            ensure_supported(&ui.schema, &ui.version)?;
            Some(ui)
        }
        None => None,
    };
    let audio = match manifest.entry.audio.as_ref() {
        Some(file) => {
            let audio: AudioIr = read_json(bundle_path, file)?;
            ensure_supported(&audio.schema, &audio.version)?;
            Some(audio)
        }
        None => None,
    };
    let environment_scene = match manifest.entry.environment_scene.as_ref() {
        Some(file) => {
            let scene: EnvironmentSceneIr = read_json(bundle_path, file)?;
            ensure_supported(&scene.schema, &scene.version)?;
            Some(scene)
        }
        None => None,
    };

    Ok(LoadedBundle {
        bundle_path: canonical_bundle_path,
        assets,
        audio,
        environment_scene,
        input,
        manifest,
        materials,
        runtime_config,
        systems,
        target_profile,
        ui,
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
