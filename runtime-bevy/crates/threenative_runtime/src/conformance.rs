use std::collections::HashMap;

use bevy::prelude::*;
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{ColorIr, LoadedBundle, WorldEntity};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceReport {
    pub diagnostics: Vec<RuntimeDiagnostic>,
    pub entities: Vec<ConformanceEntityReport>,
    pub fixture: String,
    pub runtime: String,
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
    pub mesh: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<TransformReport>,
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
        diagnostics: Vec::new(),
        entities,
        fixture: fixture.into(),
        runtime: "bevy".to_owned(),
    }
}

struct RuntimeEntityReport {
    parent: Option<String>,
    transform: Option<TransformReport>,
}

fn runtime_entities_by_id(world: &mut World) -> HashMap<String, RuntimeEntityReport> {
    let mut ids_by_entity = HashMap::new();
    let mut id_query = world.query::<(Entity, &ThreeNativeId)>();
    for (entity, id) in id_query.iter(world) {
        ids_by_entity.insert(entity, id.0.clone());
    }

    let mut reports = HashMap::new();
    let mut query = world.query::<(Entity, &ThreeNativeId, Option<&Transform>, Option<&Parent>)>();
    for (_entity, id, transform, parent) in query.iter(world) {
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
            },
        );
    }

    reports
}

fn report_entity(
    entity: &WorldEntity,
    runtime: Option<&RuntimeEntityReport>,
) -> ConformanceEntityReport {
    ConformanceEntityReport {
        camera: entity.components.camera.as_ref().map(|camera| CameraReport {
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
    }
}

fn component_names(entity: &WorldEntity) -> Vec<String> {
    let mut names = Vec::new();
    if entity.components.camera.is_some() {
        names.push("Camera".to_owned());
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
    if entity.components.transform.is_some() {
        names.push("Transform".to_owned());
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
