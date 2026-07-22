export const sceneDocumentSchema = "threenative.scene";
export const uiDocumentSchema = "threenative.ui";
export const materialDocumentSchema = "threenative.materials";
export const assetDocumentSchema = "threenative.assets";
export const inputDocumentSchema = "threenative.input";
export const environmentDocumentSchema = "threenative.environment-scene";
export const flowDocumentSchema = "threenative.flow";
export const projectDocumentSchema = "threenative.authoring";
export const runtimeDocumentSchema = "threenative.runtime-config";
export const targetProfileDocumentSchema = "threenative.target-profile";
export const resourcesDocumentSchema = "threenative.resources";
export const schemaDocumentSchema = "threenative.schema";
export const systemsDocumentSchema = "threenative.systems";
export const sequenceDocumentSchema = "threenative.sequence";
export const prefabDocumentSchema = "threenative.prefab";
export const audioDocumentSchema = "threenative.audio";
export const meshDocumentSchema = "threenative.meshes";
export const generatorDocumentSchema = "threenative.generator-provenance";
export const blenderRecipeSchema = "threenative.blender-recipe";
export const img2ThreejsRecipeSchema = "threenative.img2threejs-generator";
export const img2ThreejsValidationSchema = "threenative.img2threejs-validation";

export const img2ThreejsProviderManifest = {
  id: "img2threejs",
  internalForkTree: "3f410de76c9a7ae53875abe7b47f99edf3beb2a6",
  internalForkUrl: "https://github.com/jonit-dev/img2threejs-internal",
  license: { name: "MIT License", spdx: "MIT", url: "https://github.com/hoainho/img2threejs/blob/e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b/LICENSE" },
  repository: "https://github.com/hoainho/img2threejs",
  reviewedCommit: "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b",
  skillVersion: "1.2.0",
} as const;

export const sceneDocumentKeys = new Set(["schema", "version", "id", "kind", "activation", "initial", "entities", "instances", "placementSets", "prefabs", "resources", "systems", "scriptLifecycles", "ui", "provenance"]);
export const uiDocumentKeys = new Set(["schema", "version", "id", "nodes", "bindings", "components", "focusOrder", "screens", "recipes", "provenance"]);
export const materialDocumentKeys = new Set(["schema", "version", "id", "materials", "provenance"]);
export const assetDocumentKeys = new Set(["schema", "version", "id", "assets", "provenance"]);
export const inputDocumentKeys = new Set(["schema", "version", "id", "actions", "axes", "controlsSettings", "persistedBindingOverrides", "provenance"]);
export const environmentDocumentKeys = new Set(["schema", "version", "id", "atmosphere", "bookmarks", "controller", "environmentMap", "exclusionZones", "instances", "lightProbes", "path", "referenceImage", "scatter", "skybox", "sourceAssets", "terrain", "walkability", "provenance"]);
export const flowDocumentKeys = new Set(["schema", "version", "id", "scene", "initial", "states", "transitions", "provenance"]);
export const projectDocumentKeys = new Set(["schema", "version", "id", "authoringVersion", "buildTargets", "sourceRoots", "provenance"]);
export const runtimeDocumentKeys = new Set(["schema", "version", "id", "renderer", "time", "window", "provenance"]);
export const targetProfileDocumentKeys = new Set(["schema", "version", "id", "budgets", "performance", "targets", "provenance"]);
export const resourcesDocumentKeys = new Set(["schema", "version", "id", "resources", "provenance"]);
export const schemaDocumentKeys = new Set(["schema", "version", "id", "kind", "schemas", "provenance"]);
export const systemsDocumentKeys = new Set(["schema", "version", "id", "countdowns", "feedbackPresets", "systems", "scriptLifecycles", "provenance"]);
export const sequenceDocumentKeys = new Set(["schema", "version", "id", "duration", "skippable", "tracks", "provenance"]);
export const prefabDocumentKeys = new Set(["schema", "version", "id", "entities", "provenance"]);
export const audioDocumentKeys = new Set(["schema", "version", "id", "sounds", "provenance"]);
export const meshDocumentKeys = new Set(["schema", "version", "id", "meshes", "provenance"]);
export const generatorDocumentKeys = new Set(["schema", "version", "id", "provider", "providerVersion", "module", "export", "recipe", "outputs", "overwritePolicy", "inputHash", "outputHash", "lastRun", "provenance", "sourceImage", "sculptSpec", "upstream", "sourceHashes", "acceptedPasses", "budgets"]);
export const blenderRecipeKeys = new Set(["schema", "version", "id", "materials", "parts", "operations", "animations", "budgets"]);
export const blenderRecipeMaterialKeys = new Set(["id", "baseColor", "metallic", "roughness", "emissive", "alphaMode", "doubleSided"]);
export const blenderRecipePartKeys = new Set(["id", "primitive", "material", "position", "rotation", "scale", "segments", "rings", "shading", "modifiers"]);
export const blenderRecipeModifierKeys = new Set(["kind", "width", "segments", "axis", "count", "offset", "target", "operation", "thickness"]);
export const blenderRecipeOperationKeys = new Set(["kind", "id", "inputs", "parent", "child"]);
export const blenderRecipeAnimationKeys = new Set(["id", "duration", "loop", "tracks"]);
export const blenderRecipeAnimationTrackKeys = new Set(["node", "property", "keyframes"]);
export const blenderRecipeAnimationKeyframeKeys = new Set(["time", "value", "interpolation"]);
export const blenderRecipeBudgetKeys = new Set(["maxParts", "maxMaterials", "maxModifiersPerPart", "maxSegments", "maxPolygons", "maxOutputBytes", "maxAnimations", "maxTracksPerAnimation", "maxKeyframesPerTrack", "maxOperations", "maxJoinInputs"]);
export const img2ThreejsRecipeKeys = new Set(["schema", "version", "id", "sourceImage", "sculptSpec", "validationReport", "factory", "upstream", "export", "budgets"]);
export const img2ThreejsFactoryKeys = new Set(["module", "export"]);
export const img2ThreejsUpstreamKeys = new Set(["repository", "commit", "skillVersion"]);
export const img2ThreejsExportKeys = new Set(["rootNode", "embedTextures", "includeRuntimeExtras"]);
export const img2ThreejsBudgetKeys = new Set(["maxOutputBytes", "maxTriangles", "maxMaterials", "maxTextures", "timeoutMs"]);
export const img2ThreejsProvenanceUpstreamKeys = new Set(["repository", "commit", "skillVersion", "internalForkTree"]);
export const img2ThreejsSourceHashKeys = new Set(["recipe", "sourceImage", "sculptSpec", "factory", "validationReport", "resources"]);
export const img2ThreejsHashedResourceKeys = new Set(["path", "sha256"]);
export const img2ThreejsAcceptedPassKeys = new Set(["id", "reviewHash", "evidence"]);
export const img2ThreejsValidationKeys = new Set(["schema", "version", "validator", "sculptSpecHash", "result"]);
export const img2ThreejsValidationValidatorKeys = new Set(["repository", "commit", "skillVersion", "command"]);
export const img2ThreejsValidationResultKeys = new Set(["ok", "errors", "warnings", "summary"]);
export const img2ThreejsValidationSummaryKeys = new Set(["targetName", "suitability", "components", "materials"]);
export const entityKeys = new Set(["archetype", "id", "prefab", "tags", "transform", "components"]);
export const instanceKeys = new Set(["id", "prefab", "tags", "transform", "components"]);
export const placementSetKeys = new Set(["id", "kind", "prefab", "pattern", "idFormat", "idValues", "defaults", "indexBindings", "overrides"]);
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
  "source",
  "writes",
]);
export const systemCountdownKeys = new Set(["autostart", "direction", "event", "field", "id", "limit", "resource"]);
export const systemQueryKeys = new Set(["changed", "limit", "offset", "orderBy", "with", "without"]);
export const flowStateKeys = new Set(["id", "actions"]);
export const flowTransitionKeys = new Set(["id", "from", "to", "trigger", "actions"]);
export const flowTriggerKeys = new Set(["kind", "event", "resource", "seconds", "target"]);
export const flowActionKeys = new Set(["kind", "event", "resource", "scene", "screen", "sequence", "spawner", "timeScale", "value"]);
export const sequenceTrackKeys = new Set(["id", "kind", "entity", "keyframes"]);
export const sequenceKeyframeKeys = new Set(["time", "value", "easing"]);
export const systemCommandKeys = new Set(["child", "component", "components", "entity", "event", "kind", "parent", "prefab", "prefix", "tag"]);
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
export const uiNodeKeys = new Set(["id", "action", "attachTo", "component", "effects", "label", "layout", "responsive", "src", "style", "text", "type", "value", "virtualRange"]);
export const uiComponentInstanceKeys = new Set(["ref", "props"]);
export const uiStyleKeys = new Set(["backgroundColor", "borderColor", "borderRadius", "borderWidth", "color", "fontSize", "fontWeight", "opacity", "textAlign", "textDecoration", "wrap"]);
export const uiBindingKeys = new Set(["fields", "format", "node", "resource"]);
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
  "inputs",
  "kind",
  "metallicRoughnessTexture",
  "metalness",
  "normalTexture",
  "occlusionTexture",
  "opacity",
  "outputs",
  "program",
  "roughness",
  "textures",
  "transmission",
  "transmissionTexture",
  "uniforms",
]);
export const assetKeys = new Set(["animationGraph", "animations", "attribution", "center", "encoding", "fallback", "format", "height", "heightRange", "id", "license", "magFilter", "minFilter", "offset", "particleEmitters", "path", "repeat", "rotation", "sampleCount", "source", "type", "usage", "width", "wrapS", "wrapT"]);
export const inputActionKeys = new Set(["id", "bindings"]);
export const inputAxisKeys = new Set(["id", "negative", "positive", "value"]);
export const inputControlsSettingsKeys = new Set(["profileId", "rows"]);
export const inputControlsSettingsRowKeys = new Set(["actionOrAxisId", "axisSlot", "captureState", "defaultBindings", "kind", "uiNodeId"]);
export const inputPersistedBindingOverrideKeys = new Set(["actionOrAxisId", "axisSlot", "control", "deadzone", "device", "modifiers", "profileId", "scale", "updatedAt"]);
export const audioSoundKeys = new Set(["id", "asset"]);
export const meshKeys = new Set(["attributes", "id", "indices", "kind", "primitive", "size", "storage"]);
export const supportedGeneratorOverwritePolicies = new Set(["manual", "replace", "skip"]);
export const supportedGeneratorProviders = new Set(["typescript", "blender", "img2threejs"]);
export const supportedBlenderRecipePrimitives = new Set(["cube", "sphere", "cylinder", "cone", "torus"]);
export const supportedBlenderRecipeModifiers = new Set(["array", "bevel", "boolean", "mirror", "solidify"]);
export const supportedBlenderRecipeOperations = new Set(["join", "parent"]);
export const supportedBlenderRecipeShading = new Set(["flat", "smooth"]);
export const supportedBlenderBooleanOperations = new Set(["difference", "intersect", "union"]);
export const supportedBlenderAnimationProperties = new Set(["position", "rotation", "scale"]);
export const supportedBlenderAnimationInterpolations = new Set(["linear", "step"]);

export const blenderRecipeLimits = {
  maxAnimations: 16,
  maxJoinInputs: 128,
  maxKeyframesPerTrack: 256,
  maxMaterials: 64,
  maxModifiersPerPart: 16,
  maxOperations: 256,
  maxOutputBytes: 64 * 1024 * 1024,
  maxParts: 128,
  maxPolygons: 500_000,
  maxSegments: 128,
  maxTracksPerAnimation: 128,
} as const;

export const img2ThreejsRecipeLimits = {
  maxMaterials: 64,
  maxOutputBytes: 32 * 1024 * 1024,
  maxTextures: 64,
  maxTriangles: 250_000,
  timeoutMs: 120_000,
} as const;

export interface IBlenderRecipe {
  schema: typeof blenderRecipeSchema;
  version: "0.1.0";
  id: string;
  materials?: unknown[];
  parts: unknown[];
  operations?: unknown[];
  animations?: unknown[];
  budgets: Record<string, unknown>;
}

export interface ITypescriptGeneratorProvenance {
  schema: typeof generatorDocumentSchema;
  version?: string;
  id: string;
  provider?: "typescript";
  module: string;
  export: string;
  outputs: string[];
  overwritePolicy?: "manual" | "replace" | "skip";
}

export interface IBlenderGeneratorProvenance {
  schema: typeof generatorDocumentSchema;
  version?: string;
  id: string;
  provider: "blender";
  providerVersion: string;
  recipe: string;
  outputs: string[];
  overwritePolicy?: "manual" | "replace" | "skip";
}

export interface IImg2ThreejsRecipe {
  schema: typeof img2ThreejsRecipeSchema;
  version: "0.1.0";
  id: string;
  sourceImage: string;
  sculptSpec: string;
  validationReport: string;
  factory: { module: string; export: string };
  upstream: { repository: string; commit: string; skillVersion: string };
  export: { rootNode: string; embedTextures: true; includeRuntimeExtras: boolean };
  budgets: {
    maxOutputBytes: number;
    maxTriangles: number;
    maxMaterials: number;
    maxTextures: number;
    timeoutMs: number;
  };
}

export interface IImg2ThreejsAcceptedPass {
  id: string;
  reviewHash: string;
  evidence: Array<{ path: string; sha256: string }>;
}

export interface IImg2ThreejsGeneratorProvenance {
  schema: typeof generatorDocumentSchema;
  version: "0.1.0";
  id: string;
  provider: "img2threejs";
  providerVersion: string;
  recipe: string;
  sourceImage: string;
  sculptSpec: string;
  module: string;
  export: string;
  upstream: {
    repository: string;
    commit: string;
    skillVersion: string;
    internalForkTree: string;
  };
  sourceHashes: {
    recipe: string;
    sourceImage: string;
    sculptSpec: string;
    factory: string;
    validationReport: string;
    resources: Array<{ path: string; sha256: string }>;
  };
  acceptedPasses: IImg2ThreejsAcceptedPass[];
  budgets: IImg2ThreejsRecipe["budgets"];
  inputHash: string;
  outputs: string[];
  overwritePolicy: "manual" | "replace" | "skip";
}

export type GeneratorProvenance = ITypescriptGeneratorProvenance | IBlenderGeneratorProvenance | IImg2ThreejsGeneratorProvenance;
export const supportedFlowTriggerKinds = new Set(["allCollected", "event", "resourceEquals", "timer"]);
export const supportedFlowActionKinds = new Set(["activateUiScreen", "emitEvent", "playSequence", "sceneChange", "setResource", "setTimeScale", "spawnerEnable"]);
export const supportedSequenceTrackKinds = new Set(["audio", "cameraPose", "event", "timeScale", "transform", "ui"]);
export const supportedSequenceEasings = new Set(["linear", "step"]);
export const supportedPrefabPrimitives = new Set(["box", "capsule", "cone", "cylinder", "plane", "sphere", "torus"]);
export const supportedMeshPrimitives = new Set(["box", "cone", "cylinder", "plane", "sphere", "torus"]);

export const cameraComponentKeys = new Set(["far", "fovY", "mode", "near", "size", "target"]);
export const characterControllerComponentKeys = new Set(["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "pushPolicy", "slopeLimit", "speed", "stepOffset"]);
export const colliderComponentKeys = new Set(["center", "friction", "height", "kind", "layer", "mask", "radius", "restitution", "sensor", "size", "slope", "trigger"]);
export const contactShadowsComponentKeys = new Set(["height", "opacity", "resolution", "size", "softness", "updateMode"]);
export const lightComponentKeys = new Set(["angle", "color", "intensity", "kind", "range", "shadowBias", "shadowNormalBias"]);
export const kinematicMoverComponentKeys = new Set(["axis", "direction", "loop", "mode", "phase", "radius", "speed", "waypoints"]);
export const meshRendererComponentKeys = new Set(["castShadow", "material", "mesh", "receiveShadow", "visible"]);
export const patrolComponentKeys = new Set(["faceHeading", "mode", "pauseAtWaypoint", "paused", "speed", "waypoints"]);
export const renderLayersComponentKeys = new Set(["layers"]);
export const rigidBodyComponentKeys = new Set(["angularVelocity", "ccd", "damping", "enabledRotations", "enabledTranslations", "gravityScale", "inverseMass", "kind", "mass", "sleepThreshold", "solverIterations", "velocity"]);
export const spawnerAreaKeys = new Set(["shape", "size"]);
export const spawnerComponentKeys = new Set(["area", "despawnPolicy", "enabled", "interval", "jitterSeed", "maxAlive", "maxTotal", "mode", "prefab", "waveSize"]);
export const spawnerDespawnPolicyKeys = new Set(["afterSeconds", "beyondDistance"]);
export const stateMachineComponentKeys = new Set(["current", "enabled", "initial", "states", "transitions"]);
export const visibilityComponentKeys = new Set(["visible"]);
export const componentRegistry = {
  camera: { keys: cameraComponentKeys },
  CharacterController: { keys: characterControllerComponentKeys },
  Collider: { keys: colliderComponentKeys },
  ContactShadows: { keys: contactShadowsComponentKeys },
  KinematicMover: { keys: kinematicMoverComponentKeys },
  Light: { keys: lightComponentKeys },
  MeshRenderer: { keys: meshRendererComponentKeys },
  Patrol: { keys: patrolComponentKeys },
  RenderLayers: { keys: renderLayersComponentKeys },
  RigidBody: { keys: rigidBodyComponentKeys },
  Spawner: { keys: spawnerComponentKeys },
  StateMachine: { keys: stateMachineComponentKeys },
  Visibility: { keys: visibilityComponentKeys },
} as const;
export const supportedComponentKinds = new Set(Object.keys(componentRegistry));
export const supportedCameraModes = new Set(["third-person-follow", "perspective", "orthographic"]);
export const supportedCharacterControllerGrounding = new Set(["none", "raycast"]);
export const supportedColliderKinds = new Set(["box", "capsule", "cylinder", "mesh", "sphere"]);
export const supportedLightKinds = new Set(["ambient", "directional", "point", "spot"]);
export const supportedKinematicMoverAxes = new Set(["x", "y", "z"]);
export const supportedKinematicMoverModes = new Set(["sine", "waypoints"]);
export const supportedSpawnerAreaShapes = new Set(["box", "circle", "point"]);
export const supportedSpawnerModes = new Set(["interval", "once", "wave"]);
export const supportedRigidBodyKinds = new Set(["dynamic", "kinematic", "static"]);
export const supportedMaterialAlphaModes = new Set(["blend", "mask", "opaque"]);
export const supportedRendererAntialiasModes = new Set(["fxaa", "msaa2", "msaa4", "msaa8", "none", "smaa", "taa"]);
export const supportedRenderLookProfiles = new Set(["balanced", "cinematic", "parity", "stylized"]);
export const supportedRenderLookReservedProfiles = new Set<string>();
export const supportedRenderLookShadowQualities = new Set(["high", "low", "medium", "off"]);
export const supportedSceneActivationPolicies = new Set(["additive", "exclusive", "loading", "overlay", "persistent"]);
export const supportedSceneLifecycleKinds = new Set(["credits", "cutscene", "level", "loading", "menu", "overlay", "system"]);
export const supportedUiNodeTypes = new Set(["bar", "button", "column", "component", "image", "row", "slider", "stack", "text", "textInput"]);
export const supportedUiTextAlignments = new Set(["center", "left", "right"]);
export const supportedUiTextDecorations = new Set(["lineThrough", "none", "underline"]);
export const supportedInputCaptureStates = new Set(["applied", "conflict-confirmation", "idle", "rejected", "reset-to-default", "waiting-for-input"]);
export const supportedInputOverrideDevices = new Set(["gamepad", "keyboard", "pointer", "touch"]);
export const supportedInputRebindKinds = new Set(["action", "axis"]);
export const supportedInputAxisSlots = new Set(["negative", "positive", "value"]);

export const logicalIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
export const ecsIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const resourceIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;
export const supportedSchemaDocumentKinds = new Set(["component", "event", "resource"]);
export const supportedSchemaFieldKinds = new Set(["boolean", "color", "enum", "json", "number", "quat", "string", "vec2", "vec3", "vec4"]);

export interface ISceneDocument {
  schema: typeof sceneDocumentSchema;
  version?: string;
  id: string;
  activation?: "additive" | "exclusive" | "loading" | "overlay" | "persistent";
  entities?: ISceneEntity[];
  instances?: IScenePrefabInstance[];
  placementSets?: IScenePlacementSet[];
  initial?: boolean;
  kind?: "credits" | "cutscene" | "level" | "loading" | "menu" | "overlay" | "system";
  prefabs?: IScenePrefab[];
  resources?: ISceneResource[];
  scriptLifecycles?: ISceneScriptLifecycle[];
  systems?: ISceneSystem[];
  ui?: ISceneUi;
}

export interface ISceneEntity {
  archetype?: ISceneEntityArchetype;
  id: string;
  prefab?: string;
  tags?: string[];
  transform?: ISceneTransform;
  components?: Record<string, unknown>;
}

export interface ISceneEntityArchetype {
  id: string;
  params?: Record<string, unknown>;
  version?: number;
}

export interface IScenePrefabInstance {
  id: string;
  prefab: string;
  tags?: string[];
  transform?: ISceneTransform;
  components?: Record<string, unknown>;
}

export type ScenePlacementPattern =
  | { kind: "grid"; origin: number[]; step: number[]; rows: number; columns: number }
  | { kind: "line"; origin: number[]; step: number[]; count: number }
  | { kind: "ring"; center: number[]; radius: number; count: number; startAngle?: number }
  | { kind: "lanes"; origin: number[]; step: number[]; laneStep: number[]; lanes: number; count: number }
  | { kind: "explicit"; positions: number[][] };

export interface IScenePlacementSet {
  id: string;
  kind: "placement-set";
  prefab: string;
  pattern: ScenePlacementPattern;
  idFormat: string;
  idValues?: string[];
  defaults?: Omit<IScenePrefabInstance, "id" | "prefab">;
  indexBindings?: Record<string, "index" | "row" | "column" | "lane" | "positionX" | "positionY" | "positionZ">;
  overrides?: Record<string, Record<string, unknown>>;
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
  kind: "component" | "event" | "resource";
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
  source?: "behavior-metadata";
  writes?: string[];
}

export interface ISystemCountdown {
  autostart?: boolean;
  direction: "down" | "up";
  event: string;
  field: string;
  id: string;
  limit: number;
  resource: string;
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
  tag?: string;
}

export interface ISceneUi {
  nodes?: ISceneUiNode[];
  bindings?: ISceneUiBinding[];
}

export interface ISceneUiNode {
  id: string;
  action?: string;
  attachTo?: Record<string, unknown>;
  component?: ISceneUiComponentInstance;
  effects?: Array<Record<string, unknown>>;
  label?: string;
  layout?: Record<string, unknown>;
  responsive?: Array<{ layout?: Record<string, unknown>; style?: ISceneUiStyle; target: "desktop" | "mobile" | "tablet" }>;
  src?: string;
  style?: ISceneUiStyle;
  text?: string;
  type?: "bar" | "button" | "column" | "component" | "image" | "row" | "slider" | "stack" | "text" | "textInput";
  value?: number;
  virtualRange?: {
    buffer?: number;
    itemCount: number;
    itemExtent: number;
    orientation?: "horizontal" | "vertical";
    viewportExtent: number;
  };
}

export interface ISceneUiComponentInstance {
  ref: string;
  props?: Record<string, unknown>;
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
  fields?: string[];
  format?: string;
  node: string;
  resource: string;
}

export interface IUiDocument {
  schema: typeof uiDocumentSchema;
  version?: string;
  id: string;
  nodes?: ISceneUiNode[];
  bindings?: ISceneUiBinding[];
  components?: unknown[];
  focusOrder?: string[];
  screens?: unknown[];
  recipes?: unknown[];
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
  inputs?: string[];
  kind?: "extended" | "shader" | "standard" | "unlit";
  metallicRoughnessTexture?: string;
  metalness?: number;
  normalTexture?: string;
  occlusionTexture?: string;
  opacity?: number;
  outputs?: string[];
  program?: unknown;
  roughness?: number;
  textures?: unknown[];
  transmission?: number;
  transmissionTexture?: string;
  uniforms?: unknown[];
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
  countdowns?: ISystemCountdown[];
  feedbackPresets?: Array<{
    audio?: { pitch?: number; pitchVariance?: number; soundId: string; volume?: number };
    camera?: { amplitude: number; duration: number; frequency: number };
    id: string;
    particles?: Array<{ asset: string; command: "burst" | "emit" | "play"; count?: number; emitter: string; lifetime?: number }>;
  }>;
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
