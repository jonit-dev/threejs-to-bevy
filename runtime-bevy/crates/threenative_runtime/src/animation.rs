use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;
use threenative_loader::{
    AnimationGraphIr, AnimationGraphStateIr, AnimationGraphTransitionIr, LoadedBundle,
    ParticleEmitterIr,
};

#[derive(Clone, Debug, Default)]
pub struct AnimationTraceInput {
    pub fixed_delta: f32,
    pub parameters: BTreeMap<String, Value>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTraceObservation {
    pub active_state: String,
    pub asset: String,
    pub clip: String,
    pub events: Vec<AnimationEventObservation>,
    pub initial_state: String,
    pub parameters: BTreeMap<String, Value>,
    pub particles: Vec<ParticleTraceObservation>,
    pub queued_events: Vec<AnimationQueuedEventObservation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition: Option<AnimationTransitionObservation>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTransitionObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend_seconds: Option<f32>,
    pub from: String,
    pub to: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationEventObservation {
    pub at_seconds: f32,
    pub event: String,
    pub state: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationQueuedEventObservation {
    pub event: String,
    pub payload: AnimationQueuedEventPayload,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationQueuedEventPayload {
    pub asset: String,
    pub at_seconds: f32,
    pub clip: String,
    pub state: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleTraceObservation {
    pub id: String,
    pub lifetime_seconds: f32,
    pub max_particles: u32,
    pub shape: String,
    pub spawned: u32,
}

pub fn trace_animation_graphs(
    bundle: &LoadedBundle,
    input: &AnimationTraceInput,
) -> Vec<AnimationTraceObservation> {
    let fixed_delta = if input.fixed_delta == 0.0 {
        1.0
    } else {
        input.fixed_delta
    };
    let mut observations = bundle
        .assets
        .assets
        .iter()
        .filter_map(|asset| {
            let graph = asset.animation_graph.as_ref()?;
            Some(trace_asset_animation(
                &asset.id,
                graph,
                asset.particle_emitters.as_deref().unwrap_or(&[]),
                &input.parameters,
                fixed_delta,
            ))
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.asset.cmp(&right.asset));
    observations
}

fn trace_asset_animation(
    asset_id: &str,
    graph: &AnimationGraphIr,
    emitters: &[ParticleEmitterIr],
    overrides: &BTreeMap<String, Value>,
    fixed_delta: f32,
) -> AnimationTraceObservation {
    let parameters = parameter_values(graph, overrides);
    let transition = graph
        .transitions
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|transition| {
            transition.from == graph.initial_state && condition_matches(transition, &parameters)
        });
    let active_state_id = transition.map_or(graph.initial_state.as_str(), |transition| {
        transition.to.as_str()
    });
    let state = graph
        .states
        .iter()
        .find(|state| state.id == active_state_id)
        .unwrap_or(&graph.states[0]);

    let mut particles = emitters
        .iter()
        .map(|emitter| trace_particle_emitter(emitter, fixed_delta))
        .collect::<Vec<_>>();
    particles.sort_by(|left, right| left.id.cmp(&right.id));
    let events = active_events(state, fixed_delta);
    let queued_events = events
        .iter()
        .map(|event| AnimationQueuedEventObservation {
            event: event.event.clone(),
            payload: AnimationQueuedEventPayload {
                asset: asset_id.to_owned(),
                at_seconds: event.at_seconds,
                clip: state.clip.clone(),
                state: event.state.clone(),
            },
        })
        .collect::<Vec<_>>();

    AnimationTraceObservation {
        active_state: state.id.clone(),
        asset: asset_id.to_owned(),
        clip: state.clip.clone(),
        events,
        initial_state: graph.initial_state.clone(),
        parameters,
        particles,
        queued_events,
        transition: transition.map(|transition| AnimationTransitionObservation {
            blend_seconds: transition.blend_seconds,
            from: transition.from.clone(),
            to: transition.to.clone(),
        }),
    }
}

fn parameter_values(
    graph: &AnimationGraphIr,
    overrides: &BTreeMap<String, Value>,
) -> BTreeMap<String, Value> {
    let mut values = BTreeMap::new();
    for parameter in graph.parameters.as_deref().unwrap_or(&[]) {
        let value = overrides
            .get(&parameter.id)
            .cloned()
            .or_else(|| parameter.default.clone())
            .unwrap_or_else(|| default_parameter_value(&parameter.kind));
        values.insert(parameter.id.clone(), value);
    }
    values
}

fn default_parameter_value(kind: &str) -> Value {
    if kind == "number" {
        Value::from(0)
    } else {
        Value::from(false)
    }
}

fn condition_matches(
    transition: &AnimationGraphTransitionIr,
    parameters: &BTreeMap<String, Value>,
) -> bool {
    let Some(value) = parameters.get(&transition.when.parameter) else {
        return false;
    };
    if transition
        .when
        .equals
        .as_ref()
        .is_some_and(|expected| expected != value)
    {
        return false;
    }
    if transition.when.greater_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual <= threshold as f64)
    }) {
        return false;
    }
    if transition.when.less_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual >= threshold as f64)
    }) {
        return false;
    }
    true
}

fn active_events(
    state: &AnimationGraphStateIr,
    fixed_delta: f32,
) -> Vec<AnimationEventObservation> {
    let mut events = state
        .events
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|event| event.at_seconds <= fixed_delta)
        .map(|event| AnimationEventObservation {
            at_seconds: event.at_seconds,
            event: event.event.clone(),
            state: state.id.clone(),
        })
        .collect::<Vec<_>>();
    events.sort_by(|left, right| {
        left.at_seconds
            .total_cmp(&right.at_seconds)
            .then(left.event.cmp(&right.event))
    });
    events
}

fn trace_particle_emitter(
    emitter: &ParticleEmitterIr,
    fixed_delta: f32,
) -> ParticleTraceObservation {
    ParticleTraceObservation {
        id: emitter.id.clone(),
        lifetime_seconds: emitter.lifetime_seconds,
        max_particles: emitter.max_particles,
        shape: emitter.shape.clone(),
        spawned: ((emitter.rate_per_second * fixed_delta).floor() as u32)
            .min(emitter.max_particles),
    }
}
