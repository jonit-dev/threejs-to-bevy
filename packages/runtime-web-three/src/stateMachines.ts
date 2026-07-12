import type { IPhysicsSensorEvent } from "./sensors.js";
import type { IStateMachineComponent, IStateMachineTransition, IWorldEntity, IWorldIr } from "@threenative/ir";

export interface IStateMachineObservation {
  entity: string;
  from: string;
  tick: number;
  to: string;
  trigger: "event" | "sensor" | "timer";
}

interface IStateMachineRuntimeState {
  current: string;
  elapsedTicks: number;
}

interface IStateMachineRuntime {
  eventCounts: Map<string, number>;
  machines: Map<string, IStateMachineRuntimeState>;
}

const runtimes = new WeakMap<IWorldIr, IStateMachineRuntime>();

export function stepStateMachines(world: IWorldIr, tick: number, sensorEvents: readonly IPhysicsSensorEvent[] = []): IStateMachineObservation[] {
  const runtime = runtimes.get(world) ?? { eventCounts: new Map(), machines: new Map() };
  runtimes.set(world, runtime);
  const eventAvailable = new Set<string>();
  for (const [event, payloads] of Object.entries(world.events ?? {})) {
    const count = Array.isArray(payloads) ? payloads.length : 0;
    if (count > (runtime.eventCounts.get(event) ?? 0)) {
      eventAvailable.add(event);
    }
    runtime.eventCounts.set(event, count);
  }
  const observations: IStateMachineObservation[] = [];
  for (const entity of [...world.entities].sort(compareEntities)) {
    const machine = entity.components.StateMachine;
    if (machine === undefined) {
      runtime.machines.delete(entity.id);
      continue;
    }
    const state = stateFor(entity, machine, runtime);
    if (machine.enabled === false) {
      machine.current = state.current;
      continue;
    }
    state.elapsedTicks += 1;
    const transition = machine.transitions.find((candidate) => transitionMatches(candidate, entity.id, state, eventAvailable, sensorEvents));
    if (transition === undefined) {
      machine.current = state.current;
      continue;
    }
    const from = state.current;
    state.current = transition.to;
    state.elapsedTicks = 0;
    machine.current = state.current;
    observations.push({ entity: entity.id, from, tick, to: state.current, trigger: transition.trigger.kind });
  }
  return observations;
}

export function resetStateMachines(world: IWorldIr): void {
  runtimes.delete(world);
}

function stateFor(entity: IWorldEntity, machine: IStateMachineComponent, runtime: IStateMachineRuntime): IStateMachineRuntimeState {
  const authored = machine.current ?? machine.initial;
  const existing = runtime.machines.get(entity.id);
  if (existing !== undefined && existing.current === authored) {
    return existing;
  }
  const next = { current: authored, elapsedTicks: 0 };
  runtime.machines.set(entity.id, next);
  return next;
}

function transitionMatches(
  transition: IStateMachineTransition,
  entityId: string,
  state: IStateMachineRuntimeState,
  eventAvailable: ReadonlySet<string>,
  sensorEvents: readonly IPhysicsSensorEvent[],
): boolean {
  if (transition.from !== state.current) {
    return false;
  }
  const trigger = transition.trigger;
  if (trigger.kind === "event") {
    return eventAvailable.has(trigger.event);
  }
  if (trigger.kind === "sensor") {
    return sensorEvents.some((event) => event.sensor === trigger.sensor && event.phase === trigger.phase && event.occupants.includes(entityId));
  }
  return state.elapsedTicks >= trigger.ticks;
}

function compareEntities(left: IWorldEntity, right: IWorldEntity): number {
  return left.id.localeCompare(right.id);
}
