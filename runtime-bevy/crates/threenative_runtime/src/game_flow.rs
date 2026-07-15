use std::collections::HashMap;

use serde::Serialize;
use threenative_loader::{GameFlowActionIr, GameFlowIr, GameFlowTransitionIr};

#[derive(Clone, Debug, Default)]
pub struct NativeGameFlowTraceInput {
    pub events_by_tick: HashMap<u32, Vec<String>>,
    pub fixed_delta: f32,
    pub resources: HashMap<String, serde_json::Value>,
    pub ticks: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGameFlowTraceFrame {
    pub actions: Vec<NativeGameFlowTraceAction>,
    pub flow: String,
    pub state: String,
    pub tick: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGameFlowTraceAction {
    pub action: String,
    pub flow: String,
    pub tick: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

#[derive(Clone, Debug)]
struct FlowRuntime {
    entered_tick: u32,
    initialized: bool,
    state: String,
}

pub fn trace_game_flow(
    game_flow: &GameFlowIr,
    mut input: NativeGameFlowTraceInput,
) -> Vec<NativeGameFlowTraceFrame> {
    let fixed_delta = if input.fixed_delta > 0.0 {
        input.fixed_delta
    } else {
        0.5
    };
    let mut states: HashMap<String, FlowRuntime> = HashMap::new();
    let mut trace = Vec::new();
    for tick in 0..input.ticks {
        for flow in &game_flow.flows {
            let runtime = states
                .entry(flow.id.clone())
                .or_insert_with(|| FlowRuntime {
                    entered_tick: tick,
                    initialized: false,
                    state: flow.initial.clone(),
                });
            let mut actions = Vec::new();
            if !runtime.initialized {
                runtime.initialized = true;
                actions.extend(apply_actions(
                    &flow.id,
                    tick,
                    state_actions(game_flow, &flow.id, &runtime.state),
                    &mut input.resources,
                ));
            }
            let events = input.events_by_tick.get(&tick).cloned().unwrap_or_default();
            let transition = flow.transitions.iter().find(|candidate| {
                candidate.from == runtime.state
                    && trigger_matches(
                        candidate,
                        tick,
                        runtime.entered_tick,
                        fixed_delta,
                        &events,
                        &input.resources,
                    )
            });
            let transition_id = transition.map(|item| item.id.clone());
            if let Some(transition) = transition {
                actions.extend(apply_actions(
                    &flow.id,
                    tick,
                    &transition.actions,
                    &mut input.resources,
                ));
                runtime.state = transition.to.clone();
                runtime.entered_tick = tick;
                actions.extend(apply_actions(
                    &flow.id,
                    tick,
                    state_actions(game_flow, &flow.id, &runtime.state),
                    &mut input.resources,
                ));
            }
            trace.push(NativeGameFlowTraceFrame {
                actions,
                flow: flow.id.clone(),
                state: runtime.state.clone(),
                tick,
                transition: transition_id,
            });
        }
    }
    trace
}

fn trigger_matches(
    transition: &GameFlowTransitionIr,
    tick: u32,
    entered_tick: u32,
    fixed_delta: f32,
    events: &[String],
    resources: &HashMap<String, serde_json::Value>,
) -> bool {
    let trigger = &transition.trigger;
    match trigger.kind.as_str() {
        "event" => trigger
            .event
            .as_ref()
            .is_some_and(|event| events.iter().any(|candidate| candidate == event)),
        "timer" => ((tick - entered_tick) as f32 * fixed_delta) >= trigger.seconds.unwrap_or(0.0),
        "resourceEquals" => {
            trigger
                .resource
                .as_ref()
                .and_then(|resource| resources.get(resource))
                == trigger.target.as_ref()
        }
        "allCollected" => trigger
            .resource
            .as_ref()
            .and_then(|resource| resources.get(resource))
            .and_then(serde_json::Value::as_f64)
            .is_some_and(|value| {
                value
                    >= trigger
                        .target
                        .as_ref()
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0)
            }),
        _ => false,
    }
}

fn state_actions<'a>(
    game_flow: &'a GameFlowIr,
    flow_id: &str,
    state_id: &str,
) -> &'a [GameFlowActionIr] {
    game_flow
        .flows
        .iter()
        .find(|flow| flow.id == flow_id)
        .and_then(|flow| flow.states.iter().find(|state| state.id == state_id))
        .map(|state| state.actions.as_slice())
        .unwrap_or(&[])
}

fn apply_actions(
    flow: &str,
    tick: u32,
    actions: &[GameFlowActionIr],
    resources: &mut HashMap<String, serde_json::Value>,
) -> Vec<NativeGameFlowTraceAction> {
    actions
        .iter()
        .map(|action| {
            if action.kind == "setResource"
                && let Some(resource) = &action.resource
            {
                resources.insert(
                    resource.clone(),
                    action.value.clone().unwrap_or(serde_json::Value::Null),
                );
            }
            NativeGameFlowTraceAction {
                action: action.kind.clone(),
                flow: flow.to_owned(),
                tick,
                target: action
                    .event
                    .clone()
                    .or(action.resource.clone())
                    .or(action.scene.clone())
                    .or(action.screen.clone())
                    .or(action.sequence.clone())
                    .or(action.spawner.clone()),
                value: action
                    .value
                    .clone()
                    .or_else(|| action.time_scale.map(serde_json::Value::from)),
            }
        })
        .collect()
}
