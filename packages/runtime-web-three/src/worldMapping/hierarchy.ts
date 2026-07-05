import * as THREE from "three";
import type { IWorldEntity } from "@threenative/ir";

export function attachWorldHierarchy(
  scene: THREE.Scene,
  entities: readonly IWorldEntity[],
  objectsById: Map<string, THREE.Object3D>,
): void {
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
  }
}

function readParentId(entity: IWorldEntity): string | undefined {
  const hierarchy = entity.components.Hierarchy as { parent?: string } | undefined;
  return hierarchy?.parent;
}
