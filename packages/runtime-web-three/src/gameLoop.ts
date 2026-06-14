import type { IRuntimeConfigIr, ISystemsIr, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "./input.js";
import type { IThreeWorld } from "./mapWorld.js";
import { syncTransforms } from "./mapWorld.js";
import { stepPhysics } from "./physics.js";
import { runSchedule, type ISystemModule } from "./systems/runner.js";
import type { ISystemEffectLog } from "./systems/log.js";

export interface IGameLoopState {
  accumulator: number;
  elapsed: number;
  frame: number;
  paused: boolean;
  startupComplete: boolean;
  tick: number;
}

export function createGameLoopState(config?: IRuntimeConfigIr): IGameLoopState {
  return {
    accumulator: 0,
    elapsed: 0,
    frame: 0,
    paused: config?.time.paused ?? false,
    startupComplete: false,
    tick: 0,
  };
}

export function setPaused(state: IGameLoopState, paused: boolean): void {
  state.paused = paused;
}

export async function runGameFrame(options: {
  delta: number;
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
  const state = options.state;
  if (state !== undefined) {
    state.elapsed += options.delta;
    state.accumulator += options.delta;
    if (!state.paused) {
      if (!state.startupComplete) {
        collectDiagnostics(options.mapped, await runSchedule({ ...options, delta: 0, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "startup", tick: state.tick }));
        state.startupComplete = true;
      }
      while (state.accumulator >= fixedDelta) {
        stepPhysics(options.world, fixedDelta);
        collectDiagnostics(
          options.mapped,
          await runSchedule({ ...options, delta: fixedDelta, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "fixedUpdate", tick: state.tick }),
        );
        state.tick += 1;
        state.accumulator -= fixedDelta;
      }
      collectDiagnostics(options.mapped, await runSchedule({ ...options, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "update", tick: state.tick }));
      collectDiagnostics(options.mapped, await runSchedule({ ...options, elapsed: state.elapsed, fixedDelta, frame: state.frame, paused: state.paused, schedule: "postUpdate", tick: state.tick }));
    }
    state.frame += 1;
  } else {
    collectDiagnostics(options.mapped, await runSchedule({ ...options, delta: 0, fixedDelta, frame: 0, schedule: "startup", tick: 0 }));
    stepPhysics(options.world, fixedDelta);
    collectDiagnostics(options.mapped, await runSchedule({ ...options, fixedDelta, frame: 0, schedule: "fixedUpdate", tick: 0 }));
    collectDiagnostics(options.mapped, await runSchedule({ ...options, fixedDelta, frame: 0, schedule: "update", tick: 0 }));
    collectDiagnostics(options.mapped, await runSchedule({ ...options, fixedDelta, frame: 0, schedule: "postUpdate", tick: 0 }));
  }
  syncTransforms(options.world, options.mapped.objectsById);
  options.input?.beginFrame();
}

function collectDiagnostics(mapped: IThreeWorld, result: { diagnostics: IThreeWorld["diagnostics"] }): void {
  mapped.diagnostics.push(...result.diagnostics);
}
