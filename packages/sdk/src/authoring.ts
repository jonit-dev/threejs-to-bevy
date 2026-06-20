import { SdkError } from "./errors.js";
import type { IAssetReference } from "./assets.js";
import type { IAudioDeclaration } from "./audio.js";
import { World } from "./ecs/World.js";
import type { IEcsDeclaration } from "./ecs/schema.js";
import type { IInputMapDeclaration } from "./input.js";
import { definePrefab, PrefabTransform, type IPrefabDeclaration } from "./prefab.js";
import { defineScene, type ISceneLifecycleDeclaration, type ISceneLifecycleOptions } from "./sceneLifecycle.js";
import type { Vector3Tuple } from "./math/Vector3.js";

export interface IAuthoringSourceMetadata {
  sourceId?: string;
  sourcePath?: string;
}

export interface ISceneModuleOptions extends ISceneLifecycleOptions {
  source?: IAuthoringSourceMetadata;
}

export interface ISceneModuleDeclaration extends ISceneLifecycleDeclaration {
  authoring?: IAuthoringSourceMetadata;
}

export interface IEntityModuleDeclaration {
  authoring?: IAuthoringSourceMetadata;
  components: IEcsDeclaration[];
  id: string;
}

export interface IEntityModuleOptions {
  components?: readonly IEcsDeclaration[];
  id: string;
  source?: IAuthoringSourceMetadata;
  transform?: {
    position?: Vector3Tuple;
    rotation?: readonly [number, number, number, number];
    scale?: Vector3Tuple;
  };
}

export interface IResourceModuleDeclaration {
  authoring?: IAuthoringSourceMetadata;
  id: string;
  resource: IEcsDeclaration;
}

export interface IPrefabModuleDeclaration extends IPrefabDeclaration {
  authoring?: IAuthoringSourceMetadata;
}

export interface IWorldModuleOptions {
  entities?: readonly IEntityModuleDeclaration[];
  resources?: readonly IResourceModuleDeclaration[];
}

export interface IInputModuleDeclaration {
  authoring?: IAuthoringSourceMetadata;
  id: string;
  input: IInputMapDeclaration;
}

export interface IUiModuleDeclaration {
  authoring?: IAuthoringSourceMetadata;
  bindings: string[];
  id: string;
  ui: unknown;
}

export interface IAudioModuleDeclaration {
  audio: IAudioDeclaration;
  authoring?: IAuthoringSourceMetadata;
  id: string;
}

export interface IAssetModuleDeclaration {
  asset: IAssetReference;
  authoring?: IAuthoringSourceMetadata;
  id: string;
}

export function defineSceneModule(options: ISceneModuleOptions): ISceneModuleDeclaration {
  const scene = defineScene(options);
  const source = normalizeSourceMetadata(options.source, scene.id);
  return {
    ...scene,
    ...(source === undefined ? {} : { authoring: source }),
  };
}

export function defineInputModule(options: { id: string; input: IInputMapDeclaration; source?: IAuthoringSourceMetadata }): IInputModuleDeclaration {
  assertLogicalId(options.id);
  return {
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, options.id) }),
    id: options.id,
    input: options.input,
  };
}

export function defineUiModule(options: { bindings?: readonly string[]; id: string; source?: IAuthoringSourceMetadata; ui: unknown }): IUiModuleDeclaration {
  assertLogicalId(options.id);
  for (const binding of options.bindings ?? []) {
    assertLogicalId(binding);
  }
  return {
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, options.id) }),
    bindings: [...(options.bindings ?? [])].sort((left, right) => left.localeCompare(right)),
    id: options.id,
    ui: options.ui,
  };
}

export function defineAudioModule(options: { audio: IAudioDeclaration; id: string; source?: IAuthoringSourceMetadata }): IAudioModuleDeclaration {
  assertLogicalId(options.id);
  return {
    audio: options.audio,
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, options.id) }),
    id: options.id,
  };
}

export function defineAssetModule(options: { asset: IAssetReference; id?: string; source?: IAuthoringSourceMetadata }): IAssetModuleDeclaration {
  const id = options.id ?? options.asset.id;
  assertLogicalId(id);
  assertBundleLocalAsset(options.asset, id);
  return {
    asset: { ...options.asset },
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, id) }),
    id,
  };
}

export function defineEntity(options: IEntityModuleOptions): IEntityModuleDeclaration {
  assertLogicalId(options.id);
  const components = [
    ...(options.components ?? []),
    ...(options.transform === undefined ? [] : [PrefabTransform(transformData(options.transform))]),
  ];
  for (const component of components) {
    assertPortableData(component.data, `Entity '${options.id}' component '${component.schema.name}'`);
  }
  return {
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, options.id) }),
    components: sortComponents(components),
    id: options.id,
  };
}

export function defineResourceModule(options: { id: string; resource: IEcsDeclaration; source?: IAuthoringSourceMetadata }): IResourceModuleDeclaration {
  assertLogicalId(options.id);
  if (options.resource.schema.kind !== "resource") {
    throw new SdkError("TN_SDK_AUTHORING_RESOURCE_KIND_INVALID", `Resource module '${options.id}' must wrap a resource declaration.`);
  }
  assertPortableData(options.resource.data, `Resource module '${options.id}'`);
  return {
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, options.id) }),
    id: options.id,
    resource: {
      data: { ...options.resource.data },
      schema: options.resource.schema,
    },
  };
}

export function definePrefabModule(options: {
  componentOverrides?: readonly IEcsDeclaration[];
  id: string;
  prefab: IPrefabDeclaration;
  source?: IAuthoringSourceMetadata;
}): IPrefabModuleDeclaration {
  assertLogicalId(options.id);
  const componentsByName = new Map(options.prefab.components.map((component) => [component.schema.name, component]));
  for (const override of options.componentOverrides ?? []) {
    assertPortableData(override.data, `Prefab module '${options.id}' override '${override.schema.name}'`);
    componentsByName.set(override.schema.name, override);
  }
  const prefab = definePrefab({
    components: sortComponents([...componentsByName.values()]),
    id: options.id,
    ...(options.prefab.mesh === undefined ? {} : { mesh: options.prefab.mesh }),
  });
  return {
    ...prefab,
    ...(options.source === undefined ? {} : { authoring: normalizeSourceMetadata(options.source, options.id) }),
  };
}

export function defineWorldModule(options: IWorldModuleOptions): World {
  const world = new World();
  for (const entity of [...(options.entities ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    world.spawn(entity.id, ...entity.components);
  }
  for (const resource of [...(options.resources ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    world.addResource(resource.resource);
  }
  return world;
}

function normalizeSourceMetadata(source: IAuthoringSourceMetadata | undefined, fallbackId: string): IAuthoringSourceMetadata | undefined {
  if (source === undefined) {
    return { sourceId: fallbackId };
  }
  const normalized: IAuthoringSourceMetadata = {};
  const sourceId = source.sourceId ?? fallbackId;
  assertLogicalId(sourceId);
  normalized.sourceId = sourceId;
  if (source.sourcePath !== undefined) {
    normalized.sourcePath = normalizeSourcePath(source.sourcePath);
  }
  return normalized;
}

function transformData(transform: NonNullable<IEntityModuleOptions["transform"]>): Record<string, unknown> {
  return {
    ...(transform.position === undefined ? {} : { position: [...transform.position] }),
    ...(transform.rotation === undefined ? {} : { rotation: [...transform.rotation] }),
    ...(transform.scale === undefined ? {} : { scale: [...transform.scale] }),
  };
}

function sortComponents(components: readonly IEcsDeclaration[]): IEcsDeclaration[] {
  return [...components]
    .map((component) => ({
      data: { ...component.data },
      schema: component.schema,
    }))
    .sort((left, right) => left.schema.name.localeCompare(right.schema.name));
}

function assertPortableData(value: unknown, label: string): void {
  if (containsRuntimeHandle(value)) {
    throw new SdkError("TN_SDK_AUTHORING_RUNTIME_HANDLE_UNSUPPORTED", `${label} data must not include runtime handles.`);
  }
}

function assertBundleLocalAsset(asset: IAssetReference, id: string): void {
  if (asset.sourceMode === "network" || asset.network !== undefined) {
    throw new SdkError("TN_SDK_AUTHORING_ASSET_SOURCE_UNSUPPORTED", `Asset module '${id}' must reference bundle-local or embedded assets.`);
  }
  if (asset.sourceMode !== undefined && asset.sourceMode !== "bundle" && asset.sourceMode !== "embedded") {
    throw new SdkError("TN_SDK_AUTHORING_ASSET_SOURCE_UNSUPPORTED", `Asset module '${id}' uses unsupported source mode '${asset.sourceMode}'.`);
  }
  if (asset.path !== undefined) {
    normalizeSourcePath(asset.path);
  }
}

function containsRuntimeHandle(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsRuntimeHandle);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (normalized === "runtimehandle" || normalized === "nativehandle" || normalized === "__nativehandle" || normalized === "threeobject" || normalized === "bevyentity") {
      return true;
    }
    if (containsRuntimeHandle(item)) {
      return true;
    }
  }
  return false;
}

function assertLogicalId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) {
    throw new SdkError("TN_SDK_AUTHORING_SOURCE_ID_INVALID", "Authoring sourceId must be a non-empty logical ID using letters, numbers, '.', ':', '_' or '-'.");
  }
}

function normalizeSourcePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized === ".." ||
    normalized.includes("/.generated/") ||
    normalized.startsWith(".generated/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("build/") ||
    normalized.startsWith("game.bundle/") ||
    normalized.endsWith(".bundle")
  ) {
    throw new SdkError("TN_SDK_AUTHORING_SOURCE_PATH_INVALID", "Authoring sourcePath must be a source-owned, project-relative path.");
  }
  return normalized;
}
