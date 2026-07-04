use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleManifest {
    pub schema: String,
    pub version: String,
    pub name: String,
    #[serde(rename = "requiredCapabilities")]
    pub required_capabilities: HashMap<String, Vec<String>>,
    pub entry: BundleEntry,
    pub files: BundleFiles,
}

#[derive(Debug, Deserialize)]
pub struct BundleEntry {
    pub animations: Option<String>,
    pub audio: Option<String>,
    #[serde(rename = "environmentScene")]
    pub environment_scene: Option<String>,
    #[serde(rename = "localData")]
    pub local_data: Option<String>,
    pub overlays: Option<String>,
    pub prefabs: Option<String>,
    pub scenes: Option<String>,
    pub scripts: Option<String>,
    pub systems: Option<String>,
    pub ui: Option<String>,
    pub world: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleFiles {
    pub animations: Option<String>,
    pub assets: String,
    pub component_schemas: Option<String>,
    pub input: Option<String>,
    pub local_data: Option<String>,
    pub materials: String,
    pub prefabs: Option<String>,
    pub runtime_config: Option<String>,
    pub target_profile: String,
}

#[derive(Debug)]
pub struct LoadedBundle {
    pub animations: Option<AnimationsIr>,
    pub bundle_path: PathBuf,
    pub assets: AssetsManifest,
    pub audio: Option<AudioIr>,
    pub component_schemas: Option<SchemaFileIr>,
    pub environment_scene: Option<EnvironmentSceneIr>,
    pub input: Option<InputIr>,
    pub local_data: Option<LocalDataIr>,
    pub manifest: BundleManifest,
    pub materials: MaterialsIr,
    pub overlays: Option<OverlaysIr>,
    pub prefabs: Option<PrefabsIr>,
    pub runtime_config: Option<RuntimeConfigIr>,
    pub scenes: Option<ScenesIr>,
    pub systems: Option<SystemsIr>,
    pub target_profile: TargetProfile,
    pub ui: Option<UiIr>,
    pub world: WorldIr,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenesIr {
    pub schema: String,
    pub version: String,
    pub initial_scene: String,
    pub scenes: Vec<SceneLifecycleIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneLifecycleIr {
    pub id: String,
    pub kind: String,
    pub activation: String,
    #[serde(default)]
    pub asset_groups: Vec<String>,
    pub audio: Option<SceneAudioIr>,
    #[serde(default)]
    pub entities: Vec<String>,
    pub input: Option<String>,
    pub persistence: Option<ScenePersistenceIr>,
    #[serde(default)]
    pub systems: Vec<String>,
    pub transitions: Option<SceneTransitionsIr>,
    #[serde(default)]
    pub ui: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneAudioIr {
    pub music: Option<String>,
    pub transition: Option<SceneTransitionIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PrefabsIr {
    pub schema: String,
    pub version: String,
    #[serde(default)]
    pub prefabs: Vec<PrefabDeclarationIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PrefabDeclarationIr {
    pub id: String,
    pub root: String,
    #[serde(default)]
    pub entities: Vec<PrefabEntityTemplateIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PrefabEntityTemplateIr {
    pub id: String,
    pub components: EntityComponents,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePersistenceIr {
    #[serde(default)]
    pub keep_entities: Vec<String>,
    #[serde(default)]
    pub keep_resources: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneTransitionsIr {
    pub enter: Option<SceneTransitionIr>,
    pub exit: Option<SceneTransitionIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneTransitionIr {
    pub color: Option<String>,
    pub duration_ms: u32,
    pub kind: String,
    pub loading_scene: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnimationsIr {
    pub schema: String,
    pub version: String,
    #[serde(rename = "transformClips")]
    pub transform_clips: Vec<TransformAnimationClipIr>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformAnimationClipIr {
    pub id: String,
    #[serde(rename = "loop")]
    pub loop_: Option<String>,
    pub tracks: Vec<TransformAnimationTrackIr>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformAnimationTrackIr {
    pub target: String,
    pub channel: String,
    pub easing: Option<String>,
    pub keyframes: Vec<TransformAnimationKeyframeIr>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformAnimationKeyframeIr {
    pub time_seconds: f32,
    pub value: Vec<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct OverlaysIr {
    pub schema: String,
    pub version: String,
    pub overlays: Vec<OverlayIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayIr {
    pub id: String,
    pub entry: String,
    pub transparent: bool,
    pub z_index: u32,
    pub input: String,
    pub messages: OverlayBridgeMessagesIr,
    pub target_profiles: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayBridgeMessagesIr {
    #[serde(default)]
    pub overlay_to_game: Vec<OverlayMessageIr>,
    #[serde(default)]
    pub game_to_overlay: Vec<OverlayMessageIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct OverlayMessageIr {
    pub name: String,
    pub schema: OverlayMessageSchemaIr,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct OverlayMessageSchemaIr {
    pub kind: String,
    #[serde(default)]
    pub fields: HashMap<String, String>,
    #[serde(default)]
    pub required: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SchemaFileIr {
    pub schema: String,
    pub version: String,
    pub schemas: HashMap<String, SchemaDeclarationIr>,
}

#[derive(Debug, Deserialize)]
pub struct SchemaDeclarationIr {
    pub fields: HashMap<String, SchemaFieldIr>,
}

#[derive(Debug, Deserialize)]
pub struct SchemaFieldIr {
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    pub kind: String,
    #[serde(default)]
    pub required: bool,
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

#[derive(Clone, Debug, Deserialize)]
pub struct WorldEntity {
    pub id: String,
    pub components: EntityComponents,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EntityComponents {
    pub camera: Option<CameraComponent>,
    pub collider: Option<ColliderComponent>,
    pub hierarchy: Option<HierarchyComponent>,
    pub light: Option<LightComponent>,
    pub mesh_renderer: Option<MeshRendererComponent>,
    pub physics_joint: Option<PhysicsJointComponent>,
    pub render_layers: Option<RenderLayersComponent>,
    pub rigid_body: Option<RigidBodyComponent>,
    pub transform: Option<TransformComponent>,
    pub visibility: Option<VisibilityComponent>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TransformComponent {
    pub position: Option<[f32; 3]>,
    pub rotation: Option<[f32; 4]>,
    pub scale: Option<[f32; 3]>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshRendererComponent {
    pub cast_shadow: Option<bool>,
    pub mesh: Option<String>,
    pub material: String,
    pub receive_shadow: Option<bool>,
    pub visible: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraViewportIr {
    #[serde(rename = "0")]
    pub x: Option<f32>,
    #[serde(rename = "1")]
    pub y: Option<f32>,
    #[serde(rename = "2")]
    pub width: Option<f32>,
    #[serde(rename = "3")]
    pub height: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum CameraViewportIrValue {
    Tuple([f32; 4]),
    Object(CameraViewportIr),
}

impl CameraViewportIrValue {
    pub fn as_tuple(&self) -> [f32; 4] {
        match self {
            Self::Tuple(values) => *values,
            Self::Object(value) => [
                value.x.unwrap_or(0.0),
                value.y.unwrap_or(0.0),
                value.width.unwrap_or(1.0),
                value.height.unwrap_or(1.0),
            ],
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraClearIr {
    pub color: Option<ColorIr>,
    pub mode: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraOutputIr {
    pub format: Option<String>,
    pub height: Option<u32>,
    pub mode: Option<String>,
    pub path: Option<String>,
    pub width: Option<u32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraProjectionIr {
    pub backend: Option<String>,
    pub handedness: Option<String>,
    pub kind: String,
    pub matrix: Option<Vec<f32>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraTargetIr {
    pub asset: Option<String>,
    pub kind: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraFollowHelperIr {
    pub offset: Option<[f32; 3]>,
    pub smoothing: Option<f32>,
    pub target: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraOrbitHelperIr {
    pub distance: Option<f32>,
    #[serde(rename = "maxDistance")]
    pub max_distance: Option<f32>,
    #[serde(rename = "minDistance")]
    pub min_distance: Option<f32>,
    pub smoothing: Option<f32>,
    pub target: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraScreenShakeHelperIr {
    pub amplitude: f32,
    pub decay: Option<f32>,
    pub frequency: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraViewModelHelperIr {
    pub offset: Option<[f32; 3]>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RenderLayersComponent {
    pub layers: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CameraComponent {
    pub clear: Option<CameraClearIr>,
    pub follow: Option<CameraFollowHelperIr>,
    pub kind: String,
    #[serde(rename = "fovY")]
    pub fov_y: Option<f32>,
    pub layers: Option<Vec<String>>,
    pub near: f32,
    pub far: f32,
    pub orbit: Option<CameraOrbitHelperIr>,
    pub order: Option<i32>,
    pub output: Option<CameraOutputIr>,
    pub priority: Option<i32>,
    pub projection: Option<CameraProjectionIr>,
    #[serde(rename = "screenShake")]
    pub screen_shake: Option<CameraScreenShakeHelperIr>,
    pub size: Option<f32>,
    pub target: Option<CameraTargetIr>,
    #[serde(rename = "viewModel")]
    pub view_model: Option<CameraViewModelHelperIr>,
    pub viewport: Option<CameraViewportIrValue>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LightComponent {
    pub kind: String,
    pub color: ColorIr,
    pub debug: Option<DebugGizmoIr>,
    pub intensity: f32,
    pub range: Option<f32>,
    pub angle: Option<f32>,
    #[serde(rename = "shadowBias")]
    pub shadow_bias: Option<f32>,
    #[serde(rename = "shadowFilter")]
    pub shadow_filter: Option<ShadowFilterIr>,
    #[serde(rename = "shadowNormalBias")]
    pub shadow_normal_bias: Option<f32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DebugGizmoIr {
    pub gizmo: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ShadowFilterIr {
    pub mode: String,
    pub quality: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct HierarchyComponent {
    pub parent: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigidBodyComponent {
    pub angular_velocity: Option<[f32; 3]>,
    pub ccd: Option<CcdComponent>,
    pub damping: Option<f32>,
    pub enabled_rotations: Option<[bool; 3]>,
    pub enabled_translations: Option<[bool; 3]>,
    pub gravity_scale: Option<f32>,
    pub inverse_mass: Option<f32>,
    pub kind: String,
    pub mass: Option<f32>,
    pub sleep_threshold: Option<f32>,
    pub solver_iterations: Option<u32>,
    pub velocity: Option<[f32; 3]>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CcdComponent {
    pub enabled: bool,
    pub max_substeps: Option<u32>,
    pub mode: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ColliderComponent {
    pub center: Option<[f32; 3]>,
    pub friction: Option<f32>,
    pub kind: String,
    pub height: Option<f32>,
    pub layer: Option<String>,
    pub mask: Option<Vec<String>>,
    pub mesh: Option<MeshColliderComponent>,
    pub radius: Option<f32>,
    pub restitution: Option<f32>,
    pub size: Option<[f32; 3]>,
    pub slope: Option<ColliderSlopeComponent>,
    pub sensor: Option<serde_json::Value>,
    pub trigger: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshColliderComponent {
    pub bounds: MeshColliderBoundsComponent,
    pub source: Option<String>,
    pub triangle_count: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MeshColliderBoundsComponent {
    pub center: Option<[f32; 3]>,
    pub size: [f32; 3],
}

#[derive(Clone, Debug, Deserialize)]
pub struct ColliderSlopeComponent {
    pub axis: String,
    pub direction: i8,
    pub rise: f32,
    pub run: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsJointComponent {
    pub anchor: Option<[f32; 3]>,
    pub axis: Option<[f32; 3]>,
    pub connected_entity: String,
    pub damping: Option<f32>,
    pub kind: String,
    pub limits: Option<PhysicsJointLimitsComponent>,
    pub stiffness: Option<f32>,
    pub travel: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PhysicsJointLimitsComponent {
    pub max: f32,
    pub min: f32,
}

#[derive(Clone, Debug, Deserialize)]
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
pub struct MaterialExtensionIr {
    pub double_sided: Option<bool>,
    pub preset: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialEmissiveBloomIr {
    pub enabled: bool,
    pub intensity: f32,
    pub threshold: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialIr {
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<String>,
    pub blend_mode: Option<String>,
    pub depth_test: Option<bool>,
    pub depth_write: Option<bool>,
    pub extension: Option<MaterialExtensionIr>,
    pub id: String,
    pub kind: String,
    pub color: ColorIr,
    pub base_color_texture: Option<String>,
    pub clearcoat: Option<f32>,
    pub clearcoat_roughness: Option<f32>,
    pub clearcoat_roughness_texture: Option<String>,
    pub clearcoat_texture: Option<String>,
    pub emissive: Option<ColorIr>,
    pub emissive_bloom: Option<MaterialEmissiveBloomIr>,
    pub emissive_intensity: Option<f32>,
    pub emissive_texture: Option<String>,
    pub metalness: Option<f32>,
    pub metallic_roughness_texture: Option<String>,
    pub normal_texture: Option<String>,
    pub occlusion_texture: Option<String>,
    pub opacity: Option<f32>,
    pub render_order: Option<i32>,
    pub roughness: Option<f32>,
    pub specular_intensity: Option<f32>,
    pub specular_texture: Option<String>,
    pub transmission: Option<f32>,
    pub transmission_texture: Option<String>,
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
    pub attributes: Option<Vec<MeshAttributeIr>>,
    #[serde(rename = "binaryAttributes")]
    pub binary_attributes: Option<Vec<MeshBinaryAttributeIr>>,
    #[serde(rename = "binaryIndices")]
    pub binary_indices: Option<MeshBinaryIndicesIr>,
    pub bounds: Option<AssetBoundsIr>,
    pub budget: Option<MeshBudgetIr>,
    pub center: Option<[f32; 2]>,
    pub generation: Option<MeshGenerationIr>,
    pub indices: Option<Vec<u32>>,
    #[serde(rename = "magFilter")]
    pub mag_filter: Option<String>,
    pub masks: Option<Vec<AnimationMaskIr>>,
    #[serde(rename = "minFilter")]
    pub min_filter: Option<String>,
    #[serde(rename = "morphClips")]
    pub morph_clips: Option<Vec<MorphClipIr>>,
    #[serde(rename = "morphTargets")]
    pub morph_targets: Option<Vec<MorphTargetIr>>,
    pub offset: Option<[f32; 2]>,
    #[serde(rename = "particleEmitters")]
    pub particle_emitters: Option<Vec<ParticleEmitterIr>>,
    pub primitive: Option<String>,
    pub path: Option<String>,
    pub repeat: Option<[f32; 2]>,
    pub rotation: Option<f32>,
    pub sample_count: Option<u32>,
    pub size: Option<Vec<f32>>,
    pub skeleton: Option<ModelSkeletonIr>,
    pub topology: Option<String>,
    pub usage: Option<String>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    #[serde(rename = "wrapS")]
    pub wrap_s: Option<String>,
    #[serde(rename = "wrapT")]
    pub wrap_t: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshGenerationIr {
    pub id: String,
    pub source: String,
    pub helper: Option<String>,
    pub seed: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshBudgetIr {
    pub classification: String,
    pub vertex_count: usize,
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationMaskIr {
    pub id: String,
    pub joints: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ModelSkeletonIr {
    pub joints: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MorphTargetIr {
    pub default_weight: Option<f32>,
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MorphClipIr {
    pub id: String,
    pub keyframes: Vec<MorphKeyframeIr>,
    pub target: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MorphKeyframeIr {
    pub time_seconds: f32,
    pub weight: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshAttributeIr {
    pub name: String,
    pub item_size: usize,
    pub values: Vec<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshBinaryAttributeIr {
    pub name: String,
    pub item_size: usize,
    pub format: String,
    pub count: usize,
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct MeshBinaryIndicesIr {
    pub format: String,
    pub count: usize,
    pub path: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationClipIr {
    pub id: String,
    #[serde(rename = "loop")]
    pub loop_: Option<bool>,
    pub mask: Option<String>,
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
#[serde(rename_all = "camelCase")]
pub struct LocalDataIr {
    pub schema: String,
    pub version: String,
    #[serde(default)]
    pub autosave: Option<LocalDataAutosaveIr>,
    #[serde(default)]
    pub components: Vec<LocalDataSchemaEntryIr>,
    #[serde(default)]
    pub migration: Option<LocalDataMigrationIr>,
    #[serde(default)]
    pub resources: Vec<LocalDataSchemaEntryIr>,
    #[serde(default)]
    pub save_slots: Vec<LocalDataSaveSlotIr>,
    #[serde(default)]
    pub settings: Vec<LocalDataSettingIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LocalDataSchemaEntryIr {
    pub id: String,
    pub schema: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataSettingIr {
    pub default_value: serde_json::Value,
    #[serde(default)]
    pub enum_values: Vec<String>,
    pub group: String,
    pub key: String,
    pub kind: String,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub min: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataSaveSlotIr {
    pub app_version: String,
    pub id: String,
    pub schema_version: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataMigrationIr {
    pub current_version: u32,
    #[serde(default)]
    pub migrators: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataAutosaveIr {
    #[serde(default)]
    pub checkpoint_events: Vec<String>,
    pub debounce_ms: f64,
    #[serde(default)]
    pub interval_seconds: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemsIr {
    #[serde(default)]
    pub channels: Vec<SystemChannelIr>,
    #[serde(default, rename = "componentHooks")]
    pub component_hooks: Vec<SystemComponentHookIr>,
    #[serde(default)]
    pub lifecycle: Option<SystemsLifecycleIr>,
    #[serde(default)]
    pub observers: Vec<SystemObserverIr>,
    #[serde(default, rename = "pluginGroups")]
    pub plugin_groups: Vec<SystemPluginGroupIr>,
    #[serde(default)]
    pub plugins: Vec<SystemPluginIr>,
    pub schema: String,
    pub version: String,
    #[serde(default)]
    pub tasks: Vec<SystemTaskIr>,
    pub systems: Vec<SystemIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemChannelIr {
    pub delivery: String,
    pub event: String,
    pub id: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemComponentHookIr {
    pub component: String,
    pub hooks: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemObserverIr {
    pub event: String,
    pub phases: Vec<String>,
    pub propagation: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemPluginIr {
    pub id: String,
    pub systems: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemPluginGroupIr {
    pub id: String,
    pub plugins: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SystemTaskIr {
    pub channel: Option<String>,
    pub id: String,
    pub mode: String,
    pub schedule: String,
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
    pub after: Vec<String>,
    #[serde(default)]
    pub before: Vec<String>,
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
    #[serde(rename = "instantiate")]
    Instantiate { prefab: String, prefix: String },
    #[serde(rename = "removeComponent")]
    RemoveComponent { component: String, entity: String },
    #[serde(rename = "setParent")]
    SetParent { child: String, parent: String },
    #[serde(rename = "clearParent")]
    ClearParent { child: String },
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
    pub changed: Vec<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    #[serde(rename = "orderBy")]
    pub order_by: Option<String>,
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

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InputIr {
    pub schema: String,
    pub version: String,
    pub actions: Vec<InputActionIr>,
    pub axes: Vec<InputAxisIr>,
    #[serde(default, rename = "controlsSettings")]
    pub controls_settings: Option<ControlsSettingsIr>,
    #[serde(default, rename = "persistedBindingOverrides")]
    pub persisted_binding_overrides: Vec<PersistedBindingOverrideIr>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InputActionIr {
    pub id: String,
    pub bindings: Vec<InputBindingIr>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InputAxisIr {
    pub id: String,
    #[serde(default)]
    pub negative: Vec<InputBindingIr>,
    #[serde(default)]
    pub positive: Vec<InputBindingIr>,
    pub value: Option<InputBindingIr>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlsSettingsIr {
    pub profile_id: String,
    pub rows: Vec<ControlsSettingsRowIr>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlsSettingsRowIr {
    pub action_or_axis_id: String,
    pub axis_slot: Option<String>,
    pub capture_state: Option<String>,
    pub default_bindings: Vec<InputBindingIr>,
    pub kind: String,
    pub ui_node_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedBindingOverrideIr {
    pub action_or_axis_id: String,
    pub axis_slot: Option<String>,
    pub control: String,
    pub deadzone: Option<f32>,
    pub device: String,
    pub modifiers: Option<Vec<String>>,
    pub profile_id: String,
    pub scale: Option<f32>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
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
    pub renderer: Option<RuntimeRendererConfig>,
    pub time: RuntimeTimeConfig,
    pub window: RuntimeWindowConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRendererConfig {
    pub antialias: String,
    pub bloom: Option<RuntimeRendererBloomConfig>,
    #[serde(rename = "colorGrading")]
    pub color_grading: Option<RuntimeRendererColorGradingConfig>,
    #[serde(rename = "depthOfField")]
    pub depth_of_field: Option<RuntimeRendererDepthOfFieldConfig>,
    #[serde(rename = "renderLook")]
    pub render_look: Option<RuntimeRenderLookProfileConfig>,
    #[serde(rename = "renderPath")]
    pub render_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRendererBloomConfig {
    pub enabled: bool,
    pub intensity: f32,
    pub threshold: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRenderLookProfileConfig {
    pub version: u32,
    pub profile: String,
    pub overrides: Option<RuntimeRenderLookOverridesConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRenderLookOverridesConfig {
    pub bloom_intensity: Option<f32>,
    pub contrast: Option<f32>,
    pub environment_intensity: Option<f32>,
    pub exposure: Option<f32>,
    pub saturation: Option<f32>,
    pub shadow_quality: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRendererDepthOfFieldConfig {
    pub aperture: f32,
    pub enabled: bool,
    pub focus_distance: f32,
    pub max_blur: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRendererColorGradingConfig {
    pub contrast: Option<f32>,
    pub exposure: Option<f32>,
    pub lut: Option<String>,
    pub saturation: Option<f32>,
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
    pub tone_mapping: Option<String>,
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
    #[serde(default)]
    pub fonts: Vec<UiFontAssetIr>,
    #[serde(rename = "focusOrder")]
    pub focus_order: Option<Vec<String>>,
    #[serde(rename = "inputActions")]
    pub input_actions: Option<UiInputActionsIr>,
    #[serde(rename = "safeArea")]
    pub safe_area: Option<UiSafeAreaIr>,
    pub root: UiNodeIr,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiFontAssetIr {
    pub asset: String,
    pub fallback_family: Option<String>,
    pub family: String,
    #[serde(default)]
    pub glyph_ranges: Vec<UiGlyphRangeIr>,
    pub style: Option<String>,
    pub weight: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiGlyphRangeIr {
    pub from: u32,
    pub to: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiNodeIr {
    pub accessibility_label: Option<String>,
    pub action: Option<String>,
    pub anchor_id: Option<String>,
    pub binding: Option<UiBindingIr>,
    #[serde(default)]
    pub children: Vec<UiNodeIr>,
    pub disabled: Option<bool>,
    pub focusable: Option<bool>,
    pub id: String,
    pub image: Option<UiImageMetadataIr>,
    pub kind: String,
    pub minimap: Option<UiMinimapMetadataIr>,
    pub label: Option<String>,
    pub layout: Option<UiLayoutIr>,
    pub max: Option<f32>,
    pub min: Option<f32>,
    pub navigation: Option<UiNavigationIr>,
    pub orientation: Option<String>,
    pub role: Option<String>,
    #[serde(default)]
    pub spans: Vec<UiRichTextSpanIr>,
    pub step: Option<f32>,
    pub style: Option<UiStyleIr>,
    pub src: Option<String>,
    pub text: Option<String>,
    pub value: Option<f32>,
    pub value_text: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum UiBindingIr {
    #[serde(rename = "resource")]
    Resource { name: String, field: Option<String> },
    #[serde(rename = "component")]
    Component {
        component: String,
        entity: String,
        field: Option<String>,
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiMinimapMetadataIr {
    pub background_color: Option<String>,
    pub bounds: UiMinimapBoundsIr,
    #[serde(default)]
    pub markers: Vec<UiMinimapMarkerIr>,
    #[serde(default)]
    pub paths: Vec<UiMinimapPathIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiMinimapBoundsIr {
    pub max_x: f32,
    pub max_z: f32,
    pub min_x: f32,
    pub min_z: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiMinimapMarkerIr {
    pub color: Option<String>,
    pub label: Option<String>,
    pub radius: Option<f32>,
    pub x: f32,
    pub z: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiMinimapPathIr {
    pub color: Option<String>,
    #[serde(default)]
    pub points: Vec<[f32; 2]>,
    pub width: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiImageMetadataIr {
    pub atlas: Option<UiAtlasRectIr>,
    pub flip_x: Option<bool>,
    pub flip_y: Option<bool>,
    pub nine_slice: Option<UiNineSliceIr>,
    pub scale_mode: Option<String>,
    pub source_size: Option<UiImageSizeIr>,
    pub tile_size: Option<UiImageSizeIr>,
    pub tint: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiAtlasRectIr {
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiImageSizeIr {
    pub height: f32,
    pub width: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UiNineSliceIr {
    pub bottom: f32,
    pub left: f32,
    pub right: f32,
    pub top: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiRichTextSpanIr {
    pub accessibility_text: Option<String>,
    pub color: Option<String>,
    pub decoration: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub italic: Option<bool>,
    pub text: String,
    pub weight: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiLayoutIr {
    pub align: Option<String>,
    pub column_gap: Option<f32>,
    pub direction: Option<String>,
    pub grid: Option<UiGridLayoutIr>,
    pub grow: Option<f32>,
    pub height: Option<f32>,
    pub inset: Option<UiInsetIr>,
    pub justify: Option<String>,
    pub max_height: Option<f32>,
    pub max_width: Option<f32>,
    pub min_height: Option<f32>,
    pub min_width: Option<f32>,
    pub overflow: Option<String>,
    pub padding: Option<f32>,
    pub position: Option<String>,
    pub row_gap: Option<f32>,
    pub width: Option<f32>,
    pub z_index: Option<i32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiGridLayoutIr {
    pub auto_flow: Option<String>,
    pub columns: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiStyleIr {
    pub background_color: Option<String>,
    pub border_color: Option<String>,
    pub border_radius: Option<f32>,
    pub border_width: Option<f32>,
    pub color: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<f32>,
    pub font_weight: Option<String>,
    pub gradient: Option<UiGradientIr>,
    pub opacity: Option<f32>,
    pub shadow: Option<UiShadowIr>,
    pub text_decoration: Option<String>,
    pub text_align: Option<String>,
    pub wrap: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiGradientIr {
    pub angle: Option<f32>,
    pub from: String,
    pub kind: String,
    pub to: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiShadowIr {
    pub blur: Option<f32>,
    pub color: String,
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub spread: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiInsetIr {
    pub bottom: Option<f32>,
    pub left: Option<f32>,
    pub right: Option<f32>,
    pub top: Option<f32>,
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
    pub controls: Vec<AudioControlIr>,
    #[serde(default)]
    pub ducking_rules: Vec<AudioDuckingRuleIr>,
    #[serde(default)]
    pub emitters: Vec<AudioEmitterIr>,
    #[serde(default)]
    pub listeners: Vec<AudioListenerIr>,
    #[serde(default)]
    pub music: Vec<AudioMusicIr>,
    #[serde(default)]
    pub music_transitions: Vec<AudioMusicTransitionIr>,
    #[serde(default)]
    pub one_shots: Vec<AudioOneShotIr>,
    #[serde(default)]
    pub tones: Vec<AudioToneIr>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioControlIr {
    pub at: Option<f32>,
    pub id: String,
    pub kind: String,
    pub target: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioBusIr {
    pub gain: Option<f32>,
    pub id: String,
    pub mute: Option<bool>,
    pub parent: Option<String>,
    pub solo: Option<bool>,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioListenerIr {
    pub binding: Option<AudioListenerBindingIr>,
    pub id: String,
    pub position: [f32; 3],
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioListenerBindingIr {
    pub entity: Option<String>,
    pub kind: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioEmitterIr {
    pub attenuation: Option<AudioAttenuationIr>,
    pub id: String,
    pub position: [f32; 3],
    pub radius: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAttenuationIr {
    pub curve: String,
    pub max_distance: f32,
    pub min_distance: f32,
    pub rolloff_factor: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioOneShotIr {
    pub id: String,
    pub asset: String,
    pub bus: Option<String>,
    pub emitter: Option<String>,
    pub event: String,
    pub pitch: Option<f32>,
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
    pub pitch: Option<f32>,
    pub volume: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDuckingRuleIr {
    pub attack: f32,
    pub gain: f32,
    pub id: String,
    pub release: f32,
    pub source_bus: String,
    pub target_bus: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AudioToneIr {
    pub bus: Option<String>,
    pub duration: f32,
    pub frequency: Option<f32>,
    pub id: String,
    pub pitch: Option<f32>,
    pub volume: Option<f32>,
    pub waveform: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioMusicTransitionIr {
    pub duration: Option<f32>,
    pub from: Option<String>,
    pub id: String,
    pub kind: String,
    pub playback_id: String,
    pub state: String,
    pub to: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSceneIr {
    pub schema: String,
    pub version: String,
    pub atmosphere: Option<AtmosphereProfileIr>,
    pub controller: Option<FirstPersonControllerIr>,
    #[serde(rename = "environmentMap")]
    pub environment_map: Option<EnvironmentMapIr>,
    #[serde(default, rename = "lightProbes")]
    pub light_probes: Vec<LightProbeIr>,
    pub skybox: Option<SkyboxIr>,
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

#[derive(Clone, Debug, Deserialize, Serialize)]
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
    pub debug: Option<DebugGizmoIr>,
    #[serde(default)]
    pub lod: Vec<EnvironmentLodLevelIr>,
    pub visibility: Option<VisibilityRangeIr>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentLodLevelIr {
    pub asset: String,
    pub fade: Option<FadeRangeIr>,
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
    pub debug: Option<DebugGizmoIr>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub visibility: Option<VisibilityRangeIr>,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityRangeIr {
    pub fade: Option<FadeRangeIr>,
    pub max_distance: f32,
    pub min_distance: f32,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FadeRangeIr {
    pub end_distance: f32,
    pub start_distance: f32,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkyboxIr {
    pub asset: Option<String>,
    pub faces: Option<EnvironmentCubemapFacesIr>,
    pub intensity: Option<f32>,
    pub mode: String,
    #[serde(rename = "rotationY")]
    pub rotation_y: Option<f32>,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentMapIr {
    pub asset: Option<String>,
    pub faces: Option<EnvironmentCubemapFacesIr>,
    pub intensity: Option<f32>,
    pub intent: String,
    pub mode: String,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LightProbeIr {
    pub bounds: EnvironmentBoundsIr,
    pub id: String,
    pub influence_radius: f32,
    pub intent: String,
    pub source: EnvironmentTextureSourceIr,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentTextureSourceIr {
    pub asset: Option<String>,
    pub faces: Option<EnvironmentCubemapFacesIr>,
    pub mode: String,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentCubemapFacesIr {
    pub negative_x: String,
    pub negative_y: String,
    pub negative_z: String,
    pub positive_x: String,
    pub positive_y: String,
    pub positive_z: String,
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
