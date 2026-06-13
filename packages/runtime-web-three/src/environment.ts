import * as THREE from "three";
import type { IWebBundle } from "./loadBundle.js";
import { buildInstancingPlan, type IInstancingPlan } from "./instancing.js";
import { applyAtmosphereProfile, type IAtmosphereObservation } from "./rendering.js";

export interface IEnvironmentRuntime {
  atmosphere: IAtmosphereObservation;
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
  const atmosphere = applyAtmosphereProfile(object as unknown as THREE.Scene, bundle.environmentScene.atmosphere);

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
      new THREE.BoxGeometry(0.35, 0.8, 0.35),
      new THREE.MeshBasicMaterial({ color: colorForSourceAsset(group.sourceAsset) }),
      group.count,
    );
    mesh.name = `instanced:${group.sourceAsset}`;
    group.instanceIds.forEach((id, index) => {
      const instance = bundle.environmentScene?.instances.find((item) => item.id === id);
      if (instance === undefined) {
        return;
      }
      mesh.setMatrixAt(index, matrixForInstance(instance.position, instance.scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    object.add(mesh);
  }

  for (const item of instancingPlan.uninstanced) {
    const instance = bundle.environmentScene.instances.find((candidate) => candidate.id === item.id);
    if (instance === undefined) {
      continue;
    }
    const mesh = new THREE.Mesh(
      geometryForInstance(instance.tags ?? [], item.sourceAsset),
      new THREE.MeshBasicMaterial({ color: colorForSourceAsset(item.sourceAsset) }),
    );
    mesh.name = `environment:${instance.id}`;
    mesh.position.fromArray([...instance.position]);
    mesh.scale.fromArray([...(instance.scale ?? [1, 1, 1])]);
    object.add(mesh);
  }

  return { atmosphere, instancingPlan, object, observation: observeEnvironmentScene(bundle.environmentScene) };
}

export function applyEnvironmentBookmark(bundle: IWebBundle, camera: THREE.Camera, bookmarkId: string): boolean {
  const bookmark = bundle.environmentScene?.bookmarks?.find((item) => item.id === bookmarkId);
  if (bookmark === undefined) {
    return false;
  }
  camera.position.fromArray([...bookmark.position]);
  camera.rotation.set(THREE.MathUtils.degToRad(bookmark.pitch), THREE.MathUtils.degToRad(bookmark.yaw - 180), 0, "YXZ");
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = 62;
    camera.updateProjectionMatrix();
  }
  return true;
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

function matrixForInstance(position: readonly [number, number, number], scale: readonly [number, number, number] | undefined): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion(),
    new THREE.Vector3(...(scale ?? [1, 1, 1])),
  );
}

function geometryForInstance(tags: readonly string[], sourceAsset: string): THREE.BufferGeometry {
  if (tags.includes("tree") || sourceAsset.toLowerCase().includes("tree") || sourceAsset.toLowerCase().includes("pine")) {
    return new THREE.ConeGeometry(0.55, 2.4, 8);
  }
  if (tags.includes("rock") || sourceAsset.toLowerCase().includes("rock")) {
    return new THREE.DodecahedronGeometry(0.45, 0);
  }
  if (tags.includes("mushroom")) {
    return new THREE.SphereGeometry(0.22, 12, 8);
  }
  if (tags.includes("flower")) {
    return new THREE.SphereGeometry(0.14, 8, 6);
  }
  return new THREE.BoxGeometry(0.28, 0.45, 0.28);
}

function colorForSourceAsset(sourceAsset: string): THREE.Color {
  const normalized = sourceAsset.toLowerCase();
  if (normalized.includes("tree") || normalized.includes("pine")) {
    return new THREE.Color("#2f5f3f");
  }
  if (normalized.includes("rock")) {
    return new THREE.Color("#77766d");
  }
  if (normalized.includes("mushroom")) {
    return new THREE.Color("#d9c7a4");
  }
  if (normalized.includes("flower")) {
    return new THREE.Color("#d77b96");
  }
  if (normalized.includes("pebble")) {
    return new THREE.Color("#a0998c");
  }
  return new THREE.Color("#6aa05f");
}
