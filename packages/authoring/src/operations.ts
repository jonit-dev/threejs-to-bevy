import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { isGeneratedArtifactPath, normalizeRelativePath, writeAuthoringJsonDocument, type AuthoringDocumentKind, type IAuthoringDocument } from "./documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { validateMaterialDocument } from "./operations/materialValidation.js";
import { buildUiSourceRecipe, mergeById } from "./operations/uiRecipes.js";
import { generatedPathDiagnostic, typeDiagnostic, validateGeneratedPathString } from "./operations/validationHelpers.js";
import { loadAuthoringProject, type IAuthoringProject } from "./project.js";
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
  supportedInputAxisSlots,
  supportedInputCaptureStates,
  supportedInputOverrideDevices,
  supportedInputRebindKinds,
  supportedKinematicMoverAxes,
  supportedKinematicMoverModes,
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
} from "./schemas.js";

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

export function authoringOperationResult(input: {
  projectPath: string;
  changed?: boolean;
  diagnostics?: readonly IAuthoringDiagnostic[];
  filesWritten?: readonly string[];
}): IAuthoringOperationResult {
  const diagnostics = sortAuthoringDiagnostics(input.diagnostics ?? []);
  return {
    ok: !hasAuthoringErrors(diagnostics),
    changed: input.changed ?? false,
    diagnostics,
    projectPath: input.projectPath,
    filesWritten: [...(input.filesWritten ?? [])].sort(),
  };
}

export async function loadProjectForOperation(context: IAuthoringOperationContext): Promise<IAuthoringProject> {
  return loadAuthoringProject({ projectPath: context.projectPath });
}

export async function writeChangedProjectDocuments(project: IAuthoringProject): Promise<string[]> {
  const filesWritten: string[] = [];
  for (const document of project.documents) {
    await writeAuthoringJsonDocument(document);
    filesWritten.push(document.projectRelativePath);
  }
  return filesWritten.sort();
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

export interface ISetEnvironmentTerrainOptions extends IAuthoringOperationContext {
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
  antialias?: string;
  bloomEnabled?: boolean;
  bloomIntensity?: number;
  bloomThreshold?: number;
  renderProfile?: string;
  renderLookBloomIntensity?: number;
  renderLookContrast?: number;
  renderLookEnvironmentIntensity?: number;
  renderLookExposure?: number;
  renderLookSaturation?: number;
  renderLookShadowQuality?: string;
  renderPath?: string;
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
  file?: string;
  format?: string;
  height?: number;
  path?: string;
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

export async function createScene(options: ICreateSceneOptions): Promise<ICreateSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.sceneId, "scene");

  const requestedFile = options.file ?? `content/scenes/${options.sceneId}.scene.json`;
  const absoluteFile = resolve(projectPath, requestedFile);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));

  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Scene source documents must be created inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/scenes/ such as content/scenes/main.scene.json.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
        file: projectRelativePath,
        message: "Generated bundle artifacts cannot be used as authoring source documents.",
        suggestion: "Create scene source documents under content/scenes/ instead.",
      }),
    );
  } else if (!projectRelativePath.endsWith(".scene.json")) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Scene source documents must use the .scene.json extension.",
        value: projectRelativePath,
        suggestion: "Use a path such as content/scenes/main.scene.json.",
      }),
    );
  }

  const duplicateScene = project.documents.find((document) => document.kind === "scene" && readSceneId(document.data) === options.sceneId);
  if (duplicateScene !== undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DUPLICATE_SCENE_ID",
        file: duplicateScene.projectRelativePath,
        message: `Scene id '${options.sceneId}' already exists.`,
        path: "/id",
        value: options.sceneId,
        suggestion: "Use a new scene id or mutate the existing scene document.",
      }),
    );
  }

  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Scene source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different --file path or mutate the existing scene document.",
      }),
    );
  } catch {
    // Missing is the only successful create path; other write errors surface when writing.
  }

  const scene: ISceneDocument = {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: options.sceneId,
    entities: [],
    prefabs: [],
    resources: [],
    systems: [],
    ui: { nodes: [], bindings: [] },
  };

  if (!hasAuthoringErrors(diagnostics)) {
    diagnostics.push(...(await validateSceneDocument(projectPath, projectRelativePath, scene)));
  }

  if (hasAuthoringErrors(diagnostics)) {
    return {
      ...authoringOperationResult({ diagnostics, projectPath }),
      file: projectRelativePath,
      nextCommands: nextSceneCommands(options.sceneId),
      sceneId: options.sceneId,
    };
  }

  const document: IAuthoringDocument = {
    data: scene,
    file: absoluteFile,
    kind: "scene",
    projectRelativePath,
  };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);

  return {
    ...authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath }),
    file: projectRelativePath,
    nextCommands: nextSceneCommands(options.sceneId),
    sceneId: options.sceneId,
  };
}

export async function importWorld(options: IImportWorldOptions): Promise<IImportWorldResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.sceneId, "scene");

  const requestedFile = options.file ?? `content/scenes/${options.sceneId}.scene.json`;
  const absoluteFile = resolve(projectPath, requestedFile);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));
  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Imported scene source documents must be written inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/scenes/ such as content/scenes/imported.scene.json.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(generatedPathDiagnostic(projectRelativePath, "", projectRelativePath));
  } else if (!projectRelativePath.endsWith(".scene.json")) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Imported scene source documents must use the .scene.json extension.",
        value: projectRelativePath,
        suggestion: "Use a path such as content/scenes/imported.scene.json.",
      }),
    );
  }

  if (!options.replace) {
    try {
      await access(absoluteFile);
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
          file: projectRelativePath,
          message: `Scene source document '${projectRelativePath}' already exists.`,
          suggestion: "Pass --replace or use a different --file path.",
        }),
      );
    } catch {
      // Missing is OK.
    }
  }

  const worldPath = resolve(projectPath, options.worldFile);
  let world: unknown;
  try {
    world = JSON.parse(await readFile(worldPath, "utf8"));
  } catch (error) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_WORLD_IMPORT_FAILED",
        file: options.worldFile,
        message: `Could not read world IR JSON: ${error instanceof Error ? error.message : String(error)}`,
        value: options.worldFile,
      }),
    );
  }

  const scene = world === undefined ? emptyScene(options.sceneId) : sceneFromWorld(options.sceneId, world);
  diagnostics.push(...(await validateSceneDocument(projectPath, projectRelativePath, scene)));
  if (hasAuthoringErrors(diagnostics)) {
    return {
      ...authoringOperationResult({ diagnostics, projectPath }),
      entityCount: scene.entities?.length ?? 0,
      file: projectRelativePath,
      resourceCount: scene.resources?.length ?? 0,
      sceneId: options.sceneId,
    };
  }

  const document: IAuthoringDocument = {
    data: scene,
    file: absoluteFile,
    kind: "scene",
    projectRelativePath,
  };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);

  return {
    ...authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath }),
    entityCount: scene.entities?.length ?? 0,
    file: projectRelativePath,
    resourceCount: scene.resources?.length ?? 0,
    sceneId: options.sceneId,
  };
}

export async function validateScene(options: IValidateSceneOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const selectedScenes = options.sceneId === undefined ? sceneDocuments : sceneDocuments.filter((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);

  if (options.sceneId !== undefined && selectedScenes.length === 0) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
  }

  for (const document of selectedScenes) {
    diagnostics.push(...(await validateSceneDocument(project.projectPath, document.projectRelativePath, document.data, { materialIds, prefabDocumentIds })));
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

export async function validateAuthoringProject(options: IValidateAuthoringProjectOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const context = validationContextForProject(project);

  for (const document of project.documents) {
    diagnostics.push(
      ...(await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, document.data, context)),
    );
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

function emptyScene(sceneId: string): ISceneDocument {
  return {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: sceneId,
    entities: [],
    prefabs: [],
    resources: [],
    systems: [],
    ui: { nodes: [], bindings: [] },
  };
}

function sceneFromWorld(sceneId: string, world: unknown): ISceneDocument {
  const worldRecord = isRecord(world) ? world : {};
  const worldEntities = readArray(worldRecord.entities) ?? [];
  const entities = worldEntities
    .filter(isRecord)
    .map((entity) => ({
      id: readString(entity.id) ?? "invalid-entity-id",
      ...(isRecord(entity.components) ? { components: cloneJson(entity.components) as Record<string, unknown> } : {}),
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const resourcesRecord = isRecord(worldRecord.resources) ? worldRecord.resources : {};
  const resources = Object.entries(resourcesRecord)
    .map(([id, value]) => ({ id, value: cloneJson(value) }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: sceneId,
    entities,
    prefabs: [],
    resources,
    systems: [],
    ui: { nodes: [], bindings: [] },
  };
}

function nextSceneCommands(sceneId: string): string[] {
  return [
    `tn scene add-entity ${sceneId} <entity-id> --json`,
    `tn scene set-transform ${sceneId} <entity-id> --position x,y,z --json`,
    `tn scene attach-script ${sceneId} <system-id> --module src/scripts/<system>.ts --export <exportName> --json`,
    `tn scene validate ${sceneId} --json`,
    "tn build --json",
    "tn verify --json",
  ];
}

export async function inspectScene(options: IValidateSceneOptions & { nodeId?: string; sceneId: string }): Promise<IInspectSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);

  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
    return {
      ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    };
  }

  diagnostics.push(...(await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data, { materialIds, prefabDocumentIds })));
  const scene = inspectSceneDocument(sceneDocument.projectRelativePath, sceneDocument.data, await countSourceLines(sceneDocument.file));
  const node = options.nodeId === undefined ? undefined : inspectSceneNode(sceneDocument.data, options.nodeId);
  if (options.nodeId !== undefined && (node === undefined || node.matches.length === 0)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_NODE_MISSING",
        file: sceneDocument.projectRelativePath,
        message: `No entity, prefab, resource, system, UI node, or UI binding with id '${options.nodeId}' was found in scene '${options.sceneId}'.`,
        value: options.nodeId,
        suggestion: "Run tn scene inspect <scene-id> --json to list available ids, then retry with --node <id>.",
      }),
    );
  }

  return {
    ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    ...(node === undefined ? { scene } : { node }),
  };
}

export async function addEntity(options: IAddEntityOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const entities = ensureArrayProperty(scene, "entities");
    entities.push({
      id: options.entityId,
      ...(options.prefabId === undefined ? {} : { prefab: options.prefabId }),
    });
  });
}

export async function addPrefabInstance(options: IAddPrefabInstanceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const instances = ensureArrayProperty(scene, "instances");
    const existing = findSceneItem(instances, options.instanceId);
    if (existing !== undefined && options.replace !== true) {
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_INSTANCE_EXISTS",
          file,
          message: `Compact instance '${options.instanceId}' already exists.`,
          path: `/instances/${instances.indexOf(existing)}/id`,
          value: options.instanceId,
          suggestion: "Pass --replace to update this compact instance intentionally.",
        }),
      ];
    }
    const instance = compactInstanceRecord(options.instanceId, options.prefabId, options.transform, options.components);
    if (existing === undefined) {
      instances.push(instance);
    } else {
      instances[instances.indexOf(existing)] = instance;
    }
    return [];
  });
}

export async function addTenPinLayout(options: IAddTenPinLayoutOptions): Promise<IAuthoringOperationResult> {
  const prefix = options.prefix ?? "pin";
  const origin = options.origin ?? [0, 0.6, 0];
  const spacing = options.spacing ?? 0.52;
  const layout = tenPinLayout(prefix, origin, spacing);
  return mutateScene(options, (scene, file) => {
    const instances = ensureArrayProperty(scene, "instances");
    const ids = new Set(layout.map((pin) => pin.id));
    const existing = instances.filter((instance) => typeof instance.id === "string" && ids.has(instance.id));
    if (existing.length > 0 && options.replace !== true) {
      const first = existing[0]!;
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_LAYOUT_EXISTS",
          file,
          message: `Compact ten-pin layout '${prefix}' would replace ${existing.length} existing instance id${existing.length === 1 ? "" : "s"}.`,
          path: `/instances/${instances.indexOf(first)}/id`,
          value: first.id,
          suggestion: "Pass --replace to regenerate this layout intentionally, or choose a different --prefix.",
        }),
      ];
    }
    if (options.replace === true) {
      for (let index = instances.length - 1; index >= 0; index -= 1) {
        const id = instances[index]?.id;
        if (typeof id === "string" && ids.has(id)) {
          instances.splice(index, 1);
        }
      }
    }
    for (const pin of layout) {
      instances.push(compactInstanceRecord(pin.id, options.prefabId, {
        position: pin.position,
      }, undefined));
    }
    return [];
  });
}

export async function addTag(options: IAddTagOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const diagnostics: IAuthoringDiagnostic[] = [];
    validateEcsId(diagnostics, file, "/tag", options.tag, "tag component");
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.tag]: {},
    };
    return [];
  });
}

export async function addGroup(options: IAddGroupOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const diagnostics: IAuthoringDiagnostic[] = [];
    validateEcsId(diagnostics, file, "/groupId", options.groupId, "group");
    if (options.name !== undefined && readString(options.name) === undefined) {
      diagnostics.push(typeDiagnostic(file, "/name", "group name must be a non-empty string.", options.name));
    }
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    const entities = ensureArrayProperty(scene, "entities");
    entities.push({
      id: options.groupId,
      ...(options.position === undefined ? {} : { transform: { position: options.position } }),
      components: {
        SceneContainer: {
          kind: "group",
          ...(options.name === undefined ? {} : { name: options.name }),
        },
      },
    });
    return [];
  });
}

export async function addPrefab(options: IAddPrefabOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const prefabs = ensureArrayProperty(scene, "prefabs");
    prefabs.push({
      id: options.prefabId,
      ...(options.primitive === undefined ? {} : { primitive: options.primitive }),
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.asset === undefined ? {} : { asset: options.asset }),
    });
  });
}

export async function setPrefabColor(options: ISetPrefabColorOptions): Promise<IAuthoringOperationResult> {
  return setPrefab({ color: options.color, prefabId: options.prefabId, projectPath: options.projectPath, sceneId: options.sceneId });
}

export async function setPrefab(options: ISetPrefabOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const prefab = findSceneItem(scene.prefabs, options.prefabId);
    if (prefab === undefined) {
      return [missingReferenceDiagnostic(file, "/prefabs", "prefab", options.prefabId, idsFromArray(scene.prefabs))];
    }
    if (options.asset !== undefined) {
      prefab.asset = options.asset;
    }
    if (options.color !== undefined) {
      prefab.color = options.color;
    }
    if (options.primitive !== undefined) {
      prefab.primitive = options.primitive;
    }
    return [];
  });
}

export async function addResource(options: IAddResourceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const resources = ensureArrayProperty(scene, "resources");
    resources.push({
      id: options.resourceId,
      ...(options.path === undefined ? {} : { path: options.path }),
      ...(options.value === undefined ? {} : { value: options.value }),
    });
  });
}

export async function setResource(options: ISetResourceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const resource = findSceneItem(scene.resources, options.resourceId);
    if (resource === undefined) {
      return [missingReferenceDiagnostic(file, "/resources", "resource", options.resourceId, idsFromArray(scene.resources))];
    }
    if (options.path !== undefined) {
      resource.path = options.path;
    }
    if (options.value !== undefined) {
      resource.value = options.value;
    }
    return [];
  });
}

export async function setSceneLifecycle(options: ISetSceneLifecycleOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);
  const diagnostics = [...project.diagnostics];

  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  for (const document of sceneDocuments) {
    const documentDiagnostics = await validateSceneDocument(project.projectPath, document.projectRelativePath, document.data, { materialIds, prefabDocumentIds });
    if (hasAuthoringErrors(documentDiagnostics)) {
      return authoringOperationResult({ diagnostics: documentDiagnostics, projectPath: project.projectPath });
    }
  }

  const changedDocuments: IAuthoringDocument[] = [];
  for (const document of sceneDocuments) {
    const nextData = cloneJson(document.data);
    if (!isRecord(nextData)) {
      return authoringOperationResult({
        diagnostics: [
          authoringDiagnostic({
            code: "TN_AUTHORING_SCENE_SHAPE_INVALID",
            file: document.projectRelativePath,
            message: "Scene source document must be a JSON object before mutation.",
          }),
        ],
        projectPath: project.projectPath,
      });
    }

    const isTarget = document === sceneDocument;
    if (isTarget) {
      if (options.kind !== undefined) {
        nextData.kind = options.kind;
      }
      if (options.activation !== undefined) {
        nextData.activation = options.activation;
      }
      if (options.initial !== undefined) {
        nextData.initial = options.initial;
      }
    } else if (options.initial === true && nextData.initial === true) {
      nextData.initial = false;
    }

    const afterDiagnostics = await validateSceneDocument(project.projectPath, document.projectRelativePath, nextData, { materialIds, prefabDocumentIds });
    if (hasAuthoringErrors(afterDiagnostics)) {
      return authoringOperationResult({ diagnostics: afterDiagnostics, projectPath: project.projectPath });
    }
    if (JSON.stringify(nextData) !== JSON.stringify(document.data)) {
      document.data = nextData;
      changedDocuments.push(document);
    }
  }

  const filesWritten: string[] = [];
  for (const document of changedDocuments) {
    await writeAuthoringJsonDocument(document);
    filesWritten.push(document.projectRelativePath);
  }

  return authoringOperationResult({
    changed: changedDocuments.length > 0,
    filesWritten,
    projectPath: project.projectPath,
  });
}

export async function setComponent(options: ISetComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.componentKind]: options.value,
    };
    return [];
  });
}

export async function setCameraComponent(options: ISetCameraComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "camera",
    value: {
      ...(options.far === undefined ? {} : { far: options.far }),
      ...(options.fovY === undefined ? {} : { fovY: options.fovY }),
      mode: options.mode ?? "perspective",
      ...(options.near === undefined ? {} : { near: options.near }),
      ...(options.size === undefined ? {} : { size: options.size }),
      ...(options.targetId === undefined ? {} : { target: options.targetId }),
    },
  });
}

export async function setLightComponent(options: ISetLightComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Light",
    value: {
      color: options.color ?? "#ffffff",
      intensity: options.intensity ?? 1,
      kind: options.kind ?? "directional",
      ...(options.range === undefined ? {} : { range: options.range }),
      ...(options.angle === undefined ? {} : { angle: options.angle }),
      ...(options.shadowBias === undefined ? {} : { shadowBias: options.shadowBias }),
      ...(options.shadowNormalBias === undefined ? {} : { shadowNormalBias: options.shadowNormalBias }),
    },
  });
}

export async function setMeshRendererComponent(options: ISetMeshRendererComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "MeshRenderer",
    value: {
      material: options.material,
      mesh: options.mesh,
      ...(options.visible === undefined ? {} : { visible: options.visible }),
      ...(options.castShadow === undefined ? {} : { castShadow: options.castShadow }),
      ...(options.receiveShadow === undefined ? {} : { receiveShadow: options.receiveShadow }),
    },
  });
}

export async function setRenderLayersComponent(options: ISetRenderLayersComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "RenderLayers",
    value: {
      layers: [...options.layers],
    },
  });
}

export async function setRigidBodyComponent(options: ISetRigidBodyComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "RigidBody",
    value: {
      kind: options.kind ?? "dynamic",
      ...(options.mass === undefined ? {} : { mass: options.mass }),
      ...(options.damping === undefined ? {} : { damping: options.damping }),
      ...(options.gravityScale === undefined ? {} : { gravityScale: options.gravityScale }),
    },
  });
}

export async function setColliderComponent(options: ISetColliderComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Collider",
    value: {
      kind: options.kind ?? "box",
      ...(options.size === undefined ? { size: [1, 1, 1] } : { size: options.size }),
      ...(options.center === undefined ? {} : { center: options.center }),
      ...(options.radius === undefined ? {} : { radius: options.radius }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...(options.trigger === undefined ? {} : { trigger: options.trigger }),
    },
  });
}

export async function setCharacterControllerComponent(options: ISetCharacterControllerComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "CharacterController",
    value: {
      blocking: options.blocking ?? true,
      grounding: options.grounding ?? "raycast",
      moveXAxis: options.moveXAxis ?? "move.x",
      moveZAxis: options.moveZAxis ?? "move.z",
      speed: options.speed ?? 4,
      ...(options.slopeLimit === undefined ? {} : { slopeLimit: options.slopeLimit }),
      ...(options.stepOffset === undefined ? {} : { stepOffset: options.stepOffset }),
    },
  });
}

export async function setVisibilityComponent(options: ISetVisibilityComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Visibility",
    value: {
      visible: options.visible ?? true,
    },
  });
}

export async function removeComponent(options: IRemoveComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    if (!isRecord(entity.components)) {
      return [];
    }
    delete entity.components[options.componentKind];
    return [];
  });
}

export async function addUiNode(options: IAddUiNodeOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const ui = isRecord(scene.ui) ? scene.ui : {};
    const nodes = ensureArrayProperty(ui, "nodes");
    scene.ui = ui;
    nodes.push({ id: options.uiNodeId });
  });
}

export async function setTransform(options: ISetTransformOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.transform = {
      ...(isRecord(entity.transform) ? entity.transform : {}),
      ...(options.position === undefined ? {} : { position: options.position }),
      ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
      ...(options.scale === undefined ? {} : { scale: options.scale }),
    };
    return [];
  });
}

export async function setCamera(options: ISetCameraOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.cameraId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.cameraId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      camera: {
        ...(options.far === undefined ? {} : { far: options.far }),
        ...(options.fovY === undefined ? {} : { fovY: options.fovY }),
        mode: options.mode,
        ...(options.near === undefined ? {} : { near: options.near }),
        ...(options.size === undefined ? {} : { size: options.size }),
        target: options.targetId,
      },
    };
    return [];
  });
}

export async function attachScript(options: IAttachScriptOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const systems = ensureArrayProperty(scene, "systems");
    const existing = findSceneItem(systems, options.systemId);
    const system = existing ?? { id: options.systemId };
    system.script = {
      module: options.modulePath,
      export: options.exportName,
    };
    if (existing === undefined) {
      systems.push(system);
    }
  });
}

export async function bindUi(options: IBindUiOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const ui = isRecord(scene.ui) ? scene.ui : {};
    const bindings = ensureArrayProperty(ui, "bindings");
    scene.ui = ui;
    bindings.push({
      node: options.uiNodeId,
      resource: options.resourcePath,
    });
  });
}

export async function createUiDocument(options: ICreateUiDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "ui",
    id: options.uiDocId,
    file: `content/ui/${options.uiDocId}.ui.json`,
    data: { schema: uiDocumentSchema, version: "0.1.0", id: options.uiDocId, nodes: [], bindings: [] },
  });
}

export async function addUiText(options: IAddUiTextOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = "text";
    node.text = options.text;
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function addUiNodeDocument(options: IAddUiNodeDocumentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = options.type;
    if (options.action !== undefined) {
      node.action = options.action;
    }
    if (options.label !== undefined) {
      node.label = options.label;
    }
    if (options.src !== undefined) {
      node.src = options.src;
    }
    if (options.text !== undefined) {
      node.text = options.text;
    }
    if (options.value !== undefined) {
      node.value = options.value;
    }
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function addUiComponentInstance(options: IAddUiComponentInstanceOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = "component";
    node.component = {
      ref: options.componentId,
      ...(options.props === undefined ? {} : { props: cloneJson(options.props) }),
    };
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function applyUiRecipe(options: IApplyUiRecipeOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const recipe = buildUiSourceRecipe(options.recipe, options.recipeId ?? options.recipe, options);
    const nodes = ensureArrayProperty(data, "nodes");
    for (const recipeNode of recipe.nodes) {
      const existing = findSceneItem(nodes, recipeNode.id);
      if (existing === undefined) {
        nodes.push(recipeNode);
      } else {
        Object.assign(existing, recipeNode);
      }
    }
    const bindings = ensureArrayProperty(data, "bindings");
    for (const binding of recipe.bindings) {
      const existing = bindings.find((candidate) => candidate.node === binding.node);
      if (existing === undefined) {
        bindings.push(binding);
      } else {
        existing.resource = binding.resource;
      }
    }
    data.components = mergeById(readArray(data.components) ?? [], recipe.components);
    data.screens = mergeById(readArray(data.screens) ?? [], recipe.screens);
    data.focusOrder = [...new Set([...(Array.isArray(data.focusOrder) ? data.focusOrder.filter((id): id is string => typeof id === "string") : []), ...recipe.focusOrder])];
    data.recipes = mergeById(readArray(data.recipes) ?? [], [{ id: recipe.id, kind: options.recipe, props: cloneJson(options.props ?? {}) }]);
    data.provenance = { ...(isRecord(data.provenance) ? data.provenance : {}), ...recipe.provenance };
  });
}

export async function removeUiComponentInstance(options: IRemoveUiComponentInstanceOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const index = nodes.findIndex((node) => node.id === options.nodeId);
    if (index === -1) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    const node = nodes[index];
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    if (node.type !== "component") {
      return [
        typeDiagnostic(
          file,
          `/nodes/${index}/type`,
          "UI node must be a component instance to remove it with remove-component.",
          node.type,
        ),
      ];
    }
    nodes.splice(index, 1);
    return [];
  });
}

export async function setUiLayout(options: ISetUiLayoutOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const node = findSceneItem(nodes, options.nodeId);
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    node.layout = {
      ...(isRecord(node.layout) ? node.layout : {}),
      ...(options.align === undefined ? {} : { align: options.align }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...(options.justify === undefined ? {} : { justify: options.justify }),
      ...(options.top === undefined ? {} : { top: options.top }),
      ...(options.width === undefined ? {} : { width: options.width }),
    };
    return [];
  });
}

export async function setUiStyle(options: ISetUiStyleOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const node = findSceneItem(nodes, options.nodeId);
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    node.style = {
      ...(isRecord(node.style) ? node.style : {}),
      ...(options.backgroundColor === undefined ? {} : { backgroundColor: options.backgroundColor }),
      ...(options.borderColor === undefined ? {} : { borderColor: options.borderColor }),
      ...(options.borderRadius === undefined ? {} : { borderRadius: options.borderRadius }),
      ...(options.borderWidth === undefined ? {} : { borderWidth: options.borderWidth }),
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.fontSize === undefined ? {} : { fontSize: options.fontSize }),
      ...(options.fontWeight === undefined ? {} : { fontWeight: options.fontWeight }),
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
      ...(options.textAlign === undefined ? {} : { textAlign: options.textAlign }),
      ...(options.textDecoration === undefined ? {} : { textDecoration: options.textDecoration }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
    };
    return [];
  });
}

export async function bindUiDocument(options: IBindUiDocumentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const bindings = ensureArrayProperty(data, "bindings");
    bindings.push({ node: options.nodeId, resource: options.resourcePath });
  });
}

export async function createEnvironmentDocument(options: ICreateEnvironmentDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    data: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
  });
}

export async function setEnvironmentSkybox(options: ISetEnvironmentSkyboxOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data) => {
      data.skybox = { asset: options.asset, ...(options.mode === undefined ? {} : { mode: options.mode }) };
    },
  });
}

export async function setEnvironmentMap(options: ISetEnvironmentMapOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data) => {
      data.environmentMap = { asset: options.asset };
    },
  });
}

export async function setEnvironmentTerrain(options: ISetEnvironmentTerrainOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data) => {
      const terrain = isRecord(data.terrain) ? data.terrain : {};
      data.terrain = {
        ...terrain,
        ...(options.heightmap === undefined ? {} : { heightmap: options.heightmap }),
        ...(options.heightMode === undefined ? {} : { heightMode: options.heightMode }),
        ...(options.terrainId === undefined ? {} : { id: options.terrainId }),
      };
    },
  });
}

export async function setEnvironmentPath(options: ISetEnvironmentPathOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data) => {
      data.path = options.path;
    },
  });
}

export async function setEnvironmentWalkability(options: ISetEnvironmentWalkabilityOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data) => {
      data.walkability = options.walkability;
    },
  });
}

export async function setEnvironmentLightProbe(options: ISetEnvironmentLightProbeOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data) => {
      const lightProbes = ensureArrayProperty(data, "lightProbes");
      const existing = findSceneItem(lightProbes, options.probeId);
      const probe = { ...(cloneJson(options.probe) as Record<string, unknown>), id: options.probeId };
      if (existing === undefined) {
        lightProbes.push(probe);
      } else {
        Object.keys(existing).forEach((key) => {
          delete existing[key];
        });
        Object.assign(existing, probe);
      }
    },
  });
}

export async function setEnvironmentSourceAssetLod(options: ISetEnvironmentSourceAssetLodOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "environment",
    id: options.environmentId,
    file: `content/environment/${options.environmentId}.environment.json`,
    emptyData: { schema: environmentDocumentSchema, version: "0.1.0", id: options.environmentId, instances: [], sourceAssets: [] },
    apply: (data, file) => {
      const sourceAsset = findSceneItem(data.sourceAssets, options.sourceAssetId);
      if (sourceAsset === undefined) {
        return [missingReferenceDiagnostic(file, "/sourceAssets", "source asset", options.sourceAssetId, idsFromArray(data.sourceAssets))];
      }
      sourceAsset.lod = options.lod;
      return [];
    },
  });
}

export async function createRuntimeConfig(options: ICreateRuntimeConfigOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "runtime",
    id: options.runtimeId,
    file: `content/runtime/${options.runtimeId}.runtime.json`,
    data: defaultRuntimeConfigData(options.runtimeId, options.renderProfile),
  });
}

export async function createResourcesDocument(options: ICreateResourcesDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "resources",
    id: options.resourcesDocId,
    file: `content/resources/${options.resourcesDocId}.resources.json`,
    data: { schema: resourcesDocumentSchema, version: "0.1.0", id: options.resourcesDocId, resources: [] },
  });
}

export async function addResourceDocumentEntry(options: IAddResourceDocumentEntryOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "resources",
    id: options.resourcesDocId,
    file: `content/resources/${options.resourcesDocId}.resources.json`,
    emptyData: { schema: resourcesDocumentSchema, version: "0.1.0", id: options.resourcesDocId, resources: [] },
    apply: (data, file) => {
      const resources = ensureArrayProperty(data, "resources");
      if (findSceneItem(resources, options.resourceId) !== undefined) {
        return [
          authoringDiagnostic({
            code: duplicateIdCode("resource"),
            file,
            message: `Duplicate resource id '${options.resourceId}'.`,
            path: "/resources",
            value: options.resourceId,
            suggestion: "Use a new resource id or update the existing resource.",
          }),
        ];
      }
      resources.push({
        id: options.resourceId,
        ...(options.path === undefined ? {} : { path: options.path }),
        ...(options.value === undefined ? {} : { value: options.value }),
      });
      resources.sort((left, right) => String(isRecord(left) ? left.id : "").localeCompare(String(isRecord(right) ? right.id : "")));
      return [];
    },
  });
}

export async function setResourceDocumentEntry(options: ISetResourceDocumentEntryOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "resources", options.resourcesDocId, (data, file) => {
    const resources = ensureArrayProperty(data, "resources");
    const resource = findSceneItem(resources, options.resourceId);
    if (resource === undefined) {
      return [missingReferenceDiagnostic(file, "/resources", "resource", options.resourceId, idsFromArray(resources))];
    }
    if (options.path !== undefined) {
      resource.path = options.path;
    }
    if (options.value !== undefined) {
      resource.value = options.value;
    }
    return [];
  });
}

export async function createSchemaDocument(options: ICreateSchemaDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "schema",
    id: options.schemaDocId,
    file: `content/schemas/${options.schemaDocId}.schema.json`,
    data: { schema: schemaDocumentSchema, version: "0.1.0", id: options.schemaDocId, kind: options.kind, schemas: [] },
  });
}

export async function setSchemaEntry(options: ISetSchemaEntryOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "schema",
    id: options.schemaDocId,
    file: `content/schemas/${options.schemaDocId}.schema.json`,
    emptyData: { schema: schemaDocumentSchema, version: "0.1.0", id: options.schemaDocId, kind: options.kind, schemas: [] },
    apply: (data, file) => {
      data.kind = options.kind;
      const schemas = ensureArrayProperty(data, "schemas");
      const existing = findSceneItem(schemas, options.schemaId);
      if (existing === undefined) {
        schemas.push({ id: options.schemaId, fields: options.fields });
      } else {
        existing.fields = options.fields;
      }
      schemas.sort((left, right) => String(isRecord(left) ? left.id : "").localeCompare(String(isRecord(right) ? right.id : "")));
      return validateSchemaDocumentKind(file, data.kind);
    },
  });
}

export async function createProjectMetadata(options: ICreateProjectMetadataOptions): Promise<IAuthoringOperationResult> {
  const projectId = options.projectId;
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "project",
    id: projectId,
    file: options.file ?? "content/project.authoring.json",
    emptyData: defaultProjectMetadataData(projectId),
    apply: (data) => {
      data.id = projectId;
      data.authoringVersion = options.authoringVersion ?? "0.1.0";
      data.sourceRoots = [...(options.sourceRoots ?? ["content", "src"])];
      data.buildTargets = [...(options.buildTargets ?? ["web", "desktop"])];
    },
  });
}

export async function setRuntimeWindow(options: ISetRuntimeWindowOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "runtime",
    id: options.runtimeId,
    file: `content/runtime/${options.runtimeId}.runtime.json`,
    emptyData: defaultRuntimeConfigData(options.runtimeId),
    apply: (data) => {
      const window = isRecord(data.window) ? data.window : {};
      data.window = {
        ...window,
        ...(options.height === undefined ? {} : { height: options.height }),
        ...(options.title === undefined ? {} : { title: options.title }),
        ...(options.width === undefined ? {} : { width: options.width }),
      };
    },
  });
}

export async function setRuntimeRendering(options: ISetRuntimeRenderingOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "runtime",
    id: options.runtimeId,
    file: `content/runtime/${options.runtimeId}.runtime.json`,
    emptyData: defaultRuntimeConfigData(options.runtimeId),
    apply: (data) => {
      const renderer = isRecord(data.renderer) ? data.renderer : {};
      const bloom = isRecord(renderer.bloom) ? renderer.bloom : {};
      const renderLook = isRecord(renderer.renderLook) ? renderer.renderLook : {};
      const renderLookOverrides = isRecord(renderLook.overrides) ? renderLook.overrides : {};
      const nextRenderLookOverrides = {
        ...renderLookOverrides,
        ...(options.renderLookBloomIntensity === undefined ? {} : { bloomIntensity: options.renderLookBloomIntensity }),
        ...(options.renderLookContrast === undefined ? {} : { contrast: options.renderLookContrast }),
        ...(options.renderLookEnvironmentIntensity === undefined ? {} : { environmentIntensity: options.renderLookEnvironmentIntensity }),
        ...(options.renderLookExposure === undefined ? {} : { exposure: options.renderLookExposure }),
        ...(options.renderLookSaturation === undefined ? {} : { saturation: options.renderLookSaturation }),
        ...(options.renderLookShadowQuality === undefined ? {} : { shadowQuality: options.renderLookShadowQuality }),
      };
      const shouldSetRenderLook = options.renderProfile !== undefined
        || options.renderLookBloomIntensity !== undefined
        || options.renderLookContrast !== undefined
        || options.renderLookEnvironmentIntensity !== undefined
        || options.renderLookExposure !== undefined
        || options.renderLookSaturation !== undefined
        || options.renderLookShadowQuality !== undefined;
      data.renderer = {
        ...renderer,
        ...(options.antialias === undefined ? {} : { antialias: options.antialias }),
        ...(shouldSetRenderLook
          ? {
              renderLook: {
                ...renderLook,
                version: 1,
                profile: options.renderProfile ?? renderLook.profile ?? "balanced",
                ...(Object.keys(nextRenderLookOverrides).length === 0 ? {} : { overrides: nextRenderLookOverrides }),
              },
            }
          : {}),
        ...(options.renderPath === undefined ? {} : { renderPath: options.renderPath }),
        ...(options.bloomEnabled === undefined && options.bloomIntensity === undefined && options.bloomThreshold === undefined
          ? {}
          : {
              bloom: {
                ...bloom,
                ...(options.bloomEnabled === undefined ? {} : { enabled: options.bloomEnabled }),
                ...(options.bloomIntensity === undefined ? {} : { intensity: options.bloomIntensity }),
                ...(options.bloomThreshold === undefined ? {} : { threshold: options.bloomThreshold }),
              },
            }),
      };
    },
  });
}

export async function setTargetProfile(options: ISetTargetProfileOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "target",
    id: options.targetProfileId,
    file: `content/targets/${options.targetProfileId}.target.json`,
    emptyData: { schema: targetProfileDocumentSchema, version: "0.1.0", id: options.targetProfileId, targets: ["web", "desktop"] },
    apply: (data) => {
      data.targets = [...options.targets];
      if (options.budgets !== undefined) {
        data.budgets = cloneJson(options.budgets);
      }
      if (options.performance !== undefined) {
        data.performance = cloneJson(options.performance);
      }
    },
  });
}

export async function recordGeneratorProvenance(options: IRecordGeneratorProvenanceOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "generator",
    id: options.generatorId,
    file: `content/generators/${options.generatorId}.generator.json`,
    emptyData: { schema: generatorDocumentSchema, version: "0.1.0", id: options.generatorId, module: options.modulePath, export: options.exportName, outputs: [] },
    apply: (data) => {
      data.module = options.modulePath;
      data.export = options.exportName;
      data.outputs = [...options.outputs];
      if (options.overwritePolicy !== undefined) {
        data.overwritePolicy = options.overwritePolicy;
      }
      if (options.inputHash !== undefined) {
        data.inputHash = options.inputHash;
      }
      if (options.outputHash !== undefined) {
        data.outputHash = options.outputHash;
      }
    },
  });
}

export async function createMaterial(options: ICreateMaterialOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "material",
    id: options.materialId,
    file: `content/materials/${options.materialId}.materials.json`,
    data: { schema: materialDocumentSchema, version: "0.1.0", id: options.materialId, materials: [{ id: options.materialId }] },
  });
}

export async function setMaterial(options: ISetMaterialOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((candidate) => candidate.kind === "material" && isRecord(candidate.data) && idsFromArray(candidate.data.materials).includes(options.materialId));
  const mutateMaterial = (data: Record<string, unknown>, file: string): void | IAuthoringDiagnostic[] => {
    const materials = ensureArrayProperty(data, "materials");
    const material = findSceneItem(materials, options.materialId);
    if (material === undefined) {
      return [missingReferenceDiagnostic(file, "/materials", "material", options.materialId, idsFromArray(materials))];
    }
    setOptionalString(material, "alphaMode", options.alphaMode);
    setOptionalString(material, "baseColorTexture", options.baseColorTexture);
    setOptionalString(material, "clearcoatRoughnessTexture", options.clearcoatRoughnessTexture);
    setOptionalString(material, "clearcoatTexture", options.clearcoatTexture);
    if (options.color !== undefined) {
      material.color = options.color;
    }
    setOptionalString(material, "emissive", options.emissive);
    setOptionalString(material, "emissiveTexture", options.emissiveTexture);
    setOptionalString(material, "metallicRoughnessTexture", options.metallicRoughnessTexture);
    setOptionalString(material, "normalTexture", options.normalTexture);
    setOptionalString(material, "occlusionTexture", options.occlusionTexture);
    setOptionalString(material, "transmissionTexture", options.transmissionTexture);
    setOptionalNumber(material, "alphaCutoff", options.alphaCutoff);
    setOptionalNumber(material, "clearcoat", options.clearcoat);
    setOptionalNumber(material, "clearcoatRoughness", options.clearcoatRoughness);
    setOptionalNumber(material, "emissiveIntensity", options.emissiveIntensity);
    setOptionalNumber(material, "metalness", options.metalness);
    setOptionalNumber(material, "opacity", options.opacity);
    setOptionalNumber(material, "roughness", options.roughness);
    setOptionalNumber(material, "transmission", options.transmission);
    return [];
  };

  if (document !== undefined) {
    return mutateLoadedSourceDocument(project, document, mutateMaterial);
  }

  return mutateSourceDocument(options, "material", options.materialId, mutateMaterial);
}

export async function createMeshPrimitive(options: ICreateMeshPrimitiveOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "mesh",
    id: options.meshId,
    file: options.file ?? `content/meshes/${options.meshId}.meshes.json`,
    emptyData: { schema: meshDocumentSchema, version: "0.1.0", id: options.meshId, meshes: [] },
    apply: (data) => {
      const meshes = ensureArrayProperty(data, "meshes");
      const existing = findSceneItem(meshes, options.meshId);
      const mesh = existing ?? { id: options.meshId };
      mesh.kind = "primitive";
      mesh.primitive = options.kind;
      if (options.size !== undefined) {
        mesh.size = options.size;
      } else {
        delete mesh.size;
      }
      delete mesh.attributes;
      delete mesh.indices;
      delete mesh.storage;
      if (existing === undefined) {
        meshes.push(mesh);
      }
    },
  });
}

export async function createMeshCustom(options: ICreateMeshCustomOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "mesh",
    id: options.meshId,
    file: `content/meshes/${options.meshId}.meshes.json`,
    data: {
      schema: meshDocumentSchema,
      version: "0.1.0",
      id: options.meshId,
      meshes: [{
        attributes: options.attributes.map((attribute) => ({ itemSize: attribute.itemSize, name: attribute.name, values: [...attribute.values] })),
        id: options.meshId,
        ...(options.indices === undefined ? {} : { indices: [...options.indices] }),
        kind: "custom",
        primitive: "custom",
        ...(options.storage === undefined ? {} : { storage: options.storage }),
      }],
    },
  });
}

export async function createPrefabDocument(options: ICreatePrefabDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "prefab",
    id: options.prefabId,
    file: `content/prefabs/${options.prefabId}.prefab.json`,
    data: { schema: prefabDocumentSchema, version: "0.1.0", id: options.prefabId, entities: [{ id: options.prefabId, components: {} }] },
  });
}

export async function addPrefabComponent(options: IAddPrefabComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "prefab", options.prefabId, (data, file) => {
    const entities = ensureArrayProperty(data, "entities");
    const entity = findSceneItem(entities, options.prefabId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.prefabId, idsFromArray(entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.componentKind]: options.value,
    };
    return [];
  });
}

export async function setPrefabMaterial(options: ISetPrefabMaterialOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "prefab", options.prefabId, (data, file) => {
    const entities = ensureArrayProperty(data, "entities");
    const sameIdEntity = findSceneItem(entities, options.prefabId);
    const fallbackEntity = entities.find(isRecord);
    const entity = sameIdEntity ?? fallbackEntity;
    if (entity === undefined) {
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_REF_MISSING",
          file,
          message: `No root entity exists in prefab '${options.prefabId}'.`,
          path: "/entities",
          suggestion: "Add an entity to the prefab document before assigning a material.",
          value: options.prefabId,
        }),
      ];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      MeshRenderer: { material: options.materialId },
    };
    return [];
  });
}

export async function addInputAction(options: IAddInputActionOptions): Promise<IAuthoringOperationResult> {
  const bindings = options.keys.map(formatKeyboardBinding);
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "input",
    id: options.inputDocId,
    file: `content/input/${options.inputDocId}.input.json`,
    emptyData: { schema: inputDocumentSchema, version: "0.1.0", id: options.inputDocId, actions: [] },
    apply: (data) => {
      const actions = ensureArrayProperty(data, "actions");
      const existing = findSceneItem(actions, options.actionId);
      const action = existing ?? { id: options.actionId };
      action.bindings = bindings;
      if (existing === undefined) {
        actions.push(action);
      }
    },
  });
}

export async function addInputAxis(options: IAddInputAxisOptions): Promise<IAuthoringOperationResult> {
  const negative = options.negativeKeys.map(formatKeyboardBinding);
  const positive = options.positiveKeys.map(formatKeyboardBinding);
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "input",
    id: options.inputDocId,
    file: `content/input/${options.inputDocId}.input.json`,
    emptyData: { schema: inputDocumentSchema, version: "0.1.0", id: options.inputDocId, actions: [], axes: [] },
    apply: (data) => {
      const axes = ensureArrayProperty(data, "axes");
      const existing = findSceneItem(axes, options.axisId);
      const axis = existing ?? { id: options.axisId };
      axis.negative = negative;
      axis.positive = positive;
      if (options.value === undefined) {
        delete axis.value;
      } else {
        axis.value = options.value;
      }
      if (existing === undefined) {
        axes.push(axis);
      }
    },
  });
}

export async function setInputControls(options: ISetInputControlsOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "input",
    id: options.inputDocId,
    file: `content/input/${options.inputDocId}.input.json`,
    emptyData: { schema: inputDocumentSchema, version: "0.1.0", id: options.inputDocId, actions: [], axes: [] },
    apply: (data) => {
      data.controlsSettings = {
        profileId: options.profileId,
        rows: [...options.rows].sort((left, right) => inputControlsRowSortKey(left).localeCompare(inputControlsRowSortKey(right))),
      };
    },
  });
}

export async function setInputBindingOverride(options: ISetInputBindingOverrideOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "input",
    id: options.inputDocId,
    file: `content/input/${options.inputDocId}.input.json`,
    emptyData: { schema: inputDocumentSchema, version: "0.1.0", id: options.inputDocId, actions: [], axes: [] },
    apply: (data) => {
      const overrides = ensureArrayProperty(data, "persistedBindingOverrides");
      const next = {
        actionOrAxisId: options.actionOrAxisId,
        ...(options.axisSlot === undefined ? {} : { axisSlot: options.axisSlot }),
        control: options.control,
        ...(options.deadzone === undefined ? {} : { deadzone: options.deadzone }),
        device: options.device,
        ...(options.modifiers === undefined ? {} : { modifiers: [...options.modifiers].sort() }),
        profileId: options.profileId,
        ...(options.scale === undefined ? {} : { scale: options.scale }),
        updatedAt: options.updatedAt ?? new Date(0).toISOString(),
      };
      const existingIndex = overrides.findIndex((override) =>
        isRecord(override)
        && override.profileId === next.profileId
        && override.actionOrAxisId === next.actionOrAxisId
        && override.axisSlot === next.axisSlot
        && override.device === next.device
        && override.control === next.control
      );
      if (existingIndex === -1) {
        overrides.push(next);
      } else {
        overrides[existingIndex] = next;
      }
      overrides.sort((left, right) => inputOverrideSortKey(left).localeCompare(inputOverrideSortKey(right)));
    },
  });
}

export async function addAsset(options: IAddAssetOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "asset",
    id: options.assetId,
    file: options.file ?? `content/assets/${options.assetId}.assets.json`,
    emptyData: { schema: assetDocumentSchema, version: "0.1.0", id: options.assetId, assets: [] },
    apply: (data) => {
      const assets = ensureArrayProperty(data, "assets");
      const existing = findSceneItem(assets, options.assetId);
      const asset = existing ?? { id: options.assetId };
      asset.type = options.type;
      if (options.type === "render-target") {
        delete asset.path;
        asset.width = options.width;
        asset.height = options.height;
        asset.usage = options.usage ?? "color";
        asset.format = options.format ?? (asset.usage === "depth" ? "depth24plus" : "rgba8");
        setOptionalNumber(asset, "sampleCount", options.sampleCount);
      } else {
        asset.path = options.path;
        delete asset.width;
        delete asset.height;
        delete asset.usage;
        delete asset.format;
        delete asset.sampleCount;
      }
      if (existing === undefined) {
        assets.push(asset);
      }
    },
  });
}

export async function addAnimationClip(options: IAddAnimationClipOptions): Promise<IAuthoringOperationResult> {
  return mutateAsset(options.projectPath, options.assetId, (asset) => {
    const animations = ensureArrayProperty(asset, "animations");
    const existing = findSceneItem(animations, options.clipId);
    const clip = existing ?? { id: options.clipId };
    if (options.loop === undefined) {
      delete clip.loop;
    } else {
      clip.loop = options.loop;
    }
    setOptionalString(clip, "sourceClip", options.sourceClip);
    setOptionalNumber(clip, "speed", options.speed);
    if (existing === undefined) {
      animations.push(clip);
    }
  });
}

export async function addAnimationGraphState(options: IAddAnimationGraphStateOptions): Promise<IAuthoringOperationResult> {
  return mutateAsset(options.projectPath, options.assetId, (asset) => {
    const graph = isRecord(asset.animationGraph) ? asset.animationGraph : {};
    const states = Array.isArray(graph.states) ? graph.states : [];
    const existing = findSceneItem(states, options.stateId);
    const state = existing ?? { id: options.stateId };
    state.clip = options.clipId;
    if (existing === undefined) {
      states.push(state);
    }
    asset.animationGraph = {
      ...graph,
      initialState: options.initial === true || typeof graph.initialState !== "string" ? options.stateId : graph.initialState,
      states,
    };
  });
}

export async function addParticleEmitter(options: IAddParticleEmitterOptions): Promise<IAuthoringOperationResult> {
  return mutateAsset(options.projectPath, options.assetId, (asset) => {
    const particleEmitters = ensureArrayProperty(asset, "particleEmitters");
    const existing = findSceneItem(particleEmitters, options.emitterId);
    const emitter = existing ?? { id: options.emitterId };
    emitter.lifetimeSeconds = options.lifetimeSeconds;
    emitter.maxParticles = options.maxParticles;
    emitter.ratePerSecond = options.ratePerSecond;
    emitter.shape = options.shape ?? "point";
    if (options.radius === undefined) {
      delete emitter.radius;
    } else {
      emitter.radius = options.radius;
    }
    if (existing === undefined) {
      particleEmitters.push(emitter);
    }
  });
}

export async function createAudioDocument(options: ICreateAudioDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "audio",
    id: options.audioDocId,
    file: `content/audio/${options.audioDocId}.audio.json`,
    data: { schema: audioDocumentSchema, version: "0.1.0", id: options.audioDocId, sounds: [] },
  });
}

function mutateAsset(
  projectPath: string,
  assetId: string,
  apply: (asset: Record<string, unknown>) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument({ projectPath }, "asset", assetId, (data, file) => {
    const assets = ensureArrayProperty(data, "assets");
    const asset = findSceneItem(assets, assetId);
    if (asset === undefined) {
      return [missingReferenceDiagnostic(file, "/assets", "asset", assetId, idsFromArray(assets))];
    }
    if (asset.type !== "model") {
      return [typeDiagnostic(file, `/assets/${assets.indexOf(asset)}/type`, "animation and particle metadata require a model asset.", asset.type)];
    }
    return apply(asset);
  });
}

export async function addAudioSound(options: IAddAudioSoundOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "audio", options.audioDocId, (data) => {
    const sounds = ensureArrayProperty(data, "sounds");
    const existing = findSceneItem(sounds, options.soundId);
    const sound = existing ?? { id: options.soundId };
    sound.asset = options.asset;
    if (existing === undefined) {
      sounds.push(sound);
    }
  });
}

export async function createSystem(options: ICreateSystemOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "systems",
    id: options.systemId,
    file: `content/systems/${options.systemId}.systems.json`,
    data: { schema: systemsDocumentSchema, version: "0.1.0", id: options.systemId, systems: [{ id: options.systemId, schedule: options.schedule }] },
  });
}

export async function attachSystemScript(options: IAttachSystemScriptOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "systems", options.systemId, (data, file) => {
    const systems = ensureArrayProperty(data, "systems");
    const system = findSceneItem(systems, options.systemId);
    if (system === undefined) {
      return [missingReferenceDiagnostic(file, "/systems", "system", options.systemId, idsFromArray(systems))];
    }
    system.script = { module: options.modulePath, export: options.exportName };
    return [];
  }, options.file);
}

export async function setSystemMetadata(options: ISetSystemMetadataOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "systems", options.systemId, (data, file) => {
    const systems = ensureArrayProperty(data, "systems");
    const scriptLifecycles = ensureArrayProperty(data, "scriptLifecycles");
    const system = findSceneItem(systems, options.systemId) ?? findSceneItem(scriptLifecycles, options.systemId);
    if (system === undefined) {
      return [missingReferenceDiagnostic(file, "/systems", "system", options.systemId, [...idsFromArray(systems), ...idsFromArray(scriptLifecycles)])];
    }
    for (const key of systemStringListMetadataKeys) {
      const value = options[key];
      if (value !== undefined) {
        system[key] = sortedStringList(value);
      }
    }
    if (options.queries !== undefined) {
      system.queries = options.queries.map((query) => cloneJson(query));
    }
    if (options.commands !== undefined) {
      system.commands = options.commands.map((command) => cloneJson(command));
    }
    if (options.schedule !== undefined) {
      system.schedule = options.schedule;
    }
    return [];
  }, options.file);
}

const systemStringListMetadataKeys = [
  "after",
  "before",
  "eventReads",
  "eventWrites",
  "reads",
  "resourceReads",
  "resourceWrites",
  "services",
  "writes",
] as const;

function defaultRuntimeConfigData(runtimeId: string, renderProfile = "balanced"): Record<string, unknown> {
  return {
    schema: runtimeDocumentSchema,
    version: "0.1.0",
    id: runtimeId,
    renderer: { antialias: "msaa4", renderLook: { version: 1, profile: renderProfile } },
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  };
}

function defaultProjectMetadataData(projectId: string): Record<string, unknown> {
  return {
    schema: projectDocumentSchema,
    version: "0.1.0",
    id: projectId,
    authoringVersion: "0.1.0",
    buildTargets: ["web", "desktop"],
    sourceRoots: ["content", "src"],
  };
}

async function createSourceDocument(options: {
  projectPath: string;
  kind: AuthoringDocumentKind;
  id: string;
  file: string;
  data: Record<string, unknown>;
}): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.id, `${options.kind} document`);
  const absoluteFile = resolve(project.projectPath, options.file);
  const projectRelativePath = normalizeRelativePath(relative(project.projectPath, absoluteFile));
  validateNewSourcePath(diagnostics, projectRelativePath, options.file, sourceExtensionForKind(options.kind));

  const duplicateDocument = project.documents.find((document) => document.kind === options.kind && readDocumentId(document.data) === options.id);
  if (duplicateDocument !== undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DUPLICATE_DOCUMENT_ID",
        file: duplicateDocument.projectRelativePath,
        message: `${options.kind} document id '${options.id}' already exists.`,
        path: "/id",
        value: options.id,
        suggestion: "Use a new id or mutate the existing source document.",
      }),
    );
  }

  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Authoring source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different id or mutate the existing source document.",
      }),
    );
  } catch {
    // Missing is the successful create path.
  }

  diagnostics.push(...(await validateAuthoringDocument(project.projectPath, projectRelativePath, options.kind, options.data, validationContextForProject(project))));
  if (hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const document: IAuthoringDocument = { data: options.data, file: absoluteFile, kind: options.kind, projectRelativePath };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath: project.projectPath });
}

async function upsertSourceDocument(options: {
  projectPath: string;
  kind: AuthoringDocumentKind;
  id: string;
  file: string;
  emptyData: Record<string, unknown>;
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[];
}): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const absoluteFile = resolve(project.projectPath, options.file);
  const projectRelativePath = normalizeRelativePath(relative(project.projectPath, absoluteFile));
  const existing = project.documents.find((document) =>
    document.kind === options.kind
    && (readDocumentId(document.data) === options.id || document.projectRelativePath === projectRelativePath)
  );
  if (existing !== undefined) {
    return mutateLoadedSourceDocument(project, existing, options.apply);
  }

  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.id, `${options.kind} document`);
  validateNewSourcePath(diagnostics, projectRelativePath, options.file, sourceExtensionForKind(options.kind));
  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Authoring source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different id or mutate the existing source document.",
      }),
    );
  } catch {
    // Missing is the successful upsert-create path.
  }

  const nextData = cloneJson(options.emptyData);
  if (!isRecord(nextData)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file: projectRelativePath,
        message: "Structured authoring source document must be a JSON object before mutation.",
      }),
    );
  } else {
    diagnostics.push(...(options.apply(nextData, projectRelativePath) ?? []));
    diagnostics.push(...(await validateAuthoringDocument(project.projectPath, projectRelativePath, options.kind, nextData, validationContextForProject(project))));
  }

  if (hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const document: IAuthoringDocument = { data: nextData, file: absoluteFile, kind: options.kind, projectRelativePath };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath: project.projectPath });
}

async function mutateSourceDocument(
  options: IAuthoringOperationContext,
  kind: AuthoringDocumentKind,
  id: string,
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
  file?: string,
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((candidate) => candidate.kind === kind && (file === undefined ? readDocumentId(candidate.data) === id : candidate.projectRelativePath === file));
  const diagnostics = [...project.diagnostics];

  if (document === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_MISSING",
        message: `No ${kind} source document with id '${id}' was found.`,
        value: id,
        suggestion: closestIdSuggestion(id, project.documents.filter((candidate) => candidate.kind === kind).map((candidate) => readDocumentId(candidate.data)).filter(isString)),
      }),
    );
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  return mutateLoadedSourceDocument(project, document, apply);
}

async function mutateLoadedSourceDocument(
  project: Awaited<ReturnType<typeof loadAuthoringProject>>,
  document: IAuthoringDocument,
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  const diagnostics = [...project.diagnostics];
  const context = validationContextForProject(project);
  const beforeDiagnostics = await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, document.data, context);
  if (hasAuthoringErrors(beforeDiagnostics)) {
    return authoringOperationResult({ diagnostics: beforeDiagnostics, projectPath: project.projectPath });
  }

  const nextData = cloneJson(document.data);
  if (!isRecord(nextData)) {
    return authoringOperationResult({
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
          file: document.projectRelativePath,
          message: "Structured authoring source document must be a JSON object before mutation.",
        }),
      ],
      projectPath: project.projectPath,
    });
  }

  const applyDiagnostics = apply(nextData, document.projectRelativePath) ?? [];
  if (hasAuthoringErrors(applyDiagnostics)) {
    return authoringOperationResult({ diagnostics: applyDiagnostics, projectPath: project.projectPath });
  }

  const afterDiagnostics = await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, nextData, context);
  if (hasAuthoringErrors(afterDiagnostics)) {
    return authoringOperationResult({ diagnostics: afterDiagnostics, projectPath: project.projectPath });
  }

  document.data = nextData;
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics: afterDiagnostics, filesWritten: [document.projectRelativePath], projectPath: project.projectPath });
}

function validateNewSourcePath(diagnostics: IAuthoringDiagnostic[], projectRelativePath: string, requestedFile: string, extension: string): void {
  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Authoring source documents must be created inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/ for structured source documents.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(generatedPathDiagnostic(projectRelativePath, "", projectRelativePath));
  } else if (!projectRelativePath.endsWith(extension)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: `Authoring source documents for this operation must use the ${extension} extension.`,
        value: projectRelativePath,
      }),
    );
  }
}

function sourceExtensionForKind(kind: AuthoringDocumentKind): string {
  switch (kind) {
    case "asset":
      return ".assets.json";
    case "audio":
      return ".audio.json";
    case "environment":
      return ".environment.json";
    case "generator":
      return ".generator.json";
    case "input":
      return ".input.json";
    case "material":
      return ".materials.json";
    case "mesh":
      return ".meshes.json";
    case "prefab":
      return ".prefab.json";
    case "project":
      return ".authoring.json";
    case "runtime":
      return ".runtime.json";
    case "resources":
      return ".resources.json";
    case "schema":
      return ".schema.json";
    case "systems":
      return ".systems.json";
    case "target":
      return ".target.json";
    case "ui":
      return ".ui.json";
    default:
      return ".json";
  }
}

async function mutateScene(
  options: IAuthoringOperationContext & { sceneId: string },
  apply: (scene: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);
  const diagnostics = [...project.diagnostics];

  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const beforeDiagnostics = await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data, { materialIds, prefabDocumentIds });
  if (hasAuthoringErrors(beforeDiagnostics)) {
    return authoringOperationResult({
      diagnostics: beforeDiagnostics,
      projectPath: project.projectPath,
    });
  }

  const nextData = cloneJson(sceneDocument.data);
  if (!isRecord(nextData)) {
    return authoringOperationResult({
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_SCENE_SHAPE_INVALID",
          file: sceneDocument.projectRelativePath,
          message: "Scene source document must be a JSON object before mutation.",
        }),
      ],
      projectPath: project.projectPath,
    });
  }

  const applyDiagnostics = apply(nextData, sceneDocument.projectRelativePath) ?? [];
  if (hasAuthoringErrors(applyDiagnostics)) {
    return authoringOperationResult({
      diagnostics: applyDiagnostics,
      projectPath: project.projectPath,
    });
  }

  const afterDiagnostics = await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, nextData, { materialIds, prefabDocumentIds });
  if (hasAuthoringErrors(afterDiagnostics)) {
    return authoringOperationResult({
      diagnostics: afterDiagnostics,
      projectPath: project.projectPath,
    });
  }

  sceneDocument.data = nextData;
  await writeAuthoringJsonDocument(sceneDocument);
  return authoringOperationResult({
    changed: true,
    diagnostics: afterDiagnostics,
    filesWritten: [sceneDocument.projectRelativePath],
    projectPath: project.projectPath,
  });
}

interface IAuthoringValidationContext {
  materialIds: readonly string[];
  prefabDocumentIds?: readonly string[];
}

function validationContextForProject(project: IAuthoringProject): IAuthoringValidationContext {
  return {
    materialIds: collectMaterialIdsForProject(project),
    prefabDocumentIds: collectPrefabDocumentIdsForProject(project),
  };
}

async function validateAuthoringDocument(
  projectPath: string,
  file: string,
  kind: AuthoringDocumentKind,
  data: unknown,
  context: IAuthoringValidationContext,
): Promise<IAuthoringDiagnostic[]> {
  switch (kind) {
    case "asset":
      return validateDeclarationDocument(file, data, {
        declarationKeys: assetKeys,
        duplicateKind: "asset",
        expectedSchema: assetDocumentSchema,
        idKind: "asset document",
        listName: "assets",
        rootKeys: assetDocumentKeys,
        validateItem: (diagnostics, path, item) => validateAssetDeclaration(diagnostics, path, item, file),
      });
    case "audio":
      return validateDeclarationDocument(file, data, {
        declarationKeys: audioSoundKeys,
        duplicateKind: "audio",
        expectedSchema: audioDocumentSchema,
        idKind: "audio document",
        listName: "sounds",
        rootKeys: audioDocumentKeys,
        validateItem: (diagnostics, path, item) => validateGeneratedPathString(diagnostics, file, `${path}/asset`, item.asset, "audio asset must be a non-empty source path."),
      });
    case "input":
      return [
        ...(await validateDeclarationDocument(file, data, {
          declarationKeys: inputActionKeys,
          duplicateKind: "input",
          expectedSchema: inputDocumentSchema,
          idKind: "input document",
          listName: "actions",
          rootKeys: inputDocumentKeys,
          validateItem: (diagnostics, path, item) => {
            validateStringList(diagnostics, file, `${path}/bindings`, item.bindings, "input action bindings must be non-empty strings.");
          },
        })),
        ...(await validateDeclarationDocument(file, data, {
          declarationKeys: inputAxisKeys,
          duplicateKind: "input axis",
          expectedSchema: inputDocumentSchema,
          idKind: "input document",
          listName: "axes",
          rootKeys: inputDocumentKeys,
          validateItem: (diagnostics, path, item) => {
            validateStringList(diagnostics, file, `${path}/negative`, item.negative, "input axis negative bindings must be non-empty strings.");
            validateStringList(diagnostics, file, `${path}/positive`, item.positive, "input axis positive bindings must be non-empty strings.");
            if (item.value !== undefined && readString(item.value) === undefined) {
              diagnostics.push(typeDiagnostic(file, `${path}/value`, "input axis value binding must be a non-empty string.", item.value));
            }
          },
        })),
        ...validateInputMetadata(file, data),
      ];
    case "environment":
      return validateRootDocument(file, data, environmentDocumentSchema, "environment document", environmentDocumentKeys);
    case "generator":
      return validateGeneratorDocument(file, data);
    case "material":
      return validateMaterialDocument(file, data, validateDeclarationDocument);
    case "mesh":
      return validateDeclarationDocument(file, data, {
        declarationKeys: meshKeys,
        duplicateKind: "mesh",
        expectedSchema: meshDocumentSchema,
        idKind: "mesh document",
        listName: "meshes",
        rootKeys: meshDocumentKeys,
        validateItem: (diagnostics, path, item) => {
          if (item.kind !== "primitive" && item.kind !== "custom") {
            diagnostics.push(typeDiagnostic(file, `${path}/kind`, "mesh kind must be 'primitive' or 'custom'.", item.kind));
            return;
          }
          if (item.kind === "custom") {
            validateCustomMeshSource(diagnostics, file, path, item);
            return;
          }
          const primitive = readString(item.primitive);
          if (primitive === undefined || !supportedMeshPrimitives.has(primitive)) {
            diagnostics.push(
              authoringDiagnostic({
                code: "TN_AUTHORING_MESH_PRIMITIVE_UNKNOWN",
                file,
                message: `Unknown mesh primitive '${String(item.primitive)}'.`,
                path: `${path}/primitive`,
                value: item.primitive,
                suggestion: "Use 'box', 'sphere', 'cylinder', 'cone', or 'plane'.",
              }),
            );
          }
          if (item.size !== undefined) {
            if (!Array.isArray(item.size) || item.size.length === 0 || item.size.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
              diagnostics.push(typeDiagnostic(file, `${path}/size`, "mesh primitive size must be a non-empty array of positive finite numbers.", item.size));
            }
          }
        },
      });
    case "prefab":
      return validatePrefabDocument(file, data);
    case "project":
      return validateProjectDocument(file, data);
    case "runtime":
      return validateRuntimeDocument(file, data);
    case "resources":
      return validateDeclarationDocument(file, data, {
        declarationKeys: resourceKeys,
        duplicateKind: "resource",
        expectedSchema: resourcesDocumentSchema,
        idKind: "resources document",
        listName: "resources",
        rootKeys: resourcesDocumentKeys,
        validateItem: (diagnostics, path, item) => {
          validateOptionalString(diagnostics, file, `${path}/path`, item.path, "resource path must be a non-empty string.");
        },
      });
    case "schema":
      return validateDeclarationDocument(file, data, {
        declarationKeys: schemaEntryKeys,
        duplicateKind: "schema",
        expectedSchema: schemaDocumentSchema,
        idKind: "schema document",
        listName: "schemas",
        rootKeys: schemaDocumentKeys,
        validateRoot: (diagnostics) => {
          diagnostics.push(...validateSchemaDocumentKind(file, isRecord(data) ? data.kind : undefined));
        },
        validateItem: (diagnostics, path, item) => {
          validateSchemaFields(diagnostics, file, `${path}/fields`, item.fields);
        },
      });
    case "scene":
      return validateSceneDocument(projectPath, file, data, context);
    case "systems":
      return validateSystemsDocument(projectPath, file, data);
    case "target":
      return validateTargetProfileDocument(file, data);
    case "ui":
      return validateUiDocument(file, data);
    case "unknown":
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_DOCUMENT_KIND_UNKNOWN",
          file,
          message: "Authoring document kind could not be determined from its file extension or schema.",
          suggestion: "Use a supported source extension such as .scene.json, .ui.json, or .materials.json.",
        }),
      ];
  }
}

async function validateGeneratorDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Generator provenance source document must be a JSON object.", data)];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, generatorDocumentKeys));
  if (data.schema !== generatorDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_GENERATOR_SCHEMA_INVALID",
        file,
        message: `Generator provenance source document must use schema '${generatorDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "generator provenance document");
  validateGeneratedPathString(diagnostics, file, "/module", data.module, "generator module must be a non-empty source path.");
  validateOptionalString(diagnostics, file, "/export", data.export, "generator export must be a non-empty string.");
  validateStringList(diagnostics, file, "/outputs", data.outputs, "generator outputs must be an array of non-empty project-relative paths.");
  if (data.overwritePolicy !== undefined) {
    validateEnumString(diagnostics, file, "/overwritePolicy", data.overwritePolicy, supportedGeneratorOverwritePolicies, "generator overwrite policy", "Use 'skip', 'replace', or 'manual'.");
  }
  validateOptionalString(diagnostics, file, "/inputHash", data.inputHash, "generator inputHash must be a non-empty string.");
  validateOptionalString(diagnostics, file, "/outputHash", data.outputHash, "generator outputHash must be a non-empty string.");
  if (data.lastRun !== undefined && !isRecord(data.lastRun)) {
    diagnostics.push(typeDiagnostic(file, "/lastRun", "generator lastRun must be an object when present.", data.lastRun));
  }
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateProjectDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics = validateRootDocument(file, data, projectDocumentSchema, "project authoring document", projectDocumentKeys);
  if (!isRecord(data)) {
    return diagnostics;
  }
  validateOptionalString(diagnostics, file, "/authoringVersion", data.authoringVersion, "authoringVersion must be a non-empty string.");
  validateStringList(diagnostics, file, "/sourceRoots", data.sourceRoots, "sourceRoots must be an array of non-empty project-relative paths.");
  validateStringList(diagnostics, file, "/buildTargets", data.buildTargets, "buildTargets must be an array of non-empty target ids.");
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateRuntimeDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Runtime config source document must be a JSON object.", data)];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, runtimeDocumentKeys));
  if (data.schema !== runtimeDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_RUNTIME_SCHEMA_INVALID",
        file,
        message: `Runtime config source document must use schema '${runtimeDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "runtime config document");

  const time = isRecord(data.time) ? data.time : undefined;
  if (time === undefined) {
    diagnostics.push(typeDiagnostic(file, "/time", "Runtime config time must define fixedDelta and paused.", data.time));
  } else {
    diagnostics.push(...unknownKeyDiagnostics(file, "/time", time, new Set(["fixedDelta", "paused"])));
    validateRequiredNumber(diagnostics, file, "/time/fixedDelta", time.fixedDelta, "runtime fixedDelta must be a finite number.");
    if (typeof time.fixedDelta === "number" && Number.isFinite(time.fixedDelta) && time.fixedDelta <= 0) {
      diagnostics.push(typeDiagnostic(file, "/time/fixedDelta", "runtime fixedDelta must be positive.", time.fixedDelta));
    }
    if (typeof time.paused !== "boolean") {
      diagnostics.push(typeDiagnostic(file, "/time/paused", "runtime paused must be a boolean.", time.paused));
    }
  }

  const window = isRecord(data.window) ? data.window : undefined;
  if (window === undefined) {
    diagnostics.push(typeDiagnostic(file, "/window", "Runtime config window must define width and height.", data.window));
  } else {
    diagnostics.push(...unknownKeyDiagnostics(file, "/window", window, new Set(["height", "title", "width"])));
    validateRequiredNumber(diagnostics, file, "/window/height", window.height, "runtime window height must be a finite number.");
    validateRequiredNumber(diagnostics, file, "/window/width", window.width, "runtime window width must be a finite number.");
    if (typeof window.height === "number" && Number.isFinite(window.height) && window.height <= 0) {
      diagnostics.push(typeDiagnostic(file, "/window/height", "runtime window height must be positive.", window.height));
    }
    if (typeof window.width === "number" && Number.isFinite(window.width) && window.width <= 0) {
      diagnostics.push(typeDiagnostic(file, "/window/width", "runtime window width must be positive.", window.width));
    }
    validateOptionalString(diagnostics, file, "/window/title", window.title, "runtime window title must be a non-empty string.");
  }

  const renderer = isRecord(data.renderer) ? data.renderer : undefined;
  if (data.renderer !== undefined && renderer === undefined) {
    diagnostics.push(typeDiagnostic(file, "/renderer", "Runtime renderer config must be a JSON object.", data.renderer));
  }
  if (renderer !== undefined) {
    diagnostics.push(...unknownKeyDiagnostics(file, "/renderer", renderer, new Set(["antialias", "bloom", "colorGrading", "renderLook", "renderPath"])));
    const antialias = readString(renderer.antialias);
    if (renderer.antialias !== undefined && (antialias === undefined || !supportedRendererAntialiasModes.has(antialias))) {
      diagnostics.push(typeDiagnostic(file, "/renderer/antialias", "runtime renderer antialias must be one of none, msaa2, msaa4, msaa8, fxaa, taa, or smaa.", renderer.antialias));
    }
    if (renderer.renderPath !== undefined && renderer.renderPath !== "forward") {
      diagnostics.push(typeDiagnostic(file, "/renderer/renderPath", "runtime renderer renderPath must be 'forward'.", renderer.renderPath));
    }
    const bloom = isRecord(renderer.bloom) ? renderer.bloom : undefined;
    if (renderer.bloom !== undefined && bloom === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/bloom", "runtime renderer bloom must be a JSON object.", renderer.bloom));
    }
    if (bloom !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/bloom", bloom, new Set(["enabled", "intensity", "threshold"])));
      if (typeof bloom.enabled !== "boolean") {
        diagnostics.push(typeDiagnostic(file, "/renderer/bloom/enabled", "runtime renderer bloom enabled must be a boolean.", bloom.enabled));
      }
      validateRequiredNumber(diagnostics, file, "/renderer/bloom/intensity", bloom.intensity, "runtime renderer bloom intensity must be a finite number.");
      validateRequiredNumber(diagnostics, file, "/renderer/bloom/threshold", bloom.threshold, "runtime renderer bloom threshold must be a finite number.");
      if (typeof bloom.intensity === "number" && Number.isFinite(bloom.intensity) && bloom.intensity < 0) {
        diagnostics.push(typeDiagnostic(file, "/renderer/bloom/intensity", "runtime renderer bloom intensity must be non-negative.", bloom.intensity));
      }
      if (typeof bloom.threshold === "number" && Number.isFinite(bloom.threshold) && bloom.threshold < 0) {
        diagnostics.push(typeDiagnostic(file, "/renderer/bloom/threshold", "runtime renderer bloom threshold must be non-negative.", bloom.threshold));
      }
    }
    const colorGrading = isRecord(renderer.colorGrading) ? renderer.colorGrading : undefined;
    if (renderer.colorGrading !== undefined && colorGrading === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/colorGrading", "runtime renderer colorGrading must be a JSON object.", renderer.colorGrading));
    }
    if (colorGrading !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/colorGrading", colorGrading, new Set(["contrast", "exposure", "lut", "saturation", "temperature", "tint", "toneMapping"])));
      for (const key of ["contrast", "temperature", "tint"]) {
        validateOptionalNumber(diagnostics, file, `/renderer/colorGrading/${key}`, colorGrading[key], `runtime renderer colorGrading ${key} must be finite.`);
      }
      validateOptionalPositiveNumber(diagnostics, file, "/renderer/colorGrading/exposure", colorGrading.exposure, "runtime renderer colorGrading exposure must be positive.");
      validateOptionalNonNegativeNumber(diagnostics, file, "/renderer/colorGrading/saturation", colorGrading.saturation, "runtime renderer colorGrading saturation must be non-negative.");
      const toneMapping = readString(colorGrading.toneMapping);
      if (colorGrading.toneMapping !== undefined && (toneMapping === undefined || !new Set(["aces", "linear", "none", "reinhard"]).has(toneMapping))) {
        diagnostics.push(typeDiagnostic(file, "/renderer/colorGrading/toneMapping", "runtime renderer colorGrading toneMapping must be aces, linear, none, or reinhard.", colorGrading.toneMapping));
      }
      validateOptionalString(diagnostics, file, "/renderer/colorGrading/lut", colorGrading.lut, "runtime renderer colorGrading LUT must be a non-empty asset id.");
    }
    if (renderer.renderLook !== undefined) {
      validateRuntimeRenderLook(diagnostics, file, renderer.renderLook);
    }
  }

  return diagnostics;
}

function validateRuntimeRenderLook(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const renderLook = isRecord(value) ? value : undefined;
  if (renderLook === undefined) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook", "runtime renderer renderLook must be a JSON object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/renderLook", renderLook, new Set(["version", "profile", "overrides"])));
  if (renderLook.version !== 1) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/version", "runtime renderer renderLook version must be 1.", renderLook.version));
  }
  const profile = readString(renderLook.profile);
  if (profile === undefined || (!supportedRenderLookProfiles.has(profile) && !supportedRenderLookReservedProfiles.has(profile))) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/profile", "runtime renderer renderLook profile must be 'parity' or 'balanced'.", renderLook.profile));
  } else if (supportedRenderLookReservedProfiles.has(profile)) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/profile", "runtime renderer renderLook profile is reserved until runtime screenshot proof promotes it.", renderLook.profile));
  }
  const overrides = isRecord(renderLook.overrides) ? renderLook.overrides : undefined;
  if (renderLook.overrides !== undefined && overrides === undefined) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/overrides", "runtime renderer renderLook overrides must be a JSON object.", renderLook.overrides));
  }
  if (overrides !== undefined) {
    diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/renderLook/overrides", overrides, new Set(["bloomIntensity", "contrast", "environmentIntensity", "exposure", "saturation", "shadowQuality"])));
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "bloomIntensity", 0, 2);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "contrast", -0.5, 0.5);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "environmentIntensity", 0, 4);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "exposure", 0.25, 4);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "saturation", 0, 2);
    if (overrides.shadowQuality !== undefined) {
      const shadowQuality = readString(overrides.shadowQuality);
      if (shadowQuality === undefined || !supportedRenderLookShadowQualities.has(shadowQuality)) {
        diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/overrides/shadowQuality", "runtime renderer renderLook shadowQuality must be off, low, medium, or high.", overrides.shadowQuality));
      }
    }
  }
}

function validateRuntimeRenderLookNumber(diagnostics: IAuthoringDiagnostic[], file: string, overrides: Record<string, unknown>, key: string, minimum: number, maximum: number): void {
  const value = overrides[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push(typeDiagnostic(file, `/renderer/renderLook/overrides/${key}`, `runtime renderer renderLook ${key} must be between ${minimum} and ${maximum}.`, value));
  }
}

async function validateTargetProfileDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Target profile source document must be a JSON object.", data)];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, targetProfileDocumentKeys));
  if (data.schema !== targetProfileDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_TARGET_PROFILE_SCHEMA_INVALID",
        file,
        message: `Target profile source document must use schema '${targetProfileDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "target profile document");

  const targets = readArray(data.targets);
  const supportedTargets = new Set(["web", "desktop"]);
  if (targets === undefined || targets.length === 0 || targets.some((target) => readString(target) === undefined || !supportedTargets.has(readString(target) ?? ""))) {
    diagnostics.push(typeDiagnostic(file, "/targets", "target profile targets must be a non-empty array of 'web' or 'desktop'.", data.targets));
  }

  const budgets = isRecord(data.budgets) ? data.budgets : undefined;
  if (data.budgets !== undefined && budgets === undefined) {
    diagnostics.push(typeDiagnostic(file, "/budgets", "target profile budgets must be a JSON object.", data.budgets));
  }
  if (budgets !== undefined) {
    diagnostics.push(...unknownKeyDiagnostics(file, "/budgets", budgets, new Set(["maxAssetBytes", "maxBundleBytes", "supportedModelFormats", "supportedTextureFormats"])));
    validateOptionalPositiveNumber(diagnostics, file, "/budgets/maxAssetBytes", budgets.maxAssetBytes, "target profile maxAssetBytes must be a positive finite number.");
    validateOptionalPositiveNumber(diagnostics, file, "/budgets/maxBundleBytes", budgets.maxBundleBytes, "target profile maxBundleBytes must be a positive finite number.");
    validateSupportedStringList(diagnostics, file, "/budgets/supportedModelFormats", budgets.supportedModelFormats, new Set(["glb", "gltf"]), "target profile supportedModelFormats must only include 'glb' or 'gltf'.");
    validateSupportedStringList(diagnostics, file, "/budgets/supportedTextureFormats", budgets.supportedTextureFormats, new Set(["jpeg", "png", "webp"]), "target profile supportedTextureFormats must only include 'jpeg', 'png', or 'webp'.");
  }

  if (data.performance !== undefined && !isRecord(data.performance)) {
    diagnostics.push(typeDiagnostic(file, "/performance", "target profile performance must be a JSON object.", data.performance));
  }

  return diagnostics;
}

async function validateSceneDocument(
  projectPath: string,
  file: string,
  data: unknown,
  context: IAuthoringValidationContext = { materialIds: [] },
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_SHAPE_INVALID",
        file,
        message: "Scene source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }

  diagnostics.push(...unknownKeyDiagnostics(file, "", data, sceneDocumentKeys));

  if (data.schema !== sceneDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_SCHEMA_INVALID",
        file,
        message: `Scene source document must use schema '${sceneDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }

  validateLogicalId(diagnostics, file, "/id", data.id, "scene");
  if (data.kind !== undefined) {
    validateEnumString(diagnostics, file, "/kind", data.kind, supportedSceneLifecycleKinds, "scene lifecycle kind", "Use 'credits', 'cutscene', 'level', 'loading', 'menu', 'overlay', or 'system'.");
  }
  if (data.activation !== undefined) {
    validateEnumString(diagnostics, file, "/activation", data.activation, supportedSceneActivationPolicies, "scene activation policy", "Use 'additive', 'exclusive', 'loading', 'overlay', or 'persistent'.");
  }
  validateOptionalBoolean(diagnostics, file, "/initial", data.initial, "scene initial flag must be a boolean.");

  const prefabs = collectIds(diagnostics, file, "/prefabs", readArray(data.prefabs), "prefab", prefabKeys);
  const resources = collectIds(diagnostics, file, "/resources", readArray(data.resources), "resource", resourceKeys);
  const systems = collectIds(diagnostics, file, "/systems", readArray(data.systems), "system", systemKeys);
  const scriptLifecycles = collectIds(diagnostics, file, "/scriptLifecycles", readArray(data.scriptLifecycles), "script lifecycle", scriptLifecycleKeys);
  const uiNodes = collectUiNodeIds(diagnostics, file, data.ui);
  const entities = collectEntityIds(diagnostics, file, data.entities);
  const instances = collectInstanceIds(diagnostics, file, data.instances);

  validateEntities(diagnostics, file, data.entities, entities, prefabs, context.materialIds);
  validateInstances(diagnostics, file, data.instances, entities, instances, [...prefabs, ...(context.prefabDocumentIds ?? [])], context.materialIds);
  validatePrefabs(diagnostics, file, data.prefabs);
  validateResources(diagnostics, file, data.resources);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  await validateScriptLifecycles(diagnostics, projectPath, file, data.scriptLifecycles, scriptLifecycles);
  validateUi(diagnostics, file, data.ui, uiNodes, resources);

  return sortAuthoringDiagnostics(diagnostics);
}

interface IDeclarationDocumentValidationOptions {
  declarationKeys: ReadonlySet<string>;
  duplicateKind: string;
  expectedSchema: string;
  idKind: string;
  listName: string;
  rootKeys: ReadonlySet<string>;
  validateRoot?: (diagnostics: IAuthoringDiagnostic[]) => void;
  validateItem?: (diagnostics: IAuthoringDiagnostic[], path: string, item: Record<string, unknown>) => void | Promise<void>;
}

async function validateDeclarationDocument(
  file: string,
  data: unknown,
  options: IDeclarationDocumentValidationOptions,
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Structured authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }

  diagnostics.push(...unknownKeyDiagnostics(file, "", data, options.rootKeys));
  validateDocumentHeader(diagnostics, file, data, options.expectedSchema, options.idKind);
  options.validateRoot?.(diagnostics);

  const list = readArray(data[options.listName]);
  if (data[options.listName] !== undefined && list === undefined) {
    diagnostics.push(typeDiagnostic(file, `/${options.listName}`, `${options.listName} must be an array.`, data[options.listName]));
    return sortAuthoringDiagnostics(diagnostics);
  }
  collectIds(diagnostics, file, `/${options.listName}`, list, options.duplicateKind, options.declarationKeys);
  for (const [index, item] of list?.entries() ?? []) {
    if (isRecord(item)) {
      await options.validateItem?.(diagnostics, `/${options.listName}/${index}`, item);
    }
  }
  return sortAuthoringDiagnostics(diagnostics);
}

function validateRootDocument(
  file: string,
  data: unknown,
  expectedSchema: string,
  idKind: string,
  rootKeys: ReadonlySet<string>,
): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Structured authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, rootKeys));
  validateDocumentHeader(diagnostics, file, data, expectedSchema, idKind);
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateUiDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "UI authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, uiDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, uiDocumentSchema, "ui document");
  const nodes = collectIds(diagnostics, file, "/nodes", readArray(data.nodes), "ui-node", uiNodeKeys);
  validateUiNodes(diagnostics, file, data.nodes);
  const bindings = readArray(data.bindings);
  if (data.bindings !== undefined && bindings === undefined) {
    diagnostics.push(typeDiagnostic(file, "/bindings", "bindings must be an array.", data.bindings));
  }
  bindings?.forEach((binding, index) => {
    const path = `/bindings/${index}`;
    if (!isRecord(binding)) {
      diagnostics.push(typeDiagnostic(file, path, "ui binding must be an object.", binding));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, binding, uiBindingKeys));
    const node = readString(binding.node);
    if (node === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/node`, "ui binding node must be a non-empty ui node id.", binding.node));
    } else if (!nodes.includes(node)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/node`, "ui-node", node, nodes));
    }
    if (binding.resource !== undefined && readString(binding.resource) === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/resource`, "ui binding resource must be a non-empty resource id.", binding.resource));
    }
    validateUiBindingFormat(diagnostics, file, path, binding);
  });
  return sortAuthoringDiagnostics(diagnostics);
}

async function validatePrefabDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Prefab authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, prefabDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, prefabDocumentSchema, "prefab document");
  const entities = collectEntityIds(diagnostics, file, data.entities);
  validateEntities(diagnostics, file, data.entities, entities, [], []);
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateSystemsDocument(projectPath: string, file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Systems authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, systemsDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, systemsDocumentSchema, "systems document");
  const systems = collectIds(diagnostics, file, "/systems", readArray(data.systems), "system", systemKeys);
  const scriptLifecycles = collectIds(diagnostics, file, "/scriptLifecycles", readArray(data.scriptLifecycles), "script lifecycle", scriptLifecycleKeys);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  await validateScriptLifecycles(diagnostics, projectPath, file, data.scriptLifecycles, scriptLifecycles);
  return sortAuthoringDiagnostics(diagnostics);
}

function validateUiNodes(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  for (const [index, node] of readArray(value)?.entries() ?? []) {
    if (!isRecord(node)) {
      continue;
    }
    const path = `/nodes/${index}`;
    const type = readString(node.type);
    if (node.type !== undefined && (type === undefined || !supportedUiNodeTypes.has(type))) {
      validateEnumString(diagnostics, file, `${path}/type`, node.type, supportedUiNodeTypes, "UI node type", "Use 'text', 'textInput', 'button', 'image', 'bar', 'slider', 'row', 'column', 'stack', or 'component'.");
    }
    validateOptionalString(diagnostics, file, `${path}/text`, node.text, "UI node text must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${path}/label`, node.label, "UI node label must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${path}/action`, node.action, "UI node action must be a non-empty action id.");
    validateOptionalString(diagnostics, file, `${path}/src`, node.src, "UI image src must be a non-empty asset id or source path.");
    validateOptionalNumber(diagnostics, file, `${path}/value`, node.value, "UI node value must be a finite number.");
    validateUiComponentInstance(diagnostics, file, `${path}/component`, node.component);
    validateUiStyle(diagnostics, file, `${path}/style`, node.style);
    validateUiResponsiveRules(diagnostics, file, `${path}/responsive`, node.responsive);
    validateUiVirtualRange(diagnostics, file, `${path}/virtualRange`, node.virtualRange);
  }
}

function validateUiResponsiveRules(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  const rules = readArray(value);
  if (rules === undefined) {
    diagnostics.push(typeDiagnostic(file, path, "UI responsive rules must be an array.", value));
    return;
  }
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const rulePath = `${path}/${index}`;
    if (!isRecord(rule)) {
      diagnostics.push(typeDiagnostic(file, rulePath, "UI responsive rule must be an object.", rule));
      continue;
    }
    const target = readString(rule.target);
    if (target === undefined || !["desktop", "mobile", "tablet"].includes(target)) {
      diagnostics.push(typeDiagnostic(file, `${rulePath}/target`, "UI responsive target must be desktop, mobile, or tablet.", rule.target));
    } else if (seen.has(target)) {
      diagnostics.push(typeDiagnostic(file, `${rulePath}/target`, `UI responsive target '${target}' is duplicated.`, rule.target));
    } else {
      seen.add(target);
    }
    if (rule.layout !== undefined && !isRecord(rule.layout)) {
      diagnostics.push(typeDiagnostic(file, `${rulePath}/layout`, "UI responsive layout must be an object when present.", rule.layout));
    }
  }
}

function validateUiVirtualRange(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "UI virtual range must be an object.", value));
    return;
  }
  for (const key of ["itemCount", "itemExtent", "viewportExtent"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `UI virtual range ${key} must be a finite positive number.`, value[key]));
    }
  }
  if (value.buffer !== undefined && (typeof value.buffer !== "number" || !Number.isFinite(value.buffer) || value.buffer < 0)) {
    diagnostics.push(typeDiagnostic(file, `${path}/buffer`, "UI virtual range buffer must be a finite non-negative number.", value.buffer));
  }
  if (value.orientation !== undefined && value.orientation !== "horizontal" && value.orientation !== "vertical") {
    diagnostics.push(typeDiagnostic(file, `${path}/orientation`, "UI virtual range orientation must be horizontal or vertical.", value.orientation));
  }
}

function validateUiComponentInstance(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "UI component instance must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, uiComponentInstanceKeys));
  if (readString(value.ref) === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/ref`, "UI component ref must be a non-empty component id.", value.ref));
  }
  if (value.props !== undefined && !isRecord(value.props)) {
    diagnostics.push(typeDiagnostic(file, `${path}/props`, "UI component props must be an object when present.", value.props));
  }
}

function validateUiStyle(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "UI style must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, uiStyleKeys));
  for (const key of ["backgroundColor", "borderColor", "color"] as const) {
    validateOptionalString(diagnostics, file, `${path}/${key}`, value[key], `UI style ${key} must be a non-empty color string.`);
  }
  for (const key of ["borderRadius", "borderWidth", "fontSize", "opacity"] as const) {
    validateOptionalNumber(diagnostics, file, `${path}/${key}`, value[key], `UI style ${key} must be a finite number.`);
  }
  if (value.textAlign !== undefined) {
    validateEnumString(diagnostics, file, `${path}/textAlign`, value.textAlign, supportedUiTextAlignments, "UI text alignment", "Use 'left', 'center', or 'right'.");
  }
  if (value.textDecoration !== undefined) {
    validateEnumString(diagnostics, file, `${path}/textDecoration`, value.textDecoration, supportedUiTextDecorations, "UI text decoration", "Use 'none', 'underline', or 'lineThrough'.");
  }
  validateOptionalString(diagnostics, file, `${path}/fontWeight`, value.fontWeight, "UI style fontWeight must be a non-empty string.");
  validateOptionalBoolean(diagnostics, file, `${path}/wrap`, value.wrap, "UI style wrap must be a boolean.");
}

function validateDocumentHeader(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  data: Record<string, unknown>,
  expectedSchema: string,
  idKind: string,
): void {
  if (data.schema !== expectedSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SCHEMA_INVALID",
        file,
        message: `Structured authoring document must use schema '${expectedSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, idKind);
}

function validatePrefabs(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const prefabs = readArray(value);
  if (value !== undefined && prefabs === undefined) {
    diagnostics.push(typeDiagnostic(file, "/prefabs", "prefabs must be an array.", value));
    return;
  }
  prefabs?.forEach((prefab, index) => {
    if (!isRecord(prefab)) {
      return;
    }
    const primitive = readString(prefab.primitive);
    if (prefab.primitive !== undefined && (primitive === undefined || !supportedPrefabPrimitives.has(primitive))) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_PREFAB_PRIMITIVE_UNKNOWN",
          file,
          message: `Unknown prefab primitive '${String(prefab.primitive)}'.`,
          path: `/prefabs/${index}/primitive`,
          value: prefab.primitive,
          suggestion: "Use 'box', 'capsule', 'cone', 'cylinder', 'plane', or 'sphere'.",
        }),
      );
    }
    if (prefab.color !== undefined && readString(prefab.color) === undefined) {
      diagnostics.push(typeDiagnostic(file, `/prefabs/${index}/color`, "prefab color must be a non-empty string.", prefab.color));
    }
    if (prefab.asset !== undefined && readString(prefab.asset) === undefined) {
      diagnostics.push(typeDiagnostic(file, `/prefabs/${index}/asset`, "prefab asset must be a non-empty project-relative asset path.", prefab.asset));
    }
  });
}

function collectEntityIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  const entities = readArray(value);
  if (value !== undefined && entities === undefined) {
    diagnostics.push(typeDiagnostic(file, "/entities", "entities must be an array.", value));
    return [];
  }
  return collectIds(diagnostics, file, "/entities", entities, "entity", entityKeys);
}

function collectInstanceIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  const instances = readArray(value);
  if (value !== undefined && instances === undefined) {
    diagnostics.push(typeDiagnostic(file, "/instances", "instances must be an array.", value));
    return [];
  }
  return collectIds(diagnostics, file, "/instances", instances, "entity", instanceKeys);
}

function collectUiNodeIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, "/ui", "ui must be an object.", value));
    return [];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/ui", value, uiKeys));
  const nodes = readArray(value.nodes);
  if (value.nodes !== undefined && nodes === undefined) {
    diagnostics.push(typeDiagnostic(file, "/ui/nodes", "ui.nodes must be an array.", value.nodes));
    return [];
  }
  return collectIds(diagnostics, file, "/ui/nodes", nodes, "ui-node", uiNodeKeys);
}

function collectIds(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  basePath: string,
  values: unknown[] | undefined,
  kind: string,
  allowedKeys: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  if (values === undefined) {
    return ids;
  }

  const seen = new Map<string, string>();
  values.forEach((value, index) => {
    const path = `${basePath}/${index}`;
    if (!isRecord(value)) {
      diagnostics.push(typeDiagnostic(file, path, `${kind} declaration must be an object.`, value));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, value, allowedKeys));
    const id = kind === "resource"
      ? validateResourceId(diagnostics, file, `${path}/id`, value.id)
      : kind === "entity"
        ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
        : kind === "input axis"
          ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
          : kind === "schema"
            ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
          : validateLogicalId(diagnostics, file, `${path}/id`, value.id, kind);
    if (id === undefined) {
      return;
    }
    const existingPath = seen.get(id);
    if (existingPath !== undefined) {
      diagnostics.push(
        authoringDiagnostic({
          code: duplicateIdCode(kind),
          file,
          message: `Duplicate ${kind} id '${id}'.`,
          path: `${path}/id`,
          value: id,
          related: [{ file, path: existingPath, message: `First ${kind} declaration with this id.` }],
          suggestion: `Give each ${kind} a stable unique id.`,
        }),
      );
    } else {
      seen.set(id, `${path}/id`);
      ids.push(id);
    }
  });
  return ids;
}

function validateEntities(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  entityIds: readonly string[],
  prefabIds: readonly string[],
  materialIds: readonly string[],
): void {
  const entities = readArray(value);
  if (entities === undefined) {
    return;
  }

  entities.forEach((entity, index) => {
    if (!isRecord(entity)) {
      return;
    }
    const path = `/entities/${index}`;
    const prefab = readString(entity.prefab);
    if (entity.prefab !== undefined && prefab === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/prefab`, "Entity prefab must be a non-empty string.", entity.prefab));
    } else if (prefab !== undefined && !prefabIds.includes(prefab)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/prefab`, "prefab", prefab, prefabIds));
    }

    validateTransform(diagnostics, file, `${path}/transform`, entity.transform);
    validateComponents(diagnostics, file, `${path}/components`, entity.components, entityIds, materialIds);
  });
}

function validateInstances(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  entityIds: readonly string[],
  instanceIds: readonly string[],
  prefabIds: readonly string[],
  materialIds: readonly string[],
): void {
  const instances = readArray(value);
  if (instances === undefined) {
    return;
  }

  instances.forEach((instance, index) => {
    if (!isRecord(instance)) {
      return;
    }
    const path = `/instances/${index}`;
    const id = readString(instance.id);
    if (id !== undefined && entityIds.includes(id)) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_DUPLICATE_ENTITY_ID",
          file,
          message: `Duplicate entity id '${id}' after compact instance expansion.`,
          path: `${path}/id`,
          value: id,
          suggestion: "Use a stable instance id that does not collide with scene.entities.",
        }),
      );
    }
    const prefab = readString(instance.prefab);
    if (prefab === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/prefab`, "Compact instance prefab must be a non-empty string.", instance.prefab));
    } else if (!prefabIds.includes(prefab)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/prefab`, "prefab", prefab, prefabIds));
    }

    validateTransform(diagnostics, file, `${path}/transform`, instance.transform);
    validateComponents(diagnostics, file, `${path}/components`, instance.components, [...entityIds, ...instanceIds], materialIds);
  });
}

function validateTransform(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "Transform must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, transformKeys));
  for (const key of transformKeys) {
    const vector = value[key];
    if (vector === undefined) {
      continue;
    }
    if (!Array.isArray(vector) || vector.length !== 3 || vector.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_VECTOR3_INVALID",
          file,
          message: `Transform ${key} must be a three-number vector.`,
          path: `${path}/${key}`,
          value: vector,
          suggestion: "Use [x, y, z] numeric values.",
        }),
      );
    }
  }
}

function validateComponents(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  entityIds: readonly string[],
  materialIds: readonly string[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "components must be an object keyed by component kind.", value));
    return;
  }

  for (const [kind, component] of Object.entries(value)) {
    if (!isRecord(component)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${escapeJsonPointer(kind)}`, `component '${kind}' must be an object.`, component));
      continue;
    }
    if (kind === "camera") {
      validateCameraComponent(diagnostics, file, `${path}/camera`, component, entityIds);
    } else if (kind === "MeshRenderer" || kind === "meshRenderer") {
      validateMeshRendererComponent(diagnostics, file, `${path}/${escapeJsonPointer(kind)}`, component, materialIds);
    } else if (kind === "Light" || kind === "light") {
      validateLightComponent(diagnostics, file, `${path}/${escapeJsonPointer(kind)}`, component);
    } else if (kind === "RenderLayers") {
      validateRenderLayersComponent(diagnostics, file, `${path}/RenderLayers`, component);
    } else if (kind === "RigidBody") {
      validateRigidBodyComponent(diagnostics, file, `${path}/RigidBody`, component);
    } else if (kind === "Collider") {
      validateColliderComponent(diagnostics, file, `${path}/Collider`, component);
    } else if (kind === "CharacterController") {
      validateCharacterControllerComponent(diagnostics, file, `${path}/CharacterController`, component);
    } else if (kind === "KinematicMover") {
      validateKinematicMoverComponent(diagnostics, file, `${path}/KinematicMover`, component);
    } else if (kind === "Visibility") {
      validateVisibilityComponent(diagnostics, file, `${path}/Visibility`, component);
    }
  }
}

function validateMeshRendererComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>, materialIds: readonly string[]): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, meshRendererComponentKeys));
  const mesh = readString(value.mesh);
  if (value.mesh !== undefined && mesh === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/mesh`, "mesh renderer mesh must be a non-empty mesh id.", value.mesh));
  }
  const material = readString(value.material);
  if (value.material !== undefined && material === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/material`, "mesh renderer material must be a non-empty material id.", value.material));
  } else if (material !== undefined && materialIds.length > 0 && !materialIds.includes(material)) {
    diagnostics.push(missingReferenceDiagnostic(file, `${path}/material`, "material", material, materialIds));
  }
  validateOptionalBoolean(diagnostics, file, `${path}/visible`, value.visible, "mesh renderer visible must be a boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/castShadow`, value.castShadow, "mesh renderer castShadow must be a boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/receiveShadow`, value.receiveShadow, "mesh renderer receiveShadow must be a boolean.");
}

function validateLightComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, lightComponentKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedLightKinds, "light kind", "Use 'ambient', 'directional', 'point', or 'spot'.");
  validateRequiredNumber(diagnostics, file, `${path}/intensity`, value.intensity, "light intensity must be a finite number.");
  if (value.color === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/color`, "light color must be a non-empty string or RGB/RGBA number array.", value.color));
  } else if (readString(value.color) === undefined && !isNumberTuple(value.color, 3, 4)) {
    diagnostics.push(typeDiagnostic(file, `${path}/color`, "light color must be a non-empty string or RGB/RGBA number array.", value.color));
  }
  validateOptionalNumber(diagnostics, file, `${path}/range`, value.range, "light range must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/angle`, value.angle, "light angle must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/shadowBias`, value.shadowBias, "light shadowBias must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/shadowNormalBias`, value.shadowNormalBias, "light shadowNormalBias must be a finite number.");
}

function validateRenderLayersComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, renderLayersComponentKeys));
  if (!Array.isArray(value.layers) || value.layers.length === 0 || value.layers.some((layer) => readString(layer) === undefined)) {
    diagnostics.push(typeDiagnostic(file, `${path}/layers`, "render layers must be a non-empty string array.", value.layers));
  }
}

function validateRigidBodyComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, rigidBodyComponentKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedRigidBodyKinds, "rigid body kind", "Use 'dynamic', 'kinematic', or 'static'. Use 'static' for immovable fixed objects.", {
    allowed: ["dynamic", "kinematic", "static"],
    docs: "docs/contracts/ir.md",
    instruction: "Replace RigidBody.kind with 'dynamic', 'kinematic', or 'static'. If you wrote 'fixed', use 'static'.",
    snippet: "{ \"RigidBody\": { \"kind\": \"static\" } }",
  });
  if (value.angularVelocity !== undefined && !isVector3(value.angularVelocity)) {
    diagnostics.push(typeDiagnostic(file, `${path}/angularVelocity`, "rigid body angularVelocity must be a three-number vector.", value.angularVelocity));
  }
  if (value.enabledRotations !== undefined && !isBooleanVector3(value.enabledRotations)) {
    diagnostics.push(typeDiagnostic(file, `${path}/enabledRotations`, "rigid body enabledRotations must be a three-boolean vector.", value.enabledRotations));
  }
  if (value.enabledTranslations !== undefined && !isBooleanVector3(value.enabledTranslations)) {
    diagnostics.push(typeDiagnostic(file, `${path}/enabledTranslations`, "rigid body enabledTranslations must be a three-boolean vector.", value.enabledTranslations));
  }
  validateCcdComponent(diagnostics, file, `${path}/ccd`, value.ccd);
  validateOptionalNumber(diagnostics, file, `${path}/mass`, value.mass, "rigid body mass must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/inverseMass`, value.inverseMass, "rigid body inverseMass must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/damping`, value.damping, "rigid body damping must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/gravityScale`, value.gravityScale, "rigid body gravityScale must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/sleepThreshold`, value.sleepThreshold, "rigid body sleepThreshold must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/solverIterations`, value.solverIterations, "rigid body solverIterations must be a finite number.");
  if (value.velocity !== undefined && !isVector3(value.velocity)) {
    diagnostics.push(typeDiagnostic(file, `${path}/velocity`, "rigid body velocity must be a three-number vector.", value.velocity));
  }
}

function validateCcdComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "rigid body ccd must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, new Set(["enabled", "maxSubsteps", "mode"])));
  validateOptionalBoolean(diagnostics, file, `${path}/enabled`, value.enabled, "rigid body ccd enabled must be a boolean.");
  validateEnumString(diagnostics, file, `${path}/mode`, value.mode, new Set(["linear", "swept-aabb"]), "ccd mode", "Use 'linear' or 'swept-aabb'.");
  validateOptionalNumber(diagnostics, file, `${path}/maxSubsteps`, value.maxSubsteps, "rigid body ccd maxSubsteps must be a finite number.");
}

function validateColliderComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, colliderComponentKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedColliderKinds, "collider kind", "Use 'box', 'capsule', 'cylinder', 'mesh', or 'sphere'.");
  if (value.center !== undefined && !isVector3(value.center)) {
    diagnostics.push(typeDiagnostic(file, `${path}/center`, "collider center must be a three-number vector.", value.center));
  }
  if (value.size !== undefined && !isVector3(value.size)) {
    diagnostics.push(typeDiagnostic(file, `${path}/size`, "collider size must be a three-number vector.", value.size));
  }
  validateOptionalNumber(diagnostics, file, `${path}/radius`, value.radius, "collider radius must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/height`, value.height, "collider height must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/friction`, value.friction, "collider friction must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/restitution`, value.restitution, "collider restitution must be a finite number.");
  validateOptionalBoolean(diagnostics, file, `${path}/trigger`, value.trigger, "collider trigger must be a boolean.");
  validateColliderSlope(diagnostics, file, `${path}/slope`, value.slope);
}

function validateCharacterControllerComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, characterControllerComponentKeys));
  validateRequiredString(diagnostics, file, `${path}/moveXAxis`, value.moveXAxis, "character controller moveXAxis must be a non-empty input axis id.");
  validateRequiredString(diagnostics, file, `${path}/moveZAxis`, value.moveZAxis, "character controller moveZAxis must be a non-empty input axis id.");
  validateRequiredNumber(diagnostics, file, `${path}/speed`, value.speed, "character controller speed must be a finite number.");
  validateEnumString(diagnostics, file, `${path}/grounding`, value.grounding, supportedCharacterControllerGrounding, "character controller grounding", "Use 'none' or 'raycast'.");
  validateOptionalBoolean(diagnostics, file, `${path}/blocking`, value.blocking, "character controller blocking must be a boolean.");
  validateOptionalNumber(diagnostics, file, `${path}/slopeLimit`, value.slopeLimit, "character controller slopeLimit must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/stepOffset`, value.stepOffset, "character controller stepOffset must be a finite number.");
  validateOptionalString(diagnostics, file, `${path}/interactAction`, value.interactAction, "character controller interactAction must be a non-empty input action id.");
  validateCharacterPushPolicy(diagnostics, file, `${path}/pushPolicy`, value.pushPolicy);
}

function validateColliderSlope(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "collider slope must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, new Set(["axis", "direction", "rise", "run"])));
  validateOptionalStringEnum(diagnostics, file, `${path}/axis`, value.axis, new Set(["x", "z"]), "collider slope axis must be 'x' or 'z'.");
  if (value.direction !== -1 && value.direction !== 1) {
    diagnostics.push(typeDiagnostic(file, `${path}/direction`, "collider slope direction must be -1 or 1.", value.direction));
  }
  validateRequiredPositiveNumber(diagnostics, file, `${path}/rise`, value.rise, "collider slope rise must be a positive finite number.");
  validateRequiredPositiveNumber(diagnostics, file, `${path}/run`, value.run, "collider slope run must be a positive finite number.");
}

function validateCharacterPushPolicy(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "character controller pushPolicy must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, new Set(["allowedLayers", "blockedWhenTooHeavy", "enabled", "impulseScale", "maxPushMass", "minMoveSpeed"])));
  validateOptionalStringArray(diagnostics, file, `${path}/allowedLayers`, value.allowedLayers, "character controller pushPolicy allowedLayers must be an array of non-empty layer strings.");
  validateOptionalBoolean(diagnostics, file, `${path}/blockedWhenTooHeavy`, value.blockedWhenTooHeavy, "character controller pushPolicy blockedWhenTooHeavy must be a boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/enabled`, value.enabled, "character controller pushPolicy enabled must be a boolean.");
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/impulseScale`, value.impulseScale, "character controller pushPolicy impulseScale must be a finite non-negative number.");
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/maxPushMass`, value.maxPushMass, "character controller pushPolicy maxPushMass must be a finite non-negative number.");
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/minMoveSpeed`, value.minMoveSpeed, "character controller pushPolicy minMoveSpeed must be a finite non-negative number.");
}

function validateKinematicMoverComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, kinematicMoverComponentKeys));
  validateEnumString(diagnostics, file, `${path}/mode`, value.mode, supportedKinematicMoverModes, "kinematic mover mode", "Use 'sine' or 'waypoints'.");
  validateRequiredNumber(diagnostics, file, `${path}/speed`, value.speed, "kinematic mover speed must be a finite number.");
  validateOptionalStringEnum(diagnostics, file, `${path}/axis`, value.axis, supportedKinematicMoverAxes, "kinematic mover axis must be 'x', 'y', or 'z'.");
  validateOptionalNumber(diagnostics, file, `${path}/phase`, value.phase, "kinematic mover phase must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/radius`, value.radius, "kinematic mover radius must be a finite number.");
  if (typeof value.radius === "number" && value.radius < 0) {
    diagnostics.push(typeDiagnostic(file, `${path}/radius`, "kinematic mover radius must be non-negative.", value.radius));
  }
  validateOptionalBoolean(diagnostics, file, `${path}/loop`, value.loop, "kinematic mover loop must be a boolean.");
  if (value.direction !== undefined && !isVector3(value.direction)) {
    diagnostics.push(typeDiagnostic(file, `${path}/direction`, "kinematic mover direction must be a three-number vector.", value.direction));
  }
  const waypoints = readArray(value.waypoints);
  if (value.waypoints !== undefined && (waypoints === undefined || waypoints.some((waypoint) => !isVector3(waypoint)))) {
    diagnostics.push(typeDiagnostic(file, `${path}/waypoints`, "kinematic mover waypoints must be an array of three-number vectors.", value.waypoints));
  }
}

function validateVisibilityComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, visibilityComponentKeys));
  if (typeof value.visible !== "boolean") {
    diagnostics.push(typeDiagnostic(file, `${path}/visible`, "visibility visible must be a boolean.", value.visible));
  }
}

function validateEnumString(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
  suggestion: string,
  fix?: IAuthoringDiagnostic["fix"],
): void {
  const text = readString(value);
  if (text === undefined || !allowed.has(text)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_COMPONENT_VALUE_INVALID",
        file,
        message: `Unknown ${label} '${String(value)}'.`,
        path,
        value,
        suggestion,
        ...(fix === undefined ? {} : { fix }),
      }),
    );
  }
}

function validateRequiredNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateCustomMeshSource(diagnostics: IAuthoringDiagnostic[], file: string, path: string, item: Record<string, unknown>): void {
  if (item.primitive !== undefined && item.primitive !== "custom") {
    diagnostics.push(typeDiagnostic(file, `${path}/primitive`, "custom mesh primitive must be 'custom' when present.", item.primitive));
  }
  if (item.storage !== undefined && item.storage !== "binary") {
    diagnostics.push(typeDiagnostic(file, `${path}/storage`, "custom mesh storage must be 'binary' when present.", item.storage));
  }
  if (!Array.isArray(item.attributes) || item.attributes.length === 0) {
    diagnostics.push(typeDiagnostic(file, `${path}/attributes`, "custom mesh attributes must be a non-empty array.", item.attributes));
    return;
  }
  let hasPosition = false;
  let vertexCount: number | undefined;
  let positionVertexCount: number | undefined;
  const seenAttributes = new Set<string>();
  for (const [index, attribute] of item.attributes.entries()) {
    const attributePath = `${path}/attributes/${index}`;
    if (!isRecord(attribute)) {
      diagnostics.push(typeDiagnostic(file, attributePath, "custom mesh attribute must be an object.", attribute));
      continue;
    }
    validateRequiredString(diagnostics, file, `${attributePath}/name`, attribute.name, "custom mesh attribute name must be a non-empty string.");
    if (typeof attribute.name === "string") {
      if (seenAttributes.has(attribute.name)) {
        diagnostics.push(typeDiagnostic(file, `${attributePath}/name`, "custom mesh attribute names must be unique.", attribute.name));
      }
      seenAttributes.add(attribute.name);
    }
    if (attribute.name === "position") {
      hasPosition = true;
    }
    if (![1, 2, 3, 4].includes(Number(attribute.itemSize))) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, "custom mesh attribute itemSize must be 1, 2, 3, or 4.", attribute.itemSize));
    } else if ((attribute.name === "position" || attribute.name === "normal") && attribute.itemSize !== 3) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, `custom mesh ${String(attribute.name)} attribute itemSize must be 3.`, attribute.itemSize));
    } else if ((attribute.name === "uv" || attribute.name === "uv1") && attribute.itemSize !== 2) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, `custom mesh ${String(attribute.name)} attribute itemSize must be 2.`, attribute.itemSize));
    } else if (attribute.name === "color" && attribute.itemSize !== 4) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, "custom mesh color attribute itemSize must be 4.", attribute.itemSize));
    }
    if (!Array.isArray(attribute.values) || attribute.values.length === 0 || attribute.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/values`, "custom mesh attribute values must be non-empty finite numbers.", attribute.values));
    } else if (typeof attribute.itemSize === "number" && Number.isInteger(attribute.itemSize) && attribute.values.length % attribute.itemSize !== 0) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/values`, "custom mesh attribute values length must be divisible by itemSize.", attribute.values));
    } else if (typeof attribute.itemSize === "number" && Number.isInteger(attribute.itemSize)) {
      const count = attribute.values.length / attribute.itemSize;
      vertexCount ??= count;
      if (count !== vertexCount) {
        diagnostics.push(typeDiagnostic(file, `${attributePath}/values`, "custom mesh attributes must have matching vertex counts.", attribute.values));
      }
      if (attribute.name === "position") {
        positionVertexCount = count;
      }
    }
  }
  if (!hasPosition) {
    diagnostics.push(typeDiagnostic(file, `${path}/attributes`, "custom mesh attributes must include a position attribute.", item.attributes));
  }
  if (item.indices !== undefined) {
    if (!Array.isArray(item.indices) || item.indices.length === 0 || item.indices.length % 3 !== 0 || item.indices.some((value) => !Number.isInteger(value) || Number(value) < 0)) {
      diagnostics.push(typeDiagnostic(file, `${path}/indices`, "custom mesh indices must be non-negative integers in complete triangles.", item.indices));
    } else if (positionVertexCount !== undefined) {
      for (const [index, value] of item.indices.entries()) {
        if (Number(value) >= positionVertexCount) {
          diagnostics.push(typeDiagnostic(file, `${path}/indices/${index}`, "custom mesh indices must be within the position vertex count.", value));
        }
      }
    }
  }
}

function validateOptionalNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateRequiredPositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalNonNegativeNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalNonNegativeInteger(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Number.isInteger(value) || Number(value) < 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalVec2(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "number" || !Number.isFinite(item)))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalStringEnum(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, allowed: ReadonlySet<string>, message: string): void {
  const text = readString(value);
  if (value !== undefined && (text === undefined || !allowed.has(text))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateRequiredString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (readString(value) === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && readString(value) === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalStringArray(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => readString(item) === undefined))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalBoolean(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function isVector3(value: unknown): value is [number, number, number] {
  return isNumberTuple(value, 3, 3);
}

function isBooleanVector3(value: unknown): value is [boolean, boolean, boolean] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "boolean");
}

function isNumberTuple(value: unknown, minLength: number, maxLength: number): boolean {
  return Array.isArray(value)
    && value.length >= minLength
    && value.length <= maxLength
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function validateCameraComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, entityIds: readonly string[]): void {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "camera component must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, cameraComponentKeys));
  const mode = readString(value.mode);
  if (value.mode !== undefined && (mode === undefined || !supportedCameraModes.has(mode))) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_CAMERA_MODE_UNKNOWN",
        file,
        message: `Unknown camera mode '${String(value.mode)}'.`,
        path: `${path}/mode`,
        value: value.mode,
        suggestion: "Use 'third-person-follow', 'perspective', or 'orthographic'.",
      }),
    );
  }
  const target = readString(value.target);
  if (value.target !== undefined && target === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/target`, "camera target must be a non-empty entity id.", value.target));
  } else if (target !== undefined && !entityIds.includes(target)) {
    diagnostics.push(missingReferenceDiagnostic(file, `${path}/target`, "entity", target, entityIds));
  }
  for (const key of ["far", "fovY", "near", "size"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `camera ${key} must be a positive finite number.`, value[key]));
    }
  }
}

function validateResources(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const resources = readArray(value);
  if (value !== undefined && resources === undefined) {
    diagnostics.push(typeDiagnostic(file, "/resources", "resources must be an array.", value));
    return;
  }
  resources?.forEach((resource, index) => {
    if (!isRecord(resource)) {
      return;
    }
    const path = `/resources/${index}/path`;
    const sourcePath = readString(resource.path);
    if (resource.path !== undefined && sourcePath === undefined) {
      diagnostics.push(typeDiagnostic(file, path, "resource path must be a non-empty string.", resource.path));
    } else if (sourcePath !== undefined && isGeneratedArtifactPath(sourcePath)) {
      diagnostics.push(generatedPathDiagnostic(file, path, sourcePath));
    }
    if (resource.value !== undefined && !isPortableJson(resource.value)) {
      diagnostics.push(typeDiagnostic(file, `/resources/${index}/value`, "resource value must be portable JSON.", resource.value));
    }
  });
}

function validateAssetDeclaration(diagnostics: IAuthoringDiagnostic[], path: string, item: Record<string, unknown>, file: string): void {
  const type = readString(item.type);
  if (type === "render-target") {
    validateRenderTargetAssetDeclaration(diagnostics, file, path, item);
    return;
  }
  const sourcePath = readString(item.path);
  if (sourcePath === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/path`, "asset path must be a non-empty source path.", item.path));
    return;
  }
  validateGeneratedPathString(diagnostics, file, `${path}/path`, item.path, "asset path must be a non-empty source path.");
  if (type === "texture") {
    validateOptionalVec2(diagnostics, file, `${path}/repeat`, item.repeat, "texture repeat must be a pair of finite numbers.");
    validateOptionalVec2(diagnostics, file, `${path}/offset`, item.offset, "texture offset must be a pair of finite numbers.");
    validateOptionalVec2(diagnostics, file, `${path}/center`, item.center, "texture center must be a pair of finite numbers.");
    validateOptionalNumber(diagnostics, file, `${path}/rotation`, item.rotation, "texture rotation must be finite.");
    validateOptionalStringEnum(diagnostics, file, `${path}/wrapS`, item.wrapS, new Set(["clampToEdge", "mirroredRepeat", "repeat"]), "texture wrapS must be clampToEdge, mirroredRepeat, or repeat.");
    validateOptionalStringEnum(diagnostics, file, `${path}/wrapT`, item.wrapT, new Set(["clampToEdge", "mirroredRepeat", "repeat"]), "texture wrapT must be clampToEdge, mirroredRepeat, or repeat.");
    validateOptionalStringEnum(diagnostics, file, `${path}/minFilter`, item.minFilter, new Set(["linear", "linearMipmapLinear", "linearMipmapNearest", "nearest", "nearestMipmapLinear", "nearestMipmapNearest"]), "texture minFilter must be a promoted texture filter.");
    validateOptionalStringEnum(diagnostics, file, `${path}/magFilter`, item.magFilter, new Set(["linear", "nearest"]), "texture magFilter must be linear or nearest.");
  }
}

function validateRenderTargetAssetDeclaration(diagnostics: IAuthoringDiagnostic[], file: string, path: string, item: Record<string, unknown>): void {
  validatePositiveNumber(diagnostics, file, `${path}/width`, item.width, "render target width must be a positive finite number.");
  validatePositiveNumber(diagnostics, file, `${path}/height`, item.height, "render target height must be a positive finite number.");
  const usage = readString(item.usage);
  if (usage !== undefined && usage !== "color" && usage !== "depth") {
    diagnostics.push(typeDiagnostic(file, `${path}/usage`, "render target usage must be 'color' or 'depth'.", item.usage));
  }
  const format = readString(item.format);
  if (format !== undefined && format !== "rgba8" && format !== "rgba16f" && format !== "depth24plus") {
    diagnostics.push(typeDiagnostic(file, `${path}/format`, "render target format must be 'rgba8', 'rgba16f', or 'depth24plus'.", item.format));
  }
  if (item.sampleCount !== undefined && (typeof item.sampleCount !== "number" || !Number.isInteger(item.sampleCount) || item.sampleCount < 1)) {
    diagnostics.push(typeDiagnostic(file, `${path}/sampleCount`, "render target sampleCount must be a positive integer.", item.sampleCount));
  }
}

function validatePositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function isPortableJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isPortableJson);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isPortableJson);
  }
  return false;
}

async function validateSystems(
  diagnostics: IAuthoringDiagnostic[],
  projectPath: string,
  file: string,
  value: unknown,
  _systemIds: readonly string[],
): Promise<void> {
  const systems = readArray(value);
  if (value !== undefined && systems === undefined) {
    diagnostics.push(typeDiagnostic(file, "/systems", "systems must be an array.", value));
    return;
  }

  for (const [index, system] of systems?.entries() ?? []) {
    if (!isRecord(system)) {
      continue;
    }
    const path = `/systems/${index}`;
    if (typeof system.run === "string" || typeof system.script === "string") {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_INLINE_SCRIPT_FORBIDDEN",
          file,
          message: "Inline script strings are not valid structured authoring source.",
          path: typeof system.run === "string" ? `${path}/run` : `${path}/script`,
          suggestion: "Reference a TypeScript module and named export instead.",
        }),
      );
      continue;
    }
    if (system.script !== undefined) {
      await validateScriptReference(diagnostics, projectPath, file, `${path}/script`, system.script);
    }
    validateOptionalString(diagnostics, file, `${path}/schedule`, system.schedule, "system schedule must be a non-empty string.");
    for (const key of systemStringListMetadataKeys) {
      validateStringList(diagnostics, file, `${path}/${key}`, system[key], `system ${key} must be an array of non-empty strings.`);
    }
    validateSystemQueries(diagnostics, file, `${path}/queries`, system.queries);
    validateSystemCommands(diagnostics, file, `${path}/commands`, system.commands);
  }
}

async function validateScriptLifecycles(
  diagnostics: IAuthoringDiagnostic[],
  projectPath: string,
  file: string,
  value: unknown,
  _scriptLifecycleIds: readonly string[],
): Promise<void> {
  const lifecycles = readArray(value);
  if (value !== undefined && lifecycles === undefined) {
    diagnostics.push(typeDiagnostic(file, "/scriptLifecycles", "scriptLifecycles must be an array.", value));
    return;
  }

  for (const [index, lifecycle] of lifecycles?.entries() ?? []) {
    if (!isRecord(lifecycle)) {
      continue;
    }
    const path = `/scriptLifecycles/${index}`;
    validateRequiredString(diagnostics, file, `${path}/module`, lifecycle.module, "script lifecycle module must be a non-empty path.");
    validateOptionalString(diagnostics, file, `${path}/scene`, lifecycle.scene, "script lifecycle scene must be a non-empty scene id.");
    if (lifecycle.onEnter !== undefined || lifecycle.onExit !== undefined) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SCRIPT_LIFECYCLE_HOOK_UNSUPPORTED",
          file,
          message: "Script lifecycle onEnter/onExit hooks are not supported until they can lower to the scene lifecycle contract.",
          path: lifecycle.onEnter !== undefined ? `${path}/onEnter` : `${path}/onExit`,
          suggestion: "Use awake, fixedUpdate, update, or lateUpdate script exports.",
        }),
      );
    }

    const exports = ["awake", "fixedUpdate", "update", "lateUpdate"] as const;
    let hasSupportedExport = false;
    for (const key of exports) {
      validateOptionalString(diagnostics, file, `${path}/${key}`, lifecycle[key], `script lifecycle ${key} export must be a non-empty name.`);
      if (readString(lifecycle[key]) !== undefined) {
        hasSupportedExport = true;
        await validateScriptReference(diagnostics, projectPath, file, `${path}/${key}`, { module: lifecycle.module, export: lifecycle[key] });
      }
    }
    if (!hasSupportedExport) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SCRIPT_LIFECYCLE_EMPTY",
          file,
          message: "Script lifecycle must declare at least one supported lifecycle export.",
          path,
          suggestion: "Add awake, fixedUpdate, update, or lateUpdate.",
        }),
      );
    }

    for (const key of systemStringListMetadataKeys) {
      validateStringList(diagnostics, file, `${path}/${key}`, lifecycle[key], `script lifecycle ${key} must be an array of non-empty strings.`);
    }
    validateSystemQueries(diagnostics, file, `${path}/queries`, lifecycle.queries);
    validateSystemCommands(diagnostics, file, `${path}/commands`, lifecycle.commands);
  }
}

function validateSystemQueries(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  const queries = readArray(value);
  if (value !== undefined && queries === undefined) {
    diagnostics.push(typeDiagnostic(file, path, "system queries must be an array.", value));
    return;
  }
  for (const [index, query] of queries?.entries() ?? []) {
    const queryPath = `${path}/${index}`;
    if (!isRecord(query)) {
      diagnostics.push(typeDiagnostic(file, queryPath, "system query must be an object.", query));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, queryPath, query, systemQueryKeys));
    validateStringList(diagnostics, file, `${queryPath}/with`, query.with, "system query with must be an array of non-empty component names.");
    validateStringList(diagnostics, file, `${queryPath}/without`, query.without, "system query without must be an array of non-empty component names.");
    validateStringList(diagnostics, file, `${queryPath}/changed`, query.changed, "system query changed must be an array of non-empty component names.");
    validateOptionalNonNegativeInteger(diagnostics, file, `${queryPath}/limit`, query.limit, "system query limit must be a non-negative integer.");
    validateOptionalNonNegativeInteger(diagnostics, file, `${queryPath}/offset`, query.offset, "system query offset must be a non-negative integer.");
    if (query.orderBy !== undefined && query.orderBy !== "id") {
      diagnostics.push(typeDiagnostic(file, `${queryPath}/orderBy`, "system query orderBy must be 'id'.", query.orderBy));
    }
  }
}

function validateSystemCommands(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  const commands = readArray(value);
  if (value !== undefined && commands === undefined) {
    diagnostics.push(typeDiagnostic(file, path, "system commands must be an array.", value));
    return;
  }
  for (const [index, command] of commands?.entries() ?? []) {
    const commandPath = `${path}/${index}`;
    if (!isRecord(command)) {
      diagnostics.push(typeDiagnostic(file, commandPath, "system command must be an object.", command));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, commandPath, command, systemCommandKeys));
    const kind = readString(command.kind);
    if (kind === undefined) {
      diagnostics.push(typeDiagnostic(file, `${commandPath}/kind`, "system command kind must be a non-empty string.", command.kind));
      continue;
    }
    validateSystemCommandShape(diagnostics, file, commandPath, kind, command);
  }
}

function validateSystemCommandShape(diagnostics: IAuthoringDiagnostic[], file: string, path: string, kind: string, command: Record<string, unknown>): void {
  if (kind === "spawn") {
    validateRequiredString(diagnostics, file, `${path}/entity`, command.entity, "spawn command entity must be a non-empty entity id.");
    validateStringList(diagnostics, file, `${path}/components`, command.components, "spawn command components must be an array of non-empty component names.");
    return;
  }
  if (kind === "despawn") {
    validateRequiredString(diagnostics, file, `${path}/entity`, command.entity, "despawn command entity must be a non-empty entity id.");
    return;
  }
  if (kind === "addComponent" || kind === "removeComponent" || kind === "setComponent") {
    validateRequiredString(diagnostics, file, `${path}/entity`, command.entity, `${kind} command entity must be a non-empty entity id.`);
    validateRequiredString(diagnostics, file, `${path}/component`, command.component, `${kind} command component must be a non-empty component name.`);
    return;
  }
  if (kind === "emitEvent") {
    validateRequiredString(diagnostics, file, `${path}/event`, command.event, "emitEvent command event must be a non-empty event name.");
    return;
  }
  if (kind === "instantiate") {
    validateRequiredString(diagnostics, file, `${path}/prefab`, command.prefab, "instantiate command prefab must be a non-empty prefab id.");
    validateRequiredString(diagnostics, file, `${path}/prefix`, command.prefix, "instantiate command prefix must be a non-empty entity id prefix.");
    return;
  }
  if (kind === "setParent") {
    validateRequiredString(diagnostics, file, `${path}/child`, command.child, "setParent command child must be a non-empty entity id.");
    validateRequiredString(diagnostics, file, `${path}/parent`, command.parent, "setParent command parent must be a non-empty entity id.");
    return;
  }
  if (kind === "clearParent") {
    validateRequiredString(diagnostics, file, `${path}/child`, command.child, "clearParent command child must be a non-empty entity id.");
    return;
  }
  diagnostics.push(typeDiagnostic(file, `${path}/kind`, "system command kind must be one of spawn, despawn, addComponent, removeComponent, setComponent, emitEvent, instantiate, setParent, or clearParent.", kind));
}

async function validateScriptReference(
  diagnostics: IAuthoringDiagnostic[],
  projectPath: string,
  file: string,
  path: string,
  value: unknown,
): Promise<void> {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "script reference must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, scriptReferenceKeys));
  const modulePath = readString(value.module);
  const exportName = readString(value.export);
  if (modulePath === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/module`, "script module must be a non-empty path.", value.module));
    return;
  }
  if (isGeneratedArtifactPath(modulePath)) {
    diagnostics.push(generatedPathDiagnostic(file, `${path}/module`, modulePath));
    return;
  }
  if (exportName === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/export`, "script export must be a non-empty name.", value.export));
    return;
  }

  const absoluteModulePath = resolve(projectPath, modulePath);
  try {
    await access(absoluteModulePath);
  } catch {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCRIPT_MODULE_MISSING",
        file,
        message: `Script module '${modulePath}' was not found.`,
        path: `${path}/module`,
        value: modulePath,
        suggestion: "Create the module under the project or update the script reference.",
      }),
    );
    return;
  }

  const source = await readFile(absoluteModulePath, "utf8");
  if (!hasNamedExport(source, exportName)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCRIPT_EXPORT_MISSING",
        file,
        message: `Script module '${modulePath}' does not export '${exportName}'.`,
        path: `${path}/export`,
        value: exportName,
        suggestion: "Export the named system function or update the script reference.",
      }),
    );
  }
}

function validateUi(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, uiNodeIds: readonly string[], resourceIds: readonly string[]): void {
  if (value === undefined || !isRecord(value)) {
    return;
  }
  const bindings = readArray(value.bindings);
  if (value.bindings !== undefined && bindings === undefined) {
    diagnostics.push(typeDiagnostic(file, "/ui/bindings", "ui.bindings must be an array.", value.bindings));
    return;
  }

  bindings?.forEach((binding, index) => {
    const path = `/ui/bindings/${index}`;
    if (!isRecord(binding)) {
      diagnostics.push(typeDiagnostic(file, path, "ui binding must be an object.", binding));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, binding, uiBindingKeys));
    const node = readString(binding.node);
    if (node === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/node`, "ui binding node must be a non-empty ui node id.", binding.node));
    } else if (!uiNodeIds.includes(node)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/node`, "ui-node", node, uiNodeIds));
    }
    const resource = readString(binding.resource);
    if (resource === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/resource`, "ui binding resource must be a non-empty resource id.", binding.resource));
    } else if (!resourceIds.some((resourceId) => resource === resourceId || resource.startsWith(`${resourceId}.`))) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/resource`, "resource", resource, resourceIds));
    }
    validateUiBindingFormat(diagnostics, file, path, binding);
  });
}

function validateUiBindingFormat(diagnostics: IAuthoringDiagnostic[], file: string, path: string, binding: Record<string, unknown>): void {
  validateStringList(diagnostics, file, `${path}/fields`, binding.fields, "ui binding fields must be non-empty strings.");
  validateOptionalString(diagnostics, file, `${path}/format`, binding.format, "ui binding format must be a non-empty string.");
  const format = readString(binding.format);
  if (format === undefined) {
    return;
  }
  const fields = readArray(binding.fields)?.map((field) => readString(field)).filter((field): field is string => field !== undefined);
  const allowed = fields === undefined || fields.length === 0 ? undefined : new Set(fields);
  for (const token of format.matchAll(/\{([^{}]+)\}/g)) {
    const [fieldValue, formatter] = String(token[1] ?? "").split(":");
    const field = fieldValue ?? "";
    if (field.trim() === "" || (allowed !== undefined && !allowed.has(field))) {
      diagnostics.push(typeDiagnostic(file, `${path}/format`, "ui binding format placeholders must reference declared fields.", binding.format));
      continue;
    }
    if (formatter !== undefined && !/^fixed\d+$/.test(formatter) && !/^pad\d+$/.test(formatter)) {
      diagnostics.push(typeDiagnostic(file, `${path}/format`, "ui binding format supports fixedN and padN formatters.", binding.format));
    }
  }
}

function inspectSceneDocument(file: string, data: unknown, sourceLineCount = 0): ISceneInspection | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const entities = idsFromArray(data.entities);
  const instances = idsFromArray(data.instances);
  const repeatedBlocks = repeatedComponentBlocks(data.entities);
  return {
    id: readString(data.id) ?? "",
    file,
    entities,
    expandedEntityCount: entities.length + instances.length,
    instances,
    prefabs: idsFromArray(data.prefabs),
    repeatedBlocks,
    resources: idsFromArray(data.resources),
    sourceLineCount,
    suggestedRefactors: repeatedBlocks.map((block) => ({
      kind: "compact-prefab-instances",
      message: `${block.count} entities share components ${block.componentKinds.join(", ")}; move shared defaults to a prefab document and keep per-instance transform overrides in scene.instances.`,
    })),
    systems: idsFromArray(data.systems),
    uiNodes: isRecord(data.ui) ? idsFromArray(data.ui.nodes) : [],
  };
}

function inspectSceneNode(data: unknown, nodeId: string): ISceneNodeInspection | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const matches: ISceneNodeInspection["matches"] = [];
  pushArrayIdMatches(matches, "entity", "/entities", data.entities, nodeId);
  pushArrayIdMatches(matches, "instance", "/instances", data.instances, nodeId);
  pushArrayIdMatches(matches, "prefab", "/prefabs", data.prefabs, nodeId);
  pushArrayIdMatches(matches, "resource", "/resources", data.resources, nodeId);
  pushArrayIdMatches(matches, "system", "/systems", data.systems, nodeId);
  if (isRecord(data.ui)) {
    pushArrayIdMatches(matches, "ui-node", "/ui/nodes", data.ui.nodes, nodeId);
    readArray(data.ui.bindings)?.forEach((binding, index) => {
      if (!isRecord(binding)) {
        return;
      }
      const node = readString(binding.node);
      const resource = readString(binding.resource);
      if (node === nodeId || resource === nodeId || resource?.startsWith(`${nodeId}.`) === true) {
        matches.push({
          kind: "ui-binding",
          path: `/ui/bindings/${index}`,
          value: cloneJson(binding),
        });
      }
    });
  }
  return { id: nodeId, matches };
}

function pushArrayIdMatches(
  matches: ISceneNodeInspection["matches"],
  kind: ISceneNodeInspection["matches"][number]["kind"],
  path: string,
  value: unknown,
  nodeId: string,
): void {
  readArray(value)?.forEach((item, index) => {
    if (!isRecord(item) || readString(item.id) !== nodeId) {
      return;
    }
    matches.push({
      kind,
      path: `${path}/${index}`,
      value: cloneJson(item),
    });
  });
}

function compactInstanceRecord(
  id: string,
  prefab: string,
  transform: IAddPrefabInstanceOptions["transform"],
  components: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    id,
    prefab,
    ...(transform === undefined ? {} : { transform: cloneJson(transform) }),
    ...(components === undefined ? {} : { components: cloneJson(components) }),
  };
}

function tenPinLayout(prefix: string, origin: [number, number, number], spacing: number): Array<{ id: string; position: [number, number, number] }> {
  const rows = [
    [0],
    [-0.5, 0.5],
    [-1, 0, 1],
    [-1.5, -0.5, 0.5, 1.5],
  ];
  const pins: Array<{ id: string; position: [number, number, number] }> = [];
  let index = 1;
  for (const [rowIndex, offsets] of rows.entries()) {
    for (const offset of offsets) {
      pins.push({
        id: `${prefix}.${String(index).padStart(2, "0")}`,
        position: [
          roundNumber(origin[0] + offset * spacing),
          roundNumber(origin[1]),
          roundNumber(origin[2] - rowIndex * spacing),
        ],
      });
      index += 1;
    }
  }
  return pins;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(6));
}

async function countSourceLines(file: string): Promise<number> {
  try {
    const text = await readFile(file, "utf8");
    return text.length === 0 ? 0 : text.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

function repeatedComponentBlocks(value: unknown): Array<{ componentKinds: string[]; count: number; entityIds: string[] }> {
  const groups = new Map<string, { componentKinds: string[]; entityIds: string[] }>();
  for (const entity of readArray(value) ?? []) {
    const record = isRecord(entity) ? entity : undefined;
    const id = readString(record?.id);
    const components = isRecord(record?.components) ? record.components : undefined;
    const componentKinds = Object.keys(components ?? {}).filter((kind) => kind !== "camera").sort();
    if (id === undefined || componentKinds.length < 2) {
      continue;
    }
    const key = componentKinds.join("\u0000");
    const group = groups.get(key) ?? { componentKinds, entityIds: [] };
    group.entityIds.push(id);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.entityIds.length >= 3)
    .map((group) => ({ componentKinds: group.componentKinds, count: group.entityIds.length, entityIds: group.entityIds.sort() }))
    .sort((left, right) => right.count - left.count || left.componentKinds.join(",").localeCompare(right.componentKinds.join(",")));
}

function idsFromArray(value: unknown): string[] {
  return (readArray(value) ?? [])
    .map((item) => (isRecord(item) ? readString(item.id) : undefined))
    .filter(isString)
    .sort();
}

function sortedStringList(value: readonly string[]): string[] {
  return [...new Set(value)].sort((left, right) => left.localeCompare(right));
}

function collectMaterialIdsForProject(project: IAuthoringProject): string[] {
  const ids: string[] = [];
  for (const document of project.documents) {
    if (document.kind === "material" && isRecord(document.data)) {
      ids.push(...idsFromArray(document.data.materials));
    }
  }
  return [...new Set(ids)].sort();
}

function collectPrefabDocumentIdsForProject(project: IAuthoringProject): string[] {
  const ids: string[] = [];
  for (const document of project.documents) {
    if (document.kind === "prefab" && isRecord(document.data)) {
      const id = readString(document.data.id);
      if (id !== undefined) {
        ids.push(id);
      }
    }
  }
  return [...new Set(ids)].sort();
}

function ensureArrayProperty(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const existing = record[key];
  if (Array.isArray(existing)) {
    return existing as Record<string, unknown>[];
  }
  const created: Record<string, unknown>[] = [];
  record[key] = created;
  return created;
}

function findSceneItem(value: unknown, id: string): Record<string, unknown> | undefined {
  return (readArray(value) ?? []).find((item): item is Record<string, unknown> => isRecord(item) && item.id === id);
}

function setOptionalString(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function setOptionalNumber(target: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function inputControlsRowSortKey(value: Record<string, unknown>): string {
  return `${String(value.kind ?? "")}\0${String(value.actionOrAxisId ?? "")}\0${String(value.axisSlot ?? "")}`;
}

function inputOverrideSortKey(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  return `${String(value.profileId ?? "")}\0${String(value.actionOrAxisId ?? "")}\0${String(value.axisSlot ?? "")}\0${String(value.device ?? "")}\0${String(value.control ?? "")}`;
}

const schemaFieldKeys = new Set(["default", "kind", "required"]);

function validateSchemaDocumentKind(file: string, value: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  validateEnumString(diagnostics, file, "/kind", value, supportedSchemaDocumentKinds, "schema document kind", "Use 'component' or 'resource'.");
  return diagnostics;
}

function validateSchemaFields(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    diagnostics.push(typeDiagnostic(file, path, "schema fields must be a non-empty object.", value));
    return;
  }
  for (const [fieldName, field] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const fieldPath = `${path}/${escapeJsonPointer(fieldName)}`;
    if (fieldName.trim() === "") {
      diagnostics.push(typeDiagnostic(file, fieldPath, "schema field names must be non-empty strings.", fieldName));
      continue;
    }
    if (!isRecord(field)) {
      diagnostics.push(typeDiagnostic(file, fieldPath, "schema field declarations must be objects.", field));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, fieldPath, field, schemaFieldKeys));
    validateEnumString(diagnostics, file, `${fieldPath}/kind`, field.kind, supportedSchemaFieldKinds, "schema field kind", "Use a supported IR schema field kind such as 'string', 'number', 'boolean', 'vec3', or 'json'.");
    validateOptionalBoolean(diagnostics, file, `${fieldPath}/required`, field.required, "schema field required flag must be a boolean.");
  }
}

function formatKeyboardBinding(key: string): string {
  return `keyboard.${normalizeKeyboardCodeAlias(key)}`;
}

function validateInputMetadata(file: string, data: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return diagnostics;
  }
  const actionIds = new Set(idsFromArray(data.actions));
  const axisIds = new Set(idsFromArray(data.axes));
  validateInputBindingStrings(diagnostics, file, data);
  validateInputControlsSettings(diagnostics, file, data.controlsSettings, actionIds, axisIds);
  validateInputBindingOverrides(diagnostics, file, data.persistedBindingOverrides, actionIds, axisIds);
  return diagnostics;
}

function validateInputBindingStrings(diagnostics: IAuthoringDiagnostic[], file: string, data: Record<string, unknown>): void {
  readArray(data.actions)?.forEach((action, actionIndex) => {
    if (!isRecord(action)) {
      return;
    }
    validateStructuredInputBindingList(diagnostics, file, `/actions/${actionIndex}/bindings`, action.bindings);
  });
  readArray(data.axes)?.forEach((axis, axisIndex) => {
    if (!isRecord(axis)) {
      return;
    }
    validateStructuredInputBindingList(diagnostics, file, `/axes/${axisIndex}/negative`, axis.negative);
    validateStructuredInputBindingList(diagnostics, file, `/axes/${axisIndex}/positive`, axis.positive);
    const value = readString(axis.value);
    if (value !== undefined) {
      validateStructuredInputBindingString(diagnostics, file, `/axes/${axisIndex}/value`, value);
    }
  });
}

function validateStructuredInputBindingList(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  readArray(value)?.forEach((binding, index) => {
    const text = readString(binding);
    if (text !== undefined) {
      validateStructuredInputBindingString(diagnostics, file, `${path}/${index}`, text);
    }
  });
}

function validateStructuredInputBindingString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: string): void {
  const [device, control] = value.split(".");
  if (device !== "keyboard" || control === undefined) {
    return;
  }
  const normalized = normalizeKeyboardCodeAlias(control);
  if (normalized !== control && isCanonicalKeyboardCode(normalized)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_INPUT_KEYBOARD_CODE_NORMALIZED",
      file,
      message: `Keyboard binding '${value}' will be emitted as 'keyboard.${normalized}'.`,
      path,
      severity: "warning",
      suggestion: `Update this binding to 'keyboard.${normalized}' so source and emitted IR match.`,
      value,
    }));
    return;
  }
  if (!isCanonicalKeyboardCode(control)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_INPUT_KEYBOARD_CODE_INVALID",
      file,
      message: `Keyboard binding '${value}' must use a canonical KeyboardEvent.code value.`,
      path,
      suggestion: "Use a binding such as 'keyboard.KeyW', 'keyboard.ArrowUp', 'keyboard.Space', or 'keyboard.Escape'.",
      value,
    }));
  }
}

const canonicalKeyboardCodes = new Set([
  "AltLeft",
  "AltRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backquote",
  "Backslash",
  "Backspace",
  "BracketLeft",
  "BracketRight",
  "CapsLock",
  "Comma",
  "ContextMenu",
  "ControlLeft",
  "ControlRight",
  "Delete",
  "End",
  "Enter",
  "Equal",
  "Escape",
  "Home",
  "Insert",
  "IntlBackslash",
  "IntlRo",
  "IntlYen",
  "MetaLeft",
  "MetaRight",
  "Minus",
  "PageDown",
  "PageUp",
  "Pause",
  "Period",
  "Quote",
  "ScrollLock",
  "Semicolon",
  "ShiftLeft",
  "ShiftRight",
  "Slash",
  "Space",
  "Tab",
]);

const keyboardCodeAliases = new Map<string, string>([
  ["alt", "AltLeft"],
  ["arrowdown", "ArrowDown"],
  ["arrow-down", "ArrowDown"],
  ["arrowleft", "ArrowLeft"],
  ["arrow-left", "ArrowLeft"],
  ["arrowright", "ArrowRight"],
  ["arrow-right", "ArrowRight"],
  ["arrowup", "ArrowUp"],
  ["arrow-up", "ArrowUp"],
  ["control", "ControlLeft"],
  ["ctrl", "ControlLeft"],
  ["down", "ArrowDown"],
  ["esc", "Escape"],
  ["left", "ArrowLeft"],
  ["meta", "MetaLeft"],
  ["right", "ArrowRight"],
  ["shift", "ShiftLeft"],
  ["spacebar", "Space"],
  ["up", "ArrowUp"],
  ...[...canonicalKeyboardCodes].map((code) => [code.toLowerCase(), code] as const),
]);

function isCanonicalKeyboardCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code)
    || /^Digit[0-9]$/.test(code)
    || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)
    || /^Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma|ParenLeft|ParenRight|Backspace)$/.test(code)
    || canonicalKeyboardCodes.has(code);
}

function normalizeKeyboardCodeAlias(code: string): string {
  if (isCanonicalKeyboardCode(code)) {
    return code;
  }
  if (/^[a-z]$/i.test(code)) {
    return `Key${code.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(code)) {
    return `Digit${code}`;
  }
  return keyboardCodeAliases.get(code.toLowerCase()) ?? code;
}

function validateInputControlsSettings(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, actionIds: ReadonlySet<string>, axisIds: ReadonlySet<string>): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, "/controlsSettings", "controlsSettings must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/controlsSettings", value, inputControlsSettingsKeys));
  validateRequiredString(diagnostics, file, "/controlsSettings/profileId", value.profileId, "controls settings profileId must be a non-empty string.");
  const rows = readArray(value.rows);
  if (!Array.isArray(value.rows)) {
    diagnostics.push(typeDiagnostic(file, "/controlsSettings/rows", "controls settings rows must be an array.", value.rows));
    return;
  }
  const seenRows = new Set<string>();
  rows?.forEach((row, index) => {
    const path = `/controlsSettings/rows/${index}`;
    if (!isRecord(row)) {
      diagnostics.push(typeDiagnostic(file, path, "controls settings row must be an object.", row));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, row, inputControlsSettingsRowKeys));
    validateEnumString(diagnostics, file, `${path}/kind`, row.kind, supportedInputRebindKinds, "controls settings row kind", "Use 'action' or 'axis'.");
    const target = validateEcsId(diagnostics, file, `${path}/actionOrAxisId`, row.actionOrAxisId, "input rebind target");
    if (row.kind === "action" && row.axisSlot !== undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/axisSlot`, "action controls rows cannot declare axisSlot.", row.axisSlot));
    } else if (row.kind === "axis") {
      validateEnumString(diagnostics, file, `${path}/axisSlot`, row.axisSlot, supportedInputAxisSlots, "controls settings axis slot", "Use 'negative', 'positive', or 'value'.");
    }
    if (target !== undefined && row.kind === "action" && !actionIds.has(target)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/actionOrAxisId`, "input action", target, [...actionIds].sort()));
    }
    if (target !== undefined && row.kind === "axis" && !axisIds.has(target)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/actionOrAxisId`, "input axis", target, [...axisIds].sort()));
    }
    validateStringList(diagnostics, file, `${path}/defaultBindings`, row.defaultBindings, "controls settings defaultBindings must be non-empty binding strings.");
    validateStructuredInputBindingList(diagnostics, file, `${path}/defaultBindings`, row.defaultBindings);
    validateOptionalString(diagnostics, file, `${path}/uiNodeId`, row.uiNodeId, "controls settings uiNodeId must be a non-empty UI node id.");
    if (row.captureState !== undefined) {
      validateEnumString(diagnostics, file, `${path}/captureState`, row.captureState, supportedInputCaptureStates, "controls settings capture state", "Use a supported capture state such as 'idle' or 'waiting-for-input'.");
    }
    const key = inputControlsRowSortKey(row);
    if (seenRows.has(key)) {
      diagnostics.push(typeDiagnostic(file, path, "controls settings rows must be unique by kind, actionOrAxisId, and axisSlot.", row));
    }
    seenRows.add(key);
  });
}

function validateInputBindingOverrides(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, actionIds: ReadonlySet<string>, axisIds: ReadonlySet<string>): void {
  if (value === undefined) {
    return;
  }
  const overrides = readArray(value);
  if (overrides === undefined) {
    diagnostics.push(typeDiagnostic(file, "/persistedBindingOverrides", "persistedBindingOverrides must be an array.", value));
    return;
  }
  overrides.forEach((override, index) => {
    const path = `/persistedBindingOverrides/${index}`;
    if (!isRecord(override)) {
      diagnostics.push(typeDiagnostic(file, path, "persisted binding override must be an object.", override));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, override, inputPersistedBindingOverrideKeys));
    validateRequiredString(diagnostics, file, `${path}/profileId`, override.profileId, "persisted binding override profileId must be a non-empty string.");
    const target = validateEcsId(diagnostics, file, `${path}/actionOrAxisId`, override.actionOrAxisId, "input override target");
    if (target !== undefined && !actionIds.has(target) && !axisIds.has(target)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/actionOrAxisId`, "input action or axis", target, [...actionIds, ...axisIds].sort()));
    }
    validateEnumString(diagnostics, file, `${path}/device`, override.device, supportedInputOverrideDevices, "input override device", "Use 'keyboard', 'gamepad', 'pointer', or 'touch'.");
    validateRequiredString(diagnostics, file, `${path}/control`, override.control, "persisted binding override control must be a non-empty string.");
    if (override.device === "keyboard") {
      const control = readString(override.control);
      if (control !== undefined) {
        validateStructuredInputBindingString(diagnostics, file, `${path}/control`, `keyboard.${control}`);
      }
    }
    if (override.axisSlot !== undefined) {
      validateEnumString(diagnostics, file, `${path}/axisSlot`, override.axisSlot, supportedInputAxisSlots, "input override axis slot", "Use 'negative', 'positive', or 'value'.");
    }
    validateOptionalNumber(diagnostics, file, `${path}/deadzone`, override.deadzone, "persisted binding override deadzone must be a finite number.");
    validateOptionalNumber(diagnostics, file, `${path}/scale`, override.scale, "persisted binding override scale must be a finite number.");
    validateOptionalString(diagnostics, file, `${path}/updatedAt`, override.updatedAt, "persisted binding override updatedAt must be a non-empty timestamp string.");
    validateStringList(diagnostics, file, `${path}/modifiers`, override.modifiers, "persisted binding override modifiers must be non-empty strings.");
  });
}

function validateStringList(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  message: string,
): void {
  const items = readArray(value);
  if (value !== undefined && (items === undefined || items.some((item) => readString(item) === undefined))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateSupportedStringList(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  allowed: ReadonlySet<string>,
  message: string,
): void {
  const items = readArray(value);
  if (value !== undefined && (items === undefined || items.some((item) => readString(item) === undefined || !allowed.has(readString(item) ?? "")))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function validateOptionalPositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function validateEcsId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  const id = readString(value);
  if (id === undefined || !ecsIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: `${kind} id must be a non-empty ECS id using letters, numbers, '.', '_' or '-'.`,
        path,
        value,
        suggestion: "Use a stable id such as 'kart.player.oobi' or 'track.arrow.-1.1'.",
      }),
    );
    return undefined;
  }
  return id;
}

function validateResourceId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): string | undefined {
  const id = readString(value);
  if (id === undefined || !resourceIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: "resource id must be a non-empty ECS resource id using letters, numbers, '.', '_' or '-'.",
        path,
        value,
        suggestion: "Use a stable id such as 'RaceState', 'MinimapState', or 'hud.score'.",
      }),
    );
    return undefined;
  }
  return id;
}

function validateLogicalId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  const id = readString(value);
  if (id === undefined || !logicalIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: `${kind} id must be a non-empty logical id using lowercase letters, numbers, '.', '_' or '-'.`,
        path,
        value,
        suggestion: "Use a stable id such as 'player-kart' or 'scene.arena'.",
      }),
    );
    return undefined;
  }
  return id;
}

function unknownKeyDiagnostics(file: string, path: string, value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): IAuthoringDiagnostic[] {
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort()
    .map((key) =>
      authoringDiagnostic({
        code: "TN_AUTHORING_UNKNOWN_FIELD",
        file,
        message: `Unknown field '${key}' is not supported in this authoring document shape.`,
        path: `${path}/${escapeJsonPointer(key)}`,
        value: key,
        suggestion: "Remove the field or use a supported structured authoring property.",
      }),
    );
}

function missingReferenceDiagnostic(file: string, path: string, kind: string, value: string, candidates: readonly string[]): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_REF_MISSING",
    file,
    message: `No ${kind} with id '${value}' exists.`,
    path,
    value,
    suggestion: closestIdSuggestion(value, candidates),
  });
}

function closestIdSuggestion(value: string, candidates: readonly string[]): string | undefined {
  const closest = candidates
    .map((candidate) => ({ candidate, distance: levenshtein(value, candidate) }))
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))[0];
  if (closest === undefined || closest.distance > 3) {
    return undefined;
  }
  return `Did you mean '${closest.candidate}'?`;
}

function duplicateIdCode(kind: string): string {
  return `TN_AUTHORING_DUPLICATE_${kind.toUpperCase().replaceAll("-", "_")}_ID`;
}

function readSceneId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.id) : undefined;
}

function readDocumentId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.id) : undefined;
}

function hasNamedExport(source: string, exportName: string): boolean {
  const escaped = escapeRegExp(exportName);
  return new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${escaped}\\b`).test(source) || new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(source);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        (current[rightIndex] ?? 0) + 1,
        (previous[rightIndex + 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
