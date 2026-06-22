export const sceneDocumentSchema = "threenative.scene";
export const uiDocumentSchema = "threenative.ui";
export const materialDocumentSchema = "threenative.materials";
export const assetDocumentSchema = "threenative.assets";
export const inputDocumentSchema = "threenative.input";
export const environmentDocumentSchema = "threenative.environment-scene";
export const projectDocumentSchema = "threenative.authoring";
export const runtimeDocumentSchema = "threenative.runtime-config";
export const resourcesDocumentSchema = "threenative.resources";
export const systemsDocumentSchema = "threenative.systems";
export const prefabDocumentSchema = "threenative.prefab";
export const audioDocumentSchema = "threenative.audio";
export const meshDocumentSchema = "threenative.meshes";

export const sceneDocumentKeys = new Set(["schema", "version", "id", "kind", "activation", "initial", "entities", "prefabs", "resources", "systems", "ui", "provenance"]);
export const uiDocumentKeys = new Set(["schema", "version", "id", "nodes", "bindings", "provenance"]);
export const materialDocumentKeys = new Set(["schema", "version", "id", "materials", "provenance"]);
export const assetDocumentKeys = new Set(["schema", "version", "id", "assets", "provenance"]);
export const inputDocumentKeys = new Set(["schema", "version", "id", "actions", "axes", "provenance"]);
export const environmentDocumentKeys = new Set(["schema", "version", "id", "atmosphere", "bookmarks", "controller", "environmentMap", "exclusionZones", "instances", "lightProbes", "path", "referenceImage", "scatter", "skybox", "sourceAssets", "terrain", "walkability", "provenance"]);
export const projectDocumentKeys = new Set(["schema", "version", "id", "authoringVersion", "buildTargets", "sourceRoots", "provenance"]);
export const runtimeDocumentKeys = new Set(["schema", "version", "id", "renderer", "time", "window", "provenance"]);
export const resourcesDocumentKeys = new Set(["schema", "version", "id", "resources", "provenance"]);
export const systemsDocumentKeys = new Set(["schema", "version", "id", "systems", "provenance"]);
export const prefabDocumentKeys = new Set(["schema", "version", "id", "entities", "provenance"]);
export const audioDocumentKeys = new Set(["schema", "version", "id", "sounds", "provenance"]);
export const meshDocumentKeys = new Set(["schema", "version", "id", "meshes", "provenance"]);
export const entityKeys = new Set(["id", "prefab", "transform", "components"]);
export const transformKeys = new Set(["position", "rotation", "scale"]);
export const systemKeys = new Set([
  "after",
  "before",
  "commands",
  "eventReads",
  "eventWrites",
  "id",
  "queries",
  "reads",
  "resourceReads",
  "resourceWrites",
  "script",
  "services",
  "schedule",
  "writes",
]);
export const systemQueryKeys = new Set(["changed", "limit", "offset", "orderBy", "with", "without"]);
export const systemCommandKeys = new Set(["child", "component", "components", "entity", "event", "kind", "parent", "prefab", "prefix"]);
export const scriptReferenceKeys = new Set(["module", "export"]);
export const uiKeys = new Set(["nodes", "bindings"]);
export const uiNodeKeys = new Set(["id", "action", "label", "layout", "src", "style", "text", "type", "value"]);
export const uiStyleKeys = new Set(["backgroundColor", "borderColor", "borderRadius", "borderWidth", "color", "fontSize", "fontWeight", "opacity", "textAlign", "textDecoration", "wrap"]);
export const uiBindingKeys = new Set(["node", "resource"]);
export const resourceKeys = new Set(["id", "path", "value"]);
export const prefabKeys = new Set(["id", "primitive", "color", "asset"]);
export const materialKeys = new Set([
  "id",
  "asset",
  "alphaCutoff",
  "alphaMode",
  "baseColorTexture",
  "clearcoat",
  "clearcoatRoughness",
  "clearcoatRoughnessTexture",
  "clearcoatTexture",
  "color",
  "emissive",
  "emissiveIntensity",
  "emissiveTexture",
  "metallicRoughnessTexture",
  "metalness",
  "normalTexture",
  "occlusionTexture",
  "opacity",
  "roughness",
  "transmission",
  "transmissionTexture",
]);
export const assetKeys = new Set(["id", "path", "type"]);
export const inputActionKeys = new Set(["id", "bindings"]);
export const inputAxisKeys = new Set(["id", "negative", "positive", "value"]);
export const audioSoundKeys = new Set(["id", "asset"]);
export const meshKeys = new Set(["id", "kind", "primitive"]);
export const supportedPrefabPrimitives = new Set(["box", "capsule", "cone", "cylinder", "plane", "sphere"]);
export const supportedMeshPrimitives = new Set(["box", "cone", "cylinder", "plane", "sphere"]);

export const supportedComponentKinds = new Set(["camera", "CharacterController", "Collider", "Light", "MeshRenderer", "RigidBody"]);
export const cameraComponentKeys = new Set(["far", "fovY", "mode", "near", "size", "target"]);
export const characterControllerComponentKeys = new Set(["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "slopeLimit", "speed", "stepOffset"]);
export const colliderComponentKeys = new Set(["friction", "height", "kind", "layer", "mask", "radius", "restitution", "sensor", "size", "trigger"]);
export const lightComponentKeys = new Set(["angle", "color", "intensity", "kind", "range", "shadowBias", "shadowNormalBias"]);
export const meshRendererComponentKeys = new Set(["castShadow", "material", "mesh", "receiveShadow", "visible"]);
export const rigidBodyComponentKeys = new Set(["damping", "gravityScale", "kind", "mass", "sleepThreshold", "solverIterations"]);
export const supportedCameraModes = new Set(["third-person-follow", "perspective", "orthographic"]);
export const supportedCharacterControllerGrounding = new Set(["none", "raycast"]);
export const supportedColliderKinds = new Set(["box", "capsule", "cylinder", "mesh", "sphere"]);
export const supportedLightKinds = new Set(["ambient", "directional", "point", "spot"]);
export const supportedRigidBodyKinds = new Set(["dynamic", "kinematic", "static"]);
export const supportedMaterialAlphaModes = new Set(["blend", "mask", "opaque"]);
export const supportedRendererAntialiasModes = new Set(["fxaa", "msaa2", "msaa4", "msaa8", "none", "smaa", "taa"]);
export const supportedSceneActivationPolicies = new Set(["additive", "exclusive", "loading", "overlay", "persistent"]);
export const supportedSceneLifecycleKinds = new Set(["credits", "cutscene", "level", "loading", "menu", "overlay", "system"]);
export const supportedUiNodeTypes = new Set(["bar", "button", "column", "image", "row", "slider", "stack", "text"]);
export const supportedUiTextAlignments = new Set(["center", "left", "right"]);
export const supportedUiTextDecorations = new Set(["lineThrough", "none", "underline"]);

export const logicalIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
export const ecsIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const resourceIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;

export interface ISceneDocument {
  schema: typeof sceneDocumentSchema;
  version?: string;
  id: string;
  activation?: "additive" | "exclusive" | "loading" | "overlay" | "persistent";
  entities?: ISceneEntity[];
  initial?: boolean;
  kind?: "credits" | "cutscene" | "level" | "loading" | "menu" | "overlay" | "system";
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
  after?: string[];
  before?: string[];
  commands?: ISceneSystemCommand[];
  eventReads?: string[];
  eventWrites?: string[];
  id: string;
  queries?: ISceneSystemQuery[];
  reads?: string[];
  resourceReads?: string[];
  resourceWrites?: string[];
  script?: IScriptReference;
  services?: string[];
  schedule?: string;
  writes?: string[];
}

export interface IScriptReference {
  module: string;
  export: string;
}

export interface ISceneSystemQuery {
  changed?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "id";
  with?: string[];
  without?: string[];
}

export interface ISceneSystemCommand {
  child?: string;
  component?: string;
  components?: string[];
  entity?: string;
  event?: string;
  kind: string;
  parent?: string;
  prefab?: string;
  prefix?: string;
}

export interface ISceneUi {
  nodes?: ISceneUiNode[];
  bindings?: ISceneUiBinding[];
}

export interface ISceneUiNode {
  id: string;
  action?: string;
  label?: string;
  layout?: Record<string, unknown>;
  src?: string;
  style?: ISceneUiStyle;
  text?: string;
  type?: "bar" | "button" | "column" | "image" | "row" | "slider" | "stack" | "text";
  value?: number;
}

export interface ISceneUiStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: string;
  opacity?: number;
  textAlign?: "center" | "left" | "right";
  textDecoration?: "lineThrough" | "none" | "underline";
  wrap?: boolean;
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
  alphaCutoff?: number;
  alphaMode?: "blend" | "mask" | "opaque";
  asset?: string;
  baseColorTexture?: string;
  clearcoat?: number;
  clearcoatRoughness?: number;
  clearcoatRoughnessTexture?: string;
  clearcoatTexture?: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  emissiveTexture?: string;
  metallicRoughnessTexture?: string;
  metalness?: number;
  normalTexture?: string;
  occlusionTexture?: string;
  opacity?: number;
  roughness?: number;
  transmission?: number;
  transmissionTexture?: string;
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
  axes?: IInputAxisDeclaration[];
}

export interface IInputActionDeclaration {
  id: string;
  bindings?: string[];
}

export interface IInputAxisDeclaration {
  id: string;
  negative?: string[];
  positive?: string[];
  value?: string;
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
