use serde::{Deserialize, Serialize};
use serde_json::Value;
use threenative_loader::{
    EntityComponents, LoadedBundle, SystemCommandIr, SystemIr, TransformComponent, WorldEntity,
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

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeSystemCommandEffect {
    pub command: String,
    pub component: Option<String>,
    pub components: Option<Value>,
    pub entity: Option<String>,
    pub event: Option<String>,
    pub payload: Option<Value>,
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
    let diagnostics = validate_system_effects(system, effects);
    let log = native_effect_log(system, effects, frame, tick);
    if !diagnostics.is_empty() {
        return Err(diagnostics);
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

    Ok(log)
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
        SystemCommandIr::RemoveComponent { component, entity } => {
            command.command == "removeComponent"
                && command.component.as_ref() == Some(component)
                && command.entity.as_ref() == Some(entity)
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
        "despawn" => {
            let Some(entity_id) = command.entity.as_ref() else {
                return;
            };
            bundle
                .world
                .entities
                .retain(|entity| entity.id != *entity_id);
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
        "emitEvent" => {}
        _ => {}
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

    components.extra.insert(component.to_owned(), value);
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
