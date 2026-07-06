use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use threenative_loader::{
    EntityComponents, HierarchyComponent, LoadedBundle, MeshRendererComponent, SystemCommandIr,
    SystemIr, TransformComponent, WorldEntity,
};

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct NativeSystemEffects {
    #[serde(default)]
    pub commands: Vec<NativeSystemCommandEffect>,
    #[serde(default)]
    pub events: Vec<NativeSystemEventEffect>,
    #[serde(default)]
    pub patches: Vec<NativeSystemPatchEffect>,
    #[serde(default)]
    pub resources: Vec<NativeSystemResourceEffect>,
    #[serde(default)]
    pub services: Vec<NativeSystemServiceEffect>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemPatchEffect {
    pub component: String,
    pub entity: String,
    pub value: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemEventEffect {
    pub event: String,
    pub payload: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemResourceEffect {
    pub resource: String,
    pub value: Value,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct NativeSystemCommandEffect {
    pub child: Option<String>,
    pub command: String,
    pub component: Option<String>,
    pub components: Option<Value>,
    pub entity: Option<String>,
    pub event: Option<String>,
    pub parent: Option<String>,
    pub payload: Option<Value>,
    pub prefab: Option<String>,
    pub prefix: Option<String>,
    pub value: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemServiceEffect {
    pub payload: Value,
    pub service: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeSystemEffectDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: String,
    pub severity: &'static str,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeSystemEffectLog {
    pub entries: Vec<NativeSystemEffectLogEntry>,
    pub schema: &'static str,
    pub version: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeSystemEffectsApplied {
    pub log: NativeSystemEffectLog,
    pub transform_patches: BTreeSet<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeSystemEffectLogEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    pub frame: u32,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    pub schedule: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
    pub system: String,
    pub tick: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}

pub fn apply_system_effects(
    bundle: &mut LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
) -> Result<NativeSystemEffectLog, Vec<NativeSystemEffectDiagnostic>> {
    apply_system_effects_with_report(bundle, system, effects, frame, tick)
        .map(|applied| applied.log)
}

pub fn apply_system_effects_with_report(
    bundle: &mut LoadedBundle,
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
) -> Result<NativeSystemEffectsApplied, Vec<NativeSystemEffectDiagnostic>> {
    let diagnostics = validate_system_effects(system, effects);
    let log = native_effect_log(system, effects, frame, tick);
    if !diagnostics.is_empty() {
        return Err(diagnostics);
    }
    let transform_patches = transform_patches_for_effects(effects);

    for event in &effects.events {
        apply_event(bundle, event);
    }
    for patch in &effects.patches {
        apply_patch(bundle, patch);
    }
    for command in &effects.commands {
        apply_command(bundle, command);
    }
    for resource in &effects.resources {
        apply_resource(bundle, resource);
    }

    Ok(NativeSystemEffectsApplied {
        log,
        transform_patches,
    })
}

pub fn validate_system_effects(
    system: &SystemIr,
    effects: &NativeSystemEffects,
) -> Vec<NativeSystemEffectDiagnostic> {
    let mut diagnostics = Vec::new();
    for command in &effects.commands {
        if !declares_command(system, command) {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_COMMAND_UNDECLARED",
                system,
                &format!("commands/{}", command.command),
                format!(
                    "System '{}' emitted undeclared command '{}'.",
                    system.name, command.command
                ),
            ));
        }
    }
    for patch in &effects.patches {
        if !system
            .writes
            .iter()
            .any(|component| component == &patch.component)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_WRITE_UNDECLARED",
                system,
                &format!("writes/{}", patch.component),
                format!(
                    "System '{}' patched undeclared component '{}'.",
                    system.name, patch.component
                ),
            ));
        }
    }
    for event in &effects.events {
        if !system
            .event_writes
            .iter()
            .any(|declared| declared == &event.event)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_EVENT_WRITE_UNDECLARED",
                system,
                &format!("eventWrites/{}", event.event),
                format!(
                    "System '{}' emitted undeclared event '{}'.",
                    system.name, event.event
                ),
            ));
        }
    }
    for resource in &effects.resources {
        if !system
            .resource_writes
            .iter()
            .any(|declared| declared == &resource.resource)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_RESOURCE_WRITE_UNDECLARED",
                system,
                &format!("resourceWrites/{}", resource.resource),
                format!(
                    "System '{}' wrote undeclared resource '{}'.",
                    system.name, resource.resource
                ),
            ));
        }
    }
    for service in &effects.services {
        if !system
            .services
            .iter()
            .any(|declared| declared == &service.service)
        {
            diagnostics.push(effect_diagnostic(
                "TN_BEVY_SYSTEM_SERVICE_UNDECLARED",
                system,
                &format!("services/{}", service.service),
                format!(
                    "System '{}' called undeclared service '{}'.",
                    system.name, service.service
                ),
            ));
        }
    }
    diagnostics
}

fn declares_command(system: &SystemIr, command: &NativeSystemCommandEffect) -> bool {
    system.commands.iter().any(|declared| match declared {
        SystemCommandIr::AddComponent { component, entity } => {
            command.command == "addComponent"
                && command.component.as_ref() == Some(component)
                && command.entity.as_ref() == Some(entity)
        }
        SystemCommandIr::Despawn { entity } => {
            command.command == "despawn" && command.entity.as_ref() == Some(entity)
        }
        SystemCommandIr::EmitEvent { event } => {
            command.command == "emitEvent" && command.event.as_ref() == Some(event)
        }
        SystemCommandIr::Instantiate { prefab, prefix } => {
            command.command == "instantiate"
                && command.prefab.as_ref() == Some(prefab)
                && command.prefix.as_ref() == Some(prefix)
        }
        SystemCommandIr::RemoveComponent { component, entity } => {
            command.command == "removeComponent"
                && command.component.as_ref() == Some(component)
                && command.entity.as_ref() == Some(entity)
        }
        SystemCommandIr::SetParent { child, parent } => {
            command.command == "setParent"
                && command.child.as_ref() == Some(child)
                && command.parent.as_ref() == Some(parent)
        }
        SystemCommandIr::ClearParent { child } => {
            command.command == "clearParent" && command.child.as_ref() == Some(child)
        }
        SystemCommandIr::SetComponent { component, entity } => {
            command.command == "setComponent"
                && command.component.as_ref() == Some(component)
                && command.entity.as_ref() == Some(entity)
        }
        SystemCommandIr::Spawn { components, entity } => {
            command.command == "spawn"
                && command.entity.as_ref() == Some(entity)
                && command
                    .components
                    .as_ref()
                    .and_then(Value::as_object)
                    .map(|values| {
                        values
                            .keys()
                            .all(|component| components.contains(component))
                    })
                    .unwrap_or(true)
        }
    })
}

fn transform_patches_for_effects(effects: &NativeSystemEffects) -> BTreeSet<String> {
    let mut entity_ids = effects
        .patches
        .iter()
        .filter(|patch| patch.component == "Transform")
        .map(|patch| patch.entity.clone())
        .collect::<BTreeSet<_>>();
    for command in &effects.commands {
        if matches!(command.command.as_str(), "addComponent" | "setComponent")
            && command.component.as_deref() == Some("Transform")
            && let Some(entity) = command.entity.as_ref()
        {
            entity_ids.insert(entity.clone());
        }
    }
    entity_ids
}

pub fn native_effect_log(
    system: &SystemIr,
    effects: &NativeSystemEffects,
    frame: u32,
    tick: u32,
) -> NativeSystemEffectLog {
    let mut entries = Vec::new();
    for event in &effects.events {
        entries.push(NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: Some(event.event.clone()),
            frame,
            kind: "event".to_owned(),
            payload: Some(event.payload.clone()),
            resource: None,
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: None,
        });
    }
    for patch in &effects.patches {
        entries.push(NativeSystemEffectLogEntry {
            command: Some("setComponent".to_owned()),
            component: Some(patch.component.clone()),
            entity: Some(patch.entity.clone()),
            event: None,
            frame,
            kind: "patch".to_owned(),
            payload: None,
            resource: None,
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: Some(patch.value.clone()),
        });
    }
    for command in &effects.commands {
        entries.push(NativeSystemEffectLogEntry {
            command: Some(command.command.clone()),
            component: command.component.clone(),
            entity: command.entity.clone(),
            event: command.event.clone(),
            frame,
            kind: "command".to_owned(),
            payload: command.payload.clone(),
            resource: None,
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: command.value.clone().or_else(|| command.components.clone()),
        });
    }
    for resource in &effects.resources {
        entries.push(NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: None,
            frame,
            kind: "resource".to_owned(),
            payload: None,
            resource: Some(resource.resource.clone()),
            schedule: system.schedule.clone(),
            service: None,
            system: system.name.clone(),
            tick,
            value: Some(resource.value.clone()),
        });
    }
    for service in &effects.services {
        entries.push(NativeSystemEffectLogEntry {
            command: None,
            component: None,
            entity: None,
            event: None,
            frame,
            kind: "service".to_owned(),
            payload: Some(service.payload.clone()),
            resource: None,
            schedule: system.schedule.clone(),
            service: Some(service.service.clone()),
            system: system.name.clone(),
            tick,
            value: None,
        });
    }
    entries.sort_by_key(effect_log_key);
    NativeSystemEffectLog {
        entries,
        schema: "threenative.web-system-effects",
        version: 1,
    }
}

fn apply_patch(bundle: &mut LoadedBundle, patch: &NativeSystemPatchEffect) {
    let Some(entity) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == patch.entity)
    else {
        return;
    };

    if patch.component == "Transform" {
        let existing = entity
            .components
            .transform
            .get_or_insert(TransformComponent {
                position: None,
                rotation: None,
                scale: None,
            });
        if let Some(position) = read_vec3(&patch.value, "position") {
            existing.position = Some(position);
        }
        if let Some(rotation) = read_vec4(&patch.value, "rotation") {
            existing.rotation = Some(rotation);
        }
        if let Some(scale) = read_vec3(&patch.value, "scale") {
            existing.scale = Some(scale);
        }
        return;
    }

    if patch.component == "MeshRenderer" {
        entity.components.mesh_renderer = read_mesh_renderer(&patch.value);
        return;
    }

    entity
        .components
        .extra
        .insert(patch.component.clone(), patch.value.clone());
}

fn apply_command(bundle: &mut LoadedBundle, command: &NativeSystemCommandEffect) {
    match command.command.as_str() {
        "spawn" => {
            let Some(entity_id) = command.entity.as_ref() else {
                return;
            };
            if bundle
                .world
                .entities
                .iter()
                .any(|entity| entity.id == *entity_id)
            {
                return;
            }
            let mut components = EntityComponents::default();
            if let Some(values) = command.components.as_ref().and_then(Value::as_object) {
                for (component, value) in values {
                    apply_component_value(&mut components, component, value.clone());
                }
            }
            bundle.world.entities.push(WorldEntity {
                id: entity_id.clone(),
                components,
            });
        }
        "instantiate" => {
            let (Some(prefab_id), Some(prefix)) =
                (command.prefab.as_ref(), command.prefix.as_ref())
            else {
                return;
            };
            let Some(prefabs) = bundle.prefabs.as_ref() else {
                return;
            };
            let Some(prefab) = prefabs
                .prefabs
                .iter()
                .find(|candidate| candidate.id == *prefab_id)
            else {
                return;
            };
            for template in &prefab.entities {
                let id = format!("{prefix}.{}", template.id);
                if bundle.world.entities.iter().any(|entity| entity.id == id) {
                    continue;
                }
                let mut components = template.components.clone();
                if let Some(hierarchy) = components.hierarchy.as_mut() {
                    if let Some(parent) = hierarchy.parent.as_ref() {
                        hierarchy.parent = Some(format!("{prefix}.{parent}"));
                    }
                }
                bundle.world.entities.push(WorldEntity { id, components });
            }
        }
        "despawn" => {
            let Some(entity_id) = command.entity.as_ref() else {
                return;
            };
            bundle
                .world
                .entities
                .retain(|entity| entity.id != *entity_id);
        }
        "setParent" => {
            let (Some(child), Some(parent)) = (command.child.as_ref(), command.parent.as_ref())
            else {
                return;
            };
            set_parent(bundle, child, parent);
        }
        "clearParent" => {
            let Some(child) = command.child.as_ref() else {
                return;
            };
            clear_parent(bundle, child);
        }
        "addComponent" | "setComponent" => {
            let (Some(entity_id), Some(component), Some(value)) = (
                command.entity.as_ref(),
                command.component.as_ref(),
                command.value.as_ref(),
            ) else {
                return;
            };
            let Some(entity) = bundle
                .world
                .entities
                .iter_mut()
                .find(|entity| entity.id == *entity_id)
            else {
                return;
            };
            apply_component_value(&mut entity.components, component, value.clone());
        }
        "removeComponent" => {
            let (Some(entity_id), Some(component)) =
                (command.entity.as_ref(), command.component.as_ref())
            else {
                return;
            };
            let Some(entity) = bundle
                .world
                .entities
                .iter_mut()
                .find(|entity| entity.id == *entity_id)
            else {
                return;
            };
            remove_component(&mut entity.components, component);
        }
        "emitEvent" => {
            let (Some(event), Some(payload)) = (command.event.as_ref(), command.payload.as_ref())
            else {
                return;
            };
            apply_event(
                bundle,
                &NativeSystemEventEffect {
                    event: event.clone(),
                    payload: payload.clone(),
                },
            );
        }
        _ => {}
    }
}

fn apply_event(bundle: &mut LoadedBundle, event: &NativeSystemEventEffect) {
    let queue = bundle
        .world
        .events
        .entry(event.event.clone())
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Value::Array(values) = queue {
        values.push(event.payload.clone());
    } else {
        *queue = Value::Array(vec![event.payload.clone()]);
    }
}

fn apply_resource(bundle: &mut LoadedBundle, resource: &NativeSystemResourceEffect) {
    bundle
        .world
        .resources
        .insert(resource.resource.clone(), resource.value.clone());
}

fn apply_component_value(components: &mut EntityComponents, component: &str, value: Value) {
    if component == "Transform" {
        let patch = NativeSystemPatchEffect {
            component: component.to_owned(),
            entity: String::new(),
            value,
        };
        let existing = components.transform.get_or_insert(TransformComponent {
            position: None,
            rotation: None,
            scale: None,
        });
        if let Some(position) = read_vec3(&patch.value, "position") {
            existing.position = Some(position);
        }
        if let Some(rotation) = read_vec4(&patch.value, "rotation") {
            existing.rotation = Some(rotation);
        }
        if let Some(scale) = read_vec3(&patch.value, "scale") {
            existing.scale = Some(scale);
        }
        return;
    }

    if component == "MeshRenderer" {
        components.mesh_renderer = read_mesh_renderer(&value);
        return;
    }

    if component == "Hierarchy" {
        components.hierarchy = Some(HierarchyComponent {
            parent: value
                .get("parent")
                .and_then(Value::as_str)
                .map(str::to_owned),
        });
        return;
    }

    components.extra.insert(component.to_owned(), value);
}

fn set_parent(bundle: &mut LoadedBundle, child_id: &str, parent_id: &str) {
    if child_id == parent_id || would_create_hierarchy_cycle(bundle, child_id, parent_id) {
        return;
    }
    if !bundle
        .world
        .entities
        .iter()
        .any(|entity| entity.id == parent_id)
    {
        return;
    }
    let Some(child) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == child_id)
    else {
        return;
    };
    let hierarchy = child
        .components
        .hierarchy
        .get_or_insert(HierarchyComponent { parent: None });
    hierarchy.parent = Some(parent_id.to_owned());
}

fn clear_parent(bundle: &mut LoadedBundle, child_id: &str) {
    let Some(child) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == child_id)
    else {
        return;
    };
    let hierarchy = child
        .components
        .hierarchy
        .get_or_insert(HierarchyComponent { parent: None });
    hierarchy.parent = None;
}

fn would_create_hierarchy_cycle(bundle: &LoadedBundle, child_id: &str, parent_id: &str) -> bool {
    let mut current = Some(parent_id);
    let mut visited = std::collections::BTreeSet::new();
    while let Some(entity_id) = current {
        if entity_id == child_id || !visited.insert(entity_id.to_owned()) {
            return true;
        }
        current = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == entity_id)
            .and_then(|entity| entity.components.hierarchy.as_ref())
            .and_then(|hierarchy| hierarchy.parent.as_deref());
    }
    false
}

fn read_mesh_renderer(value: &Value) -> Option<MeshRendererComponent> {
    let material = value.get("material").and_then(Value::as_str)?;
    Some(MeshRendererComponent {
        cast_shadow: value.get("castShadow").and_then(Value::as_bool),
        mesh: value.get("mesh").and_then(Value::as_str).map(str::to_owned),
        material: material.to_owned(),
        receive_shadow: value.get("receiveShadow").and_then(Value::as_bool),
        visible: value.get("visible").and_then(Value::as_bool),
    })
}

fn remove_component(components: &mut EntityComponents, component: &str) {
    match component {
        "Camera" => components.camera = None,
        "Collider" => components.collider = None,
        "Hierarchy" => components.hierarchy = None,
        "Light" => components.light = None,
        "MeshRenderer" => components.mesh_renderer = None,
        "RigidBody" => components.rigid_body = None,
        "Transform" => components.transform = None,
        "Visibility" => components.visibility = None,
        other => {
            components.extra.remove(other);
        }
    }
}

fn effect_log_key(entry: &NativeSystemEffectLogEntry) -> String {
    format!(
        "{:012}\0{:012}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}",
        entry.frame,
        entry.tick,
        entry.schedule,
        entry.system,
        entry.kind,
        entry.command.as_deref().unwrap_or(""),
        entry.entity.as_deref().unwrap_or(""),
        entry.component.as_deref().unwrap_or(""),
        entry.event.as_deref().unwrap_or(""),
        entry.resource.as_deref().unwrap_or(""),
        entry.service.as_deref().unwrap_or(""),
        serde_json::to_string(
            entry
                .payload
                .as_ref()
                .or(entry.value.as_ref())
                .unwrap_or(&Value::Null)
        )
        .unwrap_or_else(|_| "null".to_owned())
    )
}

fn read_vec3(value: &Value, field: &str) -> Option<[f32; 3]> {
    let values = value.get(field)?.as_array()?;
    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
    ])
}

fn read_vec4(value: &Value, field: &str) -> Option<[f32; 4]> {
    let values = value.get(field)?.as_array()?;
    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
        values.get(3)?.as_f64()? as f32,
    ])
}

fn effect_diagnostic(
    code: &'static str,
    system: &SystemIr,
    path: &str,
    message: String,
) -> NativeSystemEffectDiagnostic {
    NativeSystemEffectDiagnostic {
        code,
        message,
        path: format!("systems.ir.json/systems/{}/{}", system.name, path),
        severity: "error",
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;
    use threenative_loader::load_bundle;

    use super::*;

    #[test]
    fn rejects_undeclared_mixed_effects_before_applying_any_mutation() {
        let mut bundle = load_runtime_gameplay_host_bundle();
        let system = system_by_name(&bundle, "spawnRenderable");

        let result = apply_system_effects(
            &mut bundle,
            &system,
            &NativeSystemEffects {
                commands: vec![NativeSystemCommandEffect {
                    command: "spawn".to_owned(),
                    components: Some(json!({ "Transform": { "position": [0, 1, 0] } })),
                    entity: Some("marker".to_owned()),
                    ..Default::default()
                }],
                events: vec![NativeSystemEventEffect {
                    event: "TimerElapsed".to_owned(),
                    payload: json!({ "tick": 1 }),
                }],
                patches: vec![NativeSystemPatchEffect {
                    component: "Visibility".to_owned(),
                    entity: "player".to_owned(),
                    value: json!({ "visible": false }),
                }],
                resources: vec![NativeSystemResourceEffect {
                    resource: "Score".to_owned(),
                    value: json!({ "value": 2 }),
                }],
                services: vec![NativeSystemServiceEffect {
                    payload: json!({ "request": {}, "result": { "hit": false } }),
                    service: "physics.raycast".to_owned(),
                }],
            },
            0,
            0,
        );

        let diagnostics = result.expect_err("undeclared effects should be rejected");
        let mut codes = diagnostics
            .iter()
            .map(|diagnostic| diagnostic.code)
            .collect::<Vec<_>>();
        codes.sort();
        assert_eq!(
            codes,
            vec![
                "TN_BEVY_SYSTEM_COMMAND_UNDECLARED",
                "TN_BEVY_SYSTEM_EVENT_WRITE_UNDECLARED",
                "TN_BEVY_SYSTEM_RESOURCE_WRITE_UNDECLARED",
                "TN_BEVY_SYSTEM_SERVICE_UNDECLARED",
                "TN_BEVY_SYSTEM_WRITE_UNDECLARED",
            ]
        );
        assert!(
            bundle
                .world
                .entities
                .iter()
                .all(|entity| entity.id != "marker")
        );
        assert_eq!(
            bundle
                .world
                .resources
                .get("GameState")
                .and_then(|value| value.get("phase"))
                .and_then(Value::as_str),
            Some("boot")
        );
        assert!(!bundle.world.resources.contains_key("Score"));
        assert!(!bundle.world.events.contains_key("TimerElapsed"));
        let player = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "player")
            .expect("fixture should include player");
        assert!(!player.components.extra.contains_key("Visibility"));
    }

    #[test]
    fn produces_canonical_effect_log_ordering() {
        let mut bundle = load_runtime_gameplay_host_bundle();
        let system = system_by_name(&bundle, "spawnRenderable");

        let log = apply_system_effects(
            &mut bundle,
            &system,
            &NativeSystemEffects {
                commands: vec![NativeSystemCommandEffect {
                    command: "spawn".to_owned(),
                    components: Some(json!({ "Transform": { "position": [0, 1, 0] } })),
                    entity: Some("runtime.enemy".to_owned()),
                    ..Default::default()
                }],
                events: vec![NativeSystemEventEffect {
                    event: "Spawned".to_owned(),
                    payload: json!({ "entity": "runtime.enemy" }),
                }],
                patches: vec![NativeSystemPatchEffect {
                    component: "Transform".to_owned(),
                    entity: "player".to_owned(),
                    value: json!({ "position": [1, 0, 0] }),
                }],
                resources: vec![NativeSystemResourceEffect {
                    resource: "GameState".to_owned(),
                    value: json!({ "combat": "engaged", "phase": "playing" }),
                }],
                services: Vec::new(),
            },
            3,
            4,
        )
        .expect("declared effects should apply");

        assert_eq!(
            log.entries
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["command", "event", "patch", "resource"]
        );
    }

    fn load_runtime_gameplay_host_bundle() -> threenative_loader::LoadedBundle {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        load_bundle(
            repo_root.join("packages/ir/fixtures/conformance/runtime-gameplay-host/game.bundle"),
        )
        .expect("runtime gameplay host fixture should load")
    }

    fn system_by_name(bundle: &threenative_loader::LoadedBundle, name: &str) -> SystemIr {
        bundle
            .systems
            .as_ref()
            .and_then(|systems| systems.systems.iter().find(|system| system.name == name))
            .cloned()
            .unwrap_or_else(|| panic!("missing fixture system '{name}'"))
    }
}
