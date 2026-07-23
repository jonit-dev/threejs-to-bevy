import type { IAssetsManifest, IAudioIr, IEnvironmentSceneIr, IGameFlowIr, IIrSchemaFile, IInteractionsIr, ILocalDataIr, IPrefabsIr, IRuntimeConfigIr, ISystemsIr, IVehicleControllerInput, IWorldIr } from "@threenative/ir";
import { PHYSICS_SCRIPT_SERVICE_DESCRIPTORS } from "@threenative/ir/physicsCapabilities";
import type { IWebInputState } from "./input.js";
import type { IThreeWorld } from "./mapWorld.js";
import { applyAnimationServiceEffects, applyMaterialPatchEffects, syncMeshRendererMaterials, syncTransforms } from "./mapWorld.js";
import { stepKinematicMovers } from "./kinematicMover.js";
import { stepPatrols } from "./patrol.js";
import { stepStateMachines } from "./stateMachines.js";
import { stepCountdowns } from "./countdowns.js";
import { preparePhysicsRuntime, stepPhysics } from "./physics.js";
import { stepPhysicsDestruction, type IPhysicsDestructionRuntime } from "./physicsDestruction.js";
import { applyPhysicsVehicleBindings, setPhysicsVehicleControllerInputs, stepPhysicsVehicles, updatePhysicsVehicleVisuals } from "./physicsVehicle.js";
import { applyPhysicsAerodynamicBindings, stepPhysicsAerodynamics } from "./physicsAerodynamics.js";
import { runSchedule, type ISystemModule } from "./systems/runner.js";
import { webSystemRuntimeStateFor } from "./systems/context.js";
import type { ISystemEffectLog } from "./systems/log.js";
import type { IResourceObservation } from "./systems/context.js";
import type { IRenderedUi } from "./ui/renderUi.js";
import { interpolateTransform, type ITransformSample } from "./transformInterpolation.js";
import { stepPresentation } from "./presentation.js";
import { syncWorldText } from "./worldText.js";
import { createInteractionRuntimeState, runInteractionFixedTick, type IInteractionRuntimeState } from "./interactions.js";
import { createWebPersistenceService, type IWebPersistenceService } from "./systems/services/persistence.js";

const MAX_FIXED_STEPS_PER_FRAME = 5;
const exactFixedTickStepping = new WeakSet<IGameLoopState>();

export interface IGameLoopState {
  accumulator: number;
  elapsed: number;
  frame: number;
  interpolation: IGameLoopInterpolationState;
  interactions: IInteractionRuntimeState;
  paused: boolean;
  persistence?: IWebPersistenceService;
  startupComplete: boolean;
  tick: number;
}

export interface IGameLoopInterpolationState {
  current: Map<string, ITransformSample>;
  fixedEntities: Set<string>;
  previous: Map<string, ITransformSample>;
}

export function createGameLoopState(config?: IRuntimeConfigIr): IGameLoopState {
  return {
    accumulator: 0,
    elapsed: 0,
    frame: 0,
    interpolation: {
      current: new Map(),
      fixedEntities: new Set(),
      previous: new Map(),
    },
    interactions: createInteractionRuntimeState(),
    paused: config?.time.paused ?? false,
    startupComplete: false,
    tick: 0,
  };
}

export function setPaused(state: IGameLoopState, paused: boolean): void {
  state.paused = paused;
}

export async function runGameFrame(options: {
  advancePaused?: boolean;
  assets?: IAssetsManifest;
  audio?: IAudioIr;
  delta: number;
  destructionRuntime?: IPhysicsDestructionRuntime;
  componentSchemas?: IIrSchemaFile;
  effectLog?: ISystemEffectLog;
  environmentScene?: IEnvironmentSceneIr;
  fixedDelta?: number;
  input?: IWebInputState;
  interactions?: IInteractionsIr;
  localData?: ILocalDataIr;
  gameFlow?: IGameFlowIr;
  mapped: IThreeWorld;
  module: ISystemModule;
  prefabs?: IPrefabsIr;
  persistenceStorageKey?: string;
  resourceObservations?: IResourceObservation[];
  runtimeState?: ReturnType<typeof webSystemRuntimeStateFor>;
  runtimeConfig?: IRuntimeConfigIr;
  serviceObserver?: Parameters<typeof runSchedule>[0]["serviceObserver"];
  state?: IGameLoopState;
  systems: ISystemsIr;
  ui?: import("@threenative/ir").IUiIr;
  uiState?: IRenderedUi;
  vehicleControllerInputs?: ReadonlyMap<string, IVehicleControllerInput>;
  world: IWorldIr;
}): Promise<void> {
  const fixedDelta = options.fixedDelta ?? options.runtimeConfig?.time.fixedDelta ?? 1 / 60;
  const frameDelta = Math.min(Math.max(options.delta, 0), 0.25);
  const runtimeState = options.runtimeState ?? webSystemRuntimeStateFor(options.world, { assets: options.assets, audio: options.audio });
  const state = options.state;
  if (state !== undefined && exactFixedTickStepping.has(state) && options.advancePaused !== true) return;
  const persistence = state?.persistence ?? (options.localData === undefined ? undefined : createWebPersistenceService(options.localData, { storageKey: options.persistenceStorageKey }));
  if (state !== undefined && state.persistence === undefined && persistence !== undefined) state.persistence = persistence;
  const frameOptions = { ...options, persistence };
  if (state !== undefined) {
    state.elapsed += frameDelta;
    if (!state.paused || options.advancePaused === true) {
      const schedulePaused = state.paused && options.advancePaused !== true;
      options.input?.beginFrame();
      let applyVehicleGearEdges = true;
      state.accumulator += frameDelta;
      state.accumulator = Math.min(state.accumulator, fixedDelta * MAX_FIXED_STEPS_PER_FRAME);
      if (!state.startupComplete) {
        runtimeState.sensors.advance(options.world, { fixedDelta, phase: "startup", tick: state.tick });
        collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, delta: 0, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: schedulePaused, runtimeState, schedule: "startup", tick: state.tick }));
        state.startupComplete = true;
      }
      while (state.accumulator >= fixedDelta) {
        runtimeState.writeLedger.beginTick(state.tick);
        const beforeFixed = snapshotWorldTransforms(options.world);
        stepKinematicMovers(options.world, state.elapsed);
        stepPatrols(options.world, fixedDelta);
        preparePhysicsRuntime(options.world, options.environmentScene, options.runtimeConfig?.physics?.gravity as [number, number, number] | undefined);
        if (options.input !== undefined) applyPhysicsVehicleBindings(options.world, options.input, applyVehicleGearEdges);
        if (options.input !== undefined) applyPhysicsAerodynamicBindings(options.world, options.input);
        applyVehicleGearEdges = false;
        collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, delta: fixedDelta, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: schedulePaused, runtimeState, schedule: "fixedUpdate", systemFilter: isPrePhysicsSystem, tick: state.tick }));
        for (const [entity, input] of options.vehicleControllerInputs ?? []) setPhysicsVehicleControllerInputs(options.world, entity, input);
        stepPhysicsVehicles(options.world, fixedDelta);
        stepPhysicsAerodynamics(options.world, fixedDelta, state.tick);
        stepPhysics(options.world, fixedDelta, options.environmentScene, { gravity: options.runtimeConfig?.physics?.gravity as [number, number, number] | undefined, tick: state.tick, writeLedger: runtimeState.writeLedger });
        if (options.destructionRuntime !== undefined) stepPhysicsDestruction(options.destructionRuntime, options.world, state.tick, fixedDelta);
        stepCountdowns(options.world, options.systems, fixedDelta, runtimeState.countdowns, state.tick);
        const sensorEvents = runtimeState.sensors.advance(options.world, { fixedDelta, tick: state.tick });
        stepStateMachines(options.world, state.tick, sensorEvents);
        if (options.interactions !== undefined) collectInteractionResult(options.mapped, runInteractionFixedTick({ gameFlow: options.gameFlow, interactions: options.interactions, mapped: options.mapped, prefabs: options.prefabs, presentation: runtimeState.presentation, sensorEvents, state: state.interactions, systems: options.systems, tick: state.tick, world: options.world, writeLedger: runtimeState.writeLedger }));
        collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, delta: fixedDelta, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: schedulePaused, runtimeState, schedule: "fixedUpdate", systemFilter: (system) => !isPrePhysicsSystem(system), tick: state.tick }));
        recordFixedTransformStep(state, beforeFixed, snapshotWorldTransforms(options.world));
        state.tick += 1;
        state.accumulator -= fixedDelta;
      }
      const rawBeforeVariable = snapshotWorldTransforms(options.world);
      const overlaidEntities = overlayInterpolatedFixedTransforms(options.world, state, fixedDelta);
      const beforeVariable = snapshotWorldTransforms(options.world);
      collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: schedulePaused, runtimeState, schedule: "update", tick: state.tick }));
      collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: schedulePaused, runtimeState, schedule: "postUpdate", tick: state.tick }));
      const afterVariable = snapshotWorldTransforms(options.world);
      restoreUnwrittenFixedTransforms(options.world, rawBeforeVariable, beforeVariable, afterVariable, overlaidEntities);
      removeVariableTransformWrites(state, beforeVariable, afterVariable);
    }
    state.frame += 1;
  } else {
    options.input?.beginFrame();
    runtimeState.writeLedger.beginTick(0);
    runtimeState.sensors.advance(options.world, { fixedDelta, phase: "startup", tick: 0 });
    collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, delta: 0, fixedDelta, frame: 0, runtimeState, schedule: "startup", tick: 0 }));
    stepKinematicMovers(options.world, fixedDelta);
    stepPatrols(options.world, fixedDelta);
    preparePhysicsRuntime(options.world, options.environmentScene, options.runtimeConfig?.physics?.gravity as [number, number, number] | undefined);
    if (options.input !== undefined) applyPhysicsVehicleBindings(options.world, options.input);
    if (options.input !== undefined) applyPhysicsAerodynamicBindings(options.world, options.input);
    collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, fixedDelta, frame: 0, runtimeState, schedule: "fixedUpdate", systemFilter: isPrePhysicsSystem, tick: 0 }));
    for (const [entity, input] of options.vehicleControllerInputs ?? []) setPhysicsVehicleControllerInputs(options.world, entity, input);
    stepPhysicsVehicles(options.world, fixedDelta);
    stepPhysicsAerodynamics(options.world, fixedDelta, 0);
    stepPhysics(options.world, fixedDelta, options.environmentScene, { gravity: options.runtimeConfig?.physics?.gravity as [number, number, number] | undefined, tick: 0, writeLedger: runtimeState.writeLedger });
    if (options.destructionRuntime !== undefined) stepPhysicsDestruction(options.destructionRuntime, options.world, 0, fixedDelta);
    stepCountdowns(options.world, options.systems, fixedDelta, runtimeState.countdowns, 0);
    const sensorEvents = runtimeState.sensors.advance(options.world, { fixedDelta, tick: 0 });
    stepStateMachines(options.world, 0, sensorEvents);
    if (options.interactions !== undefined) collectInteractionResult(options.mapped, runInteractionFixedTick({ gameFlow: options.gameFlow, interactions: options.interactions, mapped: options.mapped, prefabs: options.prefabs, presentation: runtimeState.presentation, sensorEvents, state: createInteractionRuntimeState(), systems: options.systems, tick: 0, world: options.world, writeLedger: runtimeState.writeLedger }));
    collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, fixedDelta, frame: 0, runtimeState, schedule: "fixedUpdate", systemFilter: (system) => !isPrePhysicsSystem(system), tick: 0 }));
    collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, fixedDelta, frame: 0, runtimeState, schedule: "update", tick: 0 }));
    collectSystemResult(options.mapped, await runSchedule({ ...frameOptions, fixedDelta, frame: 0, runtimeState, schedule: "postUpdate", tick: 0 }));
  }
  stepPresentation(options.world, options.mapped, runtimeState.presentation, frameDelta);
  if (options.mapped.reconcile !== undefined) {
    options.mapped.reconcile(options.world);
  } else {
    syncTransforms(options.world, options.mapped.objectsById);
  }
  if (state !== undefined) {
    applyFixedTransformInterpolation(options.mapped, state, fixedDelta);
  }
  updatePhysicsVehicleVisuals(options.world, options.mapped, state === undefined ? 1 : state.accumulator / fixedDelta);
  syncMeshRendererMaterials(options.world, options.mapped.objectsById);
  syncWorldText(options.world, options.mapped, frameDelta);
}

export async function runExactFixedTicks(
  options: Parameters<typeof runGameFrame>[0],
  ticks: number,
): Promise<{ endTick: number; startTick: number; ticks: number }> {
  if (!Number.isInteger(ticks) || ticks <= 0) throw new Error("Exact fixed-tick stepping requires a positive integer tick count.");
  const state = options.state;
  if (state === undefined || !state.paused) throw new Error("Exact fixed-tick stepping requires a paused game-loop lifecycle.");
  if (exactFixedTickStepping.has(state)) throw new Error("Exact fixed-tick stepping is already active for this game-loop lifecycle.");
  const fixedDelta = options.fixedDelta ?? options.runtimeConfig?.time.fixedDelta ?? 1 / 60;
  const startTick = state.tick;
  exactFixedTickStepping.add(state);
  state.accumulator = 0;
  try {
    for (let tick = 0; tick < ticks; tick += 1) {
      await runGameFrame({ ...options, advancePaused: true, delta: fixedDelta });
    }
  } finally {
    state.accumulator = 0;
    exactFixedTickStepping.delete(state);
  }
  const advancedTicks = state.tick - startTick;
  if (advancedTicks !== ticks) throw new Error(`Exact fixed-tick stepping advanced ${advancedTicks} ticks; expected ${ticks}.`);
  return { endTick: state.tick, startTick, ticks };
}

const PRE_PHYSICS_BODY_SERVICES = new Set([
  "character.move",
  ...PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.filter((descriptor) => descriptor.mutation).map((descriptor) => descriptor.service),
]);

function isPrePhysicsSystem(system: ISystemsIr["systems"][number]): boolean {
  return system.writes.includes("RigidBody")
    || system.writes.includes("Transform")
    || system.services.some((service) => PRE_PHYSICS_BODY_SERVICES.has(service));
}

function recordFixedTransformStep(
  state: IGameLoopState,
  before: Map<string, ITransformSample>,
  after: Map<string, ITransformSample>,
): void {
  state.interpolation.previous = before;
  state.interpolation.current = after;
  state.interpolation.fixedEntities = changedTransformEntities(before, after);
}

function removeVariableTransformWrites(
  state: IGameLoopState,
  before: Map<string, ITransformSample>,
  after: Map<string, ITransformSample>,
): void {
  for (const id of changedTransformEntities(before, after)) {
    state.interpolation.fixedEntities.delete(id);
  }
}

function applyFixedTransformInterpolation(mapped: IThreeWorld, state: IGameLoopState, fixedDelta: number): void {
  if (fixedDelta <= 0 || state.interpolation.fixedEntities.size === 0) {
    return;
  }
  const alpha = Math.min(1, Math.max(0, state.accumulator / fixedDelta));
  for (const id of state.interpolation.fixedEntities) {
    const previous = state.interpolation.previous.get(id);
    const current = state.interpolation.current.get(id);
    const object = mapped.objectsById.get(id);
    if (previous === undefined || current === undefined || object === undefined) {
      continue;
    }
    const interpolated = interpolateTransform(previous, current, alpha);
    if (previous.position !== undefined || current.position !== undefined) {
      object.position.fromArray([...(interpolated.position ?? [0, 0, 0])]);
    }
    if (previous.rotation !== undefined || current.rotation !== undefined) {
      object.quaternion.fromArray([...(interpolated.rotation ?? [0, 0, 0, 1])]);
    }
    if (previous.scale !== undefined || current.scale !== undefined) {
      object.scale.fromArray([...(interpolated.scale ?? [1, 1, 1])]);
    }
  }
}

function overlayInterpolatedFixedTransforms(world: IWorldIr, state: IGameLoopState, fixedDelta: number): Set<string> {
  const overlaid = new Set<string>();
  if (fixedDelta <= 0 || state.interpolation.fixedEntities.size === 0) {
    return overlaid;
  }
  const alpha = Math.min(1, Math.max(0, state.accumulator / fixedDelta));
  for (const id of state.interpolation.fixedEntities) {
    const previous = state.interpolation.previous.get(id);
    const current = state.interpolation.current.get(id);
    const entity = world.entities.find((candidate) => candidate.id === id);
    if (previous === undefined || current === undefined || entity?.components.Transform === undefined) {
      continue;
    }
    entity.components.Transform = transformSampleToComponent(interpolateTransform(previous, current, alpha));
    overlaid.add(id);
  }
  return overlaid;
}

function restoreUnwrittenFixedTransforms(
  world: IWorldIr,
  rawBeforeVariable: Map<string, ITransformSample>,
  beforeVariable: Map<string, ITransformSample>,
  afterVariable: Map<string, ITransformSample>,
  overlaidEntities: Set<string>,
): void {
  if (overlaidEntities.size === 0) {
    return;
  }
  const variableWrites = changedTransformEntities(beforeVariable, afterVariable);
  for (const id of overlaidEntities) {
    if (variableWrites.has(id)) {
      continue;
    }
    const entity = world.entities.find((candidate) => candidate.id === id);
    const raw = rawBeforeVariable.get(id);
    if (entity?.components.Transform === undefined || raw === undefined) {
      continue;
    }
    entity.components.Transform = transformSampleToComponent(raw);
  }
}

function transformSampleToComponent(sample: ITransformSample): NonNullable<IWorldIr["entities"][number]["components"]["Transform"]> {
  return {
    ...(sample.position === undefined ? {} : { position: [...sample.position] }),
    ...(sample.rotation === undefined ? {} : { rotation: [...sample.rotation] }),
    ...(sample.scale === undefined ? {} : { scale: [...sample.scale] }),
  };
}

function snapshotWorldTransforms(world: IWorldIr): Map<string, ITransformSample> {
  return new Map(
    world.entities
      .filter((entity) => entity.components.Transform !== undefined)
      .map((entity) => {
        const transform = entity.components.Transform!;
        return [entity.id, {
          ...(transform.position === undefined ? {} : { position: [...transform.position] }),
          ...(transform.rotation === undefined ? {} : { rotation: [...transform.rotation] }),
          ...(transform.scale === undefined ? {} : { scale: [...transform.scale] }),
        } satisfies ITransformSample] as const;
      }),
  );
}

function changedTransformEntities(
  before: Map<string, ITransformSample>,
  after: Map<string, ITransformSample>,
): Set<string> {
  const ids = new Set([...before.keys(), ...after.keys()]);
  return new Set([...ids].filter((id) => !transformSamplesEqual(before.get(id), after.get(id))));
}

function transformSamplesEqual(left: ITransformSample | undefined, right: ITransformSample | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return tupleEqual(left.position, right.position)
    && tupleEqual(left.rotation, right.rotation)
    && tupleEqual(left.scale, right.scale);
}

function tupleEqual(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function collectSystemResult(mapped: IThreeWorld, result: { diagnostics: IThreeWorld["diagnostics"]; entries: Parameters<typeof applyAnimationServiceEffects>[1] }): void {
  const existing = new Set(mapped.diagnostics.map((diagnostic) => `${diagnostic.code}\0${diagnostic.path}\0${diagnostic.message}`));
  for (const diagnostic of result.diagnostics) {
    const key = `${diagnostic.code}\0${diagnostic.path}\0${diagnostic.message}`;
    if (!existing.has(key)) {
      existing.add(key);
      mapped.diagnostics.push(diagnostic);
    }
  }
  applyAnimationServiceEffects(mapped, result.entries);
  applyMaterialPatchEffects(mapped, result.entries);
}

function collectInteractionResult(mapped: IThreeWorld, result: { diagnostics: IThreeWorld["diagnostics"] }): void {
  collectSystemResult(mapped, { diagnostics: result.diagnostics, entries: [] });
}
