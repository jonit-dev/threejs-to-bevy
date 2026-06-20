export const sceneDocumentSchema = "threenative.scene";

export const sceneDocumentKeys = new Set(["schema", "version", "id", "entities", "prefabs", "resources", "systems", "ui"]);
export const entityKeys = new Set(["id", "prefab", "transform", "components"]);
export const transformKeys = new Set(["position", "rotation", "scale"]);
export const systemKeys = new Set(["id", "script", "schedule"]);
export const scriptReferenceKeys = new Set(["module", "export"]);
export const uiKeys = new Set(["nodes", "bindings"]);
export const uiNodeKeys = new Set(["id"]);
export const uiBindingKeys = new Set(["node", "resource"]);
export const resourceKeys = new Set(["id", "path"]);
export const prefabKeys = new Set(["id", "primitive", "color"]);
export const supportedPrefabPrimitives = new Set(["box", "capsule", "cone", "cylinder", "plane", "sphere"]);

export const supportedComponentKinds = new Set(["camera"]);
export const cameraComponentKeys = new Set(["mode", "target"]);
export const supportedCameraModes = new Set(["third-person-follow", "perspective", "orthographic"]);

export const logicalIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

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
  color?: string;
  id: string;
  primitive?: "box" | "capsule" | "cone" | "cylinder" | "plane" | "sphere";
}

export interface ISceneResource {
  id: string;
  path?: string;
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
