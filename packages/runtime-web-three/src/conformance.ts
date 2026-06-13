import * as THREE from "three";
import type {
  IConformanceEntityReport,
  IConformanceReport,
  IWorldEntity,
  Quat,
  Vec3,
} from "@threenative/ir";
import type { IWebBundle } from "./loadBundle.js";
import type { IThreeWorld } from "./mapWorld.js";

export function reportWebConformance(
  bundle: IWebBundle,
  mapped: IThreeWorld,
  fixture = bundle.manifest.name,
): IConformanceReport {
  const idsByObject = new Map<THREE.Object3D, string>();
  for (const [id, object] of mapped.objectsById.entries()) {
    idsByObject.set(object, id);
  }

  return {
    diagnostics: mapped.diagnostics,
    entities: bundle.world.entities
      .map((entity) => reportEntity(entity, mapped, idsByObject))
      .sort((left, right) => left.id.localeCompare(right.id)),
    fixture,
    runtime: "web-three",
  };
}

function reportEntity(
  entity: IWorldEntity,
  mapped: IThreeWorld,
  idsByObject: Map<THREE.Object3D, string>,
): IConformanceEntityReport {
  const object = mapped.objectsById.get(entity.id);
  const report: IConformanceEntityReport = {
    components: componentNames(entity),
    id: entity.id,
  };

  if (object !== undefined) {
    report.transform = {
      position: object.position.toArray() as Vec3,
      rotation: object.quaternion.toArray() as Quat,
      scale: object.scale.toArray() as Vec3,
    };
    const parentId = object.parent === null || object.parent instanceof THREE.Scene ? undefined : idsByObject.get(object.parent);
    if (parentId !== undefined) {
      report.parent = parentId;
    }
  }

  if (entity.components.MeshRenderer !== undefined) {
    report.mesh = entity.components.MeshRenderer.mesh;
    report.material = entity.components.MeshRenderer.material;
  }
  if (entity.components.Camera !== undefined) {
    report.camera = {
      far: entity.components.Camera.far,
      fovY: entity.components.Camera.fovY,
      kind: entity.components.Camera.kind,
      near: entity.components.Camera.near,
    };
  }
  if (entity.components.Light !== undefined) {
    report.light = {
      color: entity.components.Light.color,
      intensity: entity.components.Light.intensity,
      kind: entity.components.Light.kind,
    };
  }

  return report;
}

function componentNames(entity: IWorldEntity): string[] {
  return Object.keys(entity.components)
    .filter((componentName) => entity.components[componentName] !== undefined)
    .sort();
}
