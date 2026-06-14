use std::collections::HashMap;

use bevy::prelude::*;
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    AssetIr, ColorIr, EnvironmentSceneIr, LoadedBundle, MaterialIr, WorldEntity,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceReport {
    pub assets: Vec<ConformanceAssetReport>,
    pub diagnostics: Vec<RuntimeDiagnostic>,
    pub entities: Vec<ConformanceEntityReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<ConformanceEnvironmentReport>,
    pub fixture: String,
    pub materials: Vec<ConformanceMaterialReport>,
    pub runtime: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceAssetReport {
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
}

#[derive(Debug, Serialize)]
pub struct LightReport {
    pub color: ColorReport,
    pub intensity: f32,
    pub kind: String,
}

#[derive(Debug, Serialize)]
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

    ConformanceReport {
        assets: bundle
            .assets
            .assets
            .iter()
            .map(report_asset)
            .collect::<Vec<_>>(),
        diagnostics: Vec::new(),
        entities,
        environment: bundle.environment_scene.as_ref().map(report_environment),
        fixture: fixture.into(),
        materials: bundle
            .materials
            .materials
            .iter()
            .map(report_material)
            .collect::<Vec<_>>(),
        runtime: "bevy".to_owned(),
    }
}

struct RuntimeEntityReport {
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
    )>();
    for (_entity, id, transform, parent, visibility) in query.iter(world) {
        reports.insert(
            id.0.clone(),
            RuntimeEntityReport {
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
            }),
        components: component_names(entity),
        id: entity.id.clone(),
        light: entity.components.light.as_ref().map(|light| LightReport {
            color: color_report(&light.color),
            intensity: light.intensity,
            kind: light.kind.clone(),
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
