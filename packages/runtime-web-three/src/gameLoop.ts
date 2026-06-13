import type { ISystemsIr, IWorldIr } from "@threenative/ir";
import type { IThreeWorld } from "./mapWorld.js";
import { syncTransforms } from "./mapWorld.js";
import { runSchedule, type ISystemModule } from "./systems/runner.js";

export async function runGameFrame(options: {
  delta: number;
  fixedDelta?: number;
  mapped: IThreeWorld;
  module: ISystemModule;
  systems: ISystemsIr;
  world: IWorldIr;
}): Promise<void> {
  const fixedDelta = options.fixedDelta ?? 1 / 60;
  await runSchedule({ ...options, fixedDelta, schedule: "fixedUpdate" });
  await runSchedule({ ...options, fixedDelta, schedule: "update" });
  await runSchedule({ ...options, fixedDelta, schedule: "postUpdate" });
  syncTransforms(options.world, options.mapped.objectsById);
}
