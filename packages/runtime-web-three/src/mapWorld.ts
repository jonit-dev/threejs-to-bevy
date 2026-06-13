import * as THREE from "three";
import type { IAssetIr, IMaterialIr, IRuntimeDiagnostic, IWorldEntity, IWorldIr } from "@threenative/ir";
import type { IWebBundle } from "./loadBundle.js";

export type { IRuntimeDiagnostic } from "@threenative/ir";

export interface IThreeWorld {
  camera: THREE.Camera;
  diagnostics: IRuntimeDiagnostic[];
  objectsById: Map<string, THREE.Object3D>;
  scene: THREE.Scene;
}

export function mapWorld(bundle: IWebBundle): IThreeWorld {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111318");
  const objectsById = new Map<string, THREE.Object3D>();
  const diagnostics: IRuntimeDiagnostic[] = [];
  const assetsById = new Map(bundle.assets.assets.map((asset) => [asset.id, asset]));
  const materialsById = new Map(bundle.materials.materials.map((material) => [material.id, material]));
  let selectedCamera: THREE.Camera | undefined;

  const entities = [...bundle.world.entities].sort((left, right) => left.id.localeCompare(right.id));
  for (const entity of entities) {
    const object = mapEntity(entity, assetsById, materialsById, diagnostics);
    applyTransform(object, entity);
    objectsById.set(entity.id, object);
  }

  for (const entity of entities) {
    const object = objectsById.get(entity.id);
    if (object === undefined) {
      continue;
    }

    const parentId = readParentId(entity);
    const parent = parentId === undefined ? undefined : objectsById.get(parentId);
    if (parent !== undefined) {
      parent.add(object);
    } else {
      scene.add(object);
    }

    if (object instanceof THREE.Camera && selectedCamera === undefined) {
      selectedCamera = object;
    }
  }

  const activeCameraEntity = readActiveCamera(bundle);
  const activeCamera = activeCameraEntity === undefined ? undefined : objectsById.get(activeCameraEntity);
  if (activeCamera instanceof THREE.Camera) {
    selectedCamera = activeCamera;
  }

  if (selectedCamera === undefined) {
    selectedCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    selectedCamera.position.set(0, 1.5, 4);
    diagnostics.push({
      code: "TN-WEB-CAMERA-MISSING",
      message: "No camera entity was found; using fallback camera.",
      path: "world.ir.json/resources/ActiveCamera",
      severity: "warning",
    });
  }

  return { camera: selectedCamera, diagnostics, objectsById, scene };
}

function mapEntity(
  entity: IWorldEntity,
  assetsById: Map<string, IAssetIr>,
  materialsById: Map<string, IMaterialIr>,
  diagnostics: IRuntimeDiagnostic[],
): THREE.Object3D {
  const renderer = entity.components.MeshRenderer;
  if (renderer !== undefined) {
    const asset = assetsById.get(renderer.mesh);
    const material = materialsById.get(renderer.material);
    if (asset !== undefined && material !== undefined) {
      return new THREE.Mesh(mapGeometry(asset), mapMaterial(material));
    }
    diagnostics.push({
      code: "TN-WEB-MESH-REFERENCE-MISSING",
      message: `Entity '${entity.id}' has unresolved mesh or material reference.`,
      path: `world.ir.json/entities/${entity.id}/components/MeshRenderer`,
      severity: "error",
    });
  }

  const camera = entity.components.Camera;
  if (camera?.kind === "perspective") {
    return new THREE.PerspectiveCamera(camera.fovY ?? 60, 1, camera.near, camera.far);
  }

  const light = entity.components.Light;
  if (light?.kind === "directional") {
    return new THREE.DirectionalLight(colorToThree(light.color), light.intensity);
  }
  if (light?.kind === "ambient") {
    return new THREE.AmbientLight(colorToThree(light.color), light.intensity);
  }

  return new THREE.Object3D();
}

function mapGeometry(asset: IAssetIr): THREE.BufferGeometry {
  if (asset.primitive === "box") {
    const [x = 1, y = 1, z = 1] = asset.size ?? [];
    return new THREE.BoxGeometry(x, y, z);
  }
  if (asset.primitive === "sphere") {
    return new THREE.SphereGeometry(asset.size?.[0] ?? 0.5, 32, 16);
  }
  const [x = 1, y = 1] = asset.size ?? [];
  return new THREE.PlaneGeometry(x, y);
}

function mapMaterial(material: IMaterialIr): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: colorToThree(material.color),
    metalness: material.metalness ?? 0,
    roughness: material.roughness ?? 1,
  });
}

function applyTransform(object: THREE.Object3D, entity: IWorldEntity): void {
  const transform = entity.components.Transform;
  if (transform?.position !== undefined) {
    object.position.fromArray([...transform.position]);
  }
  if (transform?.rotation !== undefined) {
    object.quaternion.fromArray([...transform.rotation]);
  }
  if (transform?.scale !== undefined) {
    object.scale.fromArray([...transform.scale]);
  }
}

export function syncTransforms(world: IWorldIr, objectsById: Map<string, THREE.Object3D>): void {
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  for (const id of objectsById.keys()) {
    if (!entityIds.has(id)) {
      objectsById.get(id)?.removeFromParent();
      objectsById.delete(id);
    }
  }
  for (const entity of world.entities) {
    const object = objectsById.get(entity.id);
    if (object !== undefined) {
      applyTransform(object, entity);
    }
  }
}

function colorToThree(color: IMaterialIr["color"]): THREE.Color {
  if (typeof color === "string") {
    return new THREE.Color(color);
  }
  return new THREE.Color(color[0], color[1], color[2]);
}

function readParentId(entity: IWorldEntity): string | undefined {
  const hierarchy = entity.components.Hierarchy as { parent?: string } | undefined;
  return hierarchy?.parent;
}

function readActiveCamera(bundle: IWebBundle): string | undefined {
  const activeCamera = bundle.world.resources?.ActiveCamera as { entity?: string } | undefined;
  return activeCamera?.entity;
}
