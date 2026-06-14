use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::{
    EntityComponents, LoadedBundle, SystemIr, SystemQueryIr, SystemStateSourceIr,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSystemContextSnapshot {
    pub entities: Vec<NativeSystemEntitySnapshot>,
    pub events: BTreeMap<String, Vec<Value>>,
    pub input: NativeSystemInputSnapshot,
    pub observer_routes: BTreeMap<String, BTreeMap<String, Vec<NativeObserverPropagationStep>>>,
    pub resources: BTreeMap<String, Value>,
    pub states: BTreeMap<String, Option<String>>,
    pub time: NativeSystemTimeSnapshot,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeSystemEntitySnapshot {
    pub id: String,
    pub components: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeObserverPropagationStep {
    pub entity: String,
    pub phase: String,
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
        events: merged_event_queues(bundle, events),
        input: NativeSystemInputSnapshot::fixed_trace(),
        observer_routes: observer_routes(bundle),
        resources: bundle
            .world
            .resources
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        states: evaluate_states(bundle),
        time,
    }
}

pub fn observer_routes(
    bundle: &LoadedBundle,
) -> BTreeMap<String, BTreeMap<String, Vec<NativeObserverPropagationStep>>> {
    let mut routes = BTreeMap::new();
    let Some(systems) = bundle.systems.as_ref() else {
        return routes;
    };
    for observer in &systems.observers {
        if observer.propagation != "target-ancestors" {
            continue;
        }
        let event_routes = routes
            .entry(observer.event.clone())
            .or_insert_with(BTreeMap::new);
        for entity in &bundle.world.entities {
            let mut route = Vec::new();
            if observer.phases.iter().any(|phase| phase == "target") {
                route.push(NativeObserverPropagationStep {
                    entity: entity.id.clone(),
                    phase: "target".to_owned(),
                });
            }
            if observer.phases.iter().any(|phase| phase == "bubble") {
                route.extend(
                    ancestor_ids(bundle, &entity.id)
                        .into_iter()
                        .map(|entity| NativeObserverPropagationStep {
                            entity,
                            phase: "bubble".to_owned(),
                        }),
                );
            }
            event_routes.insert(entity.id.clone(), route);
        }
    }
    routes
}

fn ancestor_ids(bundle: &LoadedBundle, target: &str) -> Vec<String> {
    let by_id = bundle
        .world
        .entities
        .iter()
        .map(|entity| (entity.id.as_str(), entity))
        .collect::<BTreeMap<_, _>>();
    let mut ancestors = Vec::new();
    let mut seen = vec![target.to_owned()];
    let mut current = by_id.get(target).copied();
    while let Some(entity) = current {
        let Some(parent) = entity
            .components
            .hierarchy
            .as_ref()
            .and_then(|hierarchy| hierarchy.parent.as_ref())
            .filter(|parent| !parent.is_empty())
        else {
            break;
        };
        if seen.iter().any(|value| value == parent) {
            break;
        }
        ancestors.push(parent.clone());
        seen.push(parent.clone());
        current = by_id.get(parent.as_str()).copied();
    }
    ancestors
}

pub fn evaluate_states(bundle: &LoadedBundle) -> BTreeMap<String, Option<String>> {
    let mut values = BTreeMap::new();
    let Some(lifecycle) = bundle.systems.as_ref().and_then(|systems| systems.lifecycle.as_ref())
    else {
        return values;
    };
    for state in &lifecycle.app_states {
        values.insert(
            state.id.clone(),
            Some(read_declared_state_value(
                bundle,
                &state.source,
                &state.values,
                &state.initial,
            )),
        );
    }
    for state in &lifecycle.computed_states {
        values.insert(
            state.id.clone(),
            Some(read_declared_state_value(
                bundle,
                &state.source,
                &state.values,
                &state.fallback,
            )),
        );
    }
    for state in &lifecycle.substates {
        let value = if values.get(&state.parent).and_then(|value| value.as_ref())
            == Some(&state.parent_value)
        {
            Some(read_declared_state_value(
                bundle,
                &state.source,
                &state.values,
                &state.fallback,
            ))
        } else {
            None
        };
        values.insert(state.id.clone(), value);
    }
    values
}

fn read_declared_state_value(
    bundle: &LoadedBundle,
    source: &SystemStateSourceIr,
    values: &[String],
    fallback: &str,
) -> String {
    let raw = bundle
        .world
        .resources
        .get(&source.resource)
        .and_then(|resource| resource.get(&source.field))
        .and_then(Value::as_str);
    match raw {
        Some(value) if values.iter().any(|candidate| candidate == value) => value.to_owned(),
        _ => fallback.to_owned(),
    }
}

fn merged_event_queues(
    bundle: &LoadedBundle,
    queued_events: BTreeMap<String, Vec<Value>>,
) -> BTreeMap<String, Vec<Value>> {
    let mut events = bundle
        .world
        .events
        .iter()
        .map(|(key, value)| (key.clone(), value.as_array().cloned().unwrap_or_default()))
        .collect::<BTreeMap<_, _>>();
    for (event, values) in queued_events {
        events.entry(event).or_default().extend(values);
    }
    events
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
                "layer": collider.layer,
                "mask": collider.mask,
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
