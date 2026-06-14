use std::collections::HashMap;

use bevy::{prelude::*, render::camera::ScalingMode};
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    AnimationClipIr, AssetIr, ColorIr, EnvironmentSceneIr, LoadedBundle, MaterialIr, UiIr,
    WorldEntity,
};

use crate::audio::{self, NativeAudioCommand, NativeAudioCommandKind, NativeAudioDiagnostic};
use crate::physics::detect_physics_events;
use crate::ui::{UiDiagnostic, build_native_ui};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<ConformanceAudioReport>,
    pub assets: Vec<ConformanceAssetReport>,
    pub diagnostics: Vec<RuntimeDiagnostic>,
    pub entities: Vec<ConformanceEntityReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<ConformanceEnvironmentReport>,
    pub events: Vec<ConformanceEventReport>,
    pub fixture: String,
    pub materials: Vec<ConformanceMaterialReport>,
    pub resources: Vec<ConformanceResourceReport>,
    pub runtime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui: Option<ConformanceUiReport>,
}

#[derive(Debug, Serialize)]
pub struct ConformanceAudioReport {
    pub commands: Vec<ConformanceAudioCommandReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceAudioCommandReport {
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    pub id: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceAssetReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animations: Option<Vec<AnimationClipReport>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<AssetBoundsReport>,
    pub format: String,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primitive: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<Vec<f32>>,
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
    pub color: ColorReport,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metalness: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roughness: Option<f32>,
    pub textures: MaterialTexturesReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialTexturesReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emissive: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metallic_roughness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occlusion: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceEnvironmentReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atmosphere: Option<String>,
    pub bookmarks: Vec<String>,
    pub instances: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub scatter: Vec<String>,
    pub source_assets: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terrain: Option<String>,
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

#[derive(Debug, Serialize)]
pub struct ConformanceUiReport {
    pub root: ConformanceUiNodeReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceUiNodeReport {
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
    pub material: String,
    pub mesh: String,
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
pub struct LightReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angle: Option<f32>,
    pub color: ColorReport,
    pub intensity: f32,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<RuntimeLightReport>,
}

#[derive(Clone, Debug, Serialize)]
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

    ConformanceReport {
        audio: report_audio(audio_observation.as_ref()),
        assets: bundle
            .assets
            .assets
            .iter()
            .map(report_asset)
            .collect::<Vec<_>>(),
        diagnostics: report_diagnostics(audio_observation.as_ref(), ui_report.as_ref()),
        entities,
        environment: bundle.environment_scene.as_ref().map(report_environment),
        events: report_events(bundle),
        fixture: fixture.into(),
        materials: bundle
            .materials
            .materials
            .iter()
            .map(report_material)
            .collect::<Vec<_>>(),
        resources: report_resources(bundle),
        runtime: "bevy".to_owned(),
        ui: ui_report.and_then(|report| report.report),
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
        event: command.event.clone(),
        id: command.id.clone(),
        kind: match &command.kind {
            NativeAudioCommandKind::Loop => "loop",
            NativeAudioCommandKind::OneShot => "oneShot",
        }
        .to_owned(),
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
        action: node.action.clone(),
        children: node.children.iter().map(report_ui_node).collect(),
        focusable: node.focusable,
        id: node.id.clone(),
        kind: node.kind.clone(),
        label: node.label.clone(),
        max: node.max,
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
        });
    }
    if let Some(light) = point {
        return Some(RuntimeLightReport {
            angle: None,
            color: Some(color_report_from_bevy(light.color)),
            intensity: Some(light.intensity / 800.0),
            kind: "point".to_owned(),
            range: Some(light.range),
        });
    }
    spot.map(|light| RuntimeLightReport {
        angle: Some(light.outer_angle),
        color: Some(color_report_from_bevy(light.color)),
        intensity: Some(light.intensity / 800.0),
        kind: "spot".to_owned(),
        range: Some(light.range),
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

    bookmarks.sort();
    instances.sort();
    scatter.sort();
    source_assets.sort();

    ConformanceEnvironmentReport {
        atmosphere: environment
            .atmosphere
            .as_ref()
            .map(|atmosphere| atmosphere.id.clone()),
        bookmarks,
        instances,
        path: Some(environment.path.id.clone()),
        scatter,
        source_assets,
        terrain: environment
            .terrain
            .as_ref()
            .map(|terrain| terrain.id.clone()),
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
        format: asset.format.clone(),
        id: asset.id.clone(),
        kind: asset.kind.clone(),
        path: asset.path.clone(),
        primitive: asset.primitive.clone(),
        size: asset.size.clone(),
    }
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
        color: color_report(&material.color),
        id: material.id.clone(),
        kind: material.kind.clone(),
        metalness: material.metalness,
        roughness: material.roughness,
        textures: MaterialTexturesReport {
            base_color: material.base_color_texture.clone(),
            emissive: material.emissive_texture.clone(),
            metallic_roughness: material.metallic_roughness_texture.clone(),
            normal: material.normal_texture.clone(),
            occlusion: material.occlusion_texture.clone(),
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
            runtime: runtime.and_then(|runtime| runtime.light.clone()),
        }),
        material: entity
            .components
            .mesh_renderer
            .as_ref()
            .map(|renderer| renderer.material.clone()),
        mesh_renderer: entity.components.mesh_renderer.as_ref().map(|renderer| {
            MeshRendererReport {
                material: renderer.material.clone(),
                mesh: renderer.mesh.clone(),
                visible: renderer.visible,
            }
        }),
        mesh: entity
            .components
            .mesh_renderer
            .as_ref()
            .map(|renderer| renderer.mesh.clone()),
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
