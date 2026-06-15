import { type IWorldIr } from "@threenative/ir";
import type { IAssetReference, IPhysicsDeclaration } from "@threenative/sdk";

interface IObjectLike {
  activeCamera?: IObjectLike;
  assetRefs?: readonly IAssetReference[];
  castShadow?: boolean;
  children: readonly IObjectLike[];
  id?: string;
  material?: {
    alphaCutoff?: number;
    alphaMode?: string;
    baseColorTexture?: string | IAssetReference;
    clearcoat?: number;
    clearcoatRoughness?: number;
    color: unknown;
    emissive?: unknown;
    emissiveIntensity?: number;
    emissiveTexture?: string | IAssetReference;
    metalness?: number;
    metallicRoughnessTexture?: string | IAssetReference;
    normalTexture?: string | IAssetReference;
    occlusionTexture?: string | IAssetReference;
    opacity?: number;
    roughness?: number;
    specularIntensity?: number;
    transmission?: number;
  };
  geometry?: {
    attributes?: readonly { itemSize: number; name: string; values: readonly number[] }[];
    depth?: number;
    height?: number;
    indices?: readonly number[];
    innerRadius?: number;
    kind: string;
    outerRadius?: number;
    radius?: number;
    radiusBottom?: number;
    radiusTop?: number;
    sides?: number;
    size?: readonly number[];
  };
  physics?: IPhysicsDeclaration;
  position: { toArray(): [number, number, number] };
  receiveShadow?: boolean;
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
      components.MeshRenderer = {
        ...(child.castShadow === undefined ? {} : { castShadow: child.castShadow }),
        material: materialId,
        mesh: meshId,
        ...(child.receiveShadow === undefined ? {} : { receiveShadow: child.receiveShadow }),
        ...(child.visible === false ? { visible: false } : {}),
      };
      output.assets.push({
        ...(child.geometry.kind === "custom" ? { attributes: child.geometry.attributes ?? [], indices: child.geometry.indices } : {}),
        id: meshId,
        kind: "mesh",
        format: "generated",
        primitive: child.geometry.kind,
        ...(child.geometry.kind === "custom" ? {} : { size: geometrySize(child.geometry) }),
      });
      output.materials.push({
        id: materialId,
        kind: "standard",
        ...(child.material.alphaCutoff === undefined ? {} : { alphaCutoff: child.material.alphaCutoff }),
        ...(child.material.alphaMode === undefined || child.material.alphaMode === "opaque" ? {} : { alphaMode: child.material.alphaMode }),
        ...(child.material.clearcoat === undefined || child.material.clearcoat === 0 ? {} : { clearcoat: child.material.clearcoat }),
        ...(child.material.clearcoatRoughness === undefined || child.material.clearcoatRoughness === 0 ? {} : { clearcoatRoughness: child.material.clearcoatRoughness }),
        color: child.material.color,
        ...(child.material.emissive === undefined ? {} : { emissive: child.material.emissive }),
        ...(child.material.emissiveIntensity === undefined || child.material.emissiveIntensity === 1 ? {} : { emissiveIntensity: child.material.emissiveIntensity }),
        metalness: child.material.metalness ?? 0,
        ...(child.material.opacity === undefined || child.material.opacity === 1 ? {} : { opacity: child.material.opacity }),
        roughness: child.material.roughness ?? 1,
        ...(child.material.specularIntensity === undefined || child.material.specularIntensity === 0.5 ? {} : { specularIntensity: child.material.specularIntensity }),
        ...(child.material.transmission === undefined || child.material.transmission === 0 ? {} : { transmission: child.material.transmission }),
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
      ...(physics.collider.slope === undefined ? {} : { slope: physics.collider.slope }),
      ...(physics.collider.trigger === undefined ? {} : { trigger: physics.collider.trigger }),
    };
  }
}

function geometrySize(geometry: NonNullable<IObjectLike["geometry"]>): readonly number[] | undefined {
  if (geometry.kind === "conicalFrustum") {
    return [geometry.radiusTop ?? 0.25, geometry.radiusBottom ?? 0.5, geometry.height ?? 1];
  }
  if (geometry.kind === "torus" || geometry.kind === "annulus") {
    return [geometry.innerRadius ?? 0.5, geometry.outerRadius ?? 1];
  }
  if (geometry.kind === "regularPolygon") {
    return [geometry.radius ?? 0.5, geometry.sides ?? 6];
  }
  if (geometry.kind === "extrudedRectangle") {
    const [width = 1, height = 1] = geometry.size ?? [];
    return [width, height, geometry.depth ?? 1];
  }
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
        ...(value.animationGraph === undefined ? {} : { animationGraph: value.animationGraph }),
        format: value.format,
        id: value.id,
        kind: value.kind,
        path: value.path,
        ...(value.animations === undefined ? {} : { animations: value.animations }),
        ...(value.particleEmitters === undefined ? {} : { particleEmitters: value.particleEmitters }),
      });
      return [[slot, value.id]];
    }),
  );
}

function emitAssetRefs(refs: readonly IAssetReference[] | undefined, assets: ISceneEmitResult["assets"]): void {
  for (const ref of refs ?? []) {
    assets.push({
      ...(ref.animationGraph === undefined ? {} : { animationGraph: ref.animationGraph }),
      format: ref.format,
      id: ref.id,
      kind: ref.kind,
      path: ref.path,
      ...(ref.animations === undefined ? {} : { animations: ref.animations }),
      ...(ref.particleEmitters === undefined ? {} : { particleEmitters: ref.particleEmitters }),
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
