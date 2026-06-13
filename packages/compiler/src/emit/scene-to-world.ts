import { type IWorldIr } from "@threenative/ir";

interface IObjectLike {
  children: readonly IObjectLike[];
  id?: string;
  material?: { color: unknown; metalness?: number; roughness?: number };
  geometry?: { kind: string; size?: readonly number[]; radius?: number };
  position: { toArray(): [number, number, number] };
  rotation: { toArray(): [number, number, number] };
  scale: { toArray(): [number, number, number] };
  constructor: { name: string };
}

export interface ISceneEmitResult {
  assets: Array<Record<string, unknown> & { id: string }>;
  materials: Array<Record<string, unknown> & { id: string }>;
  world: IWorldIr;
}

export function sceneToWorld(scene: IObjectLike): ISceneEmitResult {
  const entities: IWorldIr["entities"] = [];
  const assets: ISceneEmitResult["assets"] = [];
  const materials: ISceneEmitResult["materials"] = [];

  visitChildren(scene, undefined, { assets, entities, materials });

  entities.sort((left, right) => left.id.localeCompare(right.id));
  assets.sort((left, right) => left.id.localeCompare(right.id));
  materials.sort((left, right) => left.id.localeCompare(right.id));

  const camera = entities.find((entity) => entity.components.Camera !== undefined);

  return {
    assets,
    materials,
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities,
      resources: camera === undefined ? {} : { ActiveCamera: { entity: camera.id } },
      events: {},
      prefabs: [],
    },
  };
}

function visitChildren(
  parent: IObjectLike,
  parentId: string | undefined,
  output: { assets: ISceneEmitResult["assets"]; entities: IWorldIr["entities"]; materials: ISceneEmitResult["materials"] },
): void {
  parent.children.forEach((child, index) => {
    const id = child.id ?? `${parentId ?? "scene"}.child.${index}`;
    const components: Record<string, unknown> = {
      Transform: {
        position: child.position.toArray(),
        rotation: [...child.rotation.toArray(), 1],
        scale: child.scale.toArray(),
      },
    };

    if (parentId !== undefined) {
      components.Hierarchy = { parent: parentId };
    }

    if (child.constructor.name === "Mesh" && child.geometry !== undefined && child.material !== undefined) {
      const meshId = `mesh.${id}`;
      const materialId = `mat.${id}`;
      components.MeshRenderer = { material: materialId, mesh: meshId };
      output.assets.push({
        id: meshId,
        kind: "mesh",
        format: "generated",
        primitive: child.geometry.kind,
        size: child.geometry.size ?? (child.geometry.radius === undefined ? undefined : [child.geometry.radius]),
      });
      output.materials.push({
        id: materialId,
        kind: "standard",
        color: child.material.color,
        metalness: child.material.metalness ?? 0,
        roughness: child.material.roughness ?? 1,
      });
    }

    if (child.constructor.name === "PerspectiveCamera") {
      components.Camera = {
        kind: "perspective",
        fovY: "fovY" in child ? child.fovY : 60,
        near: "near" in child ? child.near : 0.1,
        far: "far" in child ? child.far : 100,
        priority: 0,
      };
    }

    if (child.constructor.name === "DirectionalLight") {
      components.Light = {
        kind: "directional",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
      };
    }

    if (child.constructor.name === "AmbientLight") {
      components.Light = {
        kind: "ambient",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
      };
    }

    output.entities.push({ id, components });
    visitChildren(child, id, output);
  });
}
