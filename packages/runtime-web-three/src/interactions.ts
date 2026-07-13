import type { IGameFlowIr, IInteractionDeclaration, IInteractionsIr, IPrefabsIr, IRuntimeDiagnostic, ISystemsIr, IWorldEntity, IWorldIr, InteractionEffect, InteractionEntityTarget, InteractionPredicate, InteractionSelector } from "@threenative/ir";
import { feedbackPresetById } from "@threenative/ir/feedback";
import type { IPhysicsSensorEvent } from "./sensors.js";
import { applySystemEffects } from "./systems/effects.js";
import type { IQueuedCommand, IQueuedEvent, IQueuedResourceWrite, IQueuedServiceCall } from "./systems/contextTypes.js";
import type { IRuntimeWriteLedger } from "./systems/writeAudit.js";
import { enqueuePresentationEffects } from "./presentation.js";
import type { IThreeWorld } from "./mapWorld.js";
import type { IPresentationRuntimeState } from "./presentation.js";

const MAX_TRACES = 512;

export interface IInteractionTrace {
  completion: boolean;
  detector: string;
  effects: string[];
  gate: "blocked" | "passed";
  interaction: string;
  source: string;
  target: string;
  tick: number;
}

export interface IInteractionRuntimeState {
  completed: Set<string>;
  cooldowns: Map<string, number>;
  flowStates: Map<string, string>;
  once: Set<string>;
  oncePerTarget: Set<string>;
  traces: IInteractionTrace[];
  truncated: number;
}

export interface IInteractionTickResult {
  diagnostics: IRuntimeDiagnostic[];
  traces: IInteractionTrace[];
}

export function createInteractionRuntimeState(): IInteractionRuntimeState {
  return { completed: new Set(), cooldowns: new Map(), flowStates: new Map(), once: new Set(), oncePerTarget: new Set(), traces: [], truncated: 0 };
}

export function runInteractionFixedTick(options: {
  gameFlow?: IGameFlowIr;
  interactions: IInteractionsIr;
  mapped?: IThreeWorld;
  prefabs?: IPrefabsIr;
  presentation?: IPresentationRuntimeState;
  sensorEvents?: readonly IPhysicsSensorEvent[];
  state: IInteractionRuntimeState;
  systems?: ISystemsIr;
  tick: number;
  world: IWorldIr;
  writeLedger?: IRuntimeWriteLedger;
}): IInteractionTickResult {
  const diagnostics: IRuntimeDiagnostic[] = [];
  const tickTraces: IInteractionTrace[] = [];
  const candidates = options.interactions.interactions.flatMap((interaction) => detectorCandidates(interaction, options.world, options.sensorEvents ?? []))
    .sort((a, b) => a.interaction.id.localeCompare(b.interaction.id) || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  for (const candidate of candidates) {
    const { interaction, source, target } = candidate;
    if (!isLive(options.world, source) || !isLive(options.world, target) || !predicatesPass(interaction.when ?? [], options.world, source, target)) continue;
    const passed = gatePasses(interaction, source, target, options.tick, options.state, options.world);
    if (!passed) {
      recordTrace(options.state, tickTraces, { tick: options.tick, interaction: interaction.id, source, target, detector: interaction.detector.kind, gate: "blocked", effects: [], completion: false });
      continue;
    }
    const effects = applyInteractionEffects(interaction, source, target, options, diagnostics);
    const fullyApplied = effects.length === interaction.effects.length;
    if (fullyApplied) markGate(interaction, source, target, options.tick, options.state);
    let completion = false;
    if (fullyApplied && interaction.complete !== undefined && !options.state.completed.has(interaction.id) && predicatePasses(interaction.complete.when, options.world, source, target)) {
      if (interaction.complete.effects !== undefined) effects.push(...applyInteractionEffects({ ...interaction, effects: interaction.complete.effects }, source, target, options, diagnostics));
      appendEvent(options.world, interaction.complete.event, {});
      options.state.completed.add(interaction.id);
      completion = true;
    }
    recordTrace(options.state, tickTraces, { tick: options.tick, interaction: interaction.id, source, target, detector: interaction.detector.kind, gate: "passed", effects, completion });
  }
  diagnostics.push(...options.writeLedger?.diagnostics(options.tick) ?? []);
  return { diagnostics, traces: tickTraces };
}

function detectorCandidates(interaction: IInteractionDeclaration, world: IWorldIr, sensorEvents: readonly IPhysicsSensorEvent[]): Array<{ interaction: IInteractionDeclaration; source: string; target: string }> {
  const sources = select(world, interaction.detector.source);
  const targets = select(world, interaction.detector.target);
  const pairs = sources.flatMap((source) => targets.filter((target) => target !== source).map((target) => ({ interaction, source, target })));
  const detector = interaction.detector;
  if (detector.kind === "distance2d" || detector.kind === "distance3d") return pairs.filter((pair) => withinDistance(world, pair.source, pair.target, detector.radius, detector.kind === "distance2d"));
  if (detector.kind === "overlap") return pairs.filter((pair) => overlaps(world, pair.source, pair.target));
  if (detector.kind === "sensor-enter" || detector.kind === "sensor-exit") {
    const phase = detector.kind === "sensor-enter" ? "enter" : "exit";
    const hits = pairs.filter((pair) => sensorEvents.some((event) => event.phase === phase && ((event.sensor === pair.source && event.occupants.includes(pair.target)) || (event.sensor === pair.target && event.occupants.includes(pair.source)))));
    if (hits.length > 0 || detector.fallback === undefined) return hits;
    return pairs.filter((pair) => withinDistance(world, pair.source, pair.target, detector.fallback!.radius, detector.fallback!.kind === "distance2d"));
  }
  if (detector.kind === "event" || detector.kind === "ray-hit") {
    const payloads = eventPayloads(world, detector.event);
    return pairs.filter((pair) => payloads.some((payload) => payloadPair(payload, pair.source, pair.target)));
  }
  return [];
}

function applyInteractionEffects(interaction: IInteractionDeclaration, source: string, target: string, options: Parameters<typeof runInteractionFixedTick>[0], diagnostics: IRuntimeDiagnostic[]): string[] {
  const names: string[] = [];
  for (const effect of interaction.effects) {
    const commands: IQueuedCommand[] = [];
    const events: IQueuedEvent[] = [];
    const resources: IQueuedResourceWrite[] = [];
    const services: IQueuedServiceCall[] = [];
    const error = queueEffect(effect, source, target, options, commands, events, resources, services);
    if (error !== undefined) { diagnostics.push(error); continue; }
    const system = effectEnvelope(interaction.id, effect, commands, events, resources);
    const result = applySystemEffects(options.world, system, { commands, events, resources, services }, { frame: 0, prefabs: options.prefabs, tick: options.tick, writeLedger: options.writeLedger, writer: "interaction" });
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((item) => item.severity === "error")) continue;
    if (options.mapped !== undefined && options.presentation !== undefined) enqueuePresentationEffects(options.world, options.mapped, options.presentation, commands, services);
    names.push(effect.kind);
  }
  return names;
}

function queueEffect(effect: InteractionEffect, source: string, target: string, options: Parameters<typeof runInteractionFixedTick>[0], commands: IQueuedCommand[], events: IQueuedEvent[], resources: IQueuedResourceWrite[], services: IQueuedServiceCall[]): IRuntimeDiagnostic | undefined {
  if (effect.kind === "addResource" || effect.kind === "setResource") {
    const current = record(options.world.resources?.[effect.resource]);
    const value = effect.kind === "addResource" ? number(current[effect.field]) + effect.value : effect.value;
    resources.push({ resource: effect.resource, value: { ...current, [effect.field]: value } });
  } else if (effect.kind === "patchComponent") {
    const entity = targetId(effect.target, source, target); const current = record(options.world.entities.find((item) => item.id === entity)?.components[effect.component]);
    commands.push({ component: effect.component, entity, kind: "setComponent", source: "entity", value: { ...current, ...effect.patch } });
  } else if (effect.kind === "emitEvent") events.push({ event: effect.event, payload: effect.payload ?? {} });
  else if (effect.kind === "feedbackPreset") {
    const preset = feedbackPresetById(options.systems?.feedbackPresets, effect.preset);
    if (preset === undefined) return runtimeError(options, `Feedback preset '${effect.preset}' is unavailable.`);
    services.push({ service: "effects.play", payload: { request: { preset: effect.preset, entity: effect.target === undefined ? undefined : targetId(effect.target, source, target) }, result: { accepted: true, preset: effect.preset, status: "enqueued" }, ...(preset.camera === undefined ? {} : { camera: { ...preset.camera, seed: 0 } }) } });
  } else if (effect.kind === "setTransform") {
    const entity = targetId(effect.target, source, target); const current = record(options.world.entities.find((item) => item.id === entity)?.components.Transform);
    commands.push({ component: "Transform", entity, kind: "setComponent", source: "entity", value: { ...current, ...(effect.position === undefined ? {} : { position: effect.position }), ...(effect.rotation === undefined ? {} : { rotation: effect.rotation }), ...(effect.scale === undefined ? {} : { scale: effect.scale }) } });
  } else if (effect.kind === "instantiate") commands.push({ entity: "", kind: "instantiate", prefab: effect.prefab, prefix: effect.prefix, source: "command" });
  else if (effect.kind === "despawn") commands.push({ entity: targetId(effect.target, source, target), kind: "despawn", source: "command" });
  else if (effect.kind === "requestFlowTransition") return applyFlowTransition(effect.flow, effect.transition, options, events, resources);
  return undefined;
}

function applyFlowTransition(flowId: string, transitionId: string, options: Parameters<typeof runInteractionFixedTick>[0], events: IQueuedEvent[], resources: IQueuedResourceWrite[]): IRuntimeDiagnostic | undefined {
  const flow = options.gameFlow?.flows.find((item) => item.id === flowId); const transition = flow?.transitions?.find((item) => item.id === transitionId);
  if (flow === undefined || transition === undefined) return runtimeError(options, `Flow transition '${flowId}.${transitionId}' is unavailable.`);
  const current = options.state.flowStates.get(flowId) ?? flow.initial;
  if (transition.from !== current) return runtimeError(options, `Flow transition '${flowId}.${transitionId}' cannot run from state '${current}'.`);
  const unsupported = (transition.actions ?? []).find((action) => action.kind !== "emitEvent" && action.kind !== "setResource");
  if (unsupported !== undefined) return runtimeError(options, `Flow transition action '${unsupported.kind}' is not supported by the interaction runtime.`);
  options.state.flowStates.set(flowId, transition.to);
  for (const action of transition.actions ?? []) {
    if (action.kind === "emitEvent" && action.event !== undefined) events.push({ event: action.event, payload: {} });
    else if (action.kind === "setResource" && action.resource !== undefined) resources.push({ resource: action.resource, value: action.value });
  }
  return undefined;
}

function effectEnvelope(id: string, effect: InteractionEffect, commands: readonly IQueuedCommand[], events: readonly IQueuedEvent[], resources: readonly IQueuedResourceWrite[]): ISystemsIr["systems"][number] {
  return { name: `interaction:${id}`, schedule: "fixedUpdate", reads: [], writes: effect.kind === "patchComponent" ? [effect.component] : effect.kind === "setTransform" ? ["Transform"] : [], resourceReads: effect.kind === "addResource" ? [effect.resource] : [], resourceWrites: [...new Set(resources.map((item) => item.resource))], eventReads: [], eventWrites: [...new Set(events.map((item) => item.event))], services: effect.kind === "feedbackPreset" ? ["effects.play"] : [], queries: [], commands: commands.filter((command) => command.source === "command").map((command) => command.kind === "instantiate" ? { kind: "instantiate", prefab: command.prefab ?? "", prefix: command.prefix ?? "" } : { kind: "despawn", entity: command.entity }), };
}

function gatePasses(interaction: IInteractionDeclaration, source: string, target: string, tick: number, state: IInteractionRuntimeState, world: IWorldIr): boolean { const gate = interaction.gate; if (gate.kind === "once") return !state.once.has(interaction.id); if (gate.kind === "once-per-target") return !state.oncePerTarget.has(`${interaction.id}\0${target}`); if (gate.kind === "cooldown") return tick >= (state.cooldowns.get(interaction.id) ?? 0); if (gate.kind === "equals") return predicatePasses(gate.predicate, world, source, target); return false; }
function markGate(interaction: IInteractionDeclaration, _source: string, target: string, tick: number, state: IInteractionRuntimeState): void { const gate = interaction.gate; if (gate.kind === "once") state.once.add(interaction.id); else if (gate.kind === "once-per-target") state.oncePerTarget.add(`${interaction.id}\0${target}`); else if (gate.kind === "cooldown") state.cooldowns.set(interaction.id, tick + gate.ticks); }
function predicatesPass(predicates: readonly InteractionPredicate[], world: IWorldIr, source: string, target: string): boolean { return predicates.every((item) => predicatePasses(item, world, source, target)); }
function predicatePasses(predicate: InteractionPredicate, world: IWorldIr, source: string, target: string): boolean { if ("resource" in predicate) { const value = record(world.resources?.[predicate.resource])[predicate.field]; return predicate.gte !== undefined ? number(value) >= predicate.gte : value === predicate.equals; } const entity = world.entities.find((item) => item.id === targetId(predicate.target, source, target)); return record(entity?.components[predicate.component])[predicate.field] === predicate.equals; }
function select(world: IWorldIr, selector: InteractionSelector): string[] { return world.entities.filter((entity) => "entity" in selector ? entity.id === selector.entity : "withTag" in selector ? (entity.tags ?? []).includes(selector.withTag) : entity.components[selector.withComponent] !== undefined).map((entity) => entity.id).sort(); }
function targetId(value: InteractionEntityTarget, source: string, target: string): string { return value === "source" ? source : value === "detected" ? target : value.entity; }
function position(entity: IWorldEntity | undefined): readonly number[] { const value = record(entity?.components.Transform).position; return Array.isArray(value) ? value : [0, 0, 0]; }
function withinDistance(world: IWorldIr, source: string, target: string, radius: number, flat: boolean): boolean { const a = position(world.entities.find((item) => item.id === source)); const b = position(world.entities.find((item) => item.id === target)); const dy = flat ? 0 : number(a[1]) - number(b[1]); return Math.hypot(number(a[0]) - number(b[0]), dy, number(a[2]) - number(b[2])) <= radius; }
function overlaps(world: IWorldIr, source: string, target: string): boolean { const a = world.entities.find((item) => item.id === source); const b = world.entities.find((item) => item.id === target); const ae = halfExtents(a); const be = halfExtents(b); const ap = position(a); const bp = position(b); return [0, 1, 2].every((axis) => Math.abs(number(ap[axis]) - number(bp[axis])) <= ae[axis]! + be[axis]!); }
function halfExtents(entity: IWorldEntity | undefined): number[] { const collider = record(entity?.components.Collider); const size = Array.isArray(collider.size) ? collider.size : [1, 1, 1]; return [number(size[0]) / 2, number(size[1]) / 2, number(size[2]) / 2]; }
function eventPayloads(world: IWorldIr, event: string): unknown[] { const value = world.events?.[event]; return Array.isArray(value) ? value : value === undefined ? [] : [value]; }
function payloadPair(value: unknown, source: string, target: string): boolean { const item = record(value); return (item.source === source && item.target === target) || (item.entity === target && (item.source === undefined || item.source === source)); }
function appendEvent(world: IWorldIr, event: string, payload: unknown): void { world.events = { ...(world.events ?? {}), [event]: [...eventPayloads(world, event), payload] }; }
function isLive(world: IWorldIr, id: string): boolean { return world.entities.some((item) => item.id === id); }
function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function runtimeError(options: { interactions: IInteractionsIr }, message: string): IRuntimeDiagnostic { return { code: "TN_INTERACTION_RUNTIME_UNSUPPORTED", message, path: `interactions/${options.interactions.id}`, severity: "error" }; }
function recordTrace(state: IInteractionRuntimeState, tickTraces: IInteractionTrace[], trace: IInteractionTrace): void { tickTraces.push(trace); if (state.traces.length < MAX_TRACES) state.traces.push(trace); else state.truncated += 1; }
