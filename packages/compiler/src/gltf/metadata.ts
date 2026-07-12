import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { IGltfCustomAttributeIr, IGltfMaterialMetadataIr, IGltfMorphTargetIr, IGltfSceneAssetIr, IGltfSceneMetadataIr, IGltfSceneNodeIr, IGltfNodeTransformIr, IGltfTextureTransformIr } from "@threenative/ir";

import type { IInternalAsset } from "../emit/asset-copy.js";

interface IGltfDocument {
  accessors?: readonly IGltfAccessor[];
  materials?: readonly IGltfMaterial[];
  meshes?: readonly IGltfMesh[];
  nodes?: readonly IGltfNode[];
  scene?: number;
  scenes?: readonly { nodes?: readonly number[]; name?: string }[];
}

interface IGltfNode {
  children?: readonly number[];
  extras?: unknown;
  matrix?: readonly number[];
  mesh?: number;
  name?: string;
  rotation?: readonly number[];
  scale?: readonly number[];
  translation?: readonly number[];
}

interface IGltfMesh {
  extras?: { targetNames?: readonly string[] } & Record<string, unknown>;
  name?: string;
  primitives?: readonly IGltfPrimitive[];
  weights?: readonly number[];
}

interface IGltfPrimitive {
  attributes?: Record<string, number>;
  material?: number;
  targets?: readonly Record<string, number>[];
}

interface IGltfMaterial {
  emissiveTexture?: IGltfTextureInfo;
  extensions?: Record<string, Record<string, unknown>>;
  extras?: unknown;
  name?: string;
  normalTexture?: IGltfTextureInfo;
  occlusionTexture?: IGltfTextureInfo;
  pbrMetallicRoughness?: {
    baseColorTexture?: IGltfTextureInfo;
    metallicRoughnessTexture?: IGltfTextureInfo;
  };
}

interface IGltfTextureInfo {
  extensions?: {
    KHR_texture_transform?: {
      offset?: readonly number[];
      rotation?: number;
      scale?: readonly number[];
      texCoord?: number;
    };
  };
}

interface IGltfAccessor {
  componentType?: number;
  normalized?: boolean;
  type?: string;
}

export async function extractGltfSceneMetadata(projectPath: string, assets: readonly IInternalAsset[]): Promise<IGltfSceneMetadataIr | undefined> {
  const metadataAssets: IGltfSceneAssetIr[] = [];
  for (const asset of assets) {
    if (!isBundleGltfModel(asset)) {
      continue;
    }
    try {
      const document = await readGltfDocument(resolve(projectPath, asset.sourcePath ?? asset.path));
      metadataAssets.push(extractGltfAssetMetadata(asset.id, document));
    } catch {
      continue;
    }
  }
  if (metadataAssets.length === 0) {
    return undefined;
  }
  return {
    assets: metadataAssets.sort((left, right) => left.assetId.localeCompare(right.assetId)),
    schema: "threenative.gltf-scene",
    version: "0.1.0",
  };
}

export async function readGltfDocument(path: string): Promise<IGltfDocument> {
  const bytes = await readFile(path);
  if (extname(path).toLowerCase() === ".glb") {
    return parseGlbJson(bytes);
  }
  return JSON.parse(bytes.toString("utf8")) as IGltfDocument;
}

export function extractGltfAssetMetadata(assetId: string, document: IGltfDocument): IGltfSceneAssetIr {
  const nodes = document.nodes ?? [];
  const roots = rootNodeIndexes(document);
  const pathByIndex = new Map<number, string>();
  const parentPathByIndex = new Map<number, string>();

  for (const root of roots) {
    assignNodePaths(root, undefined, nodes, pathByIndex, parentPathByIndex);
  }
  nodes.forEach((_node, index) => {
    if (!pathByIndex.has(index)) {
      assignNodePaths(index, undefined, nodes, pathByIndex, parentPathByIndex, "/orphan");
    }
  });

  const emittedNodes = nodes.map((node, index) => nodeMetadata(node, index, document, pathByIndex, parentPathByIndex));
  const customAttributes = extractCustomAttributes(document);
  return {
    assetId,
    customAttributes: customAttributes.sort(compareCustomAttributes),
    materials: extractMaterialMetadata(document),
    morphTargets: extractMorphTargets(document),
    nodes: emittedNodes.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function isBundleGltfModel(asset: IInternalAsset): asset is IInternalAsset & { format: "glb" | "gltf"; kind: "model"; path: string } {
  return asset.kind === "model"
    && (asset.format === "glb" || asset.format === "gltf")
    && (asset.sourceMode === undefined || asset.sourceMode === "bundle")
    && typeof asset.path === "string";
}

function parseGlbJson(bytes: Buffer): IGltfDocument {
  if (bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("GLB file must start with glTF magic.");
  }
  const version = bytes.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}.`);
  }
  const jsonChunkLength = bytes.readUInt32LE(12);
  const jsonChunkType = bytes.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("GLB first chunk must be JSON.");
  }
  return JSON.parse(bytes.subarray(20, 20 + jsonChunkLength).toString("utf8")) as IGltfDocument;
}

function rootNodeIndexes(document: IGltfDocument): number[] {
  const scene = document.scenes?.[document.scene ?? 0];
  const sceneRoots = scene?.nodes;
  if (sceneRoots !== undefined && sceneRoots.length > 0) {
    return [...sceneRoots].sort((left, right) => nodeSortKey(document.nodes?.[left], left).localeCompare(nodeSortKey(document.nodes?.[right], right)));
  }
  const childIndexes = new Set<number>();
  document.nodes?.forEach((node) => node.children?.forEach((child) => childIndexes.add(child)));
  return (document.nodes ?? [])
    .map((_node, index) => index)
    .filter((index) => !childIndexes.has(index))
    .sort((left, right) => nodeSortKey(document.nodes?.[left], left).localeCompare(nodeSortKey(document.nodes?.[right], right)));
}

function assignNodePaths(
  index: number,
  parentPath: string | undefined,
  nodes: readonly IGltfNode[],
  pathByIndex: Map<number, string>,
  parentPathByIndex: Map<number, string>,
  prefix = "",
): void {
  const node = nodes[index];
  if (node === undefined) {
    return;
  }
  const segment = pathSegment(node, index);
  const path = parentPath === undefined ? `${prefix}/${segment}` : `${parentPath}/${segment}`;
  pathByIndex.set(index, path);
  if (parentPath !== undefined) {
    parentPathByIndex.set(index, parentPath);
  }
  [...(node.children ?? [])]
    .sort((left, right) => nodeSortKey(nodes[left], left).localeCompare(nodeSortKey(nodes[right], right)))
    .forEach((child) => assignNodePaths(child, path, nodes, pathByIndex, parentPathByIndex, prefix));
}

function nodeMetadata(
  node: IGltfNode,
  index: number,
  document: IGltfDocument,
  pathByIndex: ReadonlyMap<number, string>,
  parentPathByIndex: ReadonlyMap<number, string>,
): IGltfSceneNodeIr {
  const mesh = node.mesh === undefined ? undefined : meshRef(document.meshes?.[node.mesh], node.mesh);
  const materials = node.mesh === undefined ? [] : materialRefs(document.meshes?.[node.mesh], document);
  const transform = nodeTransform(node);
  return {
    ...(node.extras === undefined ? {} : { extras: node.extras }),
    ...(materials.length === 0 ? {} : { materials }),
    ...(mesh === undefined ? {} : { mesh }),
    ...(typeof node.name === "string" && node.name.trim() !== "" ? { name: node.name } : {}),
    ...(parentPathByIndex.get(index) === undefined ? {} : { parentPath: parentPathByIndex.get(index) }),
    path: pathByIndex.get(index) ?? `/orphan/${pathSegment(node, index)}`,
    spawnedHandleEligible: typeof node.name === "string" && node.name.trim() !== "",
    ...(transform === undefined ? {} : { transform }),
  };
}

function nodeTransform(node: IGltfNode): IGltfNodeTransformIr | undefined {
  const transform: IGltfNodeTransformIr = {};
  const translation = tuple3(node.translation);
  const rotation = tuple4(node.rotation);
  const scale = tuple3(node.scale);
  if (translation !== undefined) {
    transform.translation = translation;
  }
  if (rotation !== undefined) {
    transform.rotation = rotation;
  }
  if (scale !== undefined) {
    transform.scale = scale;
  }
  return Object.keys(transform).length === 0 ? undefined : transform;
}

function extractCustomAttributes(document: IGltfDocument): IGltfCustomAttributeIr[] {
  const attributes: IGltfCustomAttributeIr[] = [];
  document.meshes?.forEach((mesh, meshIndex) => {
    mesh.primitives?.forEach((primitive) => {
      for (const [name, accessorIndex] of Object.entries(primitive.attributes ?? {})) {
        if (!name.startsWith("_")) {
          continue;
        }
        const accessor = document.accessors?.[accessorIndex];
        attributes.push({
          componentType: componentTypeName(accessor?.componentType),
          itemSize: accessorItemSize(accessor?.type),
          name,
          ...(accessor?.normalized === undefined ? {} : { normalized: accessor.normalized }),
          shaderConsumption: "inspectionOnly",
          targetMesh: meshRef(mesh, meshIndex),
        });
      }
    });
  });
  return attributes;
}

function extractMaterialMetadata(document: IGltfDocument): IGltfMaterialMetadataIr[] {
  return (document.materials ?? [])
    .map((material, index) => {
      const extensions = Object.entries(material.extensions ?? {})
        .map(([extension, value]) => ({
          extension,
          path: `/materials/${index}/extensions/${extension}`,
          properties: Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right)),
          status: gltfMaterialExtensionStatus(extension),
        }))
        .sort((left, right) => left.extension.localeCompare(right.extension));
      const textureTransforms = extractTextureTransforms(material, index);
      return {
        extensions,
        ...(material.extras === undefined ? {} : { extras: material.extras }),
        material: materialRef(material, index),
        ...(typeof material.name === "string" && material.name.trim() !== "" ? { name: material.name } : {}),
        textureTransforms,
      };
    })
    .filter((material) => material.extensions.length > 0 || material.textureTransforms.length > 0 || material.extras !== undefined);
}

function extractTextureTransforms(material: IGltfMaterial, materialIndex: number): IGltfTextureTransformIr[] {
  const slots: Array<[string, IGltfTextureInfo | undefined]> = [
    ["pbrMetallicRoughness.baseColorTexture", material.pbrMetallicRoughness?.baseColorTexture],
    ["pbrMetallicRoughness.metallicRoughnessTexture", material.pbrMetallicRoughness?.metallicRoughnessTexture],
    ["normalTexture", material.normalTexture],
    ["occlusionTexture", material.occlusionTexture],
    ["emissiveTexture", material.emissiveTexture],
  ];
  for (const [extension, value] of Object.entries(material.extensions ?? {})) {
    for (const [key, nested] of Object.entries(value ?? {})) {
      if (key.endsWith("Texture") && isTextureInfo(nested)) {
        slots.push([`${extension}.${key}`, nested]);
      }
    }
  }
  return slots.flatMap(([textureSlot, texture]) => {
    const transform = texture?.extensions?.KHR_texture_transform;
    if (transform === undefined) {
      return [];
    }
    const offset = tuple2(transform.offset);
    const scale = tuple2(transform.scale);
    return [{
      extension: "KHR_texture_transform" as const,
      ...(offset === undefined ? {} : { offset }),
      path: `/materials/${materialIndex}/${textureSlot}/extensions/KHR_texture_transform`,
      ...(typeof transform.rotation === "number" && Number.isFinite(transform.rotation) ? { rotation: transform.rotation } : {}),
      ...(scale === undefined ? {} : { scale }),
      ...(Number.isInteger(transform.texCoord) ? { texCoord: transform.texCoord } : {}),
      textureSlot,
    }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function extractMorphTargets(document: IGltfDocument): IGltfMorphTargetIr[] {
  const targets: IGltfMorphTargetIr[] = [];
  document.meshes?.forEach((mesh, meshIndex) => {
    const meshName = meshRef(mesh, meshIndex);
    const namedTargets = mesh.extras?.targetNames;
    if (Array.isArray(namedTargets)) {
      namedTargets.forEach((target, targetIndex) => {
        if (typeof target === "string" && target.trim() !== "") {
          targets.push({
            ...(typeof mesh.weights?.[targetIndex] === "number" ? { defaultWeight: mesh.weights[targetIndex] } : {}),
            mesh: meshName,
            path: `/meshes/${meshIndex}/extras/targetNames/${targetIndex}`,
            source: "mesh.extras.targetNames",
            target,
          });
        }
      });
      return;
    }
    const primitiveTargetCount = Math.max(0, ...((mesh.primitives ?? []).map((primitive) => primitive.targets?.length ?? 0)));
    for (let targetIndex = 0; targetIndex < primitiveTargetCount; targetIndex += 1) {
      targets.push({
        ...(typeof mesh.weights?.[targetIndex] === "number" ? { defaultWeight: mesh.weights[targetIndex] } : {}),
        mesh: meshName,
        path: `/meshes/${meshIndex}/primitives/*/targets/${targetIndex}`,
        source: "mesh.primitives.targets",
        target: `target_${targetIndex}`,
      });
    }
  });
  return targets.sort((left, right) => left.mesh.localeCompare(right.mesh) || left.target.localeCompare(right.target));
}

function materialRefs(mesh: IGltfMesh | undefined, document: IGltfDocument): string[] {
  const refs = new Set<string>();
  mesh?.primitives?.forEach((primitive) => {
    if (primitive.material !== undefined) {
      refs.add(materialRef(document.materials?.[primitive.material], primitive.material));
    }
  });
  return [...refs].sort((left, right) => left.localeCompare(right));
}

function compareCustomAttributes(left: IGltfCustomAttributeIr, right: IGltfCustomAttributeIr): number {
  return left.targetMesh.localeCompare(right.targetMesh) || left.name.localeCompare(right.name);
}

function meshRef(mesh: IGltfMesh | undefined, index: number): string {
  return typeof mesh?.name === "string" && mesh.name.trim() !== "" ? `mesh:${mesh.name}` : `mesh:${index}`;
}

function materialRef(material: { name?: string } | undefined, index: number): string {
  return typeof material?.name === "string" && material.name.trim() !== "" ? `material:${material.name}` : `material:${index}`;
}

export function gltfMaterialExtensionStatus(extension: string): IGltfMaterialMetadataIr["extensions"][number]["status"] {
  if (extension === "KHR_materials_clearcoat" || extension === "KHR_materials_transmission" || extension === "KHR_materials_emissive_strength") {
    return "promoted";
  }
  if (extension === "KHR_materials_anisotropy" || extension === "KHR_materials_specular") {
    return "inspectionOnly";
  }
  return "unsupported";
}

function isTextureInfo(value: unknown): value is IGltfTextureInfo {
  return value !== null && typeof value === "object";
}

function pathSegment(node: IGltfNode, index: number): string {
  const label = typeof node.name === "string" && node.name.trim() !== "" ? node.name : `node_${index}`;
  return label.replaceAll("/", "_");
}

function nodeSortKey(node: IGltfNode | undefined, index: number): string {
  return `${pathSegment(node ?? {}, index)}:${String(index).padStart(6, "0")}`;
}

function componentTypeName(value: number | undefined): string {
  switch (value) {
    case 5120:
      return "i8";
    case 5121:
      return "u8";
    case 5122:
      return "i16";
    case 5123:
      return "u16";
    case 5125:
      return "u32";
    case 5126:
      return "f32";
    default:
      return "unknown";
  }
}

function accessorItemSize(value: string | undefined): number {
  switch (value) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
      return 4;
    default:
      return 1;
  }
}

function tuple3(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function tuple2(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  return [value[0] as number, value[1] as number];
}

function tuple4(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return undefined;
  }
  return [value[0] as number, value[1] as number, value[2] as number, value[3] as number];
}
