use std::{collections::BTreeMap, env, path::Path};

use serde::Serialize;
use serde_json::Value;
use threenative_loader::load_bundle;
use threenative_runtime::{
    interactions::{
        NativeInteractionDiagnostic, NativeInteractionRuntimeState, NativeInteractionTrace,
        step_bundle_interactions,
    },
    trace_report::write_pretty_json_report,
};

const SNAPSHOT_ENTITIES: [&str; 4] = [
    "residual-overlap-source",
    "residual-small-outside",
    "residual-small-source",
    "residual-typed-source",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InteractionResidualReport {
    schema: &'static str,
    version: &'static str,
    adapter: &'static str,
    scenario: &'static str,
    traces: Vec<NativeInteractionTrace>,
    resources: BTreeMap<String, Value>,
    entities: Vec<String>,
    components: BTreeMap<String, BTreeMap<String, Value>>,
    component_storage: BTreeMap<String, BTreeMap<String, String>>,
    diagnostics: Vec<NativeInteractionDiagnostic>,
}

fn main() {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("usage: threenative_interaction_residual_trace <bundle-path> <output-json>");
        std::process::exit(2);
    }

    let mut bundle = load_bundle(Path::new(&args[1])).expect("load interaction residual bundle");
    bundle
        .interactions
        .as_mut()
        .expect("fixture should include interactions")
        .interactions
        .retain(|interaction| interaction.id.starts_with("residual-"));
    let mut state = NativeInteractionRuntimeState::default();
    let traces = step_bundle_interactions(&mut bundle, 0, &[], &mut state, None, None);
    let mut components = BTreeMap::new();
    let mut component_storage = BTreeMap::new();
    for id in SNAPSHOT_ENTITIES {
        let entity = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == id)
            .unwrap_or_else(|| panic!("missing residual snapshot entity '{id}'"));
        let values = entity.components.values();
        component_storage.insert(
            id.to_owned(),
            values
                .iter()
                .map(|(name, _)| {
                    (
                        name.clone(),
                        entity
                            .components
                            .storage(name)
                            .expect("serialized component should have storage")
                            .to_owned(),
                    )
                })
                .collect(),
        );
        components.insert(id.to_owned(), values.into_iter().collect());
    }
    let mut entities = bundle
        .world
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    entities.sort();
    let report = InteractionResidualReport {
        schema: "threenative.interaction-parity",
        version: "0.1.0",
        adapter: "native",
        scenario: "residuals",
        traces,
        resources: bundle.world.resources.into_iter().collect(),
        entities,
        components,
        component_storage,
        diagnostics: state.diagnostics,
    };
    write_pretty_json_report(&args[2], &report).expect("write interaction residual report");
}
