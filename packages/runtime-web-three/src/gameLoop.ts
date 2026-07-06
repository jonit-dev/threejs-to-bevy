import type { IAssetsManifest, IIrSchemaFile, IRuntimeConfigIr, ISystemsIr, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "./input.js";
import type { IThreeWorld } from "./mapWorld.js";
import { applyAnimationServiceEffects, syncMeshRendererMaterials, syncTransforms } from "./mapWorld.js";
import { stepKinematicMovers } from "./kinematicMover.js";
import { stepPhysics } from "./physics.js";
import { runSchedule, type ISystemModule } from "./systems/runner.js";
import type { ISystemEffectLog } from "./systems/log.js";
import { interpolateTransform, type ITransformSample } from "./transformInterpolation.js";

export interface IGameLoopState {
  accumulator: number;
  elapsed: number;
  frame: number;
  interpolation: IGameLoopInterpolationState;
  paused: boolean;
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
    paused: config?.time.paused ?? false,
    startupComplete: false,
    tick: 0,
  };
}

export function setPaused(state: IGameLoopState, paused: boolean): void {
  state.paused = paused;
}

export async function runGameFrame(options: {
  assets?: IAssetsManifest;
  delta: number;
  componentSchemas?: IIrSchemaFile;
  effectLog?: ISystemEffectLog;
  fixedDelta?: number;
  input?: IWebInputState;
  mapped: IThreeWorld;
  module: ISystemModule;
  runtimeConfig?: IRuntimeConfigIr;
  state?: IGameLoopState;
  systems: ISystemsIr;
  world: IWorldIr;
}): Promise<void> {
  const fixedDelta = options.fixedDelta ?? options.runtimeConfig?.time.fixedDelta ?? 1 / 60;
  options.input?.beginFrame();
  const state = options.state;
  if (state !== undefined) {
    state.elapsed += options.delta;
    state.accumulator += options.delta;
    if (!state.paused) {
      if (!state.startupComplete) {
        collectSystemResult(options.mapped, await runSchedule({ ...options, delta: 0, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "startup", tick: state.tick }));
        state.startupComplete = true;
      }
      while (state.accumulator >= fixedDelta) {
        const beforeFixed = snapshotWorldTransforms(options.world);
        stepKinematicMovers(options.world, state.elapsed);
        stepPhysics(options.world, fixedDelta);
        collectSystemResult(
          options.mapped,
          await runSchedule({ ...options, delta: fixedDelta, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "fixedUpdate", tick: state.tick }),
        );
        recordFixedTransformStep(state, beforeFixed, snapshotWorldTransforms(options.world));
        state.tick += 1;
        state.accumulator -= fixedDelta;
      }
      const beforeVariable = snapshotWorldTransforms(options.world);
      collectSystemResult(options.mapped, await runSchedule({ ...options, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "update", tick: state.tick }));
      collectSystemResult(options.mapped, await runSchedule({ ...options, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "postUpdate", tick: state.tick }));
      removeVariableTransformWrites(state, beforeVariable, snapshotWorldTransforms(options.world));
    }
    state.frame += 1;
  } else {
    collectSystemResult(options.mapped, await runSchedule({ ...options, delta: 0, fixedDelta, frame: 0, schedule: "startup", tick: 0 }));
    stepKinematicMovers(options.world, fixedDelta);
    stepPhysics(options.world, fixedDelta);
    collectSystemResult(options.mapped, await runSchedule({ ...options, fixedDelta, frame: 0, schedule: "fixedUpdate", tick: 0 }));
    collectSystemResult(options.mapped, await runSchedule({ ...options, fixedDelta, frame: 0, schedule: "update", tick: 0 }));
    collectSystemResult(options.mapped, await runSchedule({ ...options, fixedDelta, frame: 0, schedule: "postUpdate", tick: 0 }));
  }
  syncTransforms(options.world, options.mapped.objectsById);
  if (state !== undefined) {
    applyFixedTransformInterpolation(options.mapped, state, fixedDelta);
  }
  syncMeshRendererMaterials(options.world, options.mapped.objectsById);
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
  mapped.diagnostics.push(...result.diagnostics);
  applyAnimationServiceEffects(mapped, result.entries);
}
