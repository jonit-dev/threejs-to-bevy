use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::{EntityComponents, LoadedBundle, SystemIr, SystemQueryIr};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSystemContextSnapshot {
    pub entities: Vec<NativeSystemEntitySnapshot>,
    pub events: BTreeMap<String, Vec<Value>>,
    pub input: NativeSystemInputSnapshot,
    pub resources: BTreeMap<String, Value>,
    pub time: NativeSystemTimeSnapshot,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeSystemEntitySnapshot {
    pub id: String,
    pub components: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSystemTimeSnapshot {
    pub delta: f32,
    pub dt: f32,
    pub elapsed: f32,
    pub fixed_delta: f32,
    pub fixed_dt: f32,
    pub paused: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct NativeSystemInputSnapshot {
    pub actions: BTreeMap<String, bool>,
    pub axes: BTreeMap<String, f32>,
}

pub fn build_system_context_snapshot(
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
) -> NativeSystemContextSnapshot {
    build_system_context_snapshot_with_events(bundle, system, time, BTreeMap::new())
}

pub fn build_system_context_snapshot_with_events(
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
) -> NativeSystemContextSnapshot {
    let query = system.queries.first();
    let readable_components = readable_components(system, query);
    let entities = bundle
        .world
        .entities
        .iter()
        .filter(|entity| query.map_or(true, |query| matches_query(&entity.components, query)))
        .map(|entity| NativeSystemEntitySnapshot {
            id: entity.id.clone(),
            components: readable_components
                .iter()
                .filter_map(|component| {
                    component_value(&entity.components, component)
                        .map(|value| (component.clone(), value))
                })
                .collect(),
        })
        .collect();

    NativeSystemContextSnapshot {
        entities,
        events,
        input: NativeSystemInputSnapshot::fixed_trace(),
        resources: bundle
            .world
            .resources
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        time,
    }
}

impl NativeSystemInputSnapshot {
    pub fn fixed_trace() -> Self {
        Self {
            actions: BTreeMap::from([("MoveForward".to_owned(), true), ("Jump".to_owned(), true)]),
            axes: BTreeMap::from([("MoveX".to_owned(), 1.0), ("MoveY".to_owned(), 0.0)]),
        }
    }
}

pub fn component_value(components: &EntityComponents, component: &str) -> Option<Value> {
    match component {
        "Camera" => components.camera.as_ref().map(|camera| {
            json!({
                "kind": camera.kind,
                "fovY": camera.fov_y,
                "near": camera.near,
                "far": camera.far,
                "priority": camera.priority,
                "size": camera.size,
            })
        }),
        "Collider" => components.collider.as_ref().map(|collider| {
            json!({
                "kind": collider.kind,
                "height": collider.height,
                "radius": collider.radius,
                "size": collider.size,
                "trigger": collider.trigger,
            })
        }),
        "Hierarchy" => components
            .hierarchy
            .as_ref()
            .map(|hierarchy| json!({ "parent": hierarchy.parent })),
        "Light" => components.light.as_ref().map(|light| {
            json!({
                "kind": light.kind,
                "color": light.color,
                "intensity": light.intensity,
            })
        }),
        "MeshRenderer" => components.mesh_renderer.as_ref().map(|renderer| {
            json!({
                "mesh": renderer.mesh,
                "material": renderer.material,
                "visible": renderer.visible,
            })
        }),
        "RigidBody" => components.rigid_body.as_ref().map(|rigid_body| {
            json!({
                "kind": rigid_body.kind,
                "mass": rigid_body.mass,
                "velocity": rigid_body.velocity,
            })
        }),
        "Transform" => components.transform.as_ref().map(transform_value),
        "Visibility" => components
            .visibility
            .as_ref()
            .map(|visibility| json!({ "visible": visibility.visible })),
        other => components.extra.get(other).cloned(),
    }
}

pub fn transform_value(transform: &threenative_loader::TransformComponent) -> Value {
    json!({
        "position": transform.position,
        "rotation": transform.rotation,
        "scale": transform.scale,
    })
}

fn readable_components(system: &SystemIr, query: Option<&SystemQueryIr>) -> Vec<String> {
    let mut components = system.reads.clone();
    if let Some(query) = query {
        components.extend(query.with.iter().cloned());
    }
    components.sort();
    components.dedup();
    components
}

fn matches_query(components: &EntityComponents, query: &SystemQueryIr) -> bool {
    query
        .with
        .iter()
        .all(|component| component_value(components, component).is_some())
        && query
            .without
            .iter()
            .all(|component| component_value(components, component).is_none())
}
