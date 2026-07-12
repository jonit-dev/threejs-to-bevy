use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use serde_json::Value;
use threenative_loader::{
    LoadedBundle, StateMachineComponent, StateMachineTransition, StateMachineTrigger,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeStateMachineRuntimeState {
    event_counts: BTreeMap<String, usize>,
    machines: BTreeMap<String, NativeMachineState>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStateMachineObservation {
    pub entity: String,
    pub from: String,
    pub tick: u64,
    pub to: String,
    pub trigger: String,
}

#[derive(Clone, Debug, PartialEq)]
struct NativeMachineState {
    current: String,
    elapsed_ticks: u32,
}

pub fn step_bundle_state_machines(
    bundle: &mut LoadedBundle,
    tick: u64,
    sensor_events: &[Value],
    runtime: &mut NativeStateMachineRuntimeState,
) -> Vec<NativeStateMachineObservation> {
    let mut available_events = BTreeSet::new();
    for (event, payloads) in &bundle.world.events {
        let count = payloads.as_array().map_or(0, Vec::len);
        if count > *runtime.event_counts.get(event).unwrap_or(&0) {
            available_events.insert(event.clone());
        }
        runtime.event_counts.insert(event.clone(), count);
    }
    let mut ids = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.components.state_machine.is_some())
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    ids.sort();
    let mut observations = Vec::new();
    for id in ids {
        let Some(index) = bundle
            .world
            .entities
            .iter()
            .position(|entity| entity.id == id)
        else {
            continue;
        };
        let Some(machine) = bundle.world.entities[index]
            .components
            .state_machine
            .as_mut()
        else {
            continue;
        };
        let state = state_for(&id, machine, runtime);
        if machine.enabled == Some(false) {
            machine.current = Some(state.current.clone());
            continue;
        }
        state.elapsed_ticks = state.elapsed_ticks.saturating_add(1);
        let transition = machine
            .transitions
            .iter()
            .find(|candidate| {
                transition_matches(candidate, &id, state, &available_events, sensor_events)
            })
            .cloned();
        let Some(transition) = transition else {
            machine.current = Some(state.current.clone());
            continue;
        };
        let from = state.current.clone();
        state.current = transition.to.clone();
        state.elapsed_ticks = 0;
        machine.current = Some(state.current.clone());
        observations.push(NativeStateMachineObservation {
            entity: id,
            from,
            tick,
            to: state.current.clone(),
            trigger: trigger_name(&transition),
        });
    }
    observations
}

fn state_for<'a>(
    id: &str,
    machine: &StateMachineComponent,
    runtime: &'a mut NativeStateMachineRuntimeState,
) -> &'a mut NativeMachineState {
    let current = machine
        .current
        .clone()
        .unwrap_or_else(|| machine.initial.clone());
    let reset = runtime
        .machines
        .get(id)
        .is_none_or(|state| state.current != current);
    if reset {
        runtime.machines.insert(
            id.to_owned(),
            NativeMachineState {
                current,
                elapsed_ticks: 0,
            },
        );
    }
    runtime
        .machines
        .get_mut(id)
        .expect("state machine inserted")
}

fn transition_matches(
    transition: &StateMachineTransition,
    entity: &str,
    state: &NativeMachineState,
    available_events: &BTreeSet<String>,
    sensor_events: &[Value],
) -> bool {
    if transition.from != state.current {
        return false;
    }
    match &transition.trigger {
        StateMachineTrigger::Event { event } => available_events.contains(event),
        StateMachineTrigger::Sensor { phase, sensor } => sensor_events.iter().any(|event| {
            event.get("sensor").and_then(Value::as_str) == Some(sensor)
                && event.get("phase").and_then(Value::as_str) == Some(phase)
                && event
                    .get("occupants")
                    .and_then(Value::as_array)
                    .is_some_and(|occupants| {
                        occupants
                            .iter()
                            .any(|occupant| occupant.as_str() == Some(entity))
                    })
        }),
        StateMachineTrigger::Timer { ticks } => state.elapsed_ticks >= *ticks,
    }
}

fn trigger_name(transition: &StateMachineTransition) -> String {
    match transition.trigger {
        StateMachineTrigger::Event { .. } => "event".to_owned(),
        StateMachineTrigger::Sensor { .. } => "sensor".to_owned(),
        StateMachineTrigger::Timer { .. } => "timer".to_owned(),
    }
}
