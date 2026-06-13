import type { IRuntimeConfigIr, ISystemsIr, IWorldIr } from "@threenative/ir";
import type { IWebInputState } from "./input.js";
import type { IThreeWorld } from "./mapWorld.js";
import { syncTransforms } from "./mapWorld.js";
import { stepPhysics } from "./physics.js";
import { runSchedule, type ISystemModule } from "./systems/runner.js";

export interface IGameLoopState {
  accumulator: number;
  elapsed: number;
  paused: boolean;
}

export function createGameLoopState(config?: IRuntimeConfigIr): IGameLoopState {
  return {
    accumulator: 0,
    elapsed: 0,
    paused: config?.time.paused ?? false,
  };
}

export function setPaused(state: IGameLoopState, paused: boolean): void {
  state.paused = paused;
}

export async function runGameFrame(options: {
  delta: number;
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
      while (state.accumulator >= fixedDelta) {
        stepPhysics(options.world, fixedDelta);
        await runSchedule({ ...options, delta: fixedDelta, elapsed: state.elapsed, fixedDelta, paused: state.paused, schedule: "fixedUpdate" });
        state.accumulator -= fixedDelta;
      }
      await runSchedule({ ...options, elapsed: state.elapsed, fixedDelta, paused: state.paused, schedule: "update" });
      await runSchedule({ ...options, elapsed: state.elapsed, fixedDelta, paused: state.paused, schedule: "postUpdate" });
    }
  } else {
    stepPhysics(options.world, fixedDelta);
    await runSchedule({ ...options, fixedDelta, schedule: "fixedUpdate" });
    await runSchedule({ ...options, fixedDelta, schedule: "update" });
    await runSchedule({ ...options, fixedDelta, schedule: "postUpdate" });
  }
  syncTransforms(options.world, options.mapped.objectsById);
  options.input?.beginFrame();
}
