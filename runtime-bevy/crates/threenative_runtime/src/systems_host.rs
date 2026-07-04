use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
};

use quickjs_rusty::Context;
use serde_json::{json, Value};
use thiserror::Error;
use threenative_loader::{LoadedBundle, SystemIr};

use crate::{
    component_diff::ComponentDiffCache,
    input::NativeInputState,
    systems_context::{
        build_system_context_snapshot_with_events_input_and_diff, NativeSystemTimeSnapshot,
    },
    systems_effects::{apply_system_effects, NativeSystemEffectLog, NativeSystemEffects},
    systems_host_bridge::BRIDGE_SOURCE,
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
    let mut diff_cache = ComponentDiffCache::default();
    for schedule in ["startup", "fixedUpdate", "update", "postUpdate"] {
        let scheduled_systems = ordered_systems_for_schedule(&systems, schedule);
        let tracked_components = scheduled_systems
            .iter()
            .flat_map(|system| system.queries.iter())
            .flat_map(|query| query.changed.iter())
            .cloned()
            .collect::<Vec<_>>();
        diff_cache.begin_schedule_stage(bundle, &tracked_components);
        for system in scheduled_systems {
            let effects = call_system_export(
                &context,
                bundle,
                system,
                time.clone(),
                BTreeMap::new(),
                input,
                Some(&diff_cache),
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
    diff_cache: Option<&ComponentDiffCache>,
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
    let snapshot = build_system_context_snapshot_with_events_input_and_diff(
        bundle, system, time, events, input, diff_cache,
    );
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
        BRIDGE_SOURCE,
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

fn host_error(code: &'static str, message: impl Into<String>) -> SystemsHostError {
    SystemsHostError {
        code,
        message: message.into(),
    }
}
