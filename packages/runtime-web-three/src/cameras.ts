import * as THREE from "three";
import type {
  ICameraClear,
  ICameraComponent,
  ICameraProjection,
  ICameraViewport,
  IRuntimeDiagnostic,
  IWorldEntity,
  IWorldIr,
  Vec3,
} from "@threenative/ir";

export interface IPhysicalViewport {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface ICameraViewPlan {
  cameraId: string;
  clear?: ICameraClear;
  entityId: string;
  layers: readonly string[];
  order: number;
  targetKind: "backbuffer" | "depth" | "texture";
  targetAsset?: string;
  viewport?: ICameraViewport;
}

export interface ICameraHelperState {
  shakePhase: number;
  shakeStrength: number;
}

const MAX_RENDER_LAYERS = 32;

export function allocateRenderLayers(
  layerNames: Iterable<string>,
  diagnostics: IRuntimeDiagnostic[],
): Map<string, number> {
  const allocation = new Map<string, number>();
  allocation.set("default", 0);
  let nextBit = 1;
  const sorted = [...new Set(layerNames)].filter((name) => name !== "default").sort((left, right) => left.localeCompare(right));
  for (const name of sorted) {
    if (nextBit >= MAX_RENDER_LAYERS) {
      diagnostics.push({
        code: "TN-WEB-RENDER-LAYER-CAPACITY",
        message: `Render layer '${name}' could not be allocated; runtime supports ${MAX_RENDER_LAYERS} layers.`,
        path: `render-layers/${name}`,
        severity: "warning",
      });
      continue;
    }
    allocation.set(name, nextBit);
    nextBit += 1;
  }
  return allocation;
}

export function viewportToPhysical(
  viewport: ICameraViewport,
  renderWidth: number,
  renderHeight: number,
): IPhysicalViewport {
  const [x, y, width, height] = viewport;
  return {
    height: Math.max(1, Math.round(height * renderHeight)),
    width: Math.max(1, Math.round(width * renderWidth)),
    x: Math.round(x * renderWidth),
    y: Math.round(y * renderHeight),
  };
}

export function cameraOrder(camera: ICameraComponent, entityId: string): number {
  if (camera.order !== undefined) {
    return camera.order;
  }
  if (camera.priority !== undefined) {
    return camera.priority;
  }
  return 0;
}

export function readActiveCameraIds(world: IWorldIr): string[] {
  const activeCameras = world.resources?.ActiveCameras as { cameras?: readonly { entity?: string }[] } | undefined;
  if (activeCameras?.cameras !== undefined && activeCameras.cameras.length > 0) {
    return activeCameras.cameras
      .map((entry) => entry.entity)
      .filter((entity): entity is string => entity !== undefined);
  }
  const activeCamera = world.resources?.ActiveCamera as { entity?: string } | undefined;
  if (activeCamera?.entity !== undefined) {
    return [activeCamera.entity];
  }
  return [];
}

export function planCameraViews(
  world: IWorldIr,
  objectsById: Map<string, THREE.Object3D>,
): ICameraViewPlan[] {
  const declared = readActiveCameraIds(world);
  const cameraEntities = world.entities.filter((entity) => entity.components.Camera !== undefined);
  const selected = declared.length > 0
    ? declared
    : cameraEntities.map((entity) => entity.id);

  const entityById = new Map(cameraEntities.map((entity) => [entity.id, entity]));
  const plans: ICameraViewPlan[] = [];
  for (const entityId of selected) {
    const entity = entityById.get(entityId);
    const cameraComponent = entity?.components.Camera;
    const object = objectsById.get(entityId);
    if (entity === undefined || cameraComponent === undefined || !(object instanceof THREE.Camera)) {
      continue;
    }
    plans.push({
      cameraId: entityId,
      clear: cameraComponent.clear,
      entityId,
      layers: cameraComponent.layers ?? ["default"],
      order: cameraOrder(cameraComponent, entityId),
      targetAsset: cameraComponent.target?.kind === "texture" || cameraComponent.target?.kind === "depth"
        ? cameraComponent.target.asset
        : undefined,
      targetKind: cameraComponent.target?.kind ?? "backbuffer",
      viewport: cameraComponent.viewport,
    });
  }

  return plans.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.entityId.localeCompare(right.entityId);
  });
}

export function applyRenderLayersToObject(
  object: THREE.Object3D,
  layerNames: readonly string[],
  allocation: Map<string, number>,
): void {
  object.layers.disableAll();
  for (const name of layerNames.length === 0 ? ["default"] : layerNames) {
    const bit = allocation.get(name) ?? allocation.get("default") ?? 0;
    object.layers.enable(bit);
  }
  object.traverse((child) => {
    child.layers.mask = object.layers.mask;
  });
}

export function applyCameraRenderLayers(
  camera: THREE.Camera,
  layerNames: readonly string[],
  allocation: Map<string, number>,
): void {
  camera.layers.disableAll();
  for (const name of layerNames.length === 0 ? ["default"] : layerNames) {
    const bit = allocation.get(name) ?? allocation.get("default") ?? 0;
    camera.layers.enable(bit);
  }
}

export function collectLayerNames(world: IWorldIr): string[] {
  const names = new Set<string>(["default"]);
  for (const entity of world.entities) {
    for (const layer of entity.components.RenderLayers?.layers ?? []) {
      names.add(layer);
    }
    for (const layer of entity.components.Camera?.layers ?? []) {
      names.add(layer);
    }
  }
  return [...names];
}

function helperState(camera: THREE.Camera): ICameraHelperState {
  const existing = camera.userData.threeNativeCameraHelper as ICameraHelperState | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const created: ICameraHelperState = { shakePhase: 0, shakeStrength: 0 };
  camera.userData.threeNativeCameraHelper = created;
  return created;
}

function lerpScalar(current: number, target: number, smoothing: number, delta: number): number {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * delta);
  return current + (target - current) * factor;
}

function lerpVector3(current: THREE.Vector3, target: THREE.Vector3, smoothing: number, delta: number): void {
  current.x = lerpScalar(current.x, target.x, smoothing, delta);
  current.y = lerpScalar(current.y, target.y, smoothing, delta);
  current.z = lerpScalar(current.z, target.z, smoothing, delta);
}

function readOffset(offset: Vec3 | undefined): THREE.Vector3 {
  return offset === undefined ? new THREE.Vector3() : new THREE.Vector3(...offset);
}

function updateFollowHelper(
  camera: THREE.Camera,
  entity: IWorldEntity,
  objectsById: Map<string, THREE.Object3D>,
  delta: number,
): void {
  const follow = entity.components.Camera?.follow;
  if (follow === undefined) {
    return;
  }
  const target = objectsById.get(follow.target);
  if (target === undefined) {
    return;
  }
  const offset = readOffset(follow.offset);
  const desired = target.getWorldPosition(new THREE.Vector3()).add(offset);
  const smoothing = follow.smoothing ?? 8;
  lerpVector3(camera.position, desired, smoothing, delta);
  camera.lookAt(target.getWorldPosition(new THREE.Vector3()));
  writeBackCameraPose(entity, camera);
}

// Persist the helper-driven pose into the world IR so the per-frame
// syncTransforms pass re-applies it instead of resetting the camera to its
// authored transform (which would pin the camera near its spawn pose).
function writeBackCameraPose(entity: IWorldEntity, camera: THREE.Camera): void {
  if (entity.components.Transform === undefined) {
    return;
  }
  entity.components.Transform = {
    ...entity.components.Transform,
    position: [camera.position.x, camera.position.y, camera.position.z],
    rotation: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
  };
}

function updateOrbitHelper(
  camera: THREE.Camera,
  entity: IWorldEntity,
  objectsById: Map<string, THREE.Object3D>,
  delta: number,
): void {
  const orbit = entity.components.Camera?.orbit;
  if (orbit === undefined) {
    return;
  }
  const target = objectsById.get(orbit.target);
  if (target === undefined) {
    return;
  }
  const targetPosition = target.getWorldPosition(new THREE.Vector3());
  const offset = camera.position.clone().sub(targetPosition);
  const distance = offset.length();
  const desiredDistance = Math.min(
    orbit.maxDistance ?? Number.POSITIVE_INFINITY,
    Math.max(orbit.minDistance ?? 0, orbit.distance ?? distance),
  );
  if (distance > 0) {
    offset.multiplyScalar(desiredDistance / distance);
  } else {
    offset.set(0, desiredDistance, desiredDistance);
  }
  const smoothing = orbit.smoothing ?? 8;
  const desired = targetPosition.clone().add(offset);
  lerpVector3(camera.position, desired, smoothing, delta);
  camera.lookAt(targetPosition);
  writeBackCameraPose(entity, camera);
}

function updateScreenShake(
  camera: THREE.Camera,
  entity: IWorldEntity,
  delta: number,
): void {
  const shake = entity.components.Camera?.screenShake;
  const state = helperState(camera);
  if (shake === undefined) {
    state.shakeStrength = lerpScalar(state.shakeStrength, 0, 6, delta);
  } else {
    state.shakeStrength = Math.max(state.shakeStrength, shake.amplitude);
    state.shakePhase += delta * (shake.frequency ?? 20) * Math.PI * 2;
    const decay = shake.decay ?? 4;
    state.shakeStrength = lerpScalar(state.shakeStrength, 0, decay, delta);
  }
  if (state.shakeStrength <= 1e-4) {
    return;
  }
  const offset = new THREE.Vector3(
    Math.sin(state.shakePhase) * state.shakeStrength,
    Math.cos(state.shakePhase * 1.3) * state.shakeStrength,
    Math.sin(state.shakePhase * 0.7) * state.shakeStrength * 0.5,
  );
  camera.position.add(offset);
}

function updateViewModelHelper(camera: THREE.Camera, entity: IWorldEntity): void {
  const viewModel = entity.components.Camera?.viewModel;
  if (viewModel?.offset === undefined) {
    return;
  }
  camera.position.add(readOffset(viewModel.offset));
}

export function updateCameraHelpers(
  world: IWorldIr,
  objectsById: Map<string, THREE.Object3D>,
  delta: number,
): void {
  for (const entity of world.entities) {
    const camera = objectsById.get(entity.id);
    if (!(camera instanceof THREE.Camera)) {
      continue;
    }
    updateFollowHelper(camera, entity, objectsById, delta);
    updateOrbitHelper(camera, entity, objectsById, delta);
    updateViewModelHelper(camera, entity);
    updateScreenShake(camera, entity, delta);
  }
}

export function applyCustomProjection(camera: THREE.Camera, projection: ICameraProjection | undefined): void {
  if (projection === undefined || projection.kind !== "matrix" || projection.matrix.length !== 16) {
    return;
  }
  camera.projectionMatrix.fromArray([...projection.matrix]);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

export function projectionMatrixHash(projection: ICameraProjection | undefined): string | undefined {
  if (projection === undefined || projection.kind !== "matrix") {
    return undefined;
  }
  return projection.matrix.map((value) => value.toFixed(6)).join(",");
}

export function updateCameraProjection(
  camera: THREE.Camera,
  renderWidth: number,
  renderHeight: number,
  cameraComponent?: ICameraComponent,
): void {
  const projection = cameraComponent ?? (camera.userData.threeNativeCamera as ICameraComponent | undefined);
  if (projection?.projection?.kind === "matrix") {
    applyCustomProjection(camera, projection.projection);
    return;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const aspect = renderWidth / Math.max(1, renderHeight);
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    return;
  }
  if (camera instanceof THREE.OrthographicCamera) {
    const size = Math.max(camera.top - camera.bottom, 1);
    const halfHeight = size / 2;
    const halfWidth = halfHeight * (renderWidth / Math.max(1, renderHeight));
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }
}

export function resolvePrimaryCameraId(views: readonly ICameraViewPlan[]): string | undefined {
  const backbuffer = views.filter((view) => view.targetKind === "backbuffer");
  return (backbuffer[0] ?? views[0])?.entityId;
}
