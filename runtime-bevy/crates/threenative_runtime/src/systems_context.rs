use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::{
    EntityComponents, LoadedBundle, SystemIr, SystemQueryIr, SystemStateSourceIr,
};

use crate::input::NativeInputState;
use crate::mesh_bounds::mesh_aabb;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSystemContextSnapshot {
    pub channel_events: BTreeMap<String, String>,
    pub component_hooks: BTreeMap<String, Vec<NativeComponentHookObservation>>,
    pub component_types: NativeComponentReflectionRegistry,
    pub entities: Vec<NativeSystemEntitySnapshot>,
    pub events: BTreeMap<String, Vec<Value>>,
    pub input: NativeSystemInputSnapshot,
    pub mesh_bounds: BTreeMap<String, NativeMeshBoundsSnapshot>,
    pub observer_routes: BTreeMap<String, BTreeMap<String, Vec<NativeObserverPropagationStep>>>,
    pub plugin_groups: Vec<NativePluginGroupDeclaration>,
    pub plugins: Vec<NativePluginDeclaration>,
    pub resources: BTreeMap<String, Value>,
    pub states: BTreeMap<String, Option<String>>,
    pub tasks: Vec<NativeTaskDeclaration>,
    pub time: NativeSystemTimeSnapshot,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeComponentReflectionRegistry {
    pub components: Vec<NativeComponentReflectionType>,
    pub schema: String,
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeComponentReflectionType {
    pub fields: Vec<NativeComponentReflectionField>,
    pub id: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeComponentReflectionField {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
    pub kind: String,
    pub name: String,
    pub required: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeComponentHookObservation {
    pub component: String,
    pub entity: String,
    pub hook: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTaskDeclaration {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    pub id: String,
    pub mode: String,
    pub schedule: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativePluginDeclaration {
    pub id: String,
    pub systems: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativePluginGroupDeclaration {
    pub id: String,
    pub plugins: Vec<String>,
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
pub struct NativeMeshBoundsSnapshot {
    pub max: [f64; 3],
    pub mesh: String,
    pub min: [f64; 3],
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
    build_system_context_snapshot_with_events_and_input(bundle, system, time, events, None)
}

pub fn build_system_context_snapshot_with_events_and_input(
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
    input: Option<&NativeInputState>,
) -> NativeSystemContextSnapshot {
    let readable_components = readable_components(system);
    let entities = bundle
        .world
        .entities
        .iter()
        .filter(|entity| matches_declared_queries(&entity.components, system))
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
        channel_events: channel_events(bundle),
        component_hooks: component_hook_observations(bundle),
        component_types: component_reflection_registry(bundle),
        entities,
        events: merged_event_queues(bundle, events),
        input: input.map_or_else(
            NativeSystemInputSnapshot::fixed_trace,
            NativeSystemInputSnapshot::from_native_input,
        ),
        mesh_bounds: mesh_bounds(bundle),
        observer_routes: observer_routes(bundle),
        plugin_groups: plugin_group_declarations(bundle),
        plugins: plugin_declarations(bundle),
        resources: bundle
            .world
            .resources
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        states: evaluate_states(bundle),
        tasks: task_declarations(bundle),
        time,
    }
}

pub fn mesh_bounds(bundle: &LoadedBundle) -> BTreeMap<String, NativeMeshBoundsSnapshot> {
    let assets_by_id = bundle
        .assets
        .assets
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<BTreeMap<_, _>>();
    bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            let renderer = entity.components.mesh_renderer.as_ref()?;
            if renderer.visible == Some(false) {
                return None;
            }
            let asset = assets_by_id.get(renderer.mesh.as_str())?;
            let bounds = mesh_aabb(asset)?;
            Some((
                entity.id.clone(),
                NativeMeshBoundsSnapshot {
                    max: bounds.max.map(f64::from),
                    mesh: renderer.mesh.clone(),
                    min: bounds.min.map(f64::from),
                },
            ))
        })
        .collect()
}

pub fn plugin_declarations(bundle: &LoadedBundle) -> Vec<NativePluginDeclaration> {
    bundle
        .systems
        .as_ref()
        .map(|systems| {
            systems
                .plugins
                .iter()
                .map(|plugin| NativePluginDeclaration {
                    id: plugin.id.clone(),
                    systems: plugin.systems.clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn plugin_group_declarations(bundle: &LoadedBundle) -> Vec<NativePluginGroupDeclaration> {
    bundle
        .systems
        .as_ref()
        .map(|systems| {
            systems
                .plugin_groups
                .iter()
                .map(|group| NativePluginGroupDeclaration {
                    id: group.id.clone(),
                    plugins: group.plugins.clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn channel_events(bundle: &LoadedBundle) -> BTreeMap<String, String> {
    bundle
        .systems
        .as_ref()
        .map(|systems| {
            systems
                .channels
                .iter()
                .filter(|channel| channel.delivery == "fixed-trace")
                .map(|channel| (channel.id.clone(), channel.event.clone()))
                .collect()
        })
        .unwrap_or_default()
}

pub fn task_declarations(bundle: &LoadedBundle) -> Vec<NativeTaskDeclaration> {
    bundle
        .systems
        .as_ref()
        .map(|systems| {
            systems
                .tasks
                .iter()
                .map(|task| NativeTaskDeclaration {
                    channel: task.channel.clone(),
                    id: task.id.clone(),
                    mode: task.mode.clone(),
                    schedule: task.schedule.clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn component_reflection_registry(bundle: &LoadedBundle) -> NativeComponentReflectionRegistry {
    let mut components = Vec::new();
    if let Some(schema_file) = bundle.component_schemas.as_ref() {
        let mut component_entries = schema_file.schemas.iter().collect::<Vec<_>>();
        component_entries.sort_by(|(left, _), (right, _)| left.cmp(right));
        for (id, schema) in component_entries {
            let mut fields = schema.fields.iter().collect::<Vec<_>>();
            fields.sort_by(|(left, _), (right, _)| left.cmp(right));
            components.push(NativeComponentReflectionType {
                fields: fields
                    .into_iter()
                    .map(|(name, field)| NativeComponentReflectionField {
                        default: field.default.clone(),
                        kind: field.kind.clone(),
                        name: name.clone(),
                        required: field.required,
                    })
                    .collect(),
                id: id.clone(),
            });
        }
    }
    NativeComponentReflectionRegistry {
        components,
        schema: "threenative.component-reflection".to_owned(),
        version: "0.1.0".to_owned(),
    }
}

pub fn component_hook_observations(
    bundle: &LoadedBundle,
) -> BTreeMap<String, Vec<NativeComponentHookObservation>> {
    let mut observations = BTreeMap::new();
    let Some(systems) = bundle.systems.as_ref() else {
        return observations;
    };
    for declaration in &systems.component_hooks {
        let mut component_observations = Vec::new();
        for entity in &bundle.world.entities {
            if component_value(&entity.components, &declaration.component).is_none() {
                continue;
            }
            for hook in &declaration.hooks {
                component_observations.push(NativeComponentHookObservation {
                    component: declaration.component.clone(),
                    entity: entity.id.clone(),
                    hook: hook.clone(),
                });
            }
        }
        observations.insert(declaration.component.clone(), component_observations);
    }
    observations
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
                route.extend(ancestor_ids(bundle, &entity.id).into_iter().map(|entity| {
                    NativeObserverPropagationStep {
                        entity,
                        phase: "bubble".to_owned(),
                    }
                }));
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
    let Some(lifecycle) = bundle
        .systems
        .as_ref()
        .and_then(|systems| systems.lifecycle.as_ref())
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

    pub fn from_native_input(input: &NativeInputState) -> Self {
        Self {
            actions: input.action_ids().map(|id| (id.clone(), true)).collect(),
            axes: input
                .axes()
                .map(|(id, value)| (id.clone(), *value))
                .collect(),
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

fn readable_components(system: &SystemIr) -> Vec<String> {
    let mut components = system.reads.clone();
    for query in &system.queries {
        components.extend(query.with.iter().cloned());
    }
    components.sort();
    components.dedup();
    components
}

fn matches_declared_queries(components: &EntityComponents, system: &SystemIr) -> bool {
    system.queries.is_empty()
        || system
            .queries
            .iter()
            .any(|query| matches_query(components, query))
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
