use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
};

use quickjs_rusty::Context;
use serde_json::{json, Value};
use thiserror::Error;
use threenative_loader::{LoadedBundle, SystemIr};

use crate::{
    input::NativeInputState,
    systems_context::{
        build_system_context_snapshot_with_events_and_input, NativeSystemTimeSnapshot,
    },
    systems_effects::{apply_system_effects, NativeSystemEffectLog, NativeSystemEffects},
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
    run_native_systems_once_with_input(bundle, time, None)
}

pub fn run_native_systems_once_with_input(
    bundle: &mut LoadedBundle,
    time: NativeSystemTimeSnapshot,
    input: Option<&NativeInputState>,
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

    let mut logs = Vec::new();
    for schedule in ["startup", "fixedUpdate", "update", "postUpdate"] {
        let scheduled_systems = ordered_systems_for_schedule(&systems, schedule);
        for system in scheduled_systems {
            let effects = call_system_export(
                &context,
                bundle,
                system,
                time.clone(),
                BTreeMap::new(),
                input,
            )?;
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

fn ordered_systems_for_schedule<'a>(systems: &'a [SystemIr], schedule: &str) -> Vec<&'a SystemIr> {
    let mut scheduled = systems
        .iter()
        .filter(|system| system.schedule == schedule)
        .collect::<Vec<_>>();
    scheduled.sort_by(|left, right| left.name.cmp(&right.name));

    let mut by_name = BTreeMap::new();
    let mut outgoing: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut indegree: BTreeMap<String, usize> = BTreeMap::new();
    for system in &scheduled {
        by_name.insert(system.name.clone(), *system);
        outgoing.insert(system.name.clone(), BTreeSet::new());
        indegree.insert(system.name.clone(), 0);
    }
    for system in &scheduled {
        for target in &system.before {
            if by_name.contains_key(target) {
                add_order_edge(&system.name, target, &mut outgoing, &mut indegree);
            }
        }
        for source in &system.after {
            if by_name.contains_key(source) {
                add_order_edge(source, &system.name, &mut outgoing, &mut indegree);
            }
        }
    }

    let mut ready = indegree
        .iter()
        .filter_map(|(name, count)| (*count == 0).then_some(name.clone()))
        .collect::<Vec<_>>();
    ready.sort();
    let mut ordered = Vec::new();
    while !ready.is_empty() {
        let name = ready.remove(0);
        if let Some(system) = by_name.get(&name) {
            ordered.push(*system);
        }
        for next in outgoing
            .get(&name)
            .map(|targets| targets.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default()
        {
            if let Some(count) = indegree.get_mut(&next) {
                *count = count.saturating_sub(1);
                if *count == 0 {
                    ready.push(next);
                    ready.sort();
                }
            }
        }
    }

    if ordered.len() == scheduled.len() {
        ordered
    } else {
        scheduled
    }
}

fn add_order_edge(
    source: &str,
    target: &str,
    outgoing: &mut BTreeMap<String, BTreeSet<String>>,
    indegree: &mut BTreeMap<String, usize>,
) {
    if let Some(edges) = outgoing.get_mut(source) {
        if edges.insert(target.to_owned()) {
            *indegree.entry(target.to_owned()).or_insert(0) += 1;
        }
    }
}

fn call_system_export(
    context: &Context,
    bundle: &LoadedBundle,
    system: &SystemIr,
    time: NativeSystemTimeSnapshot,
    events: BTreeMap<String, Vec<Value>>,
    input: Option<&NativeInputState>,
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
    let snapshot =
        build_system_context_snapshot_with_events_and_input(bundle, system, time, events, input);
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

fn module_source(script_source: &str) -> String {
    format!(
        "{script_source}\nglobalThis.__tnExports = {{ systems, systemIds: typeof systemIds === 'undefined' ? {{}} : systemIds }};\n"
    )
}

fn bridge_source() -> &'static str {
    r#"
function __tnInvokeSystem(options) {
  const effects = { commands: [], events: [], patches: [], resources: [], services: [] };
  const data = options.snapshot;
  const normalize = (handle) => typeof handle === "string" ? handle : (handle && typeof handle.name === "string" ? handle.name : String(handle));
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const readVec3 = (value, fallback) => Array.isArray(value) ? [Number(value[0] ?? fallback[0]), Number(value[1] ?? fallback[1]), Number(value[2] ?? fallback[2])] : fallback;
  const readQuat = (value, fallback) => Array.isArray(value) ? [Number(value[0] ?? fallback[0]), Number(value[1] ?? fallback[1]), Number(value[2] ?? fallback[2]), Number(value[3] ?? fallback[3])] : fallback;
  const normalForAxis = (axis, sign) => axis === 0 ? [sign, 0, 0] : (axis === 1 ? [0, sign, 0] : [0, 0, sign]);
  const round6 = (value) => Number(value.toFixed(6));
  const roundVec3 = (value) => [round6(value[0]), round6(value[1]), round6(value[2])];
  const positiveNumber = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const hashSeed = (seed) => {
    const source = typeof seed === "string" || typeof seed === "number" || typeof seed === "boolean" ? String(seed) : JSON.stringify(seed);
    let hash = 2166136261;
    for (const char of (source || "0")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const createRandom = (seed) => {
    let state = hashSeed(seed);
    const next = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
    return {
      bool(probability = 0.5) { return next() < clamp01(probability); },
      float() { return next(); },
      int(min, max) {
        const lower = Math.ceil(Math.min(min, max));
        const upper = Math.floor(Math.max(min, max));
        if (upper < lower) return lower;
        return Math.floor(next() * (upper - lower + 1)) + lower;
      },
      pick(values) { return Array.isArray(values) && values.length > 0 ? values[Math.floor(next() * values.length)] : undefined; },
      range(min, max) { return next() * (max - min) + min; }
    };
  };
  const randomSeed = data.resources.Random && data.resources.Random.seed !== undefined ? data.resources.Random.seed : (data.resources.__randomSeed ?? 0);
  const finiteNumber = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const createTimers = (now) => {
    const normalizedNow = finiteNumber(now, 0);
    const elapsed = (start) => Math.max(0, normalizedNow - finiteNumber(start, normalizedNow));
    return {
      done(start, duration) { return elapsed(start) >= Math.max(0, finiteNumber(duration, 0)); },
      elapsed,
      progress(start, duration) {
        const total = Math.max(0, finiteNumber(duration, 0));
        return total === 0 ? 1 : Math.max(0, Math.min(1, elapsed(start) / total));
      },
      ready(lastRun, cooldown) { return elapsed(lastRun) >= Math.max(0, finiteNumber(cooldown, 0)); },
      remaining(start, duration) { return Math.max(0, Math.max(0, finiteNumber(duration, 0)) - elapsed(start)); }
    };
  };
  const assetById = (id) => data.assets.find((asset) => asset.id === id);
  const loadAsset = (id) => {
    const asset = assetById(id);
    return asset
      ? { accepted: true, asset: clone(asset), id, status: "ready" }
      : { accepted: false, asset: null, id, status: "missing" };
  };
  const changedValues = (value, entityId) => {
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value[entityId])) return value[entityId].filter((item) => typeof item === "string");
    if (value.entities && Array.isArray(value.entities[entityId])) return value.entities[entityId].filter((item) => typeof item === "string");
    return [];
  };
  const changedComponents = (entity) => new Set([
    ...changedValues(entity.components.__changed, entity.id),
    ...changedValues(data.resources.__changed, entity.id),
    ...changedValues(data.resources.Changed, entity.id)
  ]);
  const applyQuery = (source, query) => {
    const withComponents = Array.isArray(query.with) ? query.with.map(normalize) : [];
    const withoutComponents = Array.isArray(query.without) ? query.without.map(normalize) : [];
    const changed = Array.isArray(query.changed) ? query.changed.map(normalize) : [];
    const filtered = source.filter((entity) => {
      const changedSet = changedComponents(entity);
      return withComponents.every((component) => entity.components[component] !== undefined) &&
        withoutComponents.every((component) => entity.components[component] === undefined) &&
        changed.every((component) => changedSet.has(component));
    });
    const ordered = query.orderBy === "id" ? [...filtered].sort((left, right) => left.id.localeCompare(right.id)) : filtered;
    const offset = Math.max(0, Math.floor(Number(query.offset ?? 0)));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(Number(query.limit)));
    return ordered.slice(offset, limit === undefined ? undefined : offset + limit);
  };
  const normalizeVec3 = (value) => {
    const length = Math.hypot(value[0], value[1], value[2]);
    return length <= 0.000001 ? [0, 0, -1] : [value[0] / length, value[1] / length, value[2] / length];
  };
  const rotateVec3 = (value, quaternion) => {
    const [x, y, z] = value;
    const [qx, qy, qz, qw] = quaternion;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
  };
    const readColliderSize = (collider) => {
      if (Array.isArray(collider?.size)) return readVec3(collider.size, [1, 1, 1]);
      if (typeof collider?.radius === "number") {
        const diameter = collider.radius * 2;
        return [diameter, typeof collider.height === "number" ? collider.height : diameter, diameter];
      }
      return [1, 1, 1];
    };
    const readColliderHalfExtents = (collider) => {
      const size = readColliderSize(collider);
      return [size[0] / 2, size[1] / 2, size[2] / 2];
    };
    const queryHalfExtents = (shape) => {
      if (shape && shape.kind === "sphere") return [Number(shape.radius || 0), Number(shape.radius || 0), Number(shape.radius || 0)];
      if (shape && shape.kind === "box" && Array.isArray(shape.halfExtents)) return readVec3(shape.halfExtents, [0.5, 0.5, 0.5]);
      return [0.5, 0.5, 0.5];
    };
    const passesFilter = (collider, request) => {
      const mask = [...(request.mask || []), ...(request.layers || [])];
      const colliderLayer = typeof collider.layer === "string" ? collider.layer : undefined;
      if (mask.length > 0 && (!colliderLayer || !mask.includes(colliderLayer))) return false;
      if (request.layer && Array.isArray(collider.mask) && !collider.mask.includes(request.layer)) return false;
      return true;
    };
    const boundsOverlap = (left, right) => (
      Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
      Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
      Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
    );
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
        if (!passesFilter(collider, request)) continue;
        const hit = intersectAabb(request, readVec3(transform.position, [0, 0, 0]), readColliderSize(collider));
        if (hit.hit && (!best.hit || hit.distance < best.distance)) {
          best = { ...hit, entity: entity.id };
        }
      }
      return best;
    };
    const overlap = (request) => {
      const ignored = new Set(request.ignore || []);
      const queryBounds = { center: readVec3(request.position, [0, 0, 0]), halfExtents: queryHalfExtents(request.shape) };
      return {
        entities: data.entities
          .filter((entity) => !ignored.has(entity.id))
          .filter((entity) => {
            const transform = entity.components.Transform;
            const collider = entity.components.Collider;
            if (!transform || !collider || !passesFilter(collider, request)) return false;
            return boundsOverlap(queryBounds, {
              center: readVec3(transform.position, [0, 0, 0]),
              halfExtents: readColliderHalfExtents(collider)
            });
          })
          .map((entity) => entity.id)
          .sort()
      };
    };
    const shapeCast = (request) => {
      const ignored = new Set(request.ignore || []);
      const queryExtents = queryHalfExtents(request.shape);
      let best = { hit: false };
      for (const entity of data.entities) {
        if (ignored.has(entity.id)) continue;
        const transform = entity.components.Transform;
        const collider = entity.components.Collider;
        if (!transform || !collider || !passesFilter(collider, request)) continue;
        const size = readColliderSize(collider);
        const hit = intersectAabb(
          request,
          readVec3(transform.position, [0, 0, 0]),
          [size[0] + queryExtents[0] * 2, size[1] + queryExtents[1] * 2, size[2] + queryExtents[2] * 2]
        );
        if (hit.hit && (!best.hit || hit.distance < best.distance || (hit.distance === best.distance && entity.id < best.entity))) {
          best = { ...hit, entity: entity.id };
        }
      }
      return best;
    };
    const addVec3 = (left, right) => [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
    const scaleVec3 = (value, scalar) => [value[0] * scalar, value[1] * scalar, value[2] * scalar];
    const characterMovementDelta = (axisX, axisZ, speed, fixedDelta) => {
      const length = Math.hypot(axisX, axisZ);
      if (length === 0) return [0, 0, 0];
      const scale = speed * fixedDelta / Math.max(1, length);
      return [axisX * scale, 0, axisZ * scale];
    };
    const entityBounds = (entity) => {
      const collider = entity.components.Collider;
      if (!collider) return undefined;
      return {
        center: readVec3(entity.components.Transform && entity.components.Transform.position, [0, 0, 0]),
        halfExtents: readColliderHalfExtents(collider),
        id: entity.id,
        slope: collider.slope ? {
          angle: Math.atan2(Number(collider.slope.rise || 0), Number(collider.slope.run || 1)) * 180 / Math.PI,
          axis: collider.slope.axis,
          direction: Number(collider.slope.direction || 1),
          rise: Number(collider.slope.rise || 0),
          run: Number(collider.slope.run || 1)
        } : undefined,
        velocity: entity.components.RigidBody && Array.isArray(entity.components.RigidBody.velocity) ? readVec3(entity.components.RigidBody.velocity, [0, 0, 0]) : undefined
      };
    };
    const characterPenetrates = (left, right) => (
      Math.abs(left.center[0] - right.center[0]) < left.halfExtents[0] + right.halfExtents[0] - 0.00001 &&
      Math.abs(left.center[1] - right.center[1]) < left.halfExtents[1] + right.halfExtents[1] - 0.00001 &&
      Math.abs(left.center[2] - right.center[2]) < left.halfExtents[2] + right.halfExtents[2] - 0.00001
    );
    const coversXZ = (point, bounds) => (
      Math.abs(point[0] - bounds.center[0]) <= bounds.halfExtents[0] &&
      Math.abs(point[2] - bounds.center[2]) <= bounds.halfExtents[2]
    );
    const surfaceTop = (position, bounds) => {
      if (!bounds.slope) return bounds.center[1] + bounds.halfExtents[1];
      const axisIndex = bounds.slope.axis === "x" ? 0 : 2;
      const min = bounds.center[axisIndex] - bounds.halfExtents[axisIndex];
      const max = bounds.center[axisIndex] + bounds.halfExtents[axisIndex];
      const span = Math.max(0.0001, max - min);
      const distance = bounds.slope.direction === 1 ? position[axisIndex] - min : max - position[axisIndex];
      const t = Math.min(1, Math.max(0, distance / span));
      return bounds.center[1] - bounds.halfExtents[1] + t * bounds.slope.rise;
    };
    const canWalkSlope = (position, bounds, slopeLimit) => !bounds.slope || (coversXZ(position, bounds) && bounds.slope.angle <= slopeLimit + 0.0001);
    const canStepOnto = (position, characterHalfExtents, bounds, stepOffset) => {
      const foot = position[1] - characterHalfExtents[1];
      const top = surfaceTop(position, bounds);
      return stepOffset > 0 && top > foot + 0.02 && top <= foot + stepOffset + 0.02 && coversXZ(position, bounds);
    };
    const isSideBlocker = (position, characterHalfExtents, bounds) => surfaceTop(position, bounds) > position[1] - characterHalfExtents[1] + 0.02;
    const resolveHorizontalContact = (characterId, start, desired, characterHalfExtents, blockers, stepOffset, slopeLimit) => {
      let position = desired;
      let characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
      for (const blocker of blockers) {
        if (blocker.id === characterId) continue;
        const bounds = entityBounds(blocker);
        if (!bounds || !characterPenetrates(characterBounds, bounds) || !isSideBlocker(position, characterHalfExtents, bounds)) continue;
        if (bounds.slope && canWalkSlope(position, bounds, slopeLimit)) {
          position = [position[0], surfaceTop(position, bounds) + characterHalfExtents[1], position[2]];
          characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
          continue;
        }
        if (canStepOnto(position, characterHalfExtents, bounds, stepOffset)) {
          position = [position[0], surfaceTop(position, bounds) + characterHalfExtents[1], position[2]];
          characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
          continue;
        }
        return { blockedBy: blocker.id, position: start };
      }
      return { position };
    };
    const groundPosition = (characterId, position, characterHalfExtents, blockers, fixedDelta, slopeLimit) => {
      let ground;
      let groundTop;
      for (const blocker of blockers) {
        if (blocker.id === characterId) continue;
        const bounds = entityBounds(blocker);
        if (!bounds || !coversXZ(position, bounds) || !canWalkSlope(position, bounds, slopeLimit)) continue;
        const top = surfaceTop(position, bounds);
        const foot = position[1] - characterHalfExtents[1];
        if (top <= foot + 0.02 && (groundTop === undefined || top > groundTop)) {
          ground = bounds;
          groundTop = top;
        }
      }
      if (!ground || groundTop === undefined) return { position };
      const grounded = [position[0], groundTop + characterHalfExtents[1], position[2]];
      const platformDelta = ground.velocity ? scaleVec3(ground.velocity, fixedDelta) : undefined;
      return { entity: ground.id, platformDelta, position: platformDelta ? addVec3(grounded, platformDelta) : grounded };
    };
    const characterMove = (entityId, moveOptions = {}) => {
      const entity = data.entities.find((candidate) => candidate.id === entityId);
      const controller = entity && entity.components.CharacterController;
      const collider = entity && entity.components.Collider;
      if (!entity || !controller || !collider) return null;
      const fixedDelta = Number(moveOptions.fixedDelta ?? data.time.fixedDelta ?? 1);
      const axes = moveOptions.axes || {};
      const start = readVec3(entity.components.Transform && entity.components.Transform.position, [0, 0, 0]);
      const desired = addVec3(start, characterMovementDelta(
        Number(axes[controller.moveXAxis] ?? data.input.axes[controller.moveXAxis] ?? 0),
        Number(axes[controller.moveZAxis] ?? data.input.axes[controller.moveZAxis] ?? 0),
        Number(controller.speed ?? 0),
        fixedDelta
      ));
      const blockers = data.entities
        .filter((candidate) => candidate.components.Collider && candidate.components.Collider.trigger !== true)
        .sort((left, right) => left.id.localeCompare(right.id));
      const halfExtents = readColliderHalfExtents(collider);
      const slopeLimit = Number(controller.slopeLimit ?? 45);
      const horizontal = controller.blocking === true
        ? resolveHorizontalContact(entity.id, start, desired, halfExtents, blockers, Number(controller.stepOffset ?? 0), slopeLimit)
        : { position: desired };
      const ground = controller.grounding === "raycast"
        ? groundPosition(entity.id, horizontal.position, halfExtents, blockers, fixedDelta, slopeLimit)
        : { position: horizontal.position };
      return {
        ...(horizontal.blockedBy === undefined ? {} : { blockedBy: horizontal.blockedBy }),
        desired,
        entity: entity.id,
        ...(ground.entity === undefined ? {} : { groundEntity: ground.entity }),
        grounded: ground.entity !== undefined,
        ...(ground.platformDelta === undefined ? {} : { platformDelta: ground.platformDelta }),
        resolved: ground.position,
        start
      };
    };
    const sensorSnapshot = (payload = {}) => {
      const requestedPhases = new Set(payload.phases || ["enter", "stay", "exit"]);
      const events = [];
      const sensors = data.entities
        .filter((entity) => entity.components.Collider && entity.components.Collider.sensor)
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const sensor of sensors) {
        if (payload.sensor && payload.sensor !== sensor.id) continue;
        const collider = sensor.components.Collider;
        const sensorBounds = {
          center: readVec3(sensor.components.Transform && sensor.components.Transform.position, [0, 0, 0]),
          halfExtents: readColliderHalfExtents(collider)
        };
        const occupants = data.entities
          .filter((entity) => entity.id !== sensor.id && entity.components.Collider)
          .filter((entity) => boundsOverlap(sensorBounds, {
            center: readVec3(entity.components.Transform && entity.components.Transform.position, [0, 0, 0]),
            halfExtents: readColliderHalfExtents(entity.components.Collider)
          }))
          .filter((entity) => !Array.isArray(collider.mask) || collider.mask.length === 0 || collider.mask.includes(entity.components.Collider.layer))
          .map((entity) => entity.id)
          .sort()
          .slice(0, Number(collider.sensor.occupantLimit ?? data.entities.length));
        if (occupants.length > 0 && requestedPhases.has("enter")) {
          events.push({
            ...(collider.sensor.interactionKind === undefined ? {} : { interactionKind: collider.sensor.interactionKind }),
            filteredOut: [],
            occupants,
            phase: "enter",
            sensor: sensor.id,
            step: 1
          });
        }
      }
      return { events };
    };
    const pointInPolygon = (point, polygon) => {
      let inside = false;
      for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const current = polygon[index];
        const prior = polygon[previous];
        const intersects = ((current[1] > point[1]) !== (prior[1] > point[1])) &&
          point[0] < (prior[0] - current[0]) * (point[1] - current[1]) / (prior[1] - current[1]) + current[0];
        if (intersects) inside = !inside;
      }
      return inside;
    };
    const navigationRegionFor = (regions, point) => [...regions].sort((left, right) => left.id.localeCompare(right.id)).find((region) => pointInPolygon([point[0], point[2]], region.points || []));
    const navigationPath = (request) => {
      const navigation = data.resources.Navigation;
      const query = request.id || "query";
      if (!navigation || !Array.isArray(navigation.regions)) return { failureReason: "no-route", path: [], query, status: "failed", totalCost: 0, visitedRegions: [] };
      const start = navigationRegionFor(navigation.regions, readVec3(request.start, [0, 0, 0]));
      if (!start) return { failureReason: "start-outside", path: [], query, status: "failed", totalCost: 0, visitedRegions: [] };
      const goal = navigationRegionFor(navigation.regions, readVec3(request.goal, [0, 0, 0]));
      if (!goal) return { failureReason: "goal-outside", path: [], query, status: "failed", totalCost: 0, visitedRegions: [start.id] };
      const route = [start.id];
      if (start.id !== goal.id) {
        const neighbor = (start.neighbors || []).find((id) => id === goal.id);
        if (!neighbor) return { failureReason: "no-route", path: [], query, status: "failed", totalCost: 0, visitedRegions: [start.id] };
        route.push(goal.id);
      }
      return { path: [readVec3(request.start, [0, 0, 0]), readVec3(request.goal, [0, 0, 0])], query, status: "success", totalCost: route.length - 1, visitedRegions: route };
    };
    const pickMesh = (request) => {
      const ignored = new Set(request.ignore || []);
      let best = { hit: false };
      for (const entity of data.entities) {
        if (ignored.has(entity.id)) continue;
        const bounds = data.meshBounds[entity.id];
        const transform = entity.components.Transform;
        if (!bounds || !transform) continue;
        const position = readVec3(transform.position, [0, 0, 0]);
        const scale = readVec3(transform.scale, [1, 1, 1]);
        const localCenter = [
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2
        ];
        const center = [
          position[0] + localCenter[0] * scale[0],
          position[1] + localCenter[1] * scale[1],
          position[2] + localCenter[2] * scale[2]
        ];
        const size = [
          Math.abs((bounds.max[0] - bounds.min[0]) * scale[0]),
          Math.abs((bounds.max[1] - bounds.min[1]) * scale[1]),
          Math.abs((bounds.max[2] - bounds.min[2]) * scale[2])
        ];
        const hit = intersectAabb(request, center, size);
        if (hit.hit && (!best.hit || hit.distance < best.distance || (hit.distance === best.distance && entity.id < best.entity))) {
          best = { ...hit, entity: entity.id };
        }
      }
      return best;
    };
    const pointerRay = (request) => {
      const activeCamera = data.resources.ActiveCamera && typeof data.resources.ActiveCamera.entity === "string" ? data.resources.ActiveCamera.entity : undefined;
      const cameraId = typeof request.camera === "string" ? request.camera : activeCamera;
      let entity = cameraId
        ? data.entities.find((candidate) => candidate.id === cameraId && candidate.components.Camera)
        : data.entities.find((candidate) => candidate.components.Camera);
      if (!entity) entity = data.entities.find((candidate) => candidate.components.Camera);
      if (!entity) return { hit: false };
      const camera = entity.components.Camera;
      const transform = entity.components.Transform || {};
      const origin = readVec3(transform.position, [0, 0, 0]);
      const rotation = readQuat(transform.rotation, [0, 0, 0, 1]);
      const aspect = positiveNumber(request.aspect, 1);
      const maxDistance = positiveNumber(request.maxDistance, Number(camera.far || 100));
      const ndcX = Math.max(0, Math.min(1, Number(request.pointer?.[0] ?? 0.5))) * 2 - 1;
      const ndcY = 1 - Math.max(0, Math.min(1, Number(request.pointer?.[1] ?? 0.5))) * 2;
      if (camera.kind === "orthographic") {
        const size = positiveNumber(camera.size, 1);
        const offset = rotateVec3([ndcX * size * aspect * 0.5, ndcY * size * 0.5, 0], rotation);
        return {
          direction: roundVec3(normalizeVec3(rotateVec3([0, 0, -1], rotation))),
          hit: true,
          maxDistance,
          origin: roundVec3([origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]])
        };
      }
      const fovY = positiveNumber(camera.fovY, 60) * Math.PI / 180;
      const tanHalfFovY = Math.tan(fovY / 2);
      return {
        direction: roundVec3(normalizeVec3(rotateVec3([ndcX * tanHalfFovY * aspect, ndcY * tanHalfFovY, -1], rotation))),
        hit: true,
        maxDistance,
        origin: roundVec3(origin)
      };
    };
    const animations = {};
    const normalizeEntityRef = (entity) => typeof entity === "string" ? entity : entity.id;
    const roundScalar = (value) => Number(Number(value).toFixed(6));
    const positiveRuntimeNumber = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
    const nonNegativeRuntimeNumber = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
    const normalizedAnimationTime = (timeSeconds, durationSeconds, loop) => {
      if (durationSeconds <= 0) return 0;
      const normalized = timeSeconds / durationSeconds;
      return roundScalar(loop ? normalized % 1 : Math.min(1, normalized));
    };
    const createBlendState = (fromClip, toClip, durationSeconds, elapsedSeconds) => {
      const elapsed = Math.min(durationSeconds, Math.max(0, elapsedSeconds));
      const alpha = durationSeconds <= 0 ? 1 : elapsed / durationSeconds;
      return {
        complete: elapsed >= durationSeconds,
        durationSeconds: roundScalar(durationSeconds),
        elapsedSeconds: roundScalar(elapsed),
        fromClip,
        fromWeight: roundScalar(1 - alpha),
        toClip,
        toWeight: roundScalar(alpha)
      };
    };
    const serializeAnimationState = (state) => ({
      active: state.active,
      activeState: state.activeState,
      ...(state.blend === undefined ? {} : { blend: state.blend }),
      clip: state.clip,
      entity: state.entity,
      loop: state.loop,
      normalizedTime: normalizedAnimationTime(state.timeSeconds, state.durationSeconds, state.loop),
      sourceClip: state.sourceClip,
      speed: roundScalar(state.speed),
      stopped: state.stopped,
      ...(state.stopReason === undefined ? {} : { stopReason: state.stopReason }),
      timeSeconds: roundScalar(state.timeSeconds)
    });
    const stoppedAnimationState = (entity, clip, stopReason) => ({
      active: false,
      activeState: clip || "",
      clip: clip || "",
      entity,
      loop: false,
      normalizedTime: 0,
      sourceClip: clip || "",
      speed: 0,
      stopped: true,
      stopReason,
      timeSeconds: 0
    });
    const animationPlay = (entity, clip, options = {}) => {
      const entityId = normalizeEntityRef(entity);
      const previous = animations[entityId];
      const blendSeconds = positiveRuntimeNumber(options.blendSeconds, 0);
      const blendElapsedSeconds = nonNegativeRuntimeNumber(options.blendElapsedSeconds, 0);
      const blend = previous && previous.active && previous.clip !== clip && blendSeconds > 0
        ? createBlendState(previous.clip, clip, blendSeconds, blendElapsedSeconds)
        : undefined;
      const state = {
        active: true,
        activeState: typeof options.activeState === "string" ? options.activeState : clip,
        ...(blend === undefined ? {} : { blend }),
        clip,
        durationSeconds: positiveRuntimeNumber(options.durationSeconds, 1),
        entity: entityId,
        loop: typeof options.loop === "boolean" ? options.loop : true,
        sourceClip: typeof options.sourceClip === "string" ? options.sourceClip : clip,
        speed: positiveRuntimeNumber(options.speed, 1),
        stopped: false,
        timeSeconds: 0
      };
      animations[entityId] = state;
      return serializeAnimationState(state);
    };
    const animationQuery = (entity, clip) => {
      const entityId = normalizeEntityRef(entity);
      const state = animations[entityId];
      if (!state || (clip !== undefined && state.clip !== clip)) return stoppedAnimationState(entityId, clip, "not-found");
      return serializeAnimationState(state);
    };
    const animationStop = (entity, clip) => {
      const entityId = normalizeEntityRef(entity);
      const state = animations[entityId];
      if (!state || (clip !== undefined && state.clip !== clip)) {
        const stopped = stoppedAnimationState(entityId, clip, "requested");
        animations[entityId] = { ...stopped, durationSeconds: 1 };
        return stopped;
      }
      state.active = false;
      state.blend = undefined;
      state.stopped = true;
      state.stopReason = "requested";
      animations[entityId] = state;
      return serializeAnimationState(state);
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
    random: createRandom(randomSeed),
    timers: createTimers(data.time.elapsed),
    assets: {
      get(id) {
        return clone(assetById(normalize(id)) || null);
      },
      list() {
        return clone(data.assets);
      },
      load(id) {
        const request = { id: normalize(id) };
        const result = loadAsset(request.id);
        effects.services.push({ service: "assets.load", payload: { request, result } });
        return clone(result);
      }
    },
    character: {
      move(entity, options = {}) {
        const entityId = typeof entity === "string" ? entity : entity.id;
        const request = { entity: entityId, options: clone(options) };
        const result = characterMove(entityId, options);
        effects.services.push({ service: "character.move", payload: { request, result } });
        return clone(result);
      }
    },
    input: {
      action(name) { return !!data.input.actions[name]; },
      axis(name) { return Number(data.input.axes[name] ?? 0); },
      pressed() { return false; },
      released() { return false; }
    },
    observers: {
      propagate(event, target) {
        return clone((data.observerRoutes[normalize(event)] || {})[target] || []);
      }
    },
    components: {
      hooks(component) {
        return clone(data.componentHooks[normalize(component)] || []);
      },
      type(component) {
        return clone(data.componentTypes.components.find((type) => type.id === normalize(component)) || null);
      },
      types() {
        return clone(data.componentTypes);
      }
    },
    channels: {
      read(channel) {
        const event = data.channelEvents[normalize(channel)];
        return event ? clone(data.events[event] || []) : [];
      },
      send(channel, payload) {
        const event = data.channelEvents[normalize(channel)];
        if (event) effects.events.push({ event, payload: clone(payload) });
      }
    },
    resources: {
      get(name) { return clone(data.resources[name]); },
      set(name, value) {
        effects.resources.push({ resource: normalize(name), value: clone(value) });
      }
    },
    states: {
      get(id) {
        return data.states[normalize(id)] === undefined ? null : data.states[normalize(id)];
      }
    },
    tasks: {
      channel(id) {
        const task = data.tasks.find((entry) => entry.id === normalize(id));
        return task && typeof task.channel === "string" ? task.channel : null;
      },
      has(id) {
        return data.tasks.some((entry) => entry.id === normalize(id));
      },
      list() {
        return clone(data.tasks);
      }
    },
    plugins: {
      group(id) {
        return clone(data.pluginGroups.find((entry) => entry.id === normalize(id)) || null);
      },
      has(id) {
        return data.plugins.some((entry) => entry.id === normalize(id));
      },
      list() {
        return clone(data.plugins);
      }
    },
    query(query) {
      return applyQuery(entities, query === undefined ? (data.defaultQuery || { with: [], without: [] }) : query);
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
        overlap(payload) {
          const request = clone(payload);
          const result = overlap(request);
          effects.services.push({ service: "physics.overlap", payload: { request, result } });
          return result;
        },
        raycast(payload) {
          const request = clone(payload);
          const result = raycast(request);
          effects.services.push({ service: "physics.raycast", payload: { request, result } });
          return result;
        },
        shapeCast(payload) {
          const request = clone(payload);
          const result = shapeCast(request);
          effects.services.push({ service: "physics.shapeCast", payload: { request, result } });
          return result;
        },
        sensor(payload = {}) {
          const request = clone(payload);
          const result = sensorSnapshot(request);
          effects.services.push({ service: "physics.sensor", payload: { request, result } });
          return result;
        }
      },
    navigation: {
      path(payload) {
        const request = clone(payload);
        const result = navigationPath(request);
        effects.services.push({ service: "navigation.path", payload: { request, result } });
        return result;
      }
    },
    picking: {
      mesh(payload) {
        const request = clone(payload);
        const result = pickMesh(request);
        effects.services.push({ service: "picking.mesh", payload: { request, result } });
        return result;
      },
      pointerRay(payload) {
        const request = clone(payload);
        const result = pointerRay(request);
        effects.services.push({ service: "picking.pointerRay", payload: { request, result } });
        return result;
      }
    },
    animation: {
      play(entity, clip, options = {}) {
        const entityId = normalizeEntityRef(entity);
        const result = { ...animationPlay(entityId, clip, options), accepted: true };
        effects.services.push({ service: "animation.play", payload: { request: { entity: entityId, clip, options: clone(options) }, result } });
        return clone(result);
      },
      query(entity, clip) {
        const entityId = normalizeEntityRef(entity);
        const request = clip === undefined ? { entity: entityId } : { entity: entityId, clip };
        const result = animationQuery(entityId, clip);
        effects.services.push({ service: "animation.query", payload: { request, result } });
        return clone(result);
      },
      stop(entity, clip) {
        const entityId = normalizeEntityRef(entity);
        const request = clip === undefined ? { entity: entityId } : { entity: entityId, clip };
        const result = { ...animationStop(entityId, clip), accepted: true };
        effects.services.push({ service: "animation.stop", payload: { request, result } });
        return clone(result);
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
