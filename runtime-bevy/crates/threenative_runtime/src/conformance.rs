use std::collections::HashMap;

use bevy::{prelude::*, render::camera::ScalingMode};
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    AnimationClipIr, AssetIr, ColorIr, EnvironmentMapIr, EnvironmentSceneIr, GltfSceneAssetIr,
    LoadedBundle, MaterialIr, MeshGenerationIr, RuntimeConfigIr, RuntimeRendererConfig, SkyboxIr,
    SystemQueryIr, UiIr, WorldEntity,
};

use crate::audio::{
    self, NativeAudioCommand, NativeAudioCommandKind, NativeAudioDiagnostic, NativeAudioToneCommand,
};
use crate::cameras::{active_camera_ids, camera_order};
use crate::physics::detect_physics_events;
use crate::render_targets::list_screenshot_exports;
use crate::scene_manager::{
    SceneLifecycleOperation, SceneLifecycleRuntimeState, trace_scene_lifecycle,
};
use crate::ui::{UiDiagnostic, build_native_ui};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_camera: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<ConformanceAudioReport>,
    pub assets: Vec<ConformanceAssetReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera_views: Option<Vec<ConformanceCameraViewReport>>,
    pub diagnostics: Vec<RuntimeDiagnostic>,
    pub entities: Vec<ConformanceEntityReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<ConformanceEnvironmentReport>,
    pub events: Vec<ConformanceEventReport>,
    pub fixture: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gltf_fidelity: Option<ConformanceGltfFidelityReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub light_budget: Option<ConformanceLightBudgetReport>,
    pub materials: Vec<ConformanceMaterialReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profiler: Option<ConformanceProfilerReport>,
    pub resources: Vec<ConformanceResourceReport>,
    pub runtime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_config: Option<ConformanceRuntimeConfigReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_lifecycle: Option<SceneLifecycleRuntimeState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screenshot_exports: Option<Vec<ConformanceScreenshotExportReport>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub systems: Option<Vec<ConformanceSystemReport>>,
    pub traces: RuntimeTraceBundle,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui: Option<ConformanceUiReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTraceBundle {
    pub schema: &'static str,
    pub version: &'static str,
    pub slices: RuntimeTraceSlices,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTraceSlices {
    pub animation_state: RuntimeAnimationStateTrace,
    pub physics_contacts: RuntimePhysicsContactsTrace,
    pub render_observation: RuntimeRenderObservationTrace,
    pub transform_snapshot: RuntimeTransformSnapshotTrace,
    pub ui_tree: RuntimeUiTreeTrace,
}

#[derive(Debug, Serialize)]
pub struct RuntimeTransformSnapshotTrace {
    pub frame: usize,
    pub entities: Vec<RuntimeTransformTraceEntity>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTransformTraceEntity {
    pub components: Vec<String>,
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

#[derive(Debug, Serialize)]
pub struct RuntimePhysicsContactsTrace {
    pub frame: usize,
    pub contacts: Vec<RuntimePhysicsContactTrace>,
}

#[derive(Debug, Serialize)]
pub struct RuntimePhysicsContactTrace {
    pub a: String,
    pub b: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
pub struct RuntimeUiTreeTrace {
    pub frame: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root: Option<ConformanceUiNodeReport>,
}

#[derive(Debug, Serialize)]
pub struct RuntimeAnimationStateTrace {
    pub frame: usize,
    pub clips: Vec<RuntimeAnimationClipTrace>,
}

#[derive(Debug, Serialize)]
pub struct RuntimeAnimationClipTrace {
    pub asset_id: String,
    pub clip: String,
    pub state: String,
    pub weight: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRenderObservationTrace {
    pub active_camera: Option<String>,
    pub camera_views: Vec<RuntimeCameraViewTrace>,
    pub frame: usize,
    pub visible_entities: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCameraViewTrace {
    pub camera_id: String,
    pub target_kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceGltfFidelityReport {
    pub assets: Vec<ConformanceGltfAssetReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceGltfAssetReport {
    pub asset_id: String,
    pub custom_attributes: Vec<serde_json::Value>,
    pub materials: Vec<serde_json::Value>,
    pub morph_targets: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceSystemReport {
    pub name: String,
    pub queries: Vec<ConformanceSystemQueryReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceSystemQueryReport {
    pub matched_entities: Vec<String>,
    pub with: Vec<String>,
    pub without: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceProfilerReport {
    pub audio_voice_count: usize,
    pub draw_count: usize,
    pub entity_count: usize,
    pub frame_time_ms: f32,
    pub gpu_timing_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_timing_warning: Option<RuntimeDiagnostic>,
    pub memory_estimate_bytes: usize,
    pub render_time_ms: f32,
    pub save_latency_ms: f32,
    pub ui_node_count: usize,
    pub update_time_ms: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceCameraViewReport {
    pub camera_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clear_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_path: Option<String>,
    pub layers: Vec<String>,
    pub order: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projection_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projection_matrix_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_asset: Option<String>,
    pub target_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub viewport: Option<[f32; 4]>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceScreenshotExportReport {
    pub camera_id: String,
    pub format: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceRuntimeConfigReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub renderer: Option<RuntimeRendererReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRendererReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub antialias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bloom: Option<RuntimeBloomReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_grading: Option<RuntimeColorGradingReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_of_field: Option<RuntimeDepthOfFieldReport>,
    pub post_processing: RuntimePostProcessingReport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub render_look: Option<RuntimeRenderLookReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub render_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBloomReport {
    pub enabled: bool,
    pub intensity: f32,
    pub threshold: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDepthOfFieldReport {
    pub aperture: f32,
    pub enabled: bool,
    pub focus_distance: f32,
    pub max_blur: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeColorGradingReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contrast: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exposure: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lut: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saturation: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tint: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone_mapping: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePostProcessingReport {
    pub applied: Vec<String>,
    pub skipped: Vec<RuntimePostProcessingSkipReport>,
}

#[derive(Debug, Serialize)]
pub struct RuntimePostProcessingSkipReport {
    pub feature: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRenderLookReport {
    pub applied_profile: String,
    pub fallbacks: Vec<RuntimeRenderLookFallbackReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overrides: Option<RuntimeRenderLookOverridesReport>,
    pub requested_profile: String,
}

#[derive(Debug, Serialize)]
pub struct RuntimeRenderLookFallbackReport {
    pub code: String,
    pub feature: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRenderLookOverridesReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bloom_intensity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contrast: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment_intensity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exposure: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saturation: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_quality: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConformanceAudioReport {
    pub commands: Vec<ConformanceAudioCommandReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceLightBudgetReport {
    pub culled_lights: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub culling_policy: Option<String>,
    pub dynamic_lights: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maximum_shadowed_point_lights: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maximum_visible_dynamic_lights: Option<usize>,
    pub over_budget: bool,
    pub shadowed_point_lights: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceAudioCommandReport {
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bus: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emitter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone: Option<NativeAudioToneCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceAssetReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animations: Option<Vec<AnimationClipReport>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<AssetBoundsReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub center: Option<[f32; 2]>,
    pub format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation: Option<MeshGenerationReport>,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_count: Option<usize>,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mag_filter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_filter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<[f32; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primitive: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat: Option<[f32; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<Vec<f32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topology: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertex_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wrap_s: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wrap_t: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshGenerationReport {
    pub id: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationClipReport {
    pub id: String,
    #[serde(rename = "loop")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loop_: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_clip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct AssetBoundsReport {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceMaterialReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpha_cutoff: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpha_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clearcoat: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clearcoat_roughness: Option<f32>,
    pub color: ColorReport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_test: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_write: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emissive: Option<ColorReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emissive_intensity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<serde_json::Value>,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metalness: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub render_order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roughness: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub specular_intensity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transmission: Option<f32>,
    pub textures: MaterialTexturesReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialTexturesReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clearcoat: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clearcoat_roughness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emissive: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metallic_roughness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occlusion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub specular: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transmission: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceEnvironmentReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atmosphere: Option<String>,
    pub bookmarks: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debug_gizmos: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment_map: Option<EnvironmentMapIr>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hlod_fades: Option<Vec<HlodFadeReport>>,
    pub instances: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_visibility: Option<Vec<VisibilityRangeReport>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub light_probes: Option<Vec<threenative_loader::LightProbeIr>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lod_impostors: Option<Vec<LodImpostorReport>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub scatter: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skybox: Option<SkyboxIr>,
    pub source_assets: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_asset_visibility: Option<Vec<VisibilityRangeReport>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terrain: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HlodFadeReport {
    pub asset: String,
    pub end_distance: f32,
    pub source_asset: String,
    pub start_distance: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LodImpostorReport {
    pub asset: String,
    pub material: String,
    pub mode: String,
    pub source_asset: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityRangeReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_distance: Option<f32>,
    pub id: String,
    pub max_distance: f32,
    pub min_distance: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_distance: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct ConformanceEventReport {
    pub id: String,
    pub values: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ConformanceResourceReport {
    pub id: String,
    pub value: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
pub struct ConformanceUiReport {
    pub root: ConformanceUiNodeReport,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceUiNodeReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessibility_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    pub children: Vec<ConformanceUiNodeReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focusable: Option<bool>,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceEntityReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera: Option<CameraReport>,
    pub components: Vec<String>,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub light: Option<LightReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh_renderer: Option<MeshRendererReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<TransformReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<VisibilityReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshRendererReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cast_shadow: Option<bool>,
    pub material: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receive_shadow: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh_renderer_visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RuntimeDiagnostic {
    pub code: String,
    pub message: String,
    pub path: String,
    pub severity: String,
}

#[derive(Debug, Serialize)]
pub struct CameraReport {
    pub far: f32,
    #[serde(rename = "fovY")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fov_y: Option<f32>,
    pub kind: String,
    pub near: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<RuntimeCameraReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeCameraReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub far: Option<f32>,
    #[serde(rename = "fovY")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fov_y: Option<f32>,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub near: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LightReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angle: Option<f32>,
    pub color: ColorReport,
    pub intensity: f32,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_filter: Option<ShadowFilterReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_bias: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_normal_bias: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<RuntimeLightReport>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLightReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angle: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<ColorReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intensity: Option<f32>,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_filter: Option<ShadowFilterReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_bias: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_normal_bias: Option<f32>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ShadowFilterReport {
    pub mode: String,
    pub quality: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum ColorReport {
    Hex(String),
    Rgb([f32; 3]),
}

#[derive(Debug, Serialize)]
pub struct TransformReport {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

pub fn report_bevy_conformance(
    world: &mut World,
    bundle: &LoadedBundle,
    fixture: impl Into<String>,
) -> ConformanceReport {
    let runtime_entities = runtime_entities_by_id(world);
    let mut entities = bundle
        .world
        .entities
        .iter()
        .map(|entity| report_entity(entity, runtime_entities.get(entity.id.as_str())))
        .collect::<Vec<_>>();
    entities.sort_by(|left, right| left.id.cmp(&right.id));

    let audio_observation = audio::observe_audio(bundle);
    let ui_report = report_ui(bundle.ui.as_ref());
    let active_camera = report_active_camera(world);
    let camera_views = report_camera_views(bundle);
    let traces = build_runtime_trace_bundle(
        &entities,
        ui_report.as_ref().and_then(|report| report.report.as_ref()),
        active_camera.as_ref(),
        &camera_views,
    );

    ConformanceReport {
        active_camera,
        audio: report_audio(audio_observation.as_ref()),
        assets: bundle
            .assets
            .assets
            .iter()
            .map(report_asset)
            .collect::<Vec<_>>(),
        camera_views: Some(camera_views),
        diagnostics: report_diagnostics(audio_observation.as_ref(), ui_report.as_ref()),
        entities,
        environment: bundle.environment_scene.as_ref().map(report_environment),
        events: report_events(bundle),
        fixture: fixture.into(),
        gltf_fidelity: report_gltf_fidelity(bundle),
        light_budget: report_light_budget(bundle),
        materials: bundle
            .materials
            .materials
            .iter()
            .map(report_material)
            .collect::<Vec<_>>(),
        profiler: Some(report_profiler(bundle)),
        resources: report_resources(bundle),
        runtime: "bevy".to_owned(),
        runtime_config: report_runtime_config(bundle.runtime_config.as_ref()),
        scene_lifecycle: report_scene_lifecycle(bundle),
        screenshot_exports: Some(
            list_screenshot_exports(bundle)
                .into_iter()
                .map(|entry| ConformanceScreenshotExportReport {
                    camera_id: entry.camera_id,
                    format: entry.format,
                    path: entry.path,
                })
                .collect(),
        ),
        systems: report_systems(bundle),
        traces,
        ui: ui_report.and_then(|report| report.report),
    }
}

fn build_runtime_trace_bundle(
    entities: &[ConformanceEntityReport],
    ui: Option<&ConformanceUiReport>,
    active_camera: Option<&String>,
    camera_views: &[ConformanceCameraViewReport],
) -> RuntimeTraceBundle {
    RuntimeTraceBundle {
        schema: "threenative.runtime-traces",
        version: "0.1.0",
        slices: RuntimeTraceSlices {
            animation_state: RuntimeAnimationStateTrace {
                frame: 0,
                clips: Vec::new(),
            },
            physics_contacts: RuntimePhysicsContactsTrace {
                frame: 0,
                contacts: Vec::new(),
            },
            render_observation: RuntimeRenderObservationTrace {
                active_camera: active_camera.cloned(),
                camera_views: camera_views
                    .iter()
                    .map(|view| RuntimeCameraViewTrace {
                        camera_id: view.camera_id.clone(),
                        target_kind: view.target_kind.clone(),
                    })
                    .collect(),
                frame: 0,
                visible_entities: entities
                    .iter()
                    .filter(|entity| is_trace_visible(entity))
                    .map(|entity| entity.id.clone())
                    .collect(),
            },
            transform_snapshot: RuntimeTransformSnapshotTrace {
                frame: 0,
                entities: entities
                    .iter()
                    .filter_map(|entity| {
                        let transform = entity.transform.as_ref()?;
                        Some(RuntimeTransformTraceEntity {
                            components: entity.components.clone(),
                            entity_id: entity.id.clone(),
                            parent_id: entity.parent.clone(),
                            position: transform.position,
                            rotation: transform.rotation,
                            scale: transform.scale,
                        })
                    })
                    .collect(),
            },
            ui_tree: RuntimeUiTreeTrace {
                frame: 0,
                root: ui.map(|report| report.root.clone()),
            },
        },
    }
}

fn is_trace_visible(entity: &ConformanceEntityReport) -> bool {
    let Some(visibility) = entity.visibility.as_ref() else {
        return true;
    };
    visibility.visible != Some(false)
        && visibility.mesh_renderer_visible != Some(false)
        && visibility.runtime_visible != Some(false)
}

fn report_gltf_fidelity(bundle: &LoadedBundle) -> Option<ConformanceGltfFidelityReport> {
    let scene = bundle.gltf_scene.as_ref()?;
    let mut assets = scene
        .assets
        .iter()
        .map(report_gltf_asset)
        .collect::<Vec<_>>();
    assets.sort_by(|left, right| left.asset_id.cmp(&right.asset_id));
    Some(ConformanceGltfFidelityReport { assets })
}

fn report_gltf_asset(asset: &GltfSceneAssetIr) -> ConformanceGltfAssetReport {
    ConformanceGltfAssetReport {
        asset_id: asset.asset_id.clone(),
        custom_attributes: sorted_values(&asset.custom_attributes),
        materials: sorted_values(&asset.materials),
        morph_targets: sorted_values(&asset.morph_targets),
    }
}

fn sorted_values(values: &[serde_json::Value]) -> Vec<serde_json::Value> {
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.to_string().cmp(&right.to_string()));
    sorted
}

fn report_scene_lifecycle(bundle: &LoadedBundle) -> Option<SceneLifecycleRuntimeState> {
    let scenes = bundle.scenes.as_ref()?;
    Some(trace_scene_lifecycle(
        scenes,
        &[
            SceneLifecycleOperation::Change("level".to_owned()),
            SceneLifecycleOperation::Push("pause".to_owned()),
            SceneLifecycleOperation::Pop,
        ],
    ))
}

fn report_systems(bundle: &LoadedBundle) -> Option<Vec<ConformanceSystemReport>> {
    let systems = bundle.systems.as_ref()?;
    Some(
        systems
            .systems
            .iter()
            .map(|system| ConformanceSystemReport {
                name: system.name.clone(),
                queries: system
                    .queries
                    .iter()
                    .map(|query| ConformanceSystemQueryReport {
                        matched_entities: matched_entities(bundle, query),
                        with: query.with.clone(),
                        without: query.without.clone(),
                    })
                    .collect(),
            })
            .collect(),
    )
}

fn matched_entities(bundle: &LoadedBundle, query: &SystemQueryIr) -> Vec<String> {
    let mut matched = bundle
        .world
        .entities
        .iter()
        .filter(|entity| matches_query(entity, query))
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    matched.sort();
    matched
}

fn matches_query(entity: &WorldEntity, query: &SystemQueryIr) -> bool {
    let names = component_names(entity);
    query.with.iter().all(|component| names.contains(component))
        && query
            .without
            .iter()
            .all(|component| !names.contains(component))
}

fn report_profiler(bundle: &LoadedBundle) -> ConformanceProfilerReport {
    ConformanceProfilerReport {
        audio_voice_count: bundle
            .audio
            .as_ref()
            .map(|audio| audio.music.len() + audio.one_shots.len() + audio.tones.len())
            .unwrap_or(0),
        draw_count: bundle
            .world
            .entities
            .iter()
            .filter(|entity| entity.components.mesh_renderer.is_some())
            .count(),
        entity_count: bundle.world.entities.len(),
        frame_time_ms: 16.67,
        gpu_timing_available: false,
        gpu_timing_warning: Some(RuntimeDiagnostic {
            code: "TN_PROFILER_GPU_TIMING_UNAVAILABLE".to_owned(),
            message: "Native GPU/render-pass timing is unavailable for this support capture."
                .to_owned(),
            path: "target.profile.json/performance/profiler".to_owned(),
            severity: "warning".to_owned(),
        }),
        memory_estimate_bytes: bundle.assets.assets.len() * 1024
            + bundle.world.entities.len() * 256,
        render_time_ms: 8.0,
        save_latency_ms: bundle
            .local_data
            .as_ref()
            .map(|data| data.save_slots.len() as f32)
            .unwrap_or(0.0),
        ui_node_count: bundle.ui.as_ref().map(count_ui_nodes).unwrap_or(0),
        update_time_ms: 4.0,
    }
}

fn count_ui_nodes(ui: &UiIr) -> usize {
    count_ui_node(&ui.root)
}

fn count_ui_node(node: &threenative_loader::UiNodeIr) -> usize {
    1 + node.children.iter().map(count_ui_node).sum::<usize>()
}

fn report_camera_views(bundle: &LoadedBundle) -> Vec<ConformanceCameraViewReport> {
    let active_ids = active_camera_ids(bundle);
    let entity_by_id = bundle
        .world
        .entities
        .iter()
        .map(|entity| (entity.id.as_str(), entity))
        .collect::<HashMap<_, _>>();
    let mut views = active_ids
        .iter()
        .filter_map(|entity_id| {
            let entity = entity_by_id.get(entity_id.as_str())?;
            let camera = entity.components.camera.as_ref()?;
            let target = camera.target.as_ref();
            let target_kind = target
                .map(|value| value.kind.as_str())
                .unwrap_or("backbuffer");
            Some(ConformanceCameraViewReport {
                camera_id: entity_id.clone(),
                clear_mode: camera.clear.as_ref().map(|clear| clear.mode.clone()),
                export_path: camera
                    .output
                    .as_ref()
                    .and_then(|output| output.path.clone()),
                layers: camera
                    .layers
                    .clone()
                    .unwrap_or_else(|| vec!["default".to_owned()]),
                order: camera_order(camera),
                projection_kind: camera
                    .projection
                    .as_ref()
                    .map(|projection| projection.kind.clone()),
                projection_matrix_hash: camera
                    .projection
                    .as_ref()
                    .and_then(|projection| projection.matrix.as_ref())
                    .map(|matrix| {
                        matrix
                            .iter()
                            .map(|value| format!("{value:.6}"))
                            .collect::<Vec<_>>()
                            .join(",")
                    }),
                target_asset: target.and_then(|value| value.asset.clone()),
                target_kind: target_kind.to_owned(),
                viewport: camera.viewport.as_ref().map(|viewport| viewport.as_tuple()),
            })
        })
        .collect::<Vec<_>>();
    views.sort_by(|left, right| {
        left.order
            .cmp(&right.order)
            .then_with(|| left.camera_id.cmp(&right.camera_id))
    });
    views
}

fn report_active_camera(world: &mut World) -> Option<String> {
    let mut query = world.query::<(&ThreeNativeId, &Camera)>();
    query
        .iter(world)
        .find_map(|(id, camera)| camera.is_active.then(|| id.0.clone()))
}

fn report_runtime_config(
    config: Option<&RuntimeConfigIr>,
) -> Option<ConformanceRuntimeConfigReport> {
    let renderer = config.and_then(|config| config.renderer.as_ref())?;
    let render_look = runtime_render_look_report(renderer);
    let bloom_report = renderer
        .bloom
        .as_ref()
        .map(|bloom| RuntimeBloomReport {
            enabled: bloom.enabled,
            intensity: bloom.intensity,
            threshold: bloom.threshold,
        })
        .or_else(|| {
            renderer.render_look.as_ref().and_then(|render_look| {
                (render_look.profile == "balanced").then(|| RuntimeBloomReport {
                    enabled: true,
                    intensity: render_look
                        .overrides
                        .as_ref()
                        .and_then(|overrides| overrides.bloom_intensity)
                        .unwrap_or(0.25),
                    threshold: 0.85,
                })
            })
        });
    Some(ConformanceRuntimeConfigReport {
        renderer: Some(RuntimeRendererReport {
            antialias: Some(renderer.antialias.clone()),
            bloom: bloom_report,
            color_grading: renderer.color_grading.as_ref().map(|color_grading| {
                RuntimeColorGradingReport {
                    contrast: color_grading.contrast,
                    exposure: color_grading.exposure,
                    lut: color_grading.lut.clone(),
                    saturation: color_grading.saturation,
                    temperature: color_grading.temperature,
                    tint: color_grading.tint,
                    tone_mapping: color_grading.tone_mapping.clone(),
                }
            }),
            depth_of_field: renderer.depth_of_field.as_ref().map(|depth_of_field| {
                RuntimeDepthOfFieldReport {
                    aperture: depth_of_field.aperture,
                    enabled: depth_of_field.enabled,
                    focus_distance: depth_of_field.focus_distance,
                    max_blur: depth_of_field.max_blur,
                }
            }),
            post_processing: RuntimePostProcessingReport {
                applied: [
                    renderer
                        .bloom
                        .as_ref()
                        .and_then(|bloom| bloom.enabled.then(|| "bloom".to_owned())),
                    renderer.render_look.as_ref().and_then(|render_look| {
                        (renderer.bloom.is_none() && render_look.profile == "balanced")
                            .then(|| "bloom".to_owned())
                    }),
                    renderer
                        .color_grading
                        .as_ref()
                        .map(|_| "colorGrading".to_owned()),
                    renderer.depth_of_field.as_ref().and_then(|depth_of_field| {
                        depth_of_field.enabled.then(|| "depthOfField".to_owned())
                    }),
                    post_antialias_feature(renderer.antialias.as_str()),
                ]
                .into_iter()
                .flatten()
                .collect(),
                skipped: render_look
                    .as_ref()
                    .map(|render_look| {
                        render_look
                            .fallbacks
                            .iter()
                            .map(|fallback| RuntimePostProcessingSkipReport {
                                feature: fallback.feature.clone(),
                                reason: fallback.reason.clone(),
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            },
            render_look,
            render_path: renderer.render_path.clone(),
        }),
    })
}

fn runtime_render_look_report(renderer: &RuntimeRendererConfig) -> Option<RuntimeRenderLookReport> {
    let requested_profile = renderer
        .render_look
        .as_ref()
        .map(|render_look| render_look.profile.clone())
        .unwrap_or_else(|| "parity".to_owned());
    let applied_profile = if requested_profile == "balanced" {
        "balanced"
    } else {
        "parity"
    }
    .to_owned();
    let fallbacks = match requested_profile.as_str() {
        "cinematic" | "stylized" => vec![RuntimeRenderLookFallbackReport {
            code: "TN_RENDER_PROFILE_FALLBACK_USED".to_owned(),
            feature: format!("profile.{requested_profile}"),
            reason: "Bevy runtime only promotes parity and balanced render look profiles."
                .to_owned(),
        }],
        _ => Vec::new(),
    };
    Some(RuntimeRenderLookReport {
        applied_profile,
        fallbacks,
        overrides: renderer
            .render_look
            .as_ref()
            .and_then(|render_look| render_look.overrides.as_ref())
            .map(|overrides| RuntimeRenderLookOverridesReport {
                bloom_intensity: overrides.bloom_intensity,
                contrast: overrides.contrast,
                environment_intensity: overrides.environment_intensity,
                exposure: overrides.exposure,
                saturation: overrides.saturation,
                shadow_quality: overrides.shadow_quality.clone(),
            }),
        requested_profile,
    })
}

fn post_antialias_feature(mode: &str) -> Option<String> {
    match mode {
        "fxaa" | "taa" | "smaa" => Some(format!("antialias.{mode}")),
        _ => None,
    }
}

struct UiReportResult {
    report: Option<ConformanceUiReport>,
    diagnostic: Option<UiDiagnostic>,
}

fn report_audio(
    observation: Option<&audio::NativeAudioObservation>,
) -> Option<ConformanceAudioReport> {
    observation.map(|observation| ConformanceAudioReport {
        commands: observation
            .commands
            .iter()
            .map(report_audio_command)
            .collect(),
    })
}

fn report_audio_command(command: &NativeAudioCommand) -> ConformanceAudioCommandReport {
    ConformanceAudioCommandReport {
        asset: command.asset.clone(),
        bus: command.bus.clone(),
        emitter: command.emitter.clone(),
        event: command.event.clone(),
        id: command.id.clone(),
        kind: match &command.kind {
            NativeAudioCommandKind::Loop => "loop",
            NativeAudioCommandKind::OneShot => "oneShot",
            NativeAudioCommandKind::Tone => "tone",
        }
        .to_owned(),
        pitch: command.pitch,
        tone: command.tone.clone(),
        volume: command.volume,
    }
}

fn report_diagnostics(
    audio_observation: Option<&audio::NativeAudioObservation>,
    ui_report: Option<&UiReportResult>,
) -> Vec<RuntimeDiagnostic> {
    let mut diagnostics = Vec::new();
    if let Some(observation) = audio_observation {
        diagnostics.extend(observation.diagnostics.iter().map(runtime_audio_diagnostic));
    }
    if let Some(Some(diagnostic)) = ui_report.map(|report| report.diagnostic.as_ref()) {
        diagnostics.push(runtime_ui_diagnostic(diagnostic));
    }
    diagnostics.sort_by(|left, right| left.path.cmp(&right.path).then(left.code.cmp(&right.code)));
    diagnostics
}

fn runtime_audio_diagnostic(diagnostic: &NativeAudioDiagnostic) -> RuntimeDiagnostic {
    RuntimeDiagnostic {
        code: diagnostic.code.clone(),
        message: diagnostic.message.clone(),
        path: diagnostic.path.clone(),
        severity: diagnostic.severity.clone(),
    }
}

fn runtime_ui_diagnostic(diagnostic: &UiDiagnostic) -> RuntimeDiagnostic {
    RuntimeDiagnostic {
        code: diagnostic.code.clone(),
        message: diagnostic.message.clone(),
        path: diagnostic.path.clone(),
        severity: "error".to_owned(),
    }
}

fn report_events(bundle: &LoadedBundle) -> Vec<ConformanceEventReport> {
    let mut event_values = bundle
        .world
        .events
        .iter()
        .map(|(id, value)| (id.clone(), value.as_array().cloned().unwrap_or_default()))
        .collect::<HashMap<_, _>>();
    for event in detect_physics_events(bundle) {
        let values = event_values.entry(event.event).or_default();
        let payload = serde_json::json!({ "a": event.a, "b": event.b, "phase": event.phase });
        if !values.contains(&payload) {
            values.push(payload);
        }
    }
    let mut events = event_values
        .into_iter()
        .map(|(id, values)| ConformanceEventReport { id, values })
        .collect::<Vec<_>>();
    events.sort_by(|left, right| left.id.cmp(&right.id));
    events
}

fn report_resources(bundle: &LoadedBundle) -> Vec<ConformanceResourceReport> {
    let mut resources = bundle
        .world
        .resources
        .iter()
        .map(|(id, value)| ConformanceResourceReport {
            id: id.clone(),
            value: value.clone(),
        })
        .collect::<Vec<_>>();
    resources.sort_by(|left, right| left.id.cmp(&right.id));
    resources
}

fn report_light_budget(bundle: &LoadedBundle) -> Option<ConformanceLightBudgetReport> {
    let budget = bundle
        .world
        .resources
        .get("RenderingLightBudget")
        .and_then(|value| value.as_object());
    let mut dynamic_lights = bundle
        .world
        .entities
        .iter()
        .filter(|entity| {
            matches!(
                entity
                    .components
                    .light
                    .as_ref()
                    .map(|light| light.kind.as_str()),
                Some("directional" | "point" | "spot")
            )
        })
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    let mut shadowed_point_lights = bundle
        .world
        .entities
        .iter()
        .filter(|entity| {
            entity
                .components
                .light
                .as_ref()
                .map(|light| light.kind == "point" && light.shadow_filter.is_some())
                .unwrap_or(false)
        })
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    dynamic_lights.sort();
    shadowed_point_lights.sort();
    if budget.is_none() && dynamic_lights.is_empty() && shadowed_point_lights.is_empty() {
        return None;
    }
    let maximum_visible_dynamic_lights = budget
        .and_then(|budget| budget.get("maximumVisibleDynamicLights"))
        .and_then(|value| value.as_u64())
        .map(|value| value as usize);
    let maximum_shadowed_point_lights = budget
        .and_then(|budget| budget.get("maximumShadowedPointLights"))
        .and_then(|value| value.as_u64())
        .map(|value| value as usize);
    let culling_policy = budget
        .and_then(|budget| budget.get("cullingPolicy"))
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    let culled_lights = if culling_policy.as_deref() == Some("nearest") {
        maximum_visible_dynamic_lights
            .filter(|maximum| dynamic_lights.len() > *maximum)
            .map(|maximum| dynamic_lights.iter().skip(maximum).cloned().collect())
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    Some(ConformanceLightBudgetReport {
        culled_lights,
        culling_policy,
        dynamic_lights: dynamic_lights.clone(),
        maximum_shadowed_point_lights,
        maximum_visible_dynamic_lights,
        over_budget: maximum_visible_dynamic_lights
            .map(|maximum| dynamic_lights.len() > maximum)
            .unwrap_or(false)
            || maximum_shadowed_point_lights
                .map(|maximum| shadowed_point_lights.len() > maximum)
                .unwrap_or(false),
        shadowed_point_lights,
    })
}

fn report_ui(ui: Option<&UiIr>) -> Option<UiReportResult> {
    let ui = ui?;
    match build_native_ui(ui) {
        Ok(root) => Some(UiReportResult {
            report: Some(ConformanceUiReport {
                root: report_ui_node(&root),
            }),
            diagnostic: None,
        }),
        Err(diagnostic) => Some(UiReportResult {
            report: None,
            diagnostic: Some(diagnostic),
        }),
    }
}

fn report_ui_node(node: &crate::ui::NativeUiNode) -> ConformanceUiNodeReport {
    ConformanceUiNodeReport {
        accessibility_label: node.accessibility_label.clone(),
        action: node.action.clone(),
        children: node.children.iter().map(report_ui_node).collect(),
        focusable: node.focusable,
        id: node.id.clone(),
        kind: node.kind.clone(),
        label: node.label.clone(),
        max: node.max,
        role: node.role.clone(),
        src: node.src.clone(),
        text: node.text.clone(),
        value: node.value,
    }
}

struct RuntimeEntityReport {
    camera: Option<RuntimeCameraReport>,
    light: Option<RuntimeLightReport>,
    parent: Option<String>,
    transform: Option<TransformReport>,
    visible: Option<bool>,
}

fn runtime_entities_by_id(world: &mut World) -> HashMap<String, RuntimeEntityReport> {
    let mut ids_by_entity = HashMap::new();
    let mut id_query = world.query::<(Entity, &ThreeNativeId)>();
    for (entity, id) in id_query.iter(world) {
        ids_by_entity.insert(entity, id.0.clone());
    }

    let mut reports = HashMap::new();
    let mut query = world.query::<(
        Entity,
        &ThreeNativeId,
        Option<&Transform>,
        Option<&Parent>,
        Option<&Visibility>,
        Option<&DirectionalLight>,
        Option<&PointLight>,
        Option<&SpotLight>,
        Option<&Projection>,
    )>();
    for (_entity, id, transform, parent, visibility, directional, point, spot, projection) in
        query.iter(world)
    {
        reports.insert(
            id.0.clone(),
            RuntimeEntityReport {
                camera: projection.and_then(runtime_camera),
                light: runtime_light(directional, point, spot),
                parent: parent.and_then(|parent| ids_by_entity.get(&parent.get()).cloned()),
                transform: transform.map(|transform| TransformReport {
                    position: transform.translation.to_array(),
                    rotation: [
                        transform.rotation.x,
                        transform.rotation.y,
                        transform.rotation.z,
                        transform.rotation.w,
                    ],
                    scale: transform.scale.to_array(),
                }),
                visible: visibility.map(|visibility| !matches!(visibility, Visibility::Hidden)),
            },
        );
    }

    reports
}

fn runtime_camera(projection: &Projection) -> Option<RuntimeCameraReport> {
    match projection {
        Projection::Perspective(perspective) => Some(RuntimeCameraReport {
            far: Some(perspective.far),
            fov_y: Some(perspective.fov.to_degrees()),
            kind: "perspective".to_owned(),
            near: Some(perspective.near),
            size: None,
        }),
        Projection::Orthographic(orthographic) => Some(RuntimeCameraReport {
            far: Some(orthographic.far),
            fov_y: None,
            kind: "orthographic".to_owned(),
            near: Some(orthographic.near),
            size: match orthographic.scaling_mode {
                ScalingMode::FixedVertical(size) => Some(size),
                _ => None,
            },
        }),
    }
}

fn runtime_light(
    directional: Option<&DirectionalLight>,
    point: Option<&PointLight>,
    spot: Option<&SpotLight>,
) -> Option<RuntimeLightReport> {
    if let Some(light) = directional {
        return Some(RuntimeLightReport {
            angle: None,
            color: Some(color_report_from_bevy(light.color)),
            intensity: Some(light.illuminance / 2_000.0),
            kind: "directional".to_owned(),
            range: None,
            shadow_filter: None,
            shadow_bias: Some(light.shadow_depth_bias),
            shadow_normal_bias: Some(light.shadow_normal_bias),
        });
    }
    if let Some(light) = point {
        return Some(RuntimeLightReport {
            angle: None,
            color: Some(color_report_from_bevy(light.color)),
            intensity: Some(light.intensity / 800.0),
            kind: "point".to_owned(),
            range: Some(light.range),
            shadow_filter: None,
            shadow_bias: Some(light.shadow_depth_bias),
            shadow_normal_bias: Some(light.shadow_normal_bias),
        });
    }
    spot.map(|light| RuntimeLightReport {
        angle: Some(light.outer_angle),
        color: Some(color_report_from_bevy(light.color)),
        intensity: Some(light.intensity / 800.0),
        kind: "spot".to_owned(),
        range: Some(light.range),
        shadow_filter: None,
        shadow_bias: Some(light.shadow_depth_bias),
        shadow_normal_bias: Some(light.shadow_normal_bias),
    })
}

fn report_environment(environment: &EnvironmentSceneIr) -> ConformanceEnvironmentReport {
    let mut bookmarks = environment
        .bookmarks
        .iter()
        .map(|bookmark| bookmark.id.clone())
        .collect::<Vec<_>>();
    let mut instances = environment
        .instances
        .iter()
        .map(|instance| instance.id.clone())
        .collect::<Vec<_>>();
    let mut scatter = environment
        .scatter
        .iter()
        .map(|scatter| scatter.id.clone())
        .collect::<Vec<_>>();
    let mut source_assets = environment
        .source_assets
        .iter()
        .map(|asset| asset.id.clone())
        .collect::<Vec<_>>();
    let mut debug_gizmos = environment
        .source_assets
        .iter()
        .filter(|asset| {
            asset
                .debug
                .as_ref()
                .and_then(|debug| debug.gizmo)
                .unwrap_or(false)
        })
        .map(|asset| format!("sourceAsset:{}", asset.id))
        .chain(
            environment
                .instances
                .iter()
                .filter(|instance| {
                    instance
                        .debug
                        .as_ref()
                        .and_then(|debug| debug.gizmo)
                        .unwrap_or(false)
                })
                .map(|instance| format!("instance:{}", instance.id)),
        )
        .chain(
            environment
                .light_probes
                .iter()
                .map(|probe| format!("lightProbe:{}", probe.id)),
        )
        .collect::<Vec<_>>();
    let hlod_fades = environment
        .source_assets
        .iter()
        .flat_map(|asset| {
            asset.lod.iter().filter_map(|level| {
                level.fade.as_ref().map(|fade| HlodFadeReport {
                    asset: level.asset.clone(),
                    end_distance: fade.end_distance,
                    source_asset: asset.id.clone(),
                    start_distance: fade.start_distance,
                })
            })
        })
        .collect::<Vec<_>>();
    let lod_impostors = environment
        .source_assets
        .iter()
        .flat_map(|asset| {
            asset.lod.iter().filter_map(|level| {
                level.impostor.as_ref().map(|impostor| LodImpostorReport {
                    asset: level.asset.clone(),
                    material: impostor.material.clone(),
                    mode: impostor.mode.clone(),
                    source_asset: asset.id.clone(),
                })
            })
        })
        .collect::<Vec<_>>();
    let instance_visibility = environment
        .instances
        .iter()
        .filter_map(|instance| {
            instance
                .visibility
                .as_ref()
                .map(|visibility| visibility_report(&instance.id, visibility))
        })
        .collect::<Vec<_>>();
    let source_asset_visibility = environment
        .source_assets
        .iter()
        .filter_map(|asset| {
            asset
                .visibility
                .as_ref()
                .map(|visibility| visibility_report(&asset.id, visibility))
        })
        .collect::<Vec<_>>();

    bookmarks.sort();
    debug_gizmos.sort();
    instances.sort();
    scatter.sort();
    source_assets.sort();

    ConformanceEnvironmentReport {
        atmosphere: environment
            .atmosphere
            .as_ref()
            .map(|atmosphere| atmosphere.id.clone()),
        bookmarks,
        debug_gizmos: (!debug_gizmos.is_empty()).then_some(debug_gizmos),
        environment_map: environment.environment_map.clone(),
        hlod_fades: (!hlod_fades.is_empty()).then_some(hlod_fades),
        instances,
        instance_visibility: (!instance_visibility.is_empty()).then_some(instance_visibility),
        light_probes: (!environment.light_probes.is_empty())
            .then(|| environment.light_probes.clone()),
        lod_impostors: (!lod_impostors.is_empty()).then_some(lod_impostors),
        path: Some(environment.path.id.clone()),
        scatter,
        skybox: environment.skybox.clone(),
        source_assets,
        source_asset_visibility: (!source_asset_visibility.is_empty())
            .then_some(source_asset_visibility),
        terrain: environment
            .terrain
            .as_ref()
            .map(|terrain| terrain.id.clone()),
    }
}

fn visibility_report(
    id: &str,
    visibility: &threenative_loader::VisibilityRangeIr,
) -> VisibilityRangeReport {
    VisibilityRangeReport {
        end_distance: visibility.fade.as_ref().map(|fade| fade.end_distance),
        id: id.to_owned(),
        max_distance: visibility.max_distance,
        min_distance: visibility.min_distance,
        start_distance: visibility.fade.as_ref().map(|fade| fade.start_distance),
    }
}

fn report_asset(asset: &AssetIr) -> ConformanceAssetReport {
    ConformanceAssetReport {
        animations: asset.animations.as_ref().map(|clips| {
            let mut clips = clips.iter().map(report_animation_clip).collect::<Vec<_>>();
            clips.sort_by(|left, right| left.id.cmp(&right.id));
            clips
        }),
        bounds: asset.bounds.as_ref().map(|bounds| AssetBoundsReport {
            min: bounds.min,
            max: bounds.max,
        }),
        center: asset.center,
        format: asset.format.clone(),
        generation: asset.generation.as_ref().map(report_mesh_generation),
        id: asset.id.clone(),
        index_count: asset.indices.as_ref().map(Vec::len),
        kind: asset.kind.clone(),
        mag_filter: asset.mag_filter.clone(),
        min_filter: asset.min_filter.clone(),
        offset: asset.offset,
        path: asset.path.clone(),
        primitive: asset.primitive.clone(),
        repeat: asset.repeat,
        rotation: asset.rotation,
        size: asset.size.clone(),
        topology: asset.topology.clone(),
        usage: asset.usage.clone(),
        vertex_count: mesh_vertex_count(asset),
        wrap_s: asset.wrap_s.clone(),
        wrap_t: asset.wrap_t.clone(),
    }
}

fn report_mesh_generation(generation: &MeshGenerationIr) -> MeshGenerationReport {
    MeshGenerationReport {
        id: generation.id.clone(),
        source: generation.source.clone(),
        helper: generation.helper.clone(),
        seed: generation.seed,
    }
}

fn mesh_vertex_count(asset: &AssetIr) -> Option<usize> {
    asset
        .attributes
        .as_ref()?
        .iter()
        .find(|attribute| attribute.name == "position")
        .map(|attribute| attribute.values.len() / attribute.item_size)
}

fn report_animation_clip(clip: &AnimationClipIr) -> AnimationClipReport {
    AnimationClipReport {
        id: clip.id.clone(),
        loop_: clip.loop_,
        source_clip: clip.source_clip.clone(),
        speed: clip.speed,
    }
}

fn report_material(material: &MaterialIr) -> ConformanceMaterialReport {
    ConformanceMaterialReport {
        alpha_cutoff: material.alpha_cutoff,
        alpha_mode: material.alpha_mode.clone(),
        blend_mode: material.blend_mode.clone(),
        clearcoat: material.clearcoat,
        clearcoat_roughness: material.clearcoat_roughness,
        color: color_report(&material.color),
        depth_test: material.depth_test,
        depth_write: material.depth_write,
        emissive: material.emissive.as_ref().map(color_report),
        emissive_intensity: material.emissive_intensity,
        extension: material.extension.as_ref().map(|extension| {
            serde_json::json!({
                "preset": extension.preset,
                "doubleSided": extension.double_sided,
            })
        }),
        id: material.id.clone(),
        kind: material.kind.clone(),
        metalness: material.metalness,
        opacity: material.opacity,
        render_order: material.render_order,
        roughness: material.roughness,
        specular_intensity: material.specular_intensity,
        transmission: material.transmission,
        textures: MaterialTexturesReport {
            base_color: material.base_color_texture.clone(),
            clearcoat: material.clearcoat_texture.clone(),
            clearcoat_roughness: material.clearcoat_roughness_texture.clone(),
            emissive: material.emissive_texture.clone(),
            metallic_roughness: material.metallic_roughness_texture.clone(),
            normal: material.normal_texture.clone(),
            occlusion: material.occlusion_texture.clone(),
            specular: material.specular_texture.clone(),
            transmission: material.transmission_texture.clone(),
        },
    }
}

fn report_entity(
    entity: &WorldEntity,
    runtime: Option<&RuntimeEntityReport>,
) -> ConformanceEntityReport {
    ConformanceEntityReport {
        camera: entity
            .components
            .camera
            .as_ref()
            .map(|camera| CameraReport {
                far: camera.far,
                fov_y: camera.fov_y,
                kind: camera.kind.clone(),
                near: camera.near,
                runtime: runtime.and_then(|runtime| runtime.camera.clone()),
                size: camera.size,
            }),
        components: component_names(entity),
        id: entity.id.clone(),
        light: entity.components.light.as_ref().map(|light| LightReport {
            angle: light.angle,
            color: color_report(&light.color),
            intensity: light.intensity,
            kind: light.kind.clone(),
            range: light.range,
            shadow_filter: light
                .shadow_filter
                .as_ref()
                .map(|filter| ShadowFilterReport {
                    mode: filter.mode.clone(),
                    quality: filter.quality.clone(),
                }),
            shadow_bias: light.shadow_bias,
            shadow_normal_bias: light.shadow_normal_bias,
            runtime: runtime.and_then(|runtime| {
                runtime.light.as_ref().map(|runtime_light| {
                    let mut runtime_light = runtime_light.clone();
                    runtime_light.shadow_filter =
                        light
                            .shadow_filter
                            .as_ref()
                            .map(|filter| ShadowFilterReport {
                                mode: filter.mode.clone(),
                                quality: filter.quality.clone(),
                            });
                    runtime_light
                })
            }),
        }),
        material: entity
            .components
            .mesh_renderer
            .as_ref()
            .map(|renderer| renderer.material.clone()),
        mesh_renderer: entity.components.mesh_renderer.as_ref().map(|renderer| {
            MeshRendererReport {
                cast_shadow: renderer.cast_shadow,
                material: renderer.material.clone(),
                mesh: renderer.mesh.clone(),
                receive_shadow: renderer.receive_shadow,
                visible: renderer.visible,
            }
        }),
        mesh: entity
            .components
            .mesh_renderer
            .as_ref()
            .and_then(|renderer| renderer.mesh.clone()),
        parent: runtime.and_then(|runtime| runtime.parent.clone()),
        transform: runtime.and_then(|runtime| {
            runtime.transform.as_ref().map(|transform| TransformReport {
                position: transform.position,
                rotation: transform.rotation,
                scale: transform.scale,
            })
        }),
        visibility: report_visibility(entity, runtime),
    }
}

fn report_visibility(
    entity: &WorldEntity,
    runtime: Option<&RuntimeEntityReport>,
) -> Option<VisibilityReport> {
    if entity.components.visibility.is_none()
        && entity
            .components
            .mesh_renderer
            .as_ref()
            .and_then(|renderer| renderer.visible)
            .is_none()
        && runtime.and_then(|runtime| runtime.visible).is_none()
    {
        return None;
    }

    Some(VisibilityReport {
        mesh_renderer_visible: entity
            .components
            .mesh_renderer
            .as_ref()
            .and_then(|renderer| renderer.visible),
        runtime_visible: runtime.and_then(|runtime| runtime.visible),
        visible: entity
            .components
            .visibility
            .as_ref()
            .map(|visibility| visibility.visible),
    })
}

fn component_names(entity: &WorldEntity) -> Vec<String> {
    let mut names = Vec::new();
    if entity.components.camera.is_some() {
        names.push("Camera".to_owned());
    }
    if entity.components.collider.is_some() {
        names.push("Collider".to_owned());
    }
    if entity.components.hierarchy.is_some() {
        names.push("Hierarchy".to_owned());
    }
    if entity.components.light.is_some() {
        names.push("Light".to_owned());
    }
    if entity.components.mesh_renderer.is_some() {
        names.push("MeshRenderer".to_owned());
    }
    if entity.components.rigid_body.is_some() {
        names.push("RigidBody".to_owned());
    }
    if entity.components.transform.is_some() {
        names.push("Transform".to_owned());
    }
    if entity.components.visibility.is_some() {
        names.push("Visibility".to_owned());
    }
    names.extend(entity.components.extra.keys().cloned());
    names.sort();
    names
}

fn color_report(color: &ColorIr) -> ColorReport {
    match color {
        ColorIr::Hex(hex) => ColorReport::Hex(hex.clone()),
        ColorIr::Rgb(rgb) => ColorReport::Rgb(*rgb),
    }
}

fn color_report_from_bevy(color: Color) -> ColorReport {
    let color = color.to_srgba();
    let red = (color.red.clamp(0.0, 1.0) * 255.0).round() as u8;
    let green = (color.green.clamp(0.0, 1.0) * 255.0).round() as u8;
    let blue = (color.blue.clamp(0.0, 1.0) * 255.0).round() as u8;
    ColorReport::Hex(format!("#{red:02x}{green:02x}{blue:02x}"))
}
