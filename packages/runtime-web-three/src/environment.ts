import * as THREE from "three";
import type { IWebBundle } from "./loadBundle.js";
import { buildInstancingPlan, type IInstancingPlan } from "./instancing.js";

export interface IEnvironmentRuntime {
  instancingPlan: IInstancingPlan;
  object: THREE.Group;
  observation: IEnvironmentObservation;
}

export interface IEnvironmentObservation {
  bookmarks: string[];
  heroPlacementIds: string[];
  pathPointCount: number;
  scatterCountsByTag: Record<string, number>;
  scatterInstanceCount: number;
  terrain?: {
    id: string;
    max: readonly [number, number, number];
    min: readonly [number, number, number];
  };
}

export function createEnvironmentRuntime(bundle: IWebBundle): IEnvironmentRuntime | undefined {
  if (bundle.environmentScene === undefined) {
    return undefined;
  }
  const instancingPlan = buildInstancingPlan(bundle.environmentScene);
  const object = new THREE.Group();
  object.name = "tn-environment";

  if (bundle.environmentScene.terrain !== undefined) {
    const min = bundle.environmentScene.terrain.bounds.min;
    const max = bundle.environmentScene.terrain.bounds.max;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(max[0] - min[0], max[2] - min[2]),
      new THREE.MeshBasicMaterial({ color: "#4d6244" }),
    );
    ground.name = `terrain:${bundle.environmentScene.terrain.id}`;
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2);
    object.add(ground);
  }

  const pathPoints = bundle.environmentScene.path.points.map((point) => new THREE.Vector3(point[0], point[1] + 0.01, point[2]));
  const path = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pathPoints),
    new THREE.LineBasicMaterial({ color: "#8b7a55" }),
  );
  path.name = `path:${bundle.environmentScene.path.id}`;
  object.add(path);

  for (const group of instancingPlan.groups) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: "#6aa05f" }),
      group.count,
    );
    mesh.name = `instanced:${group.sourceAsset}`;
    object.add(mesh);
  }

  return { instancingPlan, object, observation: observeEnvironmentScene(bundle.environmentScene) };
}

export function observeEnvironmentScene(scene: NonNullable<IWebBundle["environmentScene"]>): IEnvironmentObservation {
  const scatterCountsByTag: Record<string, number> = {};
  for (const instance of scene.instances) {
    if (instance.kind !== "scatter") {
      continue;
    }
    for (const tag of instance.tags ?? ["untagged"]) {
      scatterCountsByTag[tag] = (scatterCountsByTag[tag] ?? 0) + 1;
    }
  }
  return {
    bookmarks: (scene.bookmarks ?? []).map((bookmark) => bookmark.id).sort((left, right) => left.localeCompare(right)),
    heroPlacementIds: scene.instances
      .filter((instance) => instance.kind === "hero")
      .map((instance) => instance.id)
      .sort((left, right) => left.localeCompare(right)),
    pathPointCount: scene.path.points.length,
    scatterCountsByTag,
    scatterInstanceCount: scene.instances.filter((instance) => instance.kind === "scatter").length,
    terrain:
      scene.terrain === undefined
        ? undefined
        : {
            id: scene.terrain.id,
            max: scene.terrain.bounds.max,
            min: scene.terrain.bounds.min,
          },
  };
}
