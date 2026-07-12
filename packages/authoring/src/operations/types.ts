import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { isGeneratedArtifactPath, normalizeRelativePath, writeAuthoringJsonDocument, type AuthoringDocumentKind, type IAuthoringDocument } from "../documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "../diagnostics.js";
import { validateMaterialDocument } from "./materialValidation.js";
import { buildUiSourceRecipe, mergeById } from "./uiRecipes.js";
import { generatedPathDiagnostic, typeDiagnostic, validateGeneratedPathString } from "./validationHelpers.js";
import { loadAuthoringProject, type IAuthoringProject } from "../project.js";
import {
  cameraComponentKeys,
  characterControllerComponentKeys,
  colliderComponentKeys,
  ecsIdPattern,
  entityKeys,
  assetDocumentKeys,
  assetDocumentSchema,
  assetKeys,
  audioDocumentKeys,
  audioDocumentSchema,
  audioSoundKeys,
  environmentDocumentKeys,
  environmentDocumentSchema,
  flowActionKeys,
  flowDocumentKeys,
  flowDocumentSchema,
  flowStateKeys,
  flowTransitionKeys,
  flowTriggerKeys,
  generatorDocumentKeys,
  generatorDocumentSchema,
  inputAxisKeys,
  inputActionKeys,
  inputControlsSettingsKeys,
  inputControlsSettingsRowKeys,
  inputDocumentKeys,
  inputDocumentSchema,
  inputPersistedBindingOverrideKeys,
  instanceKeys,
  kinematicMoverComponentKeys,
  lightComponentKeys,
  logicalIdPattern,
  materialDocumentSchema,
  meshDocumentKeys,
  meshDocumentSchema,
  meshRendererComponentKeys,
  meshKeys,
  prefabDocumentKeys,
  prefabDocumentSchema,
  prefabKeys,
  projectDocumentKeys,
  projectDocumentSchema,
  resourceIdPattern,
  resourcesDocumentKeys,
  resourcesDocumentSchema,
  renderLayersComponentKeys,
  rigidBodyComponentKeys,
  spawnerAreaKeys,
  spawnerComponentKeys,
  spawnerDespawnPolicyKeys,
  readArray,
  readString,
  resourceKeys,
  runtimeDocumentKeys,
  runtimeDocumentSchema,
  schemaDocumentKeys,
  schemaDocumentSchema,
  schemaEntryKeys,
  sceneDocumentKeys,
  sceneDocumentSchema,
  sequenceDocumentKeys,
  sequenceDocumentSchema,
  sequenceKeyframeKeys,
  sequenceTrackKeys,
  scriptReferenceKeys,
  scriptLifecycleKeys,
  systemsDocumentKeys,
  systemsDocumentSchema,
  targetProfileDocumentKeys,
  targetProfileDocumentSchema,
  supportedPrefabPrimitives,
  supportedMeshPrimitives,
  supportedCameraModes,
  supportedCharacterControllerGrounding,
  supportedColliderKinds,
  supportedComponentKinds,
  supportedGeneratorOverwritePolicies,
  supportedFlowActionKinds,
  supportedFlowTriggerKinds,
  supportedInputAxisSlots,
  supportedInputCaptureStates,
  supportedInputOverrideDevices,
  supportedInputRebindKinds,
  supportedKinematicMoverAxes,
  supportedKinematicMoverModes,
  supportedSpawnerAreaShapes,
  supportedSpawnerModes,
  supportedLightKinds,
  supportedRendererAntialiasModes,
  supportedRenderLookProfiles,
  supportedRenderLookReservedProfiles,
  supportedRenderLookShadowQualities,
  uiDocumentKeys,
  supportedRigidBodyKinds,
  supportedSceneActivationPolicies,
  supportedSceneLifecycleKinds,
  supportedSchemaDocumentKinds,
  supportedSchemaFieldKinds,
  supportedSequenceEasings,
  supportedSequenceTrackKinds,
  supportedUiNodeTypes,
  supportedUiTextAlignments,
  supportedUiTextDecorations,
  uiDocumentSchema,
  visibilityComponentKeys,
  systemCommandKeys,
  systemKeys,
  systemQueryKeys,
  transformKeys,
  uiBindingKeys,
  uiComponentInstanceKeys,
  uiKeys,
  uiNodeKeys,
  uiStyleKeys,
  type IScriptReference,
  type ISceneDocument,
  isRecord,
} from "../schemas.js";

export interface IAuthoringOperationResult {
  ok: boolean;
  changed: boolean;
  diagnostics: IAuthoringDiagnostic[];
  projectPath: string;
  filesWritten: string[];
}

export interface IAuthoringOperationContext {
  projectPath: string;
}

export interface IValidateSceneOptions extends IAuthoringOperationContext {
  sceneId?: string;
}

export interface IValidateAuthoringProjectOptions extends IAuthoringOperationContext {}

export interface ICreateSceneOptions extends IAuthoringOperationContext {
  sceneId: string;
  file?: string;
}

export interface IImportWorldOptions extends IAuthoringOperationContext {
  sceneId: string;
  worldFile: string;
  file?: string;
  replace?: boolean;
}

export interface IAddEntityOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  prefabId?: string;
}

export interface IAddPrefabInstanceOptions extends IAuthoringOperationContext {
  sceneId: string;
  instanceId: string;
  prefabId: string;
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
  components?: Record<string, unknown>;
  replace?: boolean;
}

export interface IAddPrefabInstancesOptions extends IAuthoringOperationContext {
  components?: Record<string, unknown>;
  positions: Array<[number, number, number]>;
  prefix?: string;
  prefabId: string;
  sceneId: string;
}

export interface IAddTenPinLayoutOptions extends IAuthoringOperationContext {
  sceneId: string;
  prefabId: string;
  prefix?: string;
  origin?: [number, number, number];
  spacing?: number;
  replace?: boolean;
}

export interface IAddTagOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  tag: string;
}

export interface IAddGroupOptions extends IAuthoringOperationContext {
  sceneId: string;
  groupId: string;
  name?: string;
  position?: [number, number, number];
}

export interface IAddPrefabOptions extends IAuthoringOperationContext {
  sceneId: string;
  prefabId: string;
  primitive?: string;
  color?: string;
  asset?: string;
}

export interface ISetPrefabColorOptions extends IAuthoringOperationContext {
  sceneId: string;
  prefabId: string;
  color: string;
}

export interface ISetPrefabOptions extends IAuthoringOperationContext {
  sceneId: string;
  prefabId: string;
  asset?: string;
  color?: string;
  primitive?: string;
}

export interface IAddResourceOptions extends IAuthoringOperationContext {
  sceneId: string;
  resourceId: string;
  path?: string;
  value?: unknown;
}

export interface ISetResourceOptions extends IAuthoringOperationContext {
  sceneId: string;
  resourceId: string;
  path?: string;
  value?: unknown;
}

export interface ICreateResourcesDocumentOptions extends IAuthoringOperationContext {
  resourcesDocId: string;
}

export interface IAddResourceDocumentEntryOptions extends IAuthoringOperationContext {
  resourcesDocId: string;
  resourceId: string;
  path?: string;
  value?: unknown;
}

export interface ISetResourceDocumentEntryOptions extends IAuthoringOperationContext {
  resourcesDocId: string;
  resourceId: string;
  path?: string;
  value?: unknown;
}

export interface ICreateFlowDocumentOptions extends IAuthoringOperationContext {
  flowId: string;
  initial: string;
  scene?: string;
}

export interface IAddFlowStateOptions extends IAuthoringOperationContext {
  flowId: string;
  stateId: string;
  actions?: Record<string, unknown>[];
}

export interface IAddFlowTransitionOptions extends IAuthoringOperationContext {
  actions?: Record<string, unknown>[];
  flowId: string;
  from: string;
  to: string;
  transitionId: string;
  trigger: Record<string, unknown>;
}

export interface ICreateSequenceDocumentOptions extends IAuthoringOperationContext {
  duration: number;
  sequenceId: string;
  skippable?: boolean;
}

export interface IAddSequenceTrackOptions extends IAuthoringOperationContext {
  entity?: string;
  kind: string;
  sequenceId: string;
  trackId: string;
}

export interface IAddSequenceKeyOptions extends IAuthoringOperationContext {
  easing?: string;
  sequenceId: string;
  time: number;
  trackId: string;
  value?: unknown;
}

export interface ICreateSchemaDocumentOptions extends IAuthoringOperationContext {
  schemaDocId: string;
  kind: string;
}

export interface ISetSchemaEntryOptions extends IAuthoringOperationContext {
  schemaDocId: string;
  schemaId: string;
  kind: string;
  fields: Record<string, unknown>;
}

export interface ISetComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  componentKind: string;
  value: Record<string, unknown>;
}

export interface ISetSceneLifecycleOptions extends IAuthoringOperationContext {
  sceneId: string;
  kind?: string;
  activation?: string;
  initial?: boolean;
}

export interface ISetCameraComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  far?: number;
  fovY?: number;
  mode?: string;
  near?: number;
  size?: number;
  targetId?: string;
}

export interface ISetLightComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  kind?: string;
  intensity?: number;
  color?: string;
  range?: number;
  angle?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
}

export interface ISetMeshRendererComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  mesh: string;
  material: string;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface ISetRenderLayersComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  layers: readonly string[];
}

export interface ISetRigidBodyComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  kind?: string;
  mass?: number;
  damping?: number;
  gravityScale?: number;
}

export interface ISetSpawnerComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  prefab: string;
  mode?: string;
  enabled?: boolean;
  interval?: number;
  waveSize?: number;
  maxAlive?: number;
  maxTotal?: number;
  jitterSeed?: number;
  area?: Record<string, unknown>;
  despawnPolicy?: Record<string, unknown>;
}

export interface ISetColliderComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  kind?: string;
  size?: [number, number, number];
  center?: [number, number, number];
  radius?: number;
  height?: number;
  trigger?: boolean;
}

export interface ISetCharacterControllerComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  moveXAxis?: string;
  moveZAxis?: string;
  speed?: number;
  blocking?: boolean;
  grounding?: string;
  slopeLimit?: number;
  stepOffset?: number;
}

export interface ISetVisibilityComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  visible?: boolean;
}

export interface IRemoveComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  componentKind: string;
}

export interface IRemoveEntityOptions extends IAuthoringOperationContext {
  entityId: string;
  sceneId: string;
}

export interface IRemoveUiNodeOptions extends IAuthoringOperationContext {
  sceneId: string;
  uiNodeId: string;
}

export interface IRemoveResourceOptions extends IAuthoringOperationContext {
  resourceId: string;
  sceneId: string;
}

export interface IAddUiNodeOptions extends IAuthoringOperationContext {
  sceneId: string;
  uiNodeId: string;
}

export interface ISetTransformOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface ISetCameraOptions extends IAuthoringOperationContext {
  sceneId: string;
  cameraId: string;
  far?: number;
  fovY?: number;
  mode: string;
  near?: number;
  size?: number;
  targetId: string;
}

export interface IAttachScriptOptions extends IAuthoringOperationContext {
  sceneId: string;
  systemId: string;
  modulePath: string;
  exportName: string;
}

export interface IBindUiOptions extends IAuthoringOperationContext {
  sceneId: string;
  uiNodeId: string;
  resourcePath: string;
}

export interface ICreateUiDocumentOptions extends IAuthoringOperationContext {
  uiDocId: string;
}

export interface IAddUiTextOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  text: string;
}

export interface IAddUiNodeDocumentOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  type: string;
  action?: string;
  label?: string;
  src?: string;
  text?: string;
  value?: number;
}

export interface IAddUiComponentInstanceOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  componentId: string;
  props?: Record<string, unknown>;
}

export type UiSourceRecipeKind =
  | "dialog-box"
  | "enemy-health-bar"
  | "hud-status-cluster"
  | "interact-prompt"
  | "inventory-grid"
  | "item-detail-panel"
  | "loading-overlay"
  | "nameplate"
  | "notification-toast"
  | "off-screen-indicator"
  | "pause-menu"
  | "pickup-label"
  | "quest-marker"
  | "settings-list";

export interface IApplyUiRecipeOptions extends IAuthoringOperationContext {
  uiDocId: string;
  recipe: UiSourceRecipeKind | string;
  recipeId?: string;
  actions?: Record<string, string>;
  bindings?: Record<string, string>;
  props?: Record<string, unknown>;
}

export interface IRemoveUiComponentInstanceOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
}

export interface ISetUiLayoutOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  align?: string;
  height?: number;
  justify?: string;
  top?: number;
  width?: number;
}

export interface ISetUiStyleOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: string;
  opacity?: number;
  textAlign?: string;
  textDecoration?: string;
  wrap?: boolean;
}

export interface IBindUiDocumentOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  resourcePath: string;
}

export interface ICreateEnvironmentDocumentOptions extends IAuthoringOperationContext {
  environmentId: string;
}

export interface ISetEnvironmentSkyboxOptions extends IAuthoringOperationContext {
  environmentId: string;
  asset: string;
  mode?: string;
}

export interface ISetEnvironmentMapOptions extends IAuthoringOperationContext {
  environmentId: string;
  asset: string;
}

export interface ISetEnvironmentVolumetricsOptions extends IAuthoringOperationContext {
  environmentId: string;
  volumetrics: Record<string, unknown>;
}

export interface ISetEnvironmentTerrainOptions extends IAuthoringOperationContext {
  bounds?: Record<string, unknown>;
  environmentId: string;
  terrainId?: string;
  heightMode?: string;
  heightmap?: string;
}

export interface ISetEnvironmentPathOptions extends IAuthoringOperationContext {
  environmentId: string;
  path: unknown;
}

export interface ISetEnvironmentWalkabilityOptions extends IAuthoringOperationContext {
  environmentId: string;
  walkability: unknown;
}

export interface ISetEnvironmentLightProbeOptions extends IAuthoringOperationContext {
  environmentId: string;
  probe: Record<string, unknown>;
  probeId: string;
}

export interface IAddEnvironmentScatterLayerOptions extends IAuthoringOperationContext {
  environmentId: string;
  scatter: unknown;
}

export interface ISetEnvironmentSourceAssetLodOptions extends IAuthoringOperationContext {
  environmentId: string;
  sourceAssetId: string;
  lod: unknown;
}

export interface ICreateRuntimeConfigOptions extends IAuthoringOperationContext {
  runtimeId: string;
  renderProfile?: string;
}

export interface ISetRuntimeWindowOptions extends IAuthoringOperationContext {
  runtimeId: string;
  width?: number;
  height?: number;
  title?: string;
}

export interface ISetRuntimeRenderingOptions extends IAuthoringOperationContext {
  runtimeId: string;
  ambientOcclusionEnabled?: boolean;
  ambientOcclusionIntensity?: number;
  ambientOcclusionMode?: string;
  ambientOcclusionQuality?: string;
  ambientOcclusionRadius?: number;
  antialias?: string;
  bloomEnabled?: boolean;
  bloomIntensity?: number;
  bloomThreshold?: number;
  motionBlurEnabled?: boolean;
  motionBlurShutterAngle?: number;
  renderProfile?: string;
  renderLookBloomIntensity?: number;
  renderLookContrast?: number;
  renderLookEnvironmentIntensity?: number;
  renderLookExposure?: number;
  renderLookSaturation?: number;
  renderLookShadowQuality?: string;
  renderPath?: string;
  screenSpaceGlobalIlluminationEnabled?: boolean;
  screenSpaceGlobalIlluminationIntensity?: number;
  screenSpaceGlobalIlluminationQuality?: string;
  screenSpaceGlobalIlluminationRadius?: number;
  screenSpaceReflectionsEnabled?: boolean;
  screenSpaceReflectionsQuality?: string;
  screenSpaceReflectionsRoughnessLimit?: number;
}

export interface ISetTargetProfileOptions extends IAuthoringOperationContext {
  targetProfileId: string;
  targets: readonly string[];
  budgets?: Record<string, unknown>;
  performance?: Record<string, unknown>;
}

export interface IRecordGeneratorProvenanceOptions extends IAuthoringOperationContext {
  generatorId: string;
  modulePath: string;
  exportName: string;
  outputs: readonly string[];
  overwritePolicy?: string;
  inputHash?: string;
  outputHash?: string;
}

export interface ICreateMaterialOptions extends IAuthoringOperationContext {
  materialId: string;
}

export interface ISetMaterialOptions extends IAuthoringOperationContext {
  materialId: string;
  alphaCutoff?: number;
  alphaMode?: string;
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
  shader?: Record<string, unknown>;
  transmission?: number;
  transmissionTexture?: string;
}

export interface ICreateMeshPrimitiveOptions extends IAuthoringOperationContext {
  file?: string;
  meshId: string;
  kind: string;
  size?: number[];
}

export interface ICreateMeshCustomOptions extends IAuthoringOperationContext {
  meshId: string;
  attributes: Array<{ itemSize: number; name: string; values: number[] }>;
  indices?: number[];
  storage?: string;
}

export interface ICreatePrefabDocumentOptions extends IAuthoringOperationContext {
  prefabId: string;
}

export interface ICreateProjectMetadataOptions extends IAuthoringOperationContext {
  projectId: string;
  authoringVersion?: string;
  buildTargets?: readonly string[];
  file?: string;
  sourceRoots?: readonly string[];
}

export interface IAddPrefabComponentOptions extends IAuthoringOperationContext {
  prefabId: string;
  componentKind: string;
  value: Record<string, unknown>;
}

export interface ISetPrefabMaterialOptions extends IAuthoringOperationContext {
  prefabId: string;
  materialId: string;
}

export interface IAddInputActionOptions extends IAuthoringOperationContext {
  inputDocId: string;
  actionId: string;
  keys: readonly string[];
}

export interface IAddInputAxisOptions extends IAuthoringOperationContext {
  inputDocId: string;
  axisId: string;
  negativeKeys: readonly string[];
  positiveKeys: readonly string[];
  value?: string;
}

export interface ISetInputControlsOptions extends IAuthoringOperationContext {
  inputDocId: string;
  profileId: string;
  rows: Record<string, unknown>[];
}

export interface ISetInputBindingOverrideOptions extends IAuthoringOperationContext {
  inputDocId: string;
  actionOrAxisId: string;
  axisSlot?: string;
  control: string;
  deadzone?: number;
  device: string;
  modifiers?: readonly string[];
  profileId: string;
  scale?: number;
  updatedAt?: string;
}

export interface IAddAssetOptions extends IAuthoringOperationContext {
  assetId: string;
  attribution?: string;
  file?: string;
  format?: string;
  height?: number;
  license?: string;
  path?: string;
  source?: string;
  sampleCount?: number;
  type: string;
  usage?: string;
  width?: number;
}

export interface IAddAnimationClipOptions extends IAuthoringOperationContext {
  assetId: string;
  clipId: string;
  loop?: boolean;
  sourceClip?: string;
  speed?: number;
}

export interface IAddAnimationGraphStateOptions extends IAuthoringOperationContext {
  assetId: string;
  clipId: string;
  initial?: boolean;
  stateId: string;
}

export interface IAddParticleEmitterOptions extends IAuthoringOperationContext {
  assetId: string;
  emitterId: string;
  lifetimeSeconds: number;
  maxParticles: number;
  radius?: number;
  ratePerSecond: number;
  shape?: string;
}

export interface ICreateAudioDocumentOptions extends IAuthoringOperationContext {
  audioDocId: string;
}

export interface IAddAudioSoundOptions extends IAuthoringOperationContext {
  audioDocId: string;
  soundId: string;
  asset: string;
}

export interface ICreateSystemOptions extends IAuthoringOperationContext {
  systemId: string;
  schedule: string;
}

export interface IAttachSystemScriptOptions extends IAuthoringOperationContext {
  file?: string;
  systemId: string;
  modulePath: string;
  exportName: string;
}

export interface ISetSystemMetadataOptions extends IAuthoringOperationContext {
  after?: readonly string[];
  before?: readonly string[];
  commands?: readonly Record<string, unknown>[];
  eventReads?: readonly string[];
  eventWrites?: readonly string[];
  file?: string;
  queries?: readonly Record<string, unknown>[];
  reads?: readonly string[];
  resourceReads?: readonly string[];
  resourceWrites?: readonly string[];
  schedule?: string;
  services?: readonly string[];
  systemId: string;
  writes?: readonly string[];
}

export interface ISceneInspection {
  id: string;
  file: string;
  entities: string[];
  expandedEntityCount: number;
  instances: string[];
  prefabs: string[];
  repeatedBlocks: Array<{ componentKinds: string[]; count: number; entityIds: string[] }>;
  resources: string[];
  sourceLineCount: number;
  suggestedRefactors: Array<{ kind: string; message: string }>;
  systems: string[];
  uiNodes: string[];
}

export interface ISceneNodeInspection {
  id: string;
  matches: Array<{ kind: "entity" | "instance" | "prefab" | "resource" | "system" | "ui-binding" | "ui-node"; path: string; value: unknown }>;
  summary?: {
    far?: number;
    fovY?: number;
    mode: string;
    near?: number;
    position?: unknown;
    rotation?: unknown;
    size?: number;
  };
}

export interface ICreateSceneResult extends IAuthoringOperationResult {
  sceneId: string;
  file: string;
  nextCommands: string[];
}

export interface IImportWorldResult extends IAuthoringOperationResult {
  sceneId: string;
  file: string;
  entityCount: number;
  resourceCount: number;
}

export interface IInspectSceneResult extends IAuthoringOperationResult {
  node?: ISceneNodeInspection;
  scene?: ISceneInspection;
}
