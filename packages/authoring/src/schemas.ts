export const sceneDocumentSchema = "threenative.scene";
export const uiDocumentSchema = "threenative.ui";
export const materialDocumentSchema = "threenative.materials";
export const assetDocumentSchema = "threenative.assets";
export const inputDocumentSchema = "threenative.input";
export const environmentDocumentSchema = "threenative.environment-scene";
export const projectDocumentSchema = "threenative.authoring";
export const runtimeDocumentSchema = "threenative.runtime-config";
export const targetProfileDocumentSchema = "threenative.target-profile";
export const resourcesDocumentSchema = "threenative.resources";
export const schemaDocumentSchema = "threenative.schema";
export const systemsDocumentSchema = "threenative.systems";
export const prefabDocumentSchema = "threenative.prefab";
export const audioDocumentSchema = "threenative.audio";
export const meshDocumentSchema = "threenative.meshes";
export const generatorDocumentSchema = "threenative.generator-provenance";

export const sceneDocumentKeys = new Set(["schema", "version", "id", "kind", "activation", "initial", "entities", "instances", "prefabs", "resources", "systems", "scriptLifecycles", "ui", "provenance"]);
export const uiDocumentKeys = new Set(["schema", "version", "id", "nodes", "bindings", "provenance"]);
export const materialDocumentKeys = new Set(["schema", "version", "id", "materials", "provenance"]);
export const assetDocumentKeys = new Set(["schema", "version", "id", "assets", "provenance"]);
export const inputDocumentKeys = new Set(["schema", "version", "id", "actions", "axes", "controlsSettings", "persistedBindingOverrides", "provenance"]);
export const environmentDocumentKeys = new Set(["schema", "version", "id", "atmosphere", "bookmarks", "controller", "environmentMap", "exclusionZones", "instances", "lightProbes", "path", "referenceImage", "scatter", "skybox", "sourceAssets", "terrain", "walkability", "provenance"]);
export const projectDocumentKeys = new Set(["schema", "version", "id", "authoringVersion", "buildTargets", "sourceRoots", "provenance"]);
export const runtimeDocumentKeys = new Set(["schema", "version", "id", "renderer", "time", "window", "provenance"]);
export const targetProfileDocumentKeys = new Set(["schema", "version", "id", "budgets", "performance", "targets", "provenance"]);
export const resourcesDocumentKeys = new Set(["schema", "version", "id", "resources", "provenance"]);
export const schemaDocumentKeys = new Set(["schema", "version", "id", "kind", "schemas", "provenance"]);
export const systemsDocumentKeys = new Set(["schema", "version", "id", "systems", "scriptLifecycles", "provenance"]);
export const prefabDocumentKeys = new Set(["schema", "version", "id", "entities", "provenance"]);
export const audioDocumentKeys = new Set(["schema", "version", "id", "sounds", "provenance"]);
export const meshDocumentKeys = new Set(["schema", "version", "id", "meshes", "provenance"]);
export const generatorDocumentKeys = new Set(["schema", "version", "id", "module", "export", "outputs", "overwritePolicy", "inputHash", "outputHash", "lastRun", "provenance"]);
export const entityKeys = new Set(["id", "prefab", "transform", "components"]);
export const instanceKeys = new Set(["id", "prefab", "transform", "components"]);
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
export const scriptLifecycleKeys = new Set([
  "after",
  "awake",
  "before",
  "commands",
  "eventReads",
  "eventWrites",
  "fixedUpdate",
  "id",
  "lateUpdate",
  "module",
  "onEnter",
  "onExit",
  "queries",
  "reads",
  "resourceReads",
  "resourceWrites",
  "scene",
  "services",
  "update",
  "writes",
]);
export const uiKeys = new Set(["nodes", "bindings"]);
export const uiNodeKeys = new Set(["id", "action", "label", "layout", "src", "style", "text", "type", "value"]);
export const uiStyleKeys = new Set(["backgroundColor", "borderColor", "borderRadius", "borderWidth", "color", "fontSize", "fontWeight", "opacity", "textAlign", "textDecoration", "wrap"]);
export const uiBindingKeys = new Set(["node", "resource"]);
export const resourceKeys = new Set(["id", "path", "value"]);
export const schemaEntryKeys = new Set(["id", "fields"]);
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
export const assetKeys = new Set(["animationGraph", "animations", "format", "height", "id", "particleEmitters", "path", "sampleCount", "type", "usage", "width"]);
export const inputActionKeys = new Set(["id", "bindings"]);
export const inputAxisKeys = new Set(["id", "negative", "positive", "value"]);
export const inputControlsSettingsKeys = new Set(["profileId", "rows"]);
export const inputControlsSettingsRowKeys = new Set(["actionOrAxisId", "axisSlot", "captureState", "defaultBindings", "kind", "uiNodeId"]);
export const inputPersistedBindingOverrideKeys = new Set(["actionOrAxisId", "axisSlot", "control", "deadzone", "device", "modifiers", "profileId", "scale", "updatedAt"]);
export const audioSoundKeys = new Set(["id", "asset"]);
export const meshKeys = new Set(["attributes", "id", "indices", "kind", "primitive", "size", "storage"]);
export const supportedGeneratorOverwritePolicies = new Set(["manual", "replace", "skip"]);
export const supportedPrefabPrimitives = new Set(["box", "capsule", "cone", "cylinder", "plane", "sphere", "torus"]);
export const supportedMeshPrimitives = new Set(["box", "cone", "cylinder", "plane", "sphere", "torus"]);

export const supportedComponentKinds = new Set(["camera", "CharacterController", "Collider", "Light", "MeshRenderer", "RenderLayers", "RigidBody", "Visibility"]);
export const cameraComponentKeys = new Set(["far", "fovY", "mode", "near", "size", "target"]);
export const characterControllerComponentKeys = new Set(["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "slopeLimit", "speed", "stepOffset"]);
export const colliderComponentKeys = new Set(["center", "friction", "height", "kind", "layer", "mask", "radius", "restitution", "sensor", "size", "trigger"]);
export const lightComponentKeys = new Set(["angle", "color", "intensity", "kind", "range", "shadowBias", "shadowNormalBias"]);
export const meshRendererComponentKeys = new Set(["castShadow", "material", "mesh", "receiveShadow", "visible"]);
export const renderLayersComponentKeys = new Set(["layers"]);
export const rigidBodyComponentKeys = new Set(["angularVelocity", "ccd", "damping", "enabledRotations", "enabledTranslations", "gravityScale", "inverseMass", "kind", "mass", "sleepThreshold", "solverIterations", "velocity"]);
export const visibilityComponentKeys = new Set(["visible"]);
export const supportedCameraModes = new Set(["third-person-follow", "perspective", "orthographic"]);
export const supportedCharacterControllerGrounding = new Set(["none", "raycast"]);
export const supportedColliderKinds = new Set(["box", "capsule", "cylinder", "mesh", "sphere"]);
export const supportedLightKinds = new Set(["ambient", "directional", "point", "spot"]);
export const supportedRigidBodyKinds = new Set(["dynamic", "kinematic", "static"]);
export const supportedMaterialAlphaModes = new Set(["blend", "mask", "opaque"]);
export const supportedRendererAntialiasModes = new Set(["fxaa", "msaa2", "msaa4", "msaa8", "none", "smaa", "taa"]);
export const supportedSceneActivationPolicies = new Set(["additive", "exclusive", "loading", "overlay", "persistent"]);
export const supportedSceneLifecycleKinds = new Set(["credits", "cutscene", "level", "loading", "menu", "overlay", "system"]);
export const supportedUiNodeTypes = new Set(["bar", "button", "column", "image", "row", "slider", "stack", "text", "textInput"]);
export const supportedUiTextAlignments = new Set(["center", "left", "right"]);
export const supportedUiTextDecorations = new Set(["lineThrough", "none", "underline"]);
export const supportedInputCaptureStates = new Set(["applied", "conflict-confirmation", "idle", "rejected", "reset-to-default", "waiting-for-input"]);
export const supportedInputOverrideDevices = new Set(["gamepad", "keyboard", "pointer", "touch"]);
export const supportedInputRebindKinds = new Set(["action", "axis"]);
export const supportedInputAxisSlots = new Set(["negative", "positive", "value"]);

export const logicalIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
export const ecsIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const resourceIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;
export const supportedSchemaDocumentKinds = new Set(["component", "resource"]);
export const supportedSchemaFieldKinds = new Set(["boolean", "color", "enum", "json", "number", "quat", "string", "vec2", "vec3", "vec4"]);

export interface ISceneDocument {
  schema: typeof sceneDocumentSchema;
  version?: string;
  id: string;
  activation?: "additive" | "exclusive" | "loading" | "overlay" | "persistent";
  entities?: ISceneEntity[];
  instances?: IScenePrefabInstance[];
  initial?: boolean;
  kind?: "credits" | "cutscene" | "level" | "loading" | "menu" | "overlay" | "system";
  prefabs?: IScenePrefab[];
  resources?: ISceneResource[];
  scriptLifecycles?: ISceneScriptLifecycle[];
  systems?: ISceneSystem[];
  ui?: ISceneUi;
}

export interface ISceneEntity {
  id: string;
  prefab?: string;
  transform?: ISceneTransform;
  components?: Record<string, unknown>;
}

export interface IScenePrefabInstance {
  id: string;
  prefab: string;
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
  primitive?: "box" | "capsule" | "cone" | "cylinder" | "plane" | "sphere" | "torus";
}

export interface ISceneResource {
  id: string;
  path?: string;
  value?: unknown;
}

export interface ISchemaDocument {
  schema: typeof schemaDocumentSchema;
  version?: string;
  id: string;
  kind: "component" | "resource";
  schemas?: ISchemaEntry[];
}

export interface ISchemaEntry {
  id: string;
  fields: Record<string, ISchemaField>;
}

export interface ISchemaField {
  default?: unknown;
  kind: "boolean" | "color" | "enum" | "json" | "number" | "quat" | "string" | "vec2" | "vec3" | "vec4";
  required?: boolean;
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

export interface ISceneScriptLifecycle {
  after?: string[];
  awake?: string;
  before?: string[];
  commands?: ISceneSystemCommand[];
  eventReads?: string[];
  eventWrites?: string[];
  fixedUpdate?: string;
  id: string;
  lateUpdate?: string;
  module: string;
  onEnter?: string;
  onExit?: string;
  queries?: ISceneSystemQuery[];
  reads?: string[];
  resourceReads?: string[];
  resourceWrites?: string[];
  scene?: string;
  services?: string[];
  update?: string;
  writes?: string[];
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
  type?: "bar" | "button" | "column" | "image" | "row" | "slider" | "stack" | "text" | "textInput";
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
  animationGraph?: {
    initialState: string;
    states: Array<{ clip: string; id: string }>;
  };
  animations?: Array<{ id: string; loop?: boolean; sourceClip?: string; speed?: number }>;
  format?: "depth24plus" | "rgba16f" | "rgba8";
  height?: number;
  id: string;
  particleEmitters?: Array<{ id: string; lifetimeSeconds: number; maxParticles: number; radius?: number; ratePerSecond: number; shape: "point" | "sphere" }>;
  path?: string;
  sampleCount?: number;
  type?: string;
  usage?: "color" | "depth";
  width?: number;
}

export interface IInputDocument {
  schema: typeof inputDocumentSchema;
  version?: string;
  id: string;
  actions?: IInputActionDeclaration[];
  axes?: IInputAxisDeclaration[];
  controlsSettings?: IInputControlsSettings;
  persistedBindingOverrides?: IInputPersistedBindingOverride[];
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

export interface IInputControlsSettings {
  profileId: string;
  rows: IInputControlsSettingsRow[];
}

export interface IInputControlsSettingsRow {
  actionOrAxisId: string;
  axisSlot?: "negative" | "positive" | "value";
  captureState?: "applied" | "conflict-confirmation" | "idle" | "rejected" | "reset-to-default" | "waiting-for-input";
  defaultBindings: string[];
  kind: "action" | "axis";
  uiNodeId?: string;
}

export interface IInputPersistedBindingOverride {
  actionOrAxisId: string;
  axisSlot?: "negative" | "positive" | "value";
  control: string;
  deadzone?: number;
  device: "gamepad" | "keyboard" | "pointer" | "touch";
  modifiers?: string[];
  profileId: string;
  scale?: number;
  updatedAt: string;
}

export interface ISystemsDocument {
  schema: typeof systemsDocumentSchema;
  version?: string;
  id: string;
  scriptLifecycles?: ISceneScriptLifecycle[];
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
  attributes?: Array<{ itemSize: 1 | 2 | 3 | 4; name: string; values: number[] }>;
  id: string;
  indices?: number[];
  kind: "custom" | "primitive";
  primitive?: "box" | "cone" | "custom" | "cylinder" | "plane" | "sphere" | "torus";
  size?: number[];
  storage?: "binary";
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
