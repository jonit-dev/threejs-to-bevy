import { type IWorldIr } from "@threenative/ir";
import type { IAssetReference, IPhysicsDeclaration } from "@threenative/sdk";

interface IObjectLike {
  activeCamera?: IObjectLike;
  assetRefs?: readonly IAssetReference[];
  children: readonly IObjectLike[];
  id?: string;
  material?: {
    baseColorTexture?: string | IAssetReference;
    color: unknown;
    emissiveTexture?: string | IAssetReference;
    metalness?: number;
    metallicRoughnessTexture?: string | IAssetReference;
    normalTexture?: string | IAssetReference;
    occlusionTexture?: string | IAssetReference;
    roughness?: number;
  };
  geometry?: { height?: number; kind: string; radius?: number; size?: readonly number[] };
  physics?: IPhysicsDeclaration;
  position: { toArray(): [number, number, number] };
  rotation: { toArray(): [number, number, number] };
  scale: { toArray(): [number, number, number] };
  visible?: boolean;
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

  const camera = scene.activeCamera?.id === undefined ? entities.find((entity) => entity.components.Camera !== undefined) : entities.find((entity) => entity.id === scene.activeCamera?.id);

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
        rotation: eulerToQuaternion(child.rotation.toArray()),
        scale: child.scale.toArray(),
      },
    };
    if (child.visible === false) {
      components.Visibility = { visible: false };
    }

    if (parentId !== undefined) {
      components.Hierarchy = { parent: parentId };
    }
    emitPhysics(child.physics, components);
    emitAssetRefs(child.assetRefs, output.assets);

    if (child.constructor.name === "Mesh" && child.geometry !== undefined && child.material !== undefined) {
      const meshId = `mesh.${id}`;
      const materialId = `mat.${id}`;
      components.MeshRenderer = { material: materialId, mesh: meshId, ...(child.visible === false ? { visible: false } : {}) };
      output.assets.push({
        id: meshId,
        kind: "mesh",
        format: "generated",
        primitive: child.geometry.kind,
        size: geometrySize(child.geometry),
      });
      output.materials.push({
        id: materialId,
        kind: "standard",
        color: child.material.color,
        metalness: child.material.metalness ?? 0,
        roughness: child.material.roughness ?? 1,
        ...emitTextureSlots(child.material, output.assets),
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

    if (child.constructor.name === "OrthographicCamera") {
      components.Camera = {
        kind: "orthographic",
        size: "size" in child ? child.size : 1,
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

    if (child.constructor.name === "PointLight") {
      components.Light = {
        kind: "point",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...("range" in child && child.range !== undefined ? { range: child.range } : {}),
      };
    }

    if (child.constructor.name === "SpotLight") {
      components.Light = {
        kind: "spot",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...("angle" in child && child.angle !== undefined ? { angle: child.angle } : {}),
        ...("range" in child && child.range !== undefined ? { range: child.range } : {}),
      };
    }

    output.entities.push({ id, components });
    visitChildren(child, id, output);
  });
}

function emitPhysics(physics: IPhysicsDeclaration | undefined, components: Record<string, unknown>): void {
  if (physics?.body !== undefined) {
    components.RigidBody = {
      kind: physics.body.kind,
      ...(physics.body.mass === undefined ? {} : { mass: physics.body.mass }),
      ...(physics.body.velocity === undefined ? {} : { velocity: physics.body.velocity }),
    };
  }
  if (physics?.collider !== undefined) {
    components.Collider = {
      kind: physics.collider.kind,
      ...(physics.collider.size === undefined ? {} : { size: physics.collider.size }),
      ...(physics.collider.radius === undefined ? {} : { radius: physics.collider.radius }),
      ...(physics.collider.height === undefined ? {} : { height: physics.collider.height }),
      ...(physics.collider.layer === undefined ? {} : { layer: physics.collider.layer }),
      ...(physics.collider.mask === undefined ? {} : { mask: physics.collider.mask }),
      ...(physics.collider.trigger === undefined ? {} : { trigger: physics.collider.trigger }),
    };
  }
}

function geometrySize(geometry: NonNullable<IObjectLike["geometry"]>): readonly number[] | undefined {
  if (geometry.size !== undefined) {
    return geometry.size;
  }
  if (geometry.radius === undefined) {
    return undefined;
  }
  return geometry.height === undefined ? [geometry.radius] : [geometry.radius, geometry.height];
}

function emitTextureSlots(
  material: NonNullable<IObjectLike["material"]>,
  assets: ISceneEmitResult["assets"],
): Record<string, string> {
  const slots = {
    baseColorTexture: material.baseColorTexture,
    normalTexture: material.normalTexture,
    metallicRoughnessTexture: material.metallicRoughnessTexture,
    emissiveTexture: material.emissiveTexture,
    occlusionTexture: material.occlusionTexture,
  };
  return Object.fromEntries(
    Object.entries(slots).flatMap(([slot, value]) => {
      if (value === undefined) {
        return [];
      }
      if (typeof value === "string") {
        return [[slot, value]];
      }
      assets.push({
        format: value.format,
        id: value.id,
        kind: value.kind,
        path: value.path,
        ...(value.animations === undefined ? {} : { animations: value.animations }),
      });
      return [[slot, value.id]];
    }),
  );
}

function emitAssetRefs(refs: readonly IAssetReference[] | undefined, assets: ISceneEmitResult["assets"]): void {
  for (const ref of refs ?? []) {
    assets.push({
      format: ref.format,
      id: ref.id,
      kind: ref.kind,
      path: ref.path,
      ...(ref.animations === undefined ? {} : { animations: ref.animations }),
    });
  }
}

function eulerToQuaternion([x, y, z]: [number, number, number]): [number, number, number, number] {
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}
