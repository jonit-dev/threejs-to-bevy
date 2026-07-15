import * as THREE from "three";

import type { ICameraViewPlan } from "./cameras.js";

export interface IWebMeshLodLevel {
  geometry: THREE.BufferGeometry;
  mesh: string;
  minDistance: number;
}

export interface IWebMeshLodRegistration {
  base: {
    geometry: THREE.BufferGeometry;
    mesh: string;
  };
  entity: string;
  levels: readonly IWebMeshLodLevel[];
  object: THREE.Mesh;
}

export interface IWebMeshLodSelection {
  entity: string;
  distance: number | null;
  selectedMesh: string;
  threshold: number;
}

export interface IWebMeshLodRuntime {
  entries: Map<string, IWebMeshLodRegistration>;
  selections: Map<string, { distance: number | null }>;
}

const cachedGeometries = new WeakMap<THREE.Mesh, readonly THREE.BufferGeometry[]>();
const entityWorldPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();

export function createWebMeshLodRuntime(): IWebMeshLodRuntime {
  return {
    entries: new Map(),
    selections: new Map(),
  };
}

export function selectMeshLodLevel<T extends { minDistance: number }>(
  levels: readonly T[],
  distance: number,
): T | undefined {
  let selected: T | undefined;
  for (const level of levels) {
    if (level.minDistance > distance) {
      break;
    }
    selected = level;
  }
  return selected;
}

export function registerWebMeshLod(
  runtime: IWebMeshLodRuntime,
  registration: IWebMeshLodRegistration,
): void {
  runtime.entries.set(registration.entity, registration);
  runtime.selections.set(registration.entity, { distance: null });
  cachedGeometries.set(registration.object, [
    registration.base.geometry,
    ...registration.levels.map((level) => level.geometry),
  ]);
}

export function unregisterWebMeshLod(runtime: IWebMeshLodRuntime, entity: string): void {
  runtime.entries.delete(entity);
  runtime.selections.delete(entity);
}

export function updateWebMeshLod(
  runtime: IWebMeshLodRuntime,
  cameraViews: readonly ICameraViewPlan[],
  cameras: ReadonlyMap<string, THREE.Camera>,
): void {
  const activeCameras = cameraViews
    .map((view) => cameras.get(view.entityId))
    .filter((camera): camera is THREE.Camera => camera !== undefined);

  for (const [entity, registration] of runtime.entries) {
    const distance = closestCameraDistance(registration.object, activeCameras);
    const selected = distance === null
      ? undefined
      : selectMeshLodLevel(registration.levels, distance);
    const selectedGeometry = selected?.geometry ?? registration.base.geometry;
    if (registration.object.geometry !== selectedGeometry) {
      registration.object.geometry = selectedGeometry;
    }
    runtime.selections.set(entity, { distance });
  }
}

export function traceWebMeshLod(runtime: IWebMeshLodRuntime): IWebMeshLodSelection[] {
  return [...runtime.entries.values()]
    .map((registration) => {
      const selected = registration.levels.find((level) => level.geometry === registration.object.geometry);
      const selectedBase = registration.object.geometry === registration.base.geometry;
      return {
        distance: runtime.selections.get(registration.entity)?.distance ?? null,
        entity: registration.entity,
        selectedMesh: selected?.mesh ?? registration.base.mesh,
        threshold: selectedBase ? 0 : selected?.minDistance ?? 0,
      };
    })
    .sort((left, right) => left.entity.localeCompare(right.entity));
}

export function meshLodGeometries(object: THREE.Mesh): readonly THREE.BufferGeometry[] {
  return cachedGeometries.get(object) ?? [object.geometry];
}

export function forgetMeshLodGeometries(object: THREE.Mesh): void {
  cachedGeometries.delete(object);
}

function closestCameraDistance(
  object: THREE.Object3D,
  cameras: readonly THREE.Camera[],
): number | null {
  if (cameras.length === 0) {
    return null;
  }
  object.getWorldPosition(entityWorldPosition);
  let distance = Number.POSITIVE_INFINITY;
  for (const camera of cameras) {
    camera.getWorldPosition(cameraWorldPosition);
    distance = Math.min(distance, entityWorldPosition.distanceTo(cameraWorldPosition));
  }
  return distance;
}
