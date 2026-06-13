import * as THREE from "three";
import type { IWebBundle } from "./loadBundle.js";
import { buildInstancingPlan, type IInstancingPlan } from "./instancing.js";

export interface IEnvironmentRuntime {
  instancingPlan: IInstancingPlan;
  object: THREE.Group;
}

export function createEnvironmentRuntime(bundle: IWebBundle): IEnvironmentRuntime | undefined {
  if (bundle.environmentScene === undefined) {
    return undefined;
  }
  const instancingPlan = buildInstancingPlan(bundle.environmentScene);
  const object = new THREE.Group();
  object.name = "tn-v3-environment";

  for (const group of instancingPlan.groups) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: "#6aa05f" }),
      group.count,
    );
    mesh.name = `instanced:${group.sourceAsset}`;
    object.add(mesh);
  }

  return { instancingPlan, object };
}
