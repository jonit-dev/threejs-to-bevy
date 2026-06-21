export const sceneDocumentSchema = "threenative.scene";
export const uiDocumentSchema = "threenative.ui";
export const materialDocumentSchema = "threenative.materials";
export const assetDocumentSchema = "threenative.assets";
export const inputDocumentSchema = "threenative.input";
export const systemsDocumentSchema = "threenative.systems";
export const prefabDocumentSchema = "threenative.prefab";
export const audioDocumentSchema = "threenative.audio";
export const meshDocumentSchema = "threenative.meshes";

export const sceneDocumentKeys = new Set(["schema", "version", "id", "entities", "prefabs", "resources", "systems", "ui", "provenance"]);
export const uiDocumentKeys = new Set(["schema", "version", "id", "nodes", "bindings", "provenance"]);
export const materialDocumentKeys = new Set(["schema", "version", "id", "materials", "provenance"]);
export const assetDocumentKeys = new Set(["schema", "version", "id", "assets", "provenance"]);
export const inputDocumentKeys = new Set(["schema", "version", "id", "actions", "provenance"]);
export const systemsDocumentKeys = new Set(["schema", "version", "id", "systems", "provenance"]);
export const prefabDocumentKeys = new Set(["schema", "version", "id", "entities", "provenance"]);
export const audioDocumentKeys = new Set(["schema", "version", "id", "sounds", "provenance"]);
export const meshDocumentKeys = new Set(["schema", "version", "id", "meshes", "provenance"]);
export const entityKeys = new Set(["id", "prefab", "transform", "components"]);
export const transformKeys = new Set(["position", "rotation", "scale"]);
export const systemKeys = new Set(["id", "script", "schedule"]);
export const scriptReferenceKeys = new Set(["module", "export"]);
export const uiKeys = new Set(["nodes", "bindings"]);
export const uiNodeKeys = new Set(["id", "layout", "text", "type"]);
export const uiBindingKeys = new Set(["node", "resource"]);
export const resourceKeys = new Set(["id", "path", "value"]);
export const prefabKeys = new Set(["id", "primitive", "color", "asset"]);
export const materialKeys = new Set(["id", "asset", "color", "roughness"]);
export const assetKeys = new Set(["id", "path", "type"]);
export const inputActionKeys = new Set(["id", "bindings"]);
export const audioSoundKeys = new Set(["id", "asset"]);
export const meshKeys = new Set(["id", "kind", "primitive"]);
export const supportedPrefabPrimitives = new Set(["box", "capsule", "cone", "cylinder", "plane", "sphere"]);
export const supportedMeshPrimitives = new Set(["box", "cone", "cylinder", "plane", "sphere"]);

export const supportedComponentKinds = new Set(["camera"]);
export const cameraComponentKeys = new Set(["mode", "target"]);
export const supportedCameraModes = new Set(["third-person-follow", "perspective", "orthographic"]);

export const logicalIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
export const ecsIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const resourceIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;

export interface ISceneDocument {
  schema: typeof sceneDocumentSchema;
  version?: string;
  id: string;
  entities?: ISceneEntity[];
  prefabs?: IScenePrefab[];
  resources?: ISceneResource[];
  systems?: ISceneSystem[];
  ui?: ISceneUi;
}

export interface ISceneEntity {
  id: string;
  prefab?: string;
  transform?: ISceneTransform;
  components?: Record<string, unknown>;
}

export interface ISceneTransform {
  position?: number[];
  rotation?: number[];
  scale?: number[];
}

export interface IScenePrefab {
  asset?: string;
  color?: string;
  id: string;
  primitive?: "box" | "capsule" | "cone" | "cylinder" | "plane" | "sphere";
}

export interface ISceneResource {
  id: string;
  path?: string;
  value?: unknown;
}

export interface ISceneSystem {
  id: string;
  script?: IScriptReference;
  schedule?: string;
}

export interface IScriptReference {
  module: string;
  export: string;
}

export interface ISceneUi {
  nodes?: ISceneUiNode[];
  bindings?: ISceneUiBinding[];
}

export interface ISceneUiNode {
  id: string;
}

export interface ISceneUiBinding {
  node: string;
  resource: string;
}

export interface IUiDocument {
  schema: typeof uiDocumentSchema;
  version?: string;
  id: string;
  nodes?: ISceneUiNode[];
  bindings?: ISceneUiBinding[];
}

export interface IMaterialDocument {
  schema: typeof materialDocumentSchema;
  version?: string;
  id: string;
  materials?: IMaterialDeclaration[];
}

export interface IMaterialDeclaration {
  id: string;
  asset?: string;
  color?: string;
  roughness?: number;
}

export interface IAssetDocument {
  schema: typeof assetDocumentSchema;
  version?: string;
  id: string;
  assets?: IAssetDeclaration[];
}

export interface IAssetDeclaration {
  id: string;
  path?: string;
  type?: string;
}

export interface IInputDocument {
  schema: typeof inputDocumentSchema;
  version?: string;
  id: string;
  actions?: IInputActionDeclaration[];
}

export interface IInputActionDeclaration {
  id: string;
  bindings?: string[];
}

export interface ISystemsDocument {
  schema: typeof systemsDocumentSchema;
  version?: string;
  id: string;
  systems?: ISceneSystem[];
}

export interface IPrefabDocument {
  schema: typeof prefabDocumentSchema;
  version?: string;
  id: string;
  entities?: ISceneEntity[];
}

export interface IAudioDocument {
  schema: typeof audioDocumentSchema;
  version?: string;
  id: string;
  sounds?: IAudioSoundDeclaration[];
}

export interface IAudioSoundDeclaration {
  id: string;
  asset?: string;
}

export interface IMeshDocument {
  schema: typeof meshDocumentSchema;
  version?: string;
  id: string;
  meshes?: IMeshDeclaration[];
}

export interface IMeshDeclaration {
  id: string;
  kind: "primitive";
  primitive: "box" | "cone" | "cylinder" | "plane" | "sphere";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
