import { type IWorldIr } from "@threenative/ir";
import { CustomMeshGeometry, SdkError, type IAssetReference, type ICustomMeshColliderHint, type ICustomMeshLodLevel, type IPhysicsDeclaration } from "@threenative/sdk";

import { CompilerError } from "../errors.js";
import { emitPhysics } from "./physics.js";

interface IObjectLike {
  activeCamera?: IObjectLike;
  activeCameras?: readonly IObjectLike[];
  assetRefs?: readonly IAssetReference[];
  castShadow?: boolean;
  children: readonly IObjectLike[];
  clear?: { color?: string; mode: string };
  debug?: { gizmo?: boolean };
  height?: number;
  follow?: { offset?: readonly number[]; smoothing?: number; target: string };
  id?: string;
  layers?: readonly string[];
  name?: string;
  material?: {
    alphaCutoff?: number;
    alphaMode?: string;
    baseColorTexture?: string | IAssetReference;
    blendMode?: string;
    clearcoat?: number;
    clearcoatRoughness?: number;
    clearcoatRoughnessTexture?: string | IAssetReference;
    clearcoatTexture?: string | IAssetReference;
    color?: unknown;
    depthTest?: boolean;
    depthWrite?: boolean;
    doubleSided?: boolean;
    emissive?: unknown;
    emissiveBloom?: { enabled: boolean; intensity: number; threshold: number };
    emissiveIntensity?: number;
    emissiveTexture?: string | IAssetReference;
    kind?: string;
    metalness?: number;
    metallicRoughnessTexture?: string | IAssetReference;
    normalTexture?: string | IAssetReference;
    occlusionTexture?: string | IAssetReference;
    opacity?: number;
    preset?: string;
    program?: Record<string, unknown>;
    renderOrder?: number;
    roughness?: number;
    specularIntensity?: number;
    specularTexture?: string | IAssetReference;
    textures?: readonly { asset: string | IAssetReference; name: string }[];
    transmission?: number;
    transmissionTexture?: string | IAssetReference;
    uniforms?: readonly Record<string, unknown>[];
    inputs?: readonly string[];
    outputs?: readonly string[];
  };
  geometry?: {
    attributes?: readonly { itemSize: number; name: string; values: readonly number[] }[];
    bounds?: { max: readonly [number, number, number]; min: readonly [number, number, number] };
    budget?: Record<string, unknown>;
    collider?: ICustomMeshColliderHint;
    generation?: Record<string, unknown>;
    depth?: number;
    height?: number;
    indices?: readonly number[];
    lodLevels?: readonly ICustomMeshLodLevel[];
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
  opacity?: number;
  position: { toArray(): [number, number, number] };
  receiveShadow?: boolean;
  resolution?: number;
  rotation: { toArray(): [number, number, number] };
  scale: { toArray(): [number, number, number] };
  orbit?: { distance?: { max: number; min: number }; smoothing?: number; target: string };
  order?: number;
  output?: { format?: string; height?: number; mode?: string; path?: string; width?: number };
  pan?: { axisX?: string; axisY?: string; speed?: number };
  projection?: { handedness?: string; kind: string; matrix?: readonly number[] };
  screenShake?: { amplitude: number; decay?: number; frequency?: number };
  shadowBias?: number;
  shadowFilter?: { mode: "pcf"; quality: "high" | "low" | "medium" };
  shadowNormalBias?: number;
  size?: number | readonly [number, number];
  softness?: number;
  target?: { asset?: string; kind: string };
  viewModel?: { fovScale?: number; offset?: readonly number[] };
  viewport?: readonly [number, number, number, number];
  visible?: boolean;
  updateMode?: "dynamic" | "static";
  zoom?: { max: number; min: number; smoothing?: number };
  constructor: { name: string };
}

export interface ISceneEmitResult {
  assets: Array<Record<string, unknown> & { id: string }>;
  generatedLodAssetIds: readonly string[];
  materials: Array<Record<string, unknown> & { id: string }>;
  world: IWorldIr;
}

export function sceneToWorld(scene: IObjectLike): ISceneEmitResult {
  const entities: IWorldIr["entities"] = [];
  const assets: ISceneEmitResult["assets"] = [];
  const materials: ISceneEmitResult["materials"] = [];
  const generatedLodAssetIds = new Set<string>();

  emitAssetRefs(scene.assetRefs, assets);
  visitChildren(scene, undefined, { assets, entities, generatedLodAssetIds, materials });

  assertNoGeneratedLodAssetIdCollisions(assets, generatedLodAssetIds);

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
    generatedLodAssetIds: [...generatedLodAssetIds].sort((left, right) => left.localeCompare(right)),
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
  output: { assets: ISceneEmitResult["assets"]; entities: IWorldIr["entities"]; generatedLodAssetIds: Set<string>; materials: ISceneEmitResult["materials"] },
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
    if (child.constructor.name === "Group") {
      const name = child.name ?? "";
      components.SceneContainer = {
        kind: "group",
        ...(name.trim() === "" ? {} : { name }),
      };
    }
    emitPhysics(child.physics, components);
    emitAssetRefs(child.assetRefs, output.assets);

    if (child.constructor.name === "Mesh" && child.geometry !== undefined && child.material !== undefined) {
      const modelRef = (child.assetRefs ?? []).find((ref) => ref.kind === "model");
      const meshId = modelRef?.id ?? `mesh.${id}`;
      const materialId = `mat.${id}`;
      if (modelRef !== undefined && child.geometry.kind === "custom" && child.geometry.lodLevels !== undefined) {
        throw new CompilerError(
          "TN_COMPILER_GENERATED_MESH_LOD_ASSET_REF_CONFLICT",
          `Mesh '${id}' cannot combine model assetRef '${modelRef.id}' with procedural generated-mesh LOD levels.`,
        );
      }
      const lodLevels = modelRef === undefined && child.geometry.kind === "custom"
        ? emitGeneratedMeshLodAssets(meshId, child.geometry.lodLevels, output.assets, output.generatedLodAssetIds)
        : undefined;
      components.MeshRenderer = {
        ...(child.castShadow === undefined ? {} : { castShadow: child.castShadow }),
        material: materialId,
        mesh: meshId,
        ...(lodLevels === undefined ? {} : { lod: { levels: lodLevels } }),
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
        if (components.Collider === undefined && child.geometry.kind === "custom" && child.geometry.collider !== undefined) {
          components.Collider = emitDerivedCollider(child.geometry.collider, meshId);
        }
      }
      output.materials.push(emitMaterial(materialId, child.material, output.assets));
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
        ...emitLightMetadata(child),
      };
    }

    if (child.constructor.name === "AmbientLight") {
      components.Light = {
        kind: "ambient",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...emitLightMetadata(child),
      };
    }

    if (child.constructor.name === "PointLight") {
      components.Light = {
        kind: "point",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...("range" in child && child.range !== undefined ? { range: child.range } : {}),
        ...emitLightMetadata(child),
      };
    }

    if (child.constructor.name === "SpotLight") {
      components.Light = {
        kind: "spot",
        color: "color" in child ? child.color : "#ffffff",
        intensity: "intensity" in child ? child.intensity : 1,
        ...("angle" in child && child.angle !== undefined ? { angle: child.angle } : {}),
        ...("range" in child && child.range !== undefined ? { range: child.range } : {}),
        ...emitLightMetadata(child),
      };
    }

    if (child.constructor.name === "ContactShadows") {
      components.ContactShadows = {
        height: child.height,
        opacity: child.opacity,
        resolution: child.resolution,
        size: child.size,
        softness: child.softness,
        updateMode: child.updateMode,
      };
    }

    output.entities.push({ id, components });
    visitChildren(child, id, output);
  });
}

function emitGeneratedMeshLodAssets(
  baseMeshId: string,
  levels: readonly ICustomMeshLodLevel[] | undefined,
  assets: ISceneEmitResult["assets"],
  generatedLodAssetIds: Set<string>,
): readonly { mesh: string; minDistance: number }[] | undefined {
  if (levels === undefined) {
    return undefined;
  }
  const normalizedLevels = validateGeneratedMeshLodLevels(levels);
  return normalizedLevels.map((level, index) => {
    const id = `${baseMeshId}.lod.${index + 1}`;
    generatedLodAssetIds.add(id);
    assets.push({
      attributes: level.attributes,
      bounds: level.bounds,
      budget: level.budget,
      id,
      indices: level.indices,
      kind: "mesh",
      format: "generated",
      primitive: "custom",
      storage: level.storage,
      topology: level.topology,
      usage: level.usage,
    });
    return { mesh: id, minDistance: level.minDistance };
  });
}

function validateGeneratedMeshLodLevels(levels: readonly ICustomMeshLodLevel[]): readonly ICustomMeshLodLevel[] {
  try {
    if (levels.some((level) => level.topology !== "triangle-list" || level.usage !== "static" || (level.storage !== "binary" && level.storage !== "inline"))) {
      throw new Error("storage, topology, or usage is invalid");
    }
    const first = levels[0];
    if (first === undefined) {
      throw new Error("at least one LOD level is required");
    }
    const geometry = new CustomMeshGeometry({
      attributes: first.attributes,
      bounds: first.bounds,
      budget: first.budget,
      indices: first.indices,
      lodLevels: levels,
      storage: first.storage,
      topology: first.topology,
      usage: first.usage,
    });
    return geometry.lodLevels!;
  } catch (error) {
    const detail = error instanceof SdkError || error instanceof Error ? error.message : String(error);
    throw new CompilerError(
      "TN_COMPILER_GENERATED_MESH_LOD_INVALID",
      `Generated mesh LOD metadata is invalid: ${detail}`,
    );
  }
}

function assertNoGeneratedLodAssetIdCollisions(
  assets: readonly { id: string }[],
  generatedLodAssetIds: ReadonlySet<string>,
): void {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    counts.set(asset.id, (counts.get(asset.id) ?? 0) + 1);
  }
  for (const id of generatedLodAssetIds) {
    if ((counts.get(id) ?? 0) > 1) {
      throwGeneratedLodAssetIdCollision(id);
    }
  }
}

export function throwGeneratedLodAssetIdCollision(id: string): never {
  throw new CompilerError(
    "TN_COMPILER_GENERATED_MESH_LOD_ASSET_ID_COLLISION",
    `Generated mesh LOD asset ID '${id}' collides with another claimed bundle asset ID. Rename the entity or conflicting asset.`,
  );
}

function emitDerivedCollider(
  collider: ICustomMeshColliderHint,
  meshId: string,
): NonNullable<IWorldIr["entities"][number]["components"]["Collider"]> {
  if (collider.kind === "box") {
    return {
      center: [...collider.center],
      kind: "box",
      size: [...collider.size],
    };
  }
  return {
    kind: "mesh",
    mesh: {
      bounds: {
        center: [...collider.mesh.bounds.center],
        size: [...collider.mesh.bounds.size],
      },
      source: meshId,
      triangleCount: collider.mesh.triangleCount,
    },
  };
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
  if (geometry.kind === "plane") {
    const [width = 1, height = 1] = geometry.size ?? [];
    return [width, height];
  }
  if (geometry.size !== undefined) {
    return geometry.size;
  }
  if (geometry.radius === undefined) {
    return undefined;
  }
  return geometry.height === undefined ? [geometry.radius] : [geometry.radius, geometry.height];
}

function emitLightMetadata(light: IObjectLike): Record<string, unknown> {
  return {
    ...(light.debug === undefined ? {} : { debug: light.debug }),
    ...(light.shadowBias === undefined ? {} : { shadowBias: light.shadowBias }),
    ...(light.shadowFilter === undefined ? {} : { shadowFilter: light.shadowFilter }),
    ...(light.shadowNormalBias === undefined ? {} : { shadowNormalBias: light.shadowNormalBias }),
  };
}

function emitMaterial(
  materialId: string,
  material: NonNullable<IObjectLike["material"]>,
  assets: ISceneEmitResult["assets"],
): Record<string, unknown> & { id: string } {
  if (material.kind === "shader") {
    return {
      id: materialId,
      kind: "shader",
      ...(material.alphaCutoff === undefined ? {} : { alphaCutoff: material.alphaCutoff }),
      ...(material.alphaMode === undefined || material.alphaMode === "opaque" ? {} : { alphaMode: material.alphaMode }),
      ...(material.blendMode === undefined ? {} : { blendMode: material.blendMode }),
      ...(material.color === undefined ? {} : { color: material.color }),
      ...(material.depthTest === undefined ? {} : { depthTest: material.depthTest }),
      ...(material.depthWrite === undefined ? {} : { depthWrite: material.depthWrite }),
      ...(material.emissive === undefined ? {} : { emissive: material.emissive }),
      ...(material.emissiveIntensity === undefined || material.emissiveIntensity === 1 ? {} : { emissiveIntensity: material.emissiveIntensity }),
      ...(material.inputs === undefined ? {} : { inputs: [...material.inputs] }),
      ...(material.outputs === undefined ? {} : { outputs: [...material.outputs] }),
      program: material.program,
      ...(material.renderOrder === undefined ? {} : { renderOrder: material.renderOrder }),
      ...(material.textures === undefined ? {} : { textures: emitShaderTextures(material.textures, assets) }),
      ...(material.uniforms === undefined ? {} : { uniforms: material.uniforms.map((uniform) => ({ ...uniform })) }),
    };
  }
  return {
    id: materialId,
    kind: material.kind === "extended" || material.preset !== undefined ? "extended" : "standard",
    ...(material.alphaCutoff === undefined ? {} : { alphaCutoff: material.alphaCutoff }),
    ...(material.alphaMode === undefined || material.alphaMode === "opaque" ? {} : { alphaMode: material.alphaMode }),
    ...(material.blendMode === undefined ? {} : { blendMode: material.blendMode }),
    ...(material.clearcoat === undefined || material.clearcoat === 0 ? {} : { clearcoat: material.clearcoat }),
    ...(material.clearcoatRoughness === undefined || material.clearcoatRoughness === 0 ? {} : { clearcoatRoughness: material.clearcoatRoughness }),
    color: material.color,
    ...(material.depthTest === undefined ? {} : { depthTest: material.depthTest }),
    ...(material.depthWrite === undefined ? {} : { depthWrite: material.depthWrite }),
    ...(material.emissive === undefined ? {} : { emissive: material.emissive }),
    ...(material.emissiveBloom === undefined ? {} : { emissiveBloom: material.emissiveBloom }),
    ...(material.emissiveIntensity === undefined || material.emissiveIntensity === 1 ? {} : { emissiveIntensity: material.emissiveIntensity }),
    ...(material.preset === undefined
      ? {}
      : {
          extension: {
            preset: material.preset,
            ...(material.doubleSided === undefined ? {} : { doubleSided: material.doubleSided }),
          },
        }),
    metalness: material.metalness ?? 0,
    ...(material.opacity === undefined || material.opacity === 1 ? {} : { opacity: material.opacity }),
    ...(material.renderOrder === undefined ? {} : { renderOrder: material.renderOrder }),
    roughness: material.roughness ?? 1,
    ...(material.specularIntensity === undefined || material.specularIntensity === 0.5 ? {} : { specularIntensity: material.specularIntensity }),
    ...(material.transmission === undefined || material.transmission === 0 ? {} : { transmission: material.transmission }),
    ...emitTextureSlots(material, assets),
  };
}

function emitShaderTextures(
  textures: readonly { asset: string | IAssetReference; name: string }[],
  assets: ISceneEmitResult["assets"],
): Array<{ asset: string; name: string }> {
  return textures.map((texture) => {
    if (typeof texture.asset === "string") {
      return { asset: texture.asset, name: texture.name };
    }
    assets.push({
      format: texture.asset.format,
      id: texture.asset.id,
      kind: texture.asset.kind,
      path: texture.asset.path,
      sourceMode: texture.asset.sourceMode ?? "bundle",
    });
    return { asset: texture.asset.id, name: texture.name };
  });
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
    specularTexture: material.specularTexture,
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
        ...(value.embedded === undefined ? {} : { embedded: value.embedded }),
        format: value.format,
        id: value.id,
        kind: value.kind,
        ...(value.magFilter === undefined ? {} : { magFilter: value.magFilter }),
        ...(value.minFilter === undefined ? {} : { minFilter: value.minFilter }),
        ...(value.network === undefined ? {} : { network: value.network }),
        ...(value.offset === undefined ? {} : { offset: value.offset }),
        path: value.path,
        sourceMode: value.sourceMode ?? "bundle",
        ...(value.animations === undefined ? {} : { animations: value.animations }),
        ...(value.masks === undefined ? {} : { masks: value.masks }),
        ...(value.morphClips === undefined ? {} : { morphClips: value.morphClips }),
        ...(value.morphTargets === undefined ? {} : { morphTargets: value.morphTargets }),
        ...(value.particleEmitters === undefined ? {} : { particleEmitters: value.particleEmitters }),
        ...(value.skeleton === undefined ? {} : { skeleton: value.skeleton }),
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
      ...(ref.embedded === undefined ? {} : { embedded: ref.embedded }),
      format: ref.format,
      id: ref.id,
      kind: ref.kind,
      ...(ref.network === undefined ? {} : { network: ref.network }),
      ...(ref.path === undefined ? {} : { path: ref.path }),
      sourceMode: ref.sourceMode ?? "bundle",
      ...(ref.height === undefined ? {} : { height: ref.height }),
      ...(ref.width === undefined ? {} : { width: ref.width }),
      ...(ref.usage === undefined ? {} : { usage: ref.usage }),
      ...(ref.sampleCount === undefined ? {} : { sampleCount: ref.sampleCount }),
      ...(ref.animations === undefined ? {} : { animations: ref.animations }),
      ...(ref.masks === undefined ? {} : { masks: ref.masks }),
      ...(ref.materialOwnership === undefined ? {} : { materialOwnership: ref.materialOwnership }),
      ...(ref.morphClips === undefined ? {} : { morphClips: ref.morphClips }),
      ...(ref.morphTargets === undefined ? {} : { morphTargets: ref.morphTargets }),
      ...(ref.particleEmitters === undefined ? {} : { particleEmitters: ref.particleEmitters }),
      ...(ref.skeleton === undefined ? {} : { skeleton: ref.skeleton }),
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
