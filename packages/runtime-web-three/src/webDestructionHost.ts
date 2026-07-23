import type { IWorldIr } from "@threenative/ir";

import { createPhysicsDestructionRuntime, reconcilePhysicsDestructibles, type IPhysicsDestructionRuntime } from "./physicsDestruction.js";
import type { IWebBundle } from "./webBundle.js";

export interface IWebDestructionHost {
  reconcile(world: IWorldIr): void;
  runtime: IPhysicsDestructionRuntime;
}

export function createWebDestructionHost(bundle: Pick<IWebBundle, "fractureManifests" | "world">): IWebDestructionHost {
  const runtime = createPhysicsDestructionRuntime();
  const manifests = bundle.fractureManifests ?? {};
  const host = {
    reconcile(world: IWorldIr) { reconcilePhysicsDestructibles(runtime, world, manifests); },
    runtime,
  };
  host.reconcile(bundle.world);
  return host;
}
