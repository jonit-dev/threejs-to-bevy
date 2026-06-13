use std::{collections::BTreeMap, fs};

use quickjs_rusty::Context;
use serde_json::{Value, json};
use thiserror::Error;
use threenative_loader::{LoadedBundle, SystemIr};

use crate::{
    systems_context::{NativeSystemTimeSnapshot, build_system_context_snapshot_with_events},
    systems_effects::{NativeSystemEffectLog, NativeSystemEffects, apply_system_effects},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemsHostDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub severity: &'static str,
    pub system_id: Option<String>,
}

#[derive(Debug, Error)]
#[error("{code}: {message}")]
pub struct SystemsHostError {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Default)]
pub struct NativeSystemsHostRun {
    pub logs: Vec<NativeSystemEffectLog>,
}

pub fn diagnose_native_system_host(bundle: &LoadedBundle) -> Vec<SystemsHostDiagnostic> {
    let mut diagnostics = Vec::new();
    if bundle.manifest.entry.scripts.is_none() {
        return diagnostics;
    }

    let Some(systems_ir) = bundle.systems.as_ref() else {
        diagnostics.push(SystemsHostDiagnostic {
            code: "TN_BEVY_SYSTEMS_IR_MISSING",
            message: "Bundle references scripts.bundle.js but does not include systems.ir.json."
                .to_owned(),
            severity: "error",
            system_id: None,
        });
        return diagnostics;
    };

    for system in &systems_ir.systems {
        let Some(script) = system.script.as_ref() else {
            diagnostics.push(SystemsHostDiagnostic {
                code: "TN_BEVY_SYSTEM_SCRIPT_MISSING",
                message: format!(
                    "System '{}' is present in systems.ir.json but does not declare a script export.",
                    system.name
                ),
                severity: "error",
                system_id: Some(system.name.clone()),
            });
            continue;
        };

        if Some(script.bundle.as_str()) != bundle.manifest.entry.scripts.as_deref() {
            diagnostics.push(SystemsHostDiagnostic {
                code: "TN_BEVY_SYSTEM_SCRIPT_BUNDLE_MISMATCH",
                message: format!(
                    "System '{}' references script bundle '{}' but manifest entry is '{}'.",
                    system.name,
                    script.bundle,
                    bundle.manifest.entry.scripts.as_deref().unwrap_or("<none>")
                ),
                severity: "error",
                system_id: Some(system.name.clone()),
            });
        }
    }

    diagnostics
}

pub fn ensure_native_system_host_supported(bundle: &LoadedBundle) -> Result<(), SystemsHostError> {
    let Some(diagnostic) = diagnose_native_system_host(bundle).into_iter().next() else {
        return Ok(());
    };

    Err(SystemsHostError {
        code: diagnostic.code,
        message: diagnostic.message,
    })
}

pub fn unsupported_native_system_host_diagnostic(
    system_id: impl Into<String>,
) -> SystemsHostDiagnostic {
    let system_id = system_id.into();
    SystemsHostDiagnostic {
        code: "TN_BEVY_SYSTEM_HOST_UNSUPPORTED",
        message: format!(
            "Native TypeScript system hosting is unavailable for system '{system_id}' in this build; enable the QuickJS host or use web preview."
        ),
        severity: "error",
        system_id: Some(system_id),
    }
}

pub fn run_native_systems_once(
    bundle: &mut LoadedBundle,
    time: NativeSystemTimeSnapshot,
) -> Result<NativeSystemsHostRun, SystemsHostError> {
    ensure_native_system_host_supported(bundle)?;
    if bundle.manifest.entry.scripts.is_none() {
        return Ok(NativeSystemsHostRun::default());
    }

    let systems = bundle
        .systems
        .as_ref()
        .map(|systems| systems.systems.as_slice())
        .unwrap_or(&[])
        .to_vec();
    if systems.is_empty() {
        return Ok(NativeSystemsHostRun::default());
    }

    let script_path = bundle
        .manifest
        .entry
        .scripts
        .as_ref()
        .map(|entry| bundle.bundle_path.join(entry))
        .ok_or_else(|| {
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_MISSING",
                "Bundle does not reference scripts.bundle.js.",
            )
        })?;
    let script_source = fs::read_to_string(&script_path).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_SCRIPT_READ_FAILED",
            format!("Failed to read {}: {source}", script_path.display()),
        )
    })?;

    let context = Context::builder().build().map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_HOST_INIT_FAILED",
            format!("Failed to initialize QuickJS host: {source}"),
        )
    })?;

    context
        .eval_module(&module_source(&script_source), true)
        .map_err(|source| {
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_LOAD_FAILED",
                format!("Failed to load scripts.bundle.js in QuickJS: {source}"),
            )
        })?;

    let mut events = BTreeMap::new();
    let mut logs = Vec::new();
    for schedule in ["fixedUpdate", "update", "postUpdate"] {
        for system in systems.iter().filter(|system| system.schedule == schedule) {
            let effects =
                call_system_export(&context, bundle, system, time.clone(), events.clone())?;
            queue_events(&mut events, &effects);
            let log =
                apply_system_effects(bundle, system, &effects, 1, 1).map_err(|diagnostics| {
                    let first = diagnostics
                        .into_iter()
                        .next()
                        .expect("invalid effects should include diagnostics");
                    host_error(first.code, first.message)
                })?;
            logs.push(log);
        }
    }

    Ok(NativeSystemsHostRun { logs })
}

fn call_system_export(
    context: &Context,
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
) -> Result<NativeSystemEffects, SystemsHostError> {
    let export_name = system
        .script
        .as_ref()
        .map(|script| script.export_name.as_str())
        .ok_or_else(|| {
            host_error(
                "TN_BEVY_SYSTEM_SCRIPT_MISSING",
                format!("System '{}' does not declare a script export.", system.name),
            )
        })?;
    let snapshot = build_system_context_snapshot_with_events(bundle, system, time, events);
    let snapshot_json = serde_json::to_string(&snapshot).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_CONTEXT_SERIALIZE_FAILED",
            format!(
                "Failed to serialize system '{}' context: {source}",
                system.name
            ),
        )
    })?;
    let invoke_source = format!(
        "{}\n__tnInvokeSystem({});",
        bridge_source(),
        json!({
            "exportName": export_name,
            "snapshot": serde_json::from_str::<Value>(&snapshot_json)
                .unwrap_or(Value::Null),
        })
    );

    let effects_json: String = context.eval_as(&invoke_source).map_err(|source| {
        let missing_fragment = format!("System export '{}' was not found", export_name);
        if source.to_string().contains(&missing_fragment) {
            return host_error(
                "TN_BEVY_SYSTEM_EXPORT_MISSING",
                format!(
                    "System '{}' references missing script export '{}'.",
                    system.name, export_name
                ),
            );
        }
        host_error(
            "TN_BEVY_SYSTEM_SCRIPT_EXECUTION_FAILED",
            format!(
                "Failed to execute system '{}' export '{}': {source}",
                system.name, export_name
            ),
        )
    })?;

    serde_json::from_str(&effects_json).map_err(|source| {
        host_error(
            "TN_BEVY_SYSTEM_EFFECTS_PARSE_FAILED",
            format!(
                "System '{}' export '{}' returned invalid effects: {source}",
                system.name, export_name
            ),
        )
    })
}

fn queue_events(events: &mut BTreeMap<String, Vec<Value>>, effects: &NativeSystemEffects) {
    for event in &effects.events {
        events
            .entry(event.event.clone())
            .or_default()
            .push(event.payload.clone());
    }
}

fn module_source(script_source: &str) -> String {
    format!(
        "{script_source}\nglobalThis.__tnExports = {{ systems, systemIds: typeof systemIds === 'undefined' ? {{}} : systemIds }};\n"
    )
}

fn bridge_source() -> &'static str {
    r#"
function __tnInvokeSystem(options) {
  const effects = { commands: [], events: [], patches: [], services: [] };
  const data = options.snapshot;
  const normalize = (handle) => typeof handle === "string" ? handle : (handle && typeof handle.name === "string" ? handle.name : String(handle));
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const readVec3 = (value, fallback) => Array.isArray(value) ? [Number(value[0] ?? fallback[0]), Number(value[1] ?? fallback[1]), Number(value[2] ?? fallback[2])] : fallback;
  const normalForAxis = (axis, sign) => axis === 0 ? [sign, 0, 0] : (axis === 1 ? [0, sign, 0] : [0, 0, sign]);
  const round6 = (value) => Number(value.toFixed(6));
  const readColliderSize = (collider) => {
    if (Array.isArray(collider?.size)) return readVec3(collider.size, [1, 1, 1]);
    if (typeof collider?.radius === "number") {
      const diameter = collider.radius * 2;
      return [diameter, typeof collider.height === "number" ? collider.height : diameter, diameter];
    }
    return [1, 1, 1];
  };
  const intersectAabb = (request, center, size) => {
    const half = size.map((value) => value / 2);
    const min = [center[0] - half[0], center[1] - half[1], center[2] - half[2]];
    const max = [center[0] + half[0], center[1] + half[1], center[2] + half[2]];
    let tMin = 0;
    let tMax = request.maxDistance;
    let normal = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const origin = request.origin[axis] ?? 0;
      const direction = request.direction[axis] ?? 0;
      if (Math.abs(direction) < 0.000001) {
        if (origin < min[axis] || origin > max[axis]) return { hit: false };
        continue;
      }
      const inv = 1 / direction;
      let near = (min[axis] - origin) * inv;
      let far = (max[axis] - origin) * inv;
      let axisNormal = normalForAxis(axis, direction > 0 ? -1 : 1);
      if (near > far) {
        [near, far] = [far, near];
      }
      if (near > tMin) {
        tMin = near;
        normal = axisNormal;
      }
      tMax = Math.min(tMax, far);
      if (tMin > tMax) return { hit: false };
    }
    const distance = round6(tMin);
    return {
      distance,
      hit: true,
      normal,
      point: [
        round6(request.origin[0] + request.direction[0] * distance),
        round6(request.origin[1] + request.direction[1] * distance),
        round6(request.origin[2] + request.direction[2] * distance)
      ]
    };
  };
  const raycast = (request) => {
    const ignored = new Set(request.ignore || []);
    let best = { hit: false };
    for (const entity of data.entities) {
      if (ignored.has(entity.id)) continue;
      const transform = entity.components.Transform;
      const collider = entity.components.Collider;
      if (!transform || !collider) continue;
      const hit = intersectAabb(request, readVec3(transform.position, [0, 0, 0]), readColliderSize(collider));
      if (hit.hit && (!best.hit || hit.distance < best.distance)) {
        best = { ...hit, entity: entity.id };
      }
    }
    return best;
  };
  const entities = data.entities.map((source) => ({
    id: source.id,
    components: clone(source.components),
    get(component) {
      return clone(source.components[normalize(component)]);
    },
    has(component) {
      return source.components[normalize(component)] !== undefined;
    },
    patch(component, value) {
      const name = normalize(component);
      effects.patches.push({ entity: source.id, component: name, value: { ...(source.components[name] || {}), ...clone(value) } });
    },
    set(component, value) {
      effects.patches.push({ entity: source.id, component: normalize(component), value: clone(value) });
    }
  }));
  const context = {
    time: data.time,
    input: {
      action(name) { return !!data.input.actions[name]; },
      axis(name) { return Number(data.input.axes[name] ?? 0); },
      pressed() { return false; },
      released() { return false; }
    },
    resources: {
      get(name) { return clone(data.resources[name]); },
      set() {}
    },
    query() {
      return entities;
    },
    events: {
      emit(event, payload) {
        effects.events.push({ event: normalize(event), payload: clone(payload) });
      },
      read(event) {
        return clone(data.events[normalize(event)] || []);
      }
    },
    commands: {
      spawn(entity, components = {}) {
        effects.commands.push({ command: "spawn", entity, components: clone(components) });
      },
      despawn(entity) {
        effects.commands.push({ command: "despawn", entity });
      },
      addComponent(entity, component, value = {}) {
        effects.commands.push({ command: "addComponent", entity, component: normalize(component), value: clone(value) });
      },
      removeComponent(entity, component) {
        effects.commands.push({ command: "removeComponent", entity, component: normalize(component) });
      },
      setComponent(entity, component, value) {
        effects.commands.push({ command: "setComponent", entity, component: normalize(component), value: clone(value) });
      },
      emitEvent(event, payload) {
        effects.commands.push({ command: "emitEvent", event: normalize(event), payload: clone(payload) });
      }
    },
    physics: {
      raycast(payload) {
        const request = clone(payload);
        const result = raycast(request);
        effects.services.push({ service: "physics.raycast", payload: { request, result } });
        return result;
      }
    },
    animation: {
      play(entity, clip, options = {}) {
        effects.services.push({ service: "animation.play", payload: { request: { entity, clip, options: clone(options) }, result: { accepted: true } } });
      }
    }
  };
  const fn = globalThis.__tnExports && globalThis.__tnExports.systems && globalThis.__tnExports.systems[options.exportName];
  if (typeof fn !== "function") {
    throw new Error(`System export '${options.exportName}' was not found in scripts bundle.`);
  }
  fn(context);
  return JSON.stringify(effects);
}
"#
}

fn host_error(code: &'static str, message: impl Into<String>) -> SystemsHostError {
    SystemsHostError {
        code,
        message: message.into(),
    }
}
