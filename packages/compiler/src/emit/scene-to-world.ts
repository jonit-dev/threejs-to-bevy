import { type IWorldIr } from "@threenative/ir";
import type { IAssetReference, IPhysicsDeclaration } from "@threenative/sdk";

interface IObjectLike {
  activeCamera?: IObjectLike;
  activeCameras?: readonly IObjectLike[];
  assetRefs?: readonly IAssetReference[];
  castShadow?: boolean;
  children: readonly IObjectLike[];
  clear?: { color?: string; mode: string };
  follow?: { offset?: readonly number[]; smoothing?: number; target: string };
  id?: string;
  layers?: readonly string[];
  material?: {
    alphaCutoff?: number;
    alphaMode?: string;
    baseColorTexture?: string | IAssetReference;
    clearcoat?: number;
    clearcoatRoughness?: number;
    clearcoatRoughnessTexture?: string | IAssetReference;
    clearcoatTexture?: string | IAssetReference;
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
    transmissionTexture?: string | IAssetReference;
  };
  geometry?: {
    attributes?: readonly { itemSize: number; name: string; values: readonly number[] }[];
    bounds?: { max: readonly [number, number, number]; min: readonly [number, number, number] };
    budget?: Record<string, unknown>;
    generation?: Record<string, unknown>;
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
    storage?: "binary" | "inline";
    topology?: "triangle-list";
    usage?: "static";
  };
  physics?: IPhysicsDeclaration;
  position: { toArray(): [number, number, number] };
  receiveShadow?: boolean;
  rotation: { toArray(): [number, number, number] };
  scale: { toArray(): [number, number, number] };
  orbit?: { distance?: { max: number; min: number }; smoothing?: number; target: string };
  order?: number;
  output?: { format?: string; height?: number; mode?: string; path?: string; width?: number };
  pan?: { axisX?: string; axisY?: string; speed?: number };
  projection?: { handedness?: string; kind: string; matrix?: readonly number[] };
  screenShake?: { amplitude: number; decay?: number; frequency?: number };
  shadowBias?: number;
  shadowNormalBias?: number;
  target?: { asset?: string; kind: string };
  viewModel?: { fovScale?: number; offset?: readonly number[] };
  viewport?: readonly [number, number, number, number];
  visible?: boolean;
  zoom?: { max: number; min: number; smoothing?: number };
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

  emitAssetRefs(scene.assetRefs, assets);
  visitChildren(scene, undefined, { assets, entities, materials });

  entities.sort((left, right) => left.id.localeCompare(right.id));
  assets.sort((left, right) => left.id.localeCompare(right.id));
  materials.sort((left, right) => left.id.localeCompare(right.id));

  const activeCameras = resolveActiveCameras(scene, entities);
  const resources: IWorldIr["resources"] = {};
  if (activeCameras.length > 1) {
    resources.ActiveCameras = {
      cameras: activeCameras.map((camera, index) => ({
        entity: camera.id,
        ...(camera.order === undefined ? { order: index } : { order: camera.order }),
      })),
    };
  } else if (activeCameras.length === 1) {
    resources.ActiveCamera = { entity: activeCameras[0]!.id };
  }

  return {
    assets,
    materials,
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities,
      resources,
      events: {},
      prefabs: [],
    },
  };
}

function resolveActiveCameras(
  scene: IObjectLike,
  entities: IWorldIr["entities"],
): Array<{ id: string; order?: number }> {
  if (scene.activeCameras !== undefined && scene.activeCameras.length > 0) {
    return scene.activeCameras.map((camera, index) => ({
      id: camera.id ?? entities.filter((entity) => entity.components.Camera !== undefined)[index]?.id ?? `camera.${index}`,
      order: camera.order,
    }));
  }
  if (scene.activeCamera?.id !== undefined) {
    return [{ id: scene.activeCamera.id, order: scene.activeCamera.order }];
  }
  const fallback = entities.find((entity) => entity.components.Camera !== undefined);
  return fallback === undefined ? [] : [{ id: fallback.id }];
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
      const modelRef = (child.assetRefs ?? []).find((ref) => ref.kind === "model");
      const meshId = modelRef?.id ?? `mesh.${id}`;
      const materialId = `mat.${id}`;
      components.MeshRenderer = {
        ...(child.castShadow === undefined ? {} : { castShadow: child.castShadow }),
        material: materialId,
        mesh: meshId,
        ...(child.receiveShadow === undefined ? {} : { receiveShadow: child.receiveShadow }),
        ...(child.visible === false ? { visible: false } : {}),
      };
      if (modelRef === undefined) {
        output.assets.push({
          ...(child.geometry.kind === "custom"
            ? {
                attributes: child.geometry.attributes ?? [],
                ...(child.geometry.bounds === undefined ? {} : { bounds: child.geometry.bounds }),
                ...(child.geometry.budget === undefined ? {} : { budget: child.geometry.budget }),
                ...(child.geometry.generation === undefined ? {} : { generation: child.geometry.generation }),
                indices: child.geometry.indices,
                ...(child.geometry.storage === undefined ? {} : { storage: child.geometry.storage }),
                ...(child.geometry.topology === undefined ? {} : { topology: child.geometry.topology }),
                ...(child.geometry.usage === undefined ? {} : { usage: child.geometry.usage }),
              }
            : {}),
          id: meshId,
          kind: "mesh",
          format: "generated",
          primitive: child.geometry.kind,
          ...(child.geometry.kind === "custom" ? {} : { size: geometrySize(child.geometry) }),
        });
      }
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
      if (child.layers !== undefined && child.layers.length > 0) {
        components.RenderLayers = { layers: [...child.layers].sort((left, right) => left.localeCompare(right)) };
      }
    }

    if (child.constructor.name === "PerspectiveCamera") {
      components.Camera = emitCameraComponent(child, "perspective");
    }

    if (child.constructor.name === "OrthographicCamera") {
      components.Camera = emitCameraComponent(child, "orthographic");
    }

    if (child.constructor.name === "DirectionalLight") {
      components.Light = {
        kind: "directional",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...emitLightShadowBias(child),
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
        ...emitLightShadowBias(child),
      };
    }

    if (child.constructor.name === "SpotLight") {
      components.Light = {
        kind: "spot",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...("angle" in child && child.angle !== undefined ? { angle: child.angle } : {}),
        ...("range" in child && child.range !== undefined ? { range: child.range } : {}),
        ...emitLightShadowBias(child),
      };
    }

    output.entities.push({ id, components });
    visitChildren(child, id, output);
  });
}

function emitCameraComponent(child: IObjectLike, kind: "orthographic" | "perspective"): Record<string, unknown> {
  const camera: Record<string, unknown> = {
    kind,
    near: "near" in child ? child.near : 0.1,
    far: "far" in child ? child.far : 100,
    ...(kind === "perspective"
      ? { fovY: "fovY" in child ? child.fovY : 60 }
      : { size: "size" in child ? child.size : 1 }),
    ...(child.order === undefined ? { priority: 0 } : { order: child.order }),
    ...(child.viewport === undefined ? {} : { viewport: child.viewport }),
    ...(child.clear === undefined ? {} : { clear: child.clear }),
    ...(child.layers === undefined || child.layers.length === 0 ? {} : { layers: [...child.layers].sort((left, right) => left.localeCompare(right)) }),
    ...(child.target === undefined ? {} : { target: child.target }),
    ...(child.output === undefined ? {} : { output: child.output }),
    ...(child.projection === undefined ? {} : { projection: child.projection }),
    ...(child.follow === undefined ? {} : { follow: child.follow }),
    ...(child.orbit === undefined
      ? {}
      : {
          orbit: {
            target: child.orbit.target,
            ...(child.orbit.smoothing === undefined ? {} : { smoothing: child.orbit.smoothing }),
            ...(child.orbit.distance === undefined
              ? {}
              : { minDistance: child.orbit.distance.min, maxDistance: child.orbit.distance.max }),
          },
        }),
    ...(child.pan === undefined ? {} : { pan: child.pan }),
    ...(child.zoom === undefined ? {} : { zoom: child.zoom }),
    ...(child.screenShake === undefined ? {} : { screenShake: child.screenShake }),
    ...(child.viewModel === undefined ? {} : { viewModel: child.viewModel }),
  };
  return camera;
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

function emitLightShadowBias(light: IObjectLike): Record<string, number> {
  return {
    ...(light.shadowBias === undefined ? {} : { shadowBias: light.shadowBias }),
    ...(light.shadowNormalBias === undefined ? {} : { shadowNormalBias: light.shadowNormalBias }),
  };
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
    clearcoatTexture: material.clearcoatTexture,
    clearcoatRoughnessTexture: material.clearcoatRoughnessTexture,
    transmissionTexture: material.transmissionTexture,
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
        ...(value.center === undefined ? {} : { center: value.center }),
        format: value.format,
        id: value.id,
        kind: value.kind,
        ...(value.magFilter === undefined ? {} : { magFilter: value.magFilter }),
        ...(value.minFilter === undefined ? {} : { minFilter: value.minFilter }),
        ...(value.offset === undefined ? {} : { offset: value.offset }),
        path: value.path,
        ...(value.animations === undefined ? {} : { animations: value.animations }),
        ...(value.particleEmitters === undefined ? {} : { particleEmitters: value.particleEmitters }),
        ...(value.repeat === undefined ? {} : { repeat: value.repeat }),
        ...(value.rotation === undefined ? {} : { rotation: value.rotation }),
        ...(value.wrapS === undefined ? {} : { wrapS: value.wrapS }),
        ...(value.wrapT === undefined ? {} : { wrapT: value.wrapT }),
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
      ...(ref.path === undefined ? {} : { path: ref.path }),
      ...(ref.height === undefined ? {} : { height: ref.height }),
      ...(ref.width === undefined ? {} : { width: ref.width }),
      ...(ref.usage === undefined ? {} : { usage: ref.usage }),
      ...(ref.sampleCount === undefined ? {} : { sampleCount: ref.sampleCount }),
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
