import { extname } from "node:path";

import {
  IR_SCHEMA_IDS,
  IR_VERSION,
  type IGameFlowIr,
  type IInteractionsIr,
  type IIrSchemaFile,
  type IMaterialIr,
  type IPrefabsIr,
  type IRuntimeConfigIr,
  type ISequencesIr,
  type ITargetProfile,
} from "@threenative/ir";
import type { IAuthoringDocument } from "@threenative/authoring";
import type { IAssetModuleDeclaration, IAssetReference } from "@threenative/sdk";

import type { IInternalAsset } from "./asset-copy.js";

type StructuredMaterialColor = string | readonly [number, number, number] | readonly [number, number, number, number];

export function readStructuredInteractions(documents: readonly IAuthoringDocument[] | undefined): IInteractionsIr | undefined {
  const sources = (documents ?? []).filter((document) => document.kind === "interaction" && isRecord(document.data));
  if (sources.length === 0) return undefined;
  const ids = sources.map((document) => readString((document.data as Record<string, unknown>).id)).filter((id): id is string => id !== undefined).sort();
  const interactions = sources.flatMap((document) => readRecordList((document.data as Record<string, unknown>).interactions).map(cloneRecord));
  interactions.sort((left, right) => String(left.id ?? "").localeCompare(String(right.id ?? "")));
  return { id: ids.join("+") || "interactions", interactions: interactions as unknown as IInteractionsIr["interactions"], schema: IR_SCHEMA_IDS.interactions, version: IR_VERSION };
}

export function readStructuredRuntimeConfig(documents: readonly IAuthoringDocument[] | undefined): IRuntimeConfigIr | undefined {
  const data = documents?.find((document) => document.kind === "runtime" && isRecord(document.data))?.data;
  if (!isRecord(data) || !isRecord(data.time) || !isRecord(data.window)) {
    return undefined;
  }
  return {
    schema: IR_SCHEMA_IDS.runtimeConfig,
    version: IR_VERSION,
    ...(isRecord(data.renderer) ? { renderer: cloneRecord(data.renderer) as IRuntimeConfigIr["renderer"] } : {}),
    time: cloneRecord(data.time) as IRuntimeConfigIr["time"],
    window: cloneRecord(data.window) as IRuntimeConfigIr["window"],
  };
}

export function readStructuredTargetProfile(documents: readonly IAuthoringDocument[] | undefined): ITargetProfile | undefined {
  const data = documents?.find((document) => document.kind === "target" && isRecord(document.data))?.data;
  if (!isRecord(data) || !Array.isArray(data.targets) || data.targets.some((target) => target !== "web" && target !== "desktop")) {
    return undefined;
  }
  return {
    schema: IR_SCHEMA_IDS.targetProfile,
    version: IR_VERSION,
    targets: [...data.targets] as ITargetProfile["targets"],
    ...(isRecord(data.budgets) ? { budgets: cloneRecord(data.budgets) as ITargetProfile["budgets"] } : {}),
    ...(isRecord(data.performance) ? { performance: cloneRecord(data.performance) as unknown as ITargetProfile["performance"] } : {}),
  };
}

export function readStructuredMaterials(documents: readonly IAuthoringDocument[] | undefined): IMaterialIr[] {
  return (documents ?? [])
    .filter((document) => document.kind === "material" && isRecord(document.data))
    .flatMap((document) => readRecordList((document.data as Record<string, unknown>).materials).flatMap((item) => structuredMaterial(item)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function structuredMaterial(item: Record<string, unknown>): IMaterialIr[] {
  const id = readString(item.id);
  const color = readColor(item.color) ?? "#ffffff";
  if (id === undefined) {
    return [];
  }
  if (readString(item.kind) === "shader" && isRecord(item.program)) {
    const shaderMaterial: Record<string, unknown> = {
      id,
      kind: "shader",
      ...(readColor(item.color) === undefined ? {} : { color: readColor(item.color) }),
      ...copyOptionalMaterialString(item, "alphaMode"),
      ...copyOptionalMaterialString(item, "blendMode"),
      ...copyOptionalMaterialNumber(item, "alphaCutoff"),
      ...copyOptionalMaterialNumber(item, "emissiveIntensity"),
      ...copyOptionalMaterialNumber(item, "renderOrder"),
      ...copyOptionalMaterialBoolean(item, "depthTest"),
      ...copyOptionalMaterialBoolean(item, "depthWrite"),
      ...(readColor(item.emissive) === undefined ? {} : { emissive: readColor(item.emissive) }),
      ...(Array.isArray(item.inputs) ? { inputs: [...item.inputs] } : {}),
      ...(Array.isArray(item.outputs) ? { outputs: [...item.outputs] } : {}),
      program: cloneRecord(item.program),
      ...(Array.isArray(item.textures) ? { textures: item.textures.map((texture) => (isRecord(texture) ? cloneRecord(texture) : texture)) } : {}),
      ...(Array.isArray(item.uniforms) ? { uniforms: item.uniforms.map((uniform) => (isRecord(uniform) ? cloneRecord(uniform) : uniform)) } : {}),
    };
    return [shaderMaterial as unknown as IMaterialIr];
  }
  const material: Record<string, unknown> = {
    id,
    kind: readString(item.kind) === "extended" ? "extended" : "standard",
    color,
    ...copyOptionalMaterialString(item, "alphaMode"),
    ...copyOptionalMaterialString(item, "baseColorTexture"),
    ...copyOptionalMaterialString(item, "blendMode"),
    ...copyOptionalMaterialString(item, "clearcoatRoughnessTexture"),
    ...copyOptionalMaterialString(item, "clearcoatTexture"),
    ...copyOptionalMaterialString(item, "emissiveTexture"),
    ...copyOptionalMaterialString(item, "metallicRoughnessTexture"),
    ...copyOptionalMaterialString(item, "normalTexture"),
    ...copyOptionalMaterialString(item, "occlusionTexture"),
    ...copyOptionalMaterialNumber(item, "alphaCutoff"),
    ...copyOptionalMaterialNumber(item, "clearcoat"),
    ...copyOptionalMaterialNumber(item, "clearcoatRoughness"),
    ...copyOptionalMaterialNumber(item, "emissiveIntensity"),
    ...copyOptionalMaterialNumber(item, "metalness"),
    ...copyOptionalMaterialNumber(item, "opacity"),
    ...copyOptionalMaterialNumber(item, "renderOrder"),
    ...copyOptionalMaterialNumber(item, "roughness"),
    ...copyOptionalMaterialNumber(item, "specularIntensity"),
    ...copyOptionalMaterialBoolean(item, "depthTest"),
    ...copyOptionalMaterialBoolean(item, "depthWrite"),
    ...(readColor(item.emissive) === undefined ? {} : { emissive: readColor(item.emissive) }),
    ...(isRecord(item.emissiveBloom) ? { emissiveBloom: cloneRecord(item.emissiveBloom) } : {}),
    ...(isRecord(item.extension) ? { extension: cloneRecord(item.extension) } : {}),
  };
  return [material as unknown as IMaterialIr];
}

function readColor(value: unknown): StructuredMaterialColor | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (Array.isArray(value) && (value.length === 3 || value.length === 4) && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return value as unknown as StructuredMaterialColor;
  }
  return undefined;
}

function copyOptionalMaterialString(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = readString(item[key]);
  return value === undefined ? {} : { [key]: value };
}

function copyOptionalMaterialNumber(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = readNumber(item[key]);
  return value === undefined ? {} : { [key]: value };
}

function copyOptionalMaterialBoolean(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = item[key];
  return typeof value === "boolean" ? { [key]: value } : {};
}

export function readStructuredSchemaFiles(documents: readonly IAuthoringDocument[] | undefined): {
  componentSchemas?: IIrSchemaFile;
  eventSchemas?: IIrSchemaFile;
  resourceSchemas?: IIrSchemaFile;
} {
  const componentSchemas = structuredSchemaFile("threenative.component-schemas", documents, "component");
  const eventSchemas = structuredSchemaFile("threenative.event-schemas", documents, "event");
  const resourceSchemas = structuredSchemaFile("threenative.resource-schemas", documents, "resource");
  return {
    ...(componentSchemas === undefined ? {} : { componentSchemas }),
    ...(eventSchemas === undefined ? {} : { eventSchemas }),
    ...(resourceSchemas === undefined ? {} : { resourceSchemas }),
  };
}

function structuredSchemaFile(schema: IIrSchemaFile["schema"], documents: readonly IAuthoringDocument[] | undefined, kind: "component" | "event" | "resource"): IIrSchemaFile | undefined {
  const entries: Array<[string, { fields: Record<string, unknown> }]> = [];
  for (const document of documents ?? []) {
    if (document.kind !== "schema" || !isRecord(document.data) || document.data.kind !== kind || !Array.isArray(document.data.schemas)) {
      continue;
    }
    for (const item of document.data.schemas) {
      if (!isRecord(item) || !isRecord(item.fields)) {
        continue;
      }
      const id = readString(item.id);
      if (id !== undefined) {
        entries.push([id, { fields: cloneRecord(item.fields) }]);
      }
    }
  }
  const schemas = Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))) as IIrSchemaFile["schemas"];
  if (Object.keys(schemas).length === 0) {
    return undefined;
  }
  return {
    schema,
    version: IR_VERSION,
    schemas,
  };
}

export function readBundleRootAssets(assets: readonly (IAssetReference | IAssetModuleDeclaration)[] | undefined): IInternalAsset[] {
  return (assets ?? []).map((item) => {
    const ref = isAssetModuleDeclaration(item) ? item.asset : item;
    return cloneAssetReference(ref);
  });
}

export function readStructuredAssets(documents: readonly IAuthoringDocument[] | undefined): IInternalAsset[] {
  return (documents ?? [])
    .filter((document) => document.kind === "asset" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      if (!Array.isArray(data.assets)) {
        return [];
      }
      return data.assets.flatMap((item) => structuredAsset(item));
    });
}

function structuredAsset(item: unknown): IInternalAsset[] {
  if (!isRecord(item)) {
    return [];
  }
  const id = readString(item.id);
  const type = readString(item.type);
  if (id === undefined) {
    return [];
  }
  if (type === "render-target") {
    const width = readNumber(item.width);
    const height = readNumber(item.height);
    if (width === undefined || height === undefined) {
      return [];
    }
    const usage = readString(item.usage) === "depth" ? "depth" : "color";
    const format = renderTargetFormat(readString(item.format), usage);
    return [{
      format,
      height,
      id,
      kind: "render-target",
      ...(readNumber(item.sampleCount) === undefined ? {} : { sampleCount: readNumber(item.sampleCount) }),
      usage,
      width,
    }];
  }
  const path = readString(item.path);
  const kind = assetKindFromSourceType(type);
  if (path === undefined || kind === undefined) {
    return [];
  }
  const format = inferAssetFormat(kind, path);
  if (format === undefined) {
    return [];
  }
  if (kind === "heightmap") {
    const width = readNumber(item.width);
    const height = readNumber(item.height);
    const heightRange = isRecord(item.heightRange) ? item.heightRange : undefined;
    if (width === undefined || height === undefined || heightRange === undefined) {
      return [];
    }
    return [{
      encoding: readString(item.encoding) ?? "float32",
      format,
      height,
      heightRange: cloneRecord(heightRange),
      id,
      kind,
      path,
      sourceMode: "bundle",
      width,
    }];
  }
  return [{
    ...(kind === "model" && Array.isArray(item.animations) ? { animations: item.animations.map((entry) => cloneRecord(entry as Record<string, unknown>)) } : {}),
    ...(kind === "model" && isRecord(item.animationGraph) ? { animationGraph: cloneRecord(item.animationGraph) } : {}),
    ...(kind === "texture" && readVec2(item.center) !== undefined ? { center: readVec2(item.center) } : {}),
    format,
    id,
    kind,
    ...(kind === "texture" && readString(item.magFilter) !== undefined ? { magFilter: readString(item.magFilter) } : {}),
    ...(kind === "texture" && readString(item.minFilter) !== undefined ? { minFilter: readString(item.minFilter) } : {}),
    ...(kind === "texture" && readVec2(item.offset) !== undefined ? { offset: readVec2(item.offset) } : {}),
    path,
    ...(kind === "model" && Array.isArray(item.particleEmitters) ? { particleEmitters: item.particleEmitters.map((entry) => cloneRecord(entry as Record<string, unknown>)) } : {}),
    ...(kind === "texture" && readVec2(item.repeat) !== undefined ? { repeat: readVec2(item.repeat) } : {}),
    ...(kind === "texture" && readNumber(item.rotation) !== undefined ? { rotation: readNumber(item.rotation) } : {}),
    sourceMode: "bundle",
    ...(kind === "texture" && readString(item.wrapS) !== undefined ? { wrapS: readString(item.wrapS) } : {}),
    ...(kind === "texture" && readString(item.wrapT) !== undefined ? { wrapT: readString(item.wrapT) } : {}),
  }];
}

export function readStructuredMeshes(documents: readonly IAuthoringDocument[] | undefined): IInternalAsset[] {
  return (documents ?? [])
    .filter((document) => document.kind === "mesh" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      if (!Array.isArray(data.meshes)) {
        return [];
      }
      return data.meshes.flatMap((item) => structuredMeshAsset(item));
    });
}

function structuredMeshAsset(item: unknown): IInternalAsset[] {
  if (!isRecord(item)) {
    return [];
  }
  const id = readString(item.id);
  const kind = readString(item.kind);
  if (id === undefined) {
    return [];
  }
  if (kind === "primitive") {
    const primitive = readString(item.primitive);
    const size = readNumberArray(item.size);
    return primitive === undefined ? [] : [{ format: "generated", id, kind: "mesh", primitive, ...(size === undefined ? {} : { size }) }];
  }
  if (kind !== "custom" || !Array.isArray(item.attributes)) {
    return [];
  }
  return [{
    attributes: item.attributes.map((attribute) => cloneRecord(attribute as Record<string, unknown>)),
    format: "generated",
    id,
    ...(Array.isArray(item.indices) ? { indices: [...item.indices] } : {}),
    kind: "mesh",
    primitive: "custom",
    ...(item.storage === "binary" ? { storage: "binary" } : {}),
  }];
}

function renderTargetFormat(format: string | undefined, usage: "color" | "depth"): "depth24plus" | "rgba16f" | "rgba8" {
  if (format === "rgba16f" || format === "rgba8" || format === "depth24plus") {
    return format;
  }
  return usage === "depth" ? "depth24plus" : "rgba8";
}

function assetKindFromSourceType(type: string | undefined): string | undefined {
  if (type === "model" || type === "texture" || type === "audio" || type === "buffer" || type === "heightmap") {
    return type;
  }
  return undefined;
}

function inferAssetFormat(kind: string, path: string): string | undefined {
  const extension = extname(path).slice(1).toLowerCase();
  if (kind === "model" && (extension === "glb" || extension === "gltf")) {
    return extension;
  }
  if (kind === "texture" && (extension === "png" || extension === "jpeg" || extension === "jpg" || extension === "webp")) {
    return extension === "jpg" ? "jpeg" : extension;
  }
  if (kind === "audio" && (extension === "mp3" || extension === "ogg" || extension === "wav")) {
    return extension;
  }
  if (kind === "buffer" && extension === "bin") {
    return extension;
  }
  if (kind === "heightmap" && extension === "json") {
    return extension;
  }
  return undefined;
}

function isAssetModuleDeclaration(value: IAssetReference | IAssetModuleDeclaration): value is IAssetModuleDeclaration {
  return isRecord(value) && isRecord(value.asset);
}

function cloneAssetReference(ref: IAssetReference): IInternalAsset {
  return JSON.parse(JSON.stringify(ref)) as IInternalAsset;
}

export function readStructuredPrefabs(documents: readonly IAuthoringDocument[] | undefined): IPrefabsIr | undefined {
  const prefabs = (documents ?? [])
    .filter((document) => document.kind === "prefab" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      const id = readString(data.id);
      const entities = readPrefabEntities(data.entities);
      if (id === undefined || entities.length === 0) {
        return [];
      }
      return [{
        id,
        entities,
        root: entities[0]!.id,
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  if (prefabs.length === 0) {
    return undefined;
  }
  return {
    schema: IR_SCHEMA_IDS.prefabs,
    version: IR_VERSION,
    prefabs,
  };
}

export function readStructuredGameFlow(documents: readonly IAuthoringDocument[] | undefined): IGameFlowIr | undefined {
  const flows = (documents ?? [])
    .filter((document) => document.kind === "flow" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      const id = readString(data.id);
      const initial = readString(data.initial);
      const states = readRecordList(data.states).map(cloneRecord) as unknown as IGameFlowIr["flows"][number]["states"];
      if (id === undefined || initial === undefined || states.length === 0) {
        return [];
      }
      const scene = readString(data.scene);
      return [{
        id,
        initial,
        ...(scene === undefined ? {} : { scene }),
        states,
        ...(Array.isArray(data.transitions) ? { transitions: readRecordList(data.transitions).map(cloneRecord) as unknown as IGameFlowIr["flows"][number]["transitions"] } : {}),
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return flows.length === 0
    ? undefined
    : {
        schema: IR_SCHEMA_IDS.gameFlow,
        version: IR_VERSION,
        flows,
      };
}

export function readStructuredSequences(documents: readonly IAuthoringDocument[] | undefined): ISequencesIr | undefined {
  const sequences = (documents ?? [])
    .filter((document) => document.kind === "sequence" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      const id = readString(data.id);
      const duration = readNumber(data.duration);
      if (id === undefined || duration === undefined) {
        return [];
      }
      return [{
        duration,
        id,
        ...(typeof data.skippable === "boolean" ? { skippable: data.skippable } : {}),
        tracks: readRecordList(data.tracks).map(cloneRecord) as unknown as ISequencesIr["sequences"][number]["tracks"],
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return sequences.length === 0
    ? undefined
    : {
        schema: IR_SCHEMA_IDS.sequences,
        sequences,
        version: IR_VERSION,
      };
}

function readPrefabEntities(value: unknown): IPrefabsIr["prefabs"][number]["entities"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = readString(item.id);
    if (id === undefined) {
      return [];
    }
    const components = isRecord(item.components) ? cloneRecord(item.components) : {};
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "") : [];
    return [{ id, components, ...(tags.length === 0 ? {} : { tags: [...new Set(tags)].sort() }) }];
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNumberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value : undefined;
}

function readVec2(value: unknown): [number, number] | undefined {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1]]
    : undefined;
}

function readRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
