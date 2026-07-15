use std::collections::BTreeMap;

use serde::{Serialize, Serializer, ser::SerializeStruct};
use serde_json::{Value, json};
use threenative_loader::{
    EntityComponents, LoadedBundle, SystemIr, SystemQueryIr, SystemStateSourceIr, UiIr, UiNodeIr,
    WorldEntity,
};

use crate::component_diff::ComponentDiffCache;
use crate::input::NativeInputState;
use crate::mesh_bounds::mesh_aabb;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSystemContextSnapshot {
    pub audio_sounds: BTreeMap<String, NativeScriptAudioSound>,
    pub channel_events: BTreeMap<String, String>,
    pub assets: Vec<NativeAssetDeclaration>,
    pub component_hooks: BTreeMap<String, Vec<NativeComponentHookObservation>>,
    pub declared_queries: Vec<Value>,
    pub component_types: NativeComponentReflectionRegistry,
    pub default_query: Value,
    pub delayed_commands: Vec<NativeDelayedCommandDeclaration>,
    pub entities: Vec<NativeSystemEntitySnapshot>,
    pub events: BTreeMap<String, Vec<Value>>,
    pub input: NativeSystemInputSnapshot,
    #[serde(rename = "lifecycle")]
    pub lifecycle: NativeEntityLifecycleSnapshot,
    pub local_data: NativeLocalDataSnapshot,
    #[serde(rename = "feedbackPresets", skip_serializing_if = "Vec::is_empty")]
    pub feedback_presets: Vec<Value>,
    pub mesh_bounds: BTreeMap<String, NativeMeshBoundsSnapshot>,
    pub observer_routes: BTreeMap<String, BTreeMap<String, Vec<NativeObserverPropagationStep>>>,
    pub plugin_groups: Vec<NativePluginGroupDeclaration>,
    pub plugins: Vec<NativePluginDeclaration>,
    pub resources: BTreeMap<String, Value>,
    #[serde(rename = "sensorEvents", skip_serializing_if = "Vec::is_empty")]
    pub sensor_events: Vec<Value>,
    #[serde(rename = "runtimeChanged", skip_serializing_if = "BTreeMap::is_empty")]
    pub runtime_changed: BTreeMap<String, Vec<String>>,
    pub states: BTreeMap<String, Option<String>>,
    pub tasks: Vec<NativeTaskDeclaration>,
    #[serde(rename = "tagEntities")]
    pub tag_entities: Vec<NativeSystemEntitySnapshot>,
    pub time: NativeSystemTimeSnapshot,
    pub ui: Option<NativeUiSnapshot>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEntityLifecycleSnapshot {
    pub despawned: Vec<String>,
    pub spawned: Vec<String>,
    pub tags: BTreeMap<String, Vec<String>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDelayedCommandDeclaration {
    pub id: String,
    pub max_delay_ticks: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeScriptAudioSound {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
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
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetDeclaration {
    pub format: String,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub particle_emitters: Vec<NativeParticleEmitterDeclaration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primitive: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<Vec<f32>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeParticleEmitterDeclaration {
    pub id: String,
    pub lifetime_seconds: f32,
    pub max_particles: u32,
    pub rate_per_second: f32,
    pub shape: String,
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

#[derive(Clone, Debug)]
pub struct NativeSystemTimeSnapshot {
    pub delta: f32,
    pub dt: f32,
    pub elapsed: f32,
    pub fixed_delta: f32,
    pub fixed_dt: f32,
    pub paused: bool,
}

impl Serialize for NativeSystemTimeSnapshot {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("NativeSystemTimeSnapshot", 9)?;
        state.serialize_field("delta", &rounded_time(self.delta))?;
        state.serialize_field("deltaTime", &rounded_time(self.delta))?;
        state.serialize_field("dt", &rounded_time(self.dt))?;
        state.serialize_field("elapsed", &rounded_time(self.elapsed))?;
        state.serialize_field("fixedDelta", &rounded_time(self.fixed_delta))?;
        state.serialize_field("fixedDeltaTime", &rounded_time(self.fixed_delta))?;
        state.serialize_field("fixedDt", &rounded_time(self.fixed_dt))?;
        state.serialize_field("paused", &self.paused)?;
        state.serialize_field("time", &rounded_time(self.elapsed))?;
        state.end()
    }
}

fn rounded_time(value: f32) -> f64 {
    (f64::from(value) * 1_000_000.0).round() / 1_000_000.0
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct NativeSystemInputSnapshot {
    pub actions: BTreeMap<String, bool>,
    pub axes: BTreeMap<String, f32>,
    pub pressed: BTreeMap<String, bool>,
    pub released: BTreeMap<String, bool>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLocalDataSnapshot {
    pub components: Vec<NativeLocalDataSchemaEntry>,
    pub resources: Vec<NativeLocalDataSchemaEntry>,
    pub save_slots: Vec<NativeLocalDataSaveSlot>,
    pub settings: Vec<NativeLocalDataSetting>,
    pub persisted_saves: BTreeMap<String, Value>,
    pub persisted_settings: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize)]
pub struct NativeLocalDataSchemaEntry {
    pub id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLocalDataSaveSlot {
    pub app_version: String,
    pub id: String,
    pub schema_version: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLocalDataSetting {
    pub default_value: Value,
    pub enum_values: Vec<String>,
    pub key: String,
    pub kind: String,
    pub max: Option<f64>,
    pub min: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiSnapshot {
    pub focus_order: Option<Vec<String>>,
    pub nodes: Vec<NativeUiNodeSnapshot>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiNodeSnapshot {
    pub action: Option<String>,
    pub disabled: bool,
    pub focusable: bool,
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub text: Option<String>,
    pub value: Option<f32>,
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
    build_system_context_snapshot_with_events_input_and_diff(
        bundle, system, time, events, input, None,
    )
}

pub fn build_system_context_snapshot_with_events_input_and_diff(
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
    input: Option<&NativeInputState>,
    diff_cache: Option<&ComponentDiffCache>,
) -> NativeSystemContextSnapshot {
    build_system_context_snapshot_with_sensor_events(
        bundle,
        system,
        time,
        events,
        input,
        diff_cache,
        &[],
    )
}

pub fn build_system_context_snapshot_with_sensor_events(
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
    input: Option<&NativeInputState>,
    diff_cache: Option<&ComponentDiffCache>,
    sensor_events: &[Value],
) -> NativeSystemContextSnapshot {
    build_system_context_snapshot_with_sensor_events_and_lifecycle(
        bundle,
        system,
        time,
        events,
        input,
        diff_cache,
        sensor_events,
        NativeEntityLifecycleSnapshot::default(),
    )
}

pub fn build_system_context_snapshot_with_sensor_events_and_lifecycle(
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
    input: Option<&NativeInputState>,
    diff_cache: Option<&ComponentDiffCache>,
    sensor_events: &[Value],
    lifecycle: NativeEntityLifecycleSnapshot,
) -> NativeSystemContextSnapshot {
    let readable_components = readable_components(system);
    let entity_snapshot = |entity: &WorldEntity| NativeSystemEntitySnapshot {
        id: entity.id.clone(),
        components: readable_components
            .iter()
            .filter_map(|component| {
                component_value(&entity.components, component)
                    .map(|value| (component.clone(), value))
            })
            .collect(),
        tags: normalize_entity_tags(&entity.tags),
    };
    let entities = bundle
        .world
        .entities
        .iter()
        .filter(|entity| system_entity_matches_declared_queries(entity, system))
        .map(entity_snapshot)
        .collect();
    let tag_entities = bundle.world.entities.iter().map(entity_snapshot).collect();

    NativeSystemContextSnapshot {
        audio_sounds: audio_sounds(bundle),
        assets: asset_declarations(bundle),
        channel_events: channel_events(bundle),
        component_hooks: component_hook_observations(bundle),
        declared_queries: system.queries.iter().map(query_value).collect(),
        component_types: component_reflection_registry(bundle),
        default_query: system
            .queries
            .first()
            .map(query_value)
            .unwrap_or_else(|| json!({ "with": [], "without": [] })),
        delayed_commands: system
            .delayed_commands
            .iter()
            .map(|command| NativeDelayedCommandDeclaration {
                id: command.id.clone(),
                max_delay_ticks: command.max_delay_ticks,
            })
            .collect(),
        entities,
        events: merged_event_queues(bundle, events),
        feedback_presets: bundle
            .systems
            .as_ref()
            .map(|systems| systems.feedback_presets.clone())
            .unwrap_or_default(),
        input: input.map_or_else(
            NativeSystemInputSnapshot::neutral,
            NativeSystemInputSnapshot::from_native_input,
        ),
        lifecycle,
        local_data: local_data_snapshot(bundle),
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
        sensor_events: sensor_events.to_vec(),
        runtime_changed: diff_cache
            .map(|cache| cache.runtime_changed_map(bundle))
            .unwrap_or_default(),
        states: evaluate_states(bundle),
        tasks: task_declarations(bundle),
        tag_entities,
        time,
        ui: bundle.ui.as_ref().map(ui_snapshot),
    }
}

fn normalize_entity_tags(tags: &[String]) -> Vec<String> {
    let mut normalized = tags
        .iter()
        .filter(|tag| {
            !tag.trim().is_empty() && tag.len() <= 64 && !tag.chars().any(char::is_control)
        })
        .cloned()
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

fn local_data_snapshot(bundle: &LoadedBundle) -> NativeLocalDataSnapshot {
    let Some(local_data) = bundle.local_data.as_ref() else {
        return NativeLocalDataSnapshot::default();
    };

    let (persisted_saves, persisted_settings) =
        crate::persistence::native_persistence_snapshot(bundle).unwrap_or_default();

    NativeLocalDataSnapshot {
        components: local_data
            .components
            .iter()
            .map(|entry| NativeLocalDataSchemaEntry {
                id: entry.id.clone(),
            })
            .collect(),
        resources: local_data
            .resources
            .iter()
            .map(|entry| NativeLocalDataSchemaEntry {
                id: entry.id.clone(),
            })
            .collect(),
        save_slots: local_data
            .save_slots
            .iter()
            .map(|slot| NativeLocalDataSaveSlot {
                app_version: slot.app_version.clone(),
                id: slot.id.clone(),
                schema_version: slot.schema_version,
            })
            .collect(),
        settings: local_data
            .settings
            .iter()
            .map(|setting| NativeLocalDataSetting {
                default_value: setting.default_value.clone(),
                enum_values: setting.enum_values.clone(),
                key: setting.key.clone(),
                kind: setting.kind.clone(),
                max: setting.max,
                min: setting.min,
            })
            .collect(),
        persisted_saves,
        persisted_settings,
    }
}

fn ui_snapshot(ui: &UiIr) -> NativeUiSnapshot {
    let mut nodes = Vec::new();
    collect_ui_nodes(&ui.root, &mut nodes);
    NativeUiSnapshot {
        focus_order: ui.focus_order.clone(),
        nodes,
    }
}

fn collect_ui_nodes(node: &UiNodeIr, nodes: &mut Vec<NativeUiNodeSnapshot>) {
    let focusable = node.focusable.unwrap_or(false)
        || node.kind == "button"
        || node.kind == "textInput"
        || node.kind == "touchControl";
    nodes.push(NativeUiNodeSnapshot {
        action: node.action.clone(),
        disabled: node.disabled.unwrap_or(false),
        focusable,
        id: node.id.clone(),
        kind: node.kind.clone(),
        label: node.label.clone(),
        text: node.text.clone(),
        value: node.value,
    });
    for child in &node.children {
        collect_ui_nodes(child, nodes);
    }
}

pub fn audio_sounds(bundle: &LoadedBundle) -> BTreeMap<String, NativeScriptAudioSound> {
    let Some(audio) = bundle.audio.as_ref() else {
        return BTreeMap::new();
    };
    let mut sounds = BTreeMap::new();
    for music in &audio.music {
        sounds.insert(
            music.id.clone(),
            NativeScriptAudioSound {
                kind: "loop".to_owned(),
                volume: music.volume,
            },
        );
    }
    for one_shot in &audio.one_shots {
        sounds.insert(
            one_shot.id.clone(),
            NativeScriptAudioSound {
                kind: "oneShot".to_owned(),
                volume: one_shot.volume,
            },
        );
    }
    for tone in &audio.tones {
        sounds.insert(
            tone.id.clone(),
            NativeScriptAudioSound {
                kind: "tone".to_owned(),
                volume: tone.volume,
            },
        );
    }
    sounds
}

pub fn asset_declarations(bundle: &LoadedBundle) -> Vec<NativeAssetDeclaration> {
    bundle
        .assets
        .assets
        .iter()
        .map(|asset| NativeAssetDeclaration {
            format: asset.format.clone(),
            id: asset.id.clone(),
            kind: asset.kind.clone(),
            particle_emitters: asset
                .particle_emitters
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(|emitter| NativeParticleEmitterDeclaration {
                    id: emitter.id.clone(),
                    lifetime_seconds: emitter.lifetime_seconds,
                    max_particles: emitter.max_particles,
                    rate_per_second: emitter.rate_per_second,
                    shape: emitter.shape.clone(),
                })
                .collect(),
            path: asset.path.clone(),
            primitive: asset.primitive.clone(),
            size: asset.size.clone(),
        })
        .collect()
}

fn query_value(query: &SystemQueryIr) -> Value {
    json!({
        "changed": query.changed,
        "limit": query.limit,
        "offset": query.offset,
        "orderBy": query.order_by,
        "with": query.with,
        "without": query.without,
    })
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
            let mesh_id = renderer.mesh.as_deref()?;
            let asset = assets_by_id.get(mesh_id)?;
            let bounds = mesh_aabb(asset)?;
            Some((
                entity.id.clone(),
                NativeMeshBoundsSnapshot {
                    max: bounds.max.map(f64::from),
                    mesh: mesh_id.to_owned(),
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
        component_entries.sort_by_key(|(id, _)| *id);
        for (id, schema) in component_entries {
            let mut fields = schema.fields.iter().collect::<Vec<_>>();
            fields.sort_by_key(|(name, _)| *name);
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
    pub fn neutral() -> Self {
        Self {
            actions: BTreeMap::new(),
            axes: BTreeMap::new(),
            pressed: BTreeMap::new(),
            released: BTreeMap::new(),
        }
    }

    pub fn fixed_trace() -> Self {
        Self {
            actions: BTreeMap::from([("MoveForward".to_owned(), true), ("Jump".to_owned(), true)]),
            axes: BTreeMap::from([("MoveX".to_owned(), 1.0), ("MoveY".to_owned(), 0.0)]),
            pressed: BTreeMap::from([("MoveForward".to_owned(), true), ("Jump".to_owned(), true)]),
            released: BTreeMap::new(),
        }
    }

    pub fn from_native_input(input: &NativeInputState) -> Self {
        Self {
            actions: input.action_ids().map(|id| (id.clone(), true)).collect(),
            axes: input
                .axes()
                .map(|(id, value)| (id.clone(), *value))
                .collect(),
            pressed: input
                .pressed_action_ids()
                .map(|id| (id.clone(), true))
                .collect(),
            released: input
                .released_action_ids()
                .map(|id| (id.clone(), true))
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
        "Collider" => components
            .collider
            .as_ref()
            .and_then(|collider| serde_json::to_value(collider).ok()),
        "Hierarchy" => components
            .hierarchy
            .as_ref()
            .map(|hierarchy| json!({ "parent": hierarchy.parent })),
        "KinematicMover" => components.kinematic_mover.as_ref().map(|mover| {
            json!({
                "axis": mover.axis,
                "direction": mover.direction,
                "loop": mover.loop_enabled,
                "mode": mover.mode,
                "phase": mover.phase,
                "radius": mover.radius,
                "speed": mover.speed,
                "waypoints": mover.waypoints,
            })
        }),
        "Patrol" => components.patrol.as_ref().map(|patrol| {
            json!({
                "faceHeading": patrol.face_heading,
                "mode": patrol.mode,
                "pauseAtWaypoint": patrol.pause_at_waypoint,
                "paused": patrol.paused,
                "speed": patrol.speed,
                "waypoints": patrol.waypoints,
            })
        }),
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
        "RigidBody" => components
            .rigid_body
            .as_ref()
            .and_then(|rigid_body| serde_json::to_value(rigid_body).ok()),
        "Transform" => components.transform.as_ref().map(transform_value),
        "StateMachine" => components.state_machine.as_ref().map(|machine| {
            json!({
                "current": machine.current,
                "enabled": machine.enabled,
                "initial": machine.initial,
                "states": machine.states,
                "transitions": machine.transitions,
            })
        }),
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

fn system_entity_matches_declared_queries(entity: &WorldEntity, system: &SystemIr) -> bool {
    if system.queries.is_empty() {
        return true;
    }
    system
        .queries
        .iter()
        .any(|query| entity_matches_system_query(entity, query))
        || system
            .services
            .iter()
            .flat_map(|service| service_readable_components(service))
            .filter(|component| component != "Transform")
            .any(|component| entity_has_component(entity, component.as_str()))
}

fn entity_matches_system_query(entity: &WorldEntity, query: &SystemQueryIr) -> bool {
    query
        .with
        .iter()
        .chain(query.changed.iter())
        .all(|component| entity_has_component(entity, component))
        && query
            .without
            .iter()
            .all(|component| !entity_has_component(entity, component))
}

fn entity_has_component(entity: &WorldEntity, component: &str) -> bool {
    component_value(&entity.components, component).is_some()
}

fn readable_components(system: &SystemIr) -> Vec<String> {
    let mut components = system.reads.clone();
    for query in &system.queries {
        components.extend(query.changed.iter().cloned());
        components.extend(query.with.iter().cloned());
    }
    for service in &system.services {
        components.extend(service_readable_components(service));
    }
    components.sort();
    components.dedup();
    components
}

fn service_readable_components(service: &str) -> Vec<String> {
    match service {
        "character.move" => vec![
            "CharacterController".to_owned(),
            "Collider".to_owned(),
            "RigidBody".to_owned(),
            "Transform".to_owned(),
        ],
        "physics.overlap" | "physics.raycast" | "physics.sensor" | "physics.shapeCast" => vec![
            "Collider".to_owned(),
            "RigidBody".to_owned(),
            "Transform".to_owned(),
        ],
        "physics.addForce"
        | "physics.addTorque"
        | "physics.applyAngularImpulse"
        | "physics.applyImpulse"
        | "physics.setAngularVelocity"
        | "physics.setLinearVelocity" => vec![
            "Collider".to_owned(),
            "RigidBody".to_owned(),
            "Transform".to_owned(),
        ],
        "picking.mesh" => vec!["MeshRenderer".to_owned(), "Transform".to_owned()],
        "picking.pointerRay" => vec!["Camera".to_owned(), "Transform".to_owned()],
        _ => Vec::new(),
    }
}

pub fn canonical_component_value(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_owned())
}
