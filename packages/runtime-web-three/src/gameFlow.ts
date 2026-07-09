import type { IGameFlowActionIr, IGameFlowIr, IGameFlowTransitionIr } from "@threenative/ir";

export interface IGameFlowTraceInput {
  eventsByTick?: Record<number, readonly string[]>;
  fixedDelta?: number;
  resources?: Record<string, unknown>;
  ticks: number;
}

export interface IGameFlowTraceAction {
  action: string;
  flow: string;
  tick: number;
  target?: string;
  value?: unknown;
}

export interface IGameFlowTraceFrame {
  actions: IGameFlowTraceAction[];
  flow: string;
  state: string;
  tick: number;
  transition?: string;
}

interface IFlowRuntime {
  enteredTick: number;
  initialized: boolean;
  state: string;
}

export function traceGameFlow(gameFlow: IGameFlowIr, input: IGameFlowTraceInput): IGameFlowTraceFrame[] {
  const fixedDelta = input.fixedDelta ?? 0.5;
  const resources = { ...(input.resources ?? {}) };
  const states = new Map<string, IFlowRuntime>();
  const trace: IGameFlowTraceFrame[] = [];
  for (let tick = 0; tick < input.ticks; tick += 1) {
    for (const flow of gameFlow.flows) {
      const runtime = states.get(flow.id) ?? { enteredTick: tick, initialized: false, state: flow.initial };
      states.set(flow.id, runtime);
      const actions: IGameFlowTraceAction[] = [];
      if (!runtime.initialized) {
        runtime.initialized = true;
        actions.push(...applyActions(flow.id, tick, stateActions(gameFlow, flow.id, runtime.state), resources));
      }
      const transition = flow.transitions?.find((candidate) => candidate.from === runtime.state && triggerMatches(candidate, tick, runtime.enteredTick, fixedDelta, input.eventsByTick?.[tick] ?? [], resources));
      if (transition !== undefined) {
        actions.push(...applyActions(flow.id, tick, transition.actions ?? [], resources));
        runtime.state = transition.to;
        runtime.enteredTick = tick;
        actions.push(...applyActions(flow.id, tick, stateActions(gameFlow, flow.id, runtime.state), resources));
      }
      trace.push({ actions, flow: flow.id, state: runtime.state, tick, ...(transition === undefined ? {} : { transition: transition.id }) });
    }
  }
  return trace;
}

function triggerMatches(
  transition: IGameFlowTransitionIr,
  tick: number,
  enteredTick: number,
  fixedDelta: number,
  events: readonly string[],
  resources: Record<string, unknown>,
): boolean {
  const trigger = transition.trigger;
  if (trigger.kind === "event") {
    return trigger.event !== undefined && events.includes(trigger.event);
  }
  if (trigger.kind === "timer") {
    return ((tick - enteredTick) * fixedDelta) >= (trigger.seconds ?? 0);
  }
  if (trigger.kind === "resourceEquals") {
    return trigger.resource !== undefined && resources[trigger.resource] === trigger.target;
  }
  if (trigger.kind === "allCollected") {
    return trigger.resource !== undefined && Number(resources[trigger.resource] ?? 0) >= Number(trigger.target ?? 0);
  }
  return false;
}

function stateActions(gameFlow: IGameFlowIr, flowId: string, stateId: string): readonly IGameFlowActionIr[] {
  return gameFlow.flows.find((flow) => flow.id === flowId)?.states.find((state) => state.id === stateId)?.actions ?? [];
}

function applyActions(flow: string, tick: number, actions: readonly IGameFlowActionIr[], resources: Record<string, unknown>): IGameFlowTraceAction[] {
  return actions.map((action) => {
    if (action.kind === "setResource" && action.resource !== undefined) {
      resources[action.resource] = action.value;
    }
    return {
      action: action.kind,
      flow,
      tick,
      ...(action.event === undefined && action.resource === undefined && action.scene === undefined && action.screen === undefined && action.sequence === undefined && action.spawner === undefined
        ? {}
        : { target: action.event ?? action.resource ?? action.scene ?? action.screen ?? action.sequence ?? action.spawner }),
      ...(action.value === undefined && action.timeScale === undefined ? {} : { value: action.value ?? action.timeScale }),
    };
  });
}
