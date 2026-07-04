import { authoringDiagnostic } from "./diagnostics.js";
import {
  addEntity,
  addAsset,
  addAudioSound,
  addGroup,
  addInputAction,
  addInputAxis,
  addPrefab,
  addPrefabComponent,
  addPrefabInstance,
  addResourceDocumentEntry,
  addResource,
  addTag,
  addTenPinLayout,
  addUiNode,
  addUiNodeDocument,
  addUiText,
  attachScript,
  attachSystemScript,
  bindUi,
  bindUiDocument,
  createAudioDocument,
  createEnvironmentDocument,
  createMaterial,
  createMeshCustom,
  createMeshPrimitive,
  createPrefabDocument,
  createProjectMetadata,
  createRuntimeConfig,
  createResourcesDocument,
  createSchemaDocument,
  createScene,
  createSystem,
  createUiDocument,
  recordGeneratorProvenance,
  removeComponent,
  setCamera,
  setCameraComponent,
  setCharacterControllerComponent,
  setColliderComponent,
  setComponent,
  setEnvironmentMap,
  setEnvironmentLightProbe,
  setEnvironmentPath,
  setEnvironmentSkybox,
  setEnvironmentSourceAssetLod,
  setEnvironmentTerrain,
  setEnvironmentWalkability,
  setInputBindingOverride,
  setInputControls,
  setLightComponent,
  setMaterial,
  setMeshRendererComponent,
  setPrefab,
  setRenderLayersComponent,
  setResource,
  setResourceDocumentEntry,
  setRuntimeRendering,
  setRuntimeWindow,
  setSchemaEntry,
  setRigidBodyComponent,
  setSceneLifecycle,
  setSystemMetadata,
  setTargetProfile,
  setTransform,
  setUiLayout,
  setUiStyle,
  setVisibilityComponent,
  type IAuthoringOperationContext,
  type IAuthoringOperationResult,
} from "./operations.js";

type StylizedNatureDensity = "low" | "medium" | "high";

const STYLIZED_NATURE_DENSITY_DEFAULTS: Record<StylizedNatureDensity, { grassCount: number; treeCount: number }> = {
  low: { grassCount: 48, treeCount: 3 },
  medium: { grassCount: 140, treeCount: 6 },
  high: { grassCount: 320, treeCount: 10 },
};

const STYLIZED_NATURE_AUTHORED_DEFAULTS = {
  barkColor: "#7b4f2f",
  density: "medium" as StylizedNatureDensity,
  grassRootColor: "#5e8f42",
  grassTipColor: "#c8df5f",
  groundColor: "#5c8d45",
  leafColor: "#7fbf45",
  pathColor: "#8b7250",
  pathWidth: 2.4,
  size: 24,
  windStrength: 0.35,
};

export type AuthoringOperationPathPolicy = "source-document" | "source-script";
export type AuthoringOperationSourceFamily = "asset" | "audio" | "environment" | "generator" | "input" | "material" | "mesh" | "prefab" | "project" | "resources" | "runtime" | "schema" | "scene" | "system" | "target" | "ui";
export type AuthoringOperationResultShape = "authoring-operation-result";

export interface IAuthoringOperationArgumentDescriptor {
  name: string;
  required: boolean;
  type: "boolean" | "json-object" | "json-object-array" | "json-value" | "number" | "number-array" | "string" | "string-array" | "vector3";
}

export interface IAuthoringOperationDescriptor<TName extends string = AuthoringOperationName> {
  arguments: IAuthoringOperationArgumentDescriptor[];
  description: string;
  name: TName;
  pathPolicy: AuthoringOperationPathPolicy;
  resultShape: AuthoringOperationResultShape;
  sourceFamily: AuthoringOperationSourceFamily;
}

export interface IDispatchAuthoringOperationOptions extends IAuthoringOperationContext {
  args: Record<string, unknown>;
  name: AuthoringOperationName | string;
}

type OperationDispatcher = (options: IDispatchAuthoringOperationOptions) => Promise<IAuthoringOperationResult>;
type OperationRegistryEntry<TName extends string = AuthoringOperationName> = IAuthoringOperationDescriptor<TName> & {
  dispatch: OperationDispatcher;
};

const operationEntries = [
  operation(descriptor("asset.add", "Add or replace an asset declaration in a structured asset document.", "asset", "source-document", [
    stringArg("assetId"),
    stringArg("type"),
    stringArg("path", false),
    numberArg("width", false),
    numberArg("height", false),
    stringArg("usage", false),
    stringArg("format", false),
    numberArg("sampleCount", false),
    stringArg("file", false),
  ]), async ({ args, projectPath }) =>
    addAsset({ assetId: requiredString(args, "assetId"), file: optionalString(args, "file"), format: optionalString(args, "format"), height: optionalNumber(args, "height"), path: optionalString(args, "path"), projectPath, sampleCount: optionalNumber(args, "sampleCount"), type: requiredString(args, "type"), usage: optionalString(args, "usage"), width: optionalNumber(args, "width") })),
  operation(descriptor("audio.create", "Create a structured audio source document.", "audio", "source-document", [
    stringArg("audioDocId"),
  ]), async ({ args, projectPath }) =>
    createAudioDocument({ audioDocId: requiredString(args, "audioDocId"), projectPath })),
  operation(descriptor("audio.add_sound", "Add or replace an audio sound declaration in structured source.", "audio", "source-document", [
    stringArg("audioDocId"),
    stringArg("soundId"),
    stringArg("asset"),
  ]), async ({ args, projectPath }) =>
    addAudioSound({ asset: requiredString(args, "asset"), audioDocId: requiredString(args, "audioDocId"), projectPath, soundId: requiredString(args, "soundId") })),
  operation(descriptor("environment.create", "Create a structured environment source document.", "environment", "source-document", [
    stringArg("environmentId"),
  ]), async ({ args, projectPath }) =>
    createEnvironmentDocument({ environmentId: requiredString(args, "environmentId"), projectPath })),
  operation(descriptor("environment.set_skybox", "Set environment skybox source fields.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("asset"),
    stringArg("mode", false),
  ]), async ({ args, projectPath }) =>
    setEnvironmentSkybox({ asset: requiredString(args, "asset"), environmentId: requiredString(args, "environmentId"), mode: optionalString(args, "mode"), projectPath })),
  operation(descriptor("environment.set_map", "Set environment map source fields.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("asset"),
  ]), async ({ args, projectPath }) =>
    setEnvironmentMap({ asset: requiredString(args, "asset"), environmentId: requiredString(args, "environmentId"), projectPath })),
  operation(descriptor("environment.set_light_probe", "Add or replace environment light probe metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("probeId"),
    objectArg("probe"),
  ]), async ({ args, projectPath }) =>
    setEnvironmentLightProbe({ environmentId: requiredString(args, "environmentId"), probe: requiredObject(args, "probe"), probeId: requiredString(args, "probeId"), projectPath })),
  operation(descriptor("environment.set_path", "Set environment path metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    anyJsonArg("path"),
  ]), async ({ args, projectPath }) =>
    setEnvironmentPath({ environmentId: requiredString(args, "environmentId"), path: optionalJson(args, "path"), projectPath })),
  operation(descriptor("environment.set_terrain", "Set promoted environment terrain source fields.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("terrainId", false),
    stringArg("heightMode", false),
    stringArg("heightmap", false),
  ]), async ({ args, projectPath }) =>
    setEnvironmentTerrain({ environmentId: requiredString(args, "environmentId"), heightmap: optionalString(args, "heightmap"), heightMode: optionalString(args, "heightMode"), projectPath, terrainId: optionalString(args, "terrainId") })),
  operation(descriptor("environment.set_walkability", "Set environment walkability metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    anyJsonArg("walkability"),
  ]), async ({ args, projectPath }) =>
    setEnvironmentWalkability({ environmentId: requiredString(args, "environmentId"), projectPath, walkability: optionalJson(args, "walkability") })),
  operation(descriptor("environment.set_source_asset_lod", "Set environment source asset LOD metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("sourceAssetId"),
    anyJsonArg("lod"),
  ]), async ({ args, projectPath }) =>
    setEnvironmentSourceAssetLod({ environmentId: requiredString(args, "environmentId"), lod: optionalJson(args, "lod"), projectPath, sourceAssetId: requiredString(args, "sourceAssetId") })),
  operation(descriptor("generator.record", "Create or update one-way generator provenance metadata.", "generator", "source-document", [
    stringArg("generatorId"),
    stringArg("modulePath"),
    stringArg("exportName"),
    stringArrayArg("outputs"),
    stringArg("overwritePolicy", false),
    stringArg("inputHash", false),
    stringArg("outputHash", false),
  ]), async ({ args, projectPath }) =>
    recordGeneratorProvenance({ exportName: requiredString(args, "exportName"), generatorId: requiredString(args, "generatorId"), inputHash: optionalString(args, "inputHash"), modulePath: requiredString(args, "modulePath"), outputHash: optionalString(args, "outputHash"), outputs: requiredStringArray(args, "outputs"), overwritePolicy: optionalString(args, "overwritePolicy"), projectPath })),
  operation(descriptor("scene.create", "Create a structured scene source document.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("file", false),
  ]), async ({ args, projectPath }) =>
    createScene({ file: optionalString(args, "file"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("input.add_action", "Add or replace an input action in a structured input document.", "input", "source-document", [
    stringArg("inputDocId"),
    stringArg("actionId"),
    stringArrayArg("keys"),
  ]), async ({ args, projectPath }) =>
    addInputAction({ actionId: requiredString(args, "actionId"), inputDocId: requiredString(args, "inputDocId"), keys: requiredStringArray(args, "keys"), projectPath })),
  operation(descriptor("input.add_axis", "Add or replace an input axis in a structured input document.", "input", "source-document", [
    stringArg("inputDocId"),
    stringArg("axisId"),
    stringArrayArg("negativeKeys"),
    stringArrayArg("positiveKeys"),
    stringArg("value", false),
  ]), async ({ args, projectPath }) =>
    addInputAxis({ axisId: requiredString(args, "axisId"), inputDocId: requiredString(args, "inputDocId"), negativeKeys: requiredStringArray(args, "negativeKeys"), positiveKeys: requiredStringArray(args, "positiveKeys"), projectPath, value: optionalString(args, "value") })),
  operation(descriptor("input.set_controls", "Set input controls/rebinding metadata rows in a structured input document.", "input", "source-document", [
    stringArg("inputDocId"),
    stringArg("profileId"),
    objectArrayArg("rows"),
  ]), async ({ args, projectPath }) =>
    setInputControls({ inputDocId: requiredString(args, "inputDocId"), profileId: requiredString(args, "profileId"), projectPath, rows: requiredObjectArray(args, "rows") })),
  operation(descriptor("input.set_override", "Add or replace a persisted input binding override.", "input", "source-document", [
    stringArg("inputDocId"),
    stringArg("actionOrAxisId"),
    stringArg("axisSlot", false),
    stringArg("control"),
    numberArg("deadzone", false),
    stringArg("device"),
    stringArrayArg("modifiers", false),
    stringArg("profileId"),
    numberArg("scale", false),
    stringArg("updatedAt", false),
  ]), async ({ args, projectPath }) =>
    setInputBindingOverride({ actionOrAxisId: requiredString(args, "actionOrAxisId"), axisSlot: optionalString(args, "axisSlot"), control: requiredString(args, "control"), deadzone: optionalNumber(args, "deadzone"), device: requiredString(args, "device"), inputDocId: requiredString(args, "inputDocId"), modifiers: optionalStringArray(args, "modifiers"), profileId: requiredString(args, "profileId"), projectPath, scale: optionalNumber(args, "scale"), updatedAt: optionalString(args, "updatedAt") })),
  operation(descriptor("material.create", "Create a structured material source document.", "material", "source-document", [
    stringArg("materialId"),
  ]), async ({ args, projectPath }) =>
    createMaterial({ materialId: requiredString(args, "materialId"), projectPath })),
  operation(descriptor("material.set", "Set material source fields.", "material", "source-document", [
    stringArg("materialId"),
    numberArg("alphaCutoff", false),
    stringArg("alphaMode", false),
    stringArg("baseColorTexture", false),
    numberArg("clearcoat", false),
    numberArg("clearcoatRoughness", false),
    stringArg("clearcoatRoughnessTexture", false),
    stringArg("clearcoatTexture", false),
    stringArg("color", false),
    stringArg("emissive", false),
    numberArg("emissiveIntensity", false),
    stringArg("emissiveTexture", false),
    stringArg("metallicRoughnessTexture", false),
    numberArg("metalness", false),
    stringArg("normalTexture", false),
    stringArg("occlusionTexture", false),
    numberArg("opacity", false),
    numberArg("roughness", false),
    numberArg("transmission", false),
    stringArg("transmissionTexture", false),
  ]), async ({ args, projectPath }) =>
    setMaterial({
      alphaCutoff: optionalNumber(args, "alphaCutoff"),
      alphaMode: optionalString(args, "alphaMode"),
      baseColorTexture: optionalString(args, "baseColorTexture"),
      clearcoat: optionalNumber(args, "clearcoat"),
      clearcoatRoughness: optionalNumber(args, "clearcoatRoughness"),
      clearcoatRoughnessTexture: optionalString(args, "clearcoatRoughnessTexture"),
      clearcoatTexture: optionalString(args, "clearcoatTexture"),
      color: optionalString(args, "color"),
      emissive: optionalString(args, "emissive"),
      emissiveIntensity: optionalNumber(args, "emissiveIntensity"),
      emissiveTexture: optionalString(args, "emissiveTexture"),
      materialId: requiredString(args, "materialId"),
      metallicRoughnessTexture: optionalString(args, "metallicRoughnessTexture"),
      metalness: optionalNumber(args, "metalness"),
      normalTexture: optionalString(args, "normalTexture"),
      occlusionTexture: optionalString(args, "occlusionTexture"),
      opacity: optionalNumber(args, "opacity"),
      projectPath,
      roughness: optionalNumber(args, "roughness"),
      transmission: optionalNumber(args, "transmission"),
      transmissionTexture: optionalString(args, "transmissionTexture"),
    })),
  operation(descriptor("mesh.create_primitive", "Create or update a primitive mesh source declaration.", "mesh", "source-document", [
    stringArg("meshId"),
    stringArg("kind"),
    numberArrayArg("size", false),
    stringArg("file", false),
  ]), async ({ args, projectPath }) =>
    createMeshPrimitive({ file: optionalString(args, "file"), kind: requiredString(args, "kind"), meshId: requiredString(args, "meshId"), projectPath, size: optionalNumberArray(args, "size") })),
  operation(descriptor("mesh.create_custom", "Create a custom mesh source document with attributes and indices.", "mesh", "source-document", [
    stringArg("meshId"),
    objectArrayArg("attributes"),
    numberArrayArg("indices", false),
    stringArg("storage", false),
  ]), async ({ args, projectPath }) =>
    createMeshCustom({ attributes: requiredObjectArray(args, "attributes") as Array<{ itemSize: number; name: string; values: number[] }>, indices: optionalNumberArray(args, "indices"), meshId: requiredString(args, "meshId"), projectPath, storage: optionalString(args, "storage") })),
  operation(descriptor("prefab.create", "Create a structured prefab source document.", "prefab", "source-document", [
    stringArg("prefabId"),
  ]), async ({ args, projectPath }) =>
    createPrefabDocument({ prefabId: requiredString(args, "prefabId"), projectPath })),
  operation(descriptor("prefab.add_component", "Add or replace a component on a structured prefab document.", "prefab", "source-document", [
    stringArg("prefabId"),
    stringArg("componentKind"),
    objectArg("value"),
  ]), async ({ args, projectPath }) =>
    addPrefabComponent({ componentKind: requiredString(args, "componentKind"), prefabId: requiredString(args, "prefabId"), projectPath, value: requiredObject(args, "value") })),
  operation(descriptor("prefab.set_defaults", "Set a component default on a structured prefab document.", "prefab", "source-document", [
    stringArg("prefabId"),
    stringArg("componentKind"),
    objectArg("value"),
  ]), async ({ args, projectPath }) =>
    addPrefabComponent({ componentKind: requiredString(args, "componentKind"), prefabId: requiredString(args, "prefabId"), projectPath, value: requiredObject(args, "value") })),
  operation(descriptor("project.create", "Create or update structured project metadata.", "project", "source-document", [
    stringArg("projectId"),
    stringArg("authoringVersion", false),
    stringArrayArg("sourceRoots", false),
    stringArrayArg("buildTargets", false),
    stringArg("file", false),
  ]), async ({ args, projectPath }) =>
    createProjectMetadata({ authoringVersion: optionalString(args, "authoringVersion"), buildTargets: optionalStringArray(args, "buildTargets"), file: optionalString(args, "file"), projectId: requiredString(args, "projectId"), projectPath, sourceRoots: optionalStringArray(args, "sourceRoots") })),
  operation(descriptor("resources.create", "Create a reusable resources source document.", "resources", "source-document", [
    stringArg("resourcesDocId"),
  ]), async ({ args, projectPath }) =>
    createResourcesDocument({ projectPath, resourcesDocId: requiredString(args, "resourcesDocId") })),
  operation(descriptor("resources.add", "Add a resource declaration to a reusable resources source document.", "resources", "source-document", [
    stringArg("resourcesDocId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]), async ({ args, projectPath }) =>
    addResourceDocumentEntry({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), resourcesDocId: requiredString(args, "resourcesDocId"), value: optionalJson(args, "value") })),
  operation(descriptor("resources.set", "Update a resource declaration in a reusable resources source document.", "resources", "source-document", [
    stringArg("resourcesDocId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]), async ({ args, projectPath }) =>
    setResourceDocumentEntry({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), resourcesDocId: requiredString(args, "resourcesDocId"), value: optionalJson(args, "value") })),
  operation(descriptor("schema.create", "Create a reusable component or resource schema source document.", "schema", "source-document", [
    stringArg("schemaDocId"),
    stringArg("kind"),
  ]), async ({ args, projectPath }) =>
    createSchemaDocument({ kind: requiredString(args, "kind"), projectPath, schemaDocId: requiredString(args, "schemaDocId") })),
  operation(descriptor("schema.set", "Add or replace a schema declaration in a reusable schema source document.", "schema", "source-document", [
    stringArg("schemaDocId"),
    stringArg("schemaId"),
    stringArg("kind"),
    objectArg("fields"),
  ]), async ({ args, projectPath }) =>
    setSchemaEntry({ fields: requiredObject(args, "fields"), kind: requiredString(args, "kind"), projectPath, schemaDocId: requiredString(args, "schemaDocId"), schemaId: requiredString(args, "schemaId") })),
  operation(descriptor("runtime.create", "Create a structured runtime config source document.", "runtime", "source-document", [
    stringArg("runtimeId"),
    stringArg("renderProfile", false),
  ]), async ({ args, projectPath }) =>
    createRuntimeConfig({ projectPath, renderProfile: optionalString(args, "renderProfile"), runtimeId: requiredString(args, "runtimeId") })),
  operation(descriptor("runtime.set_window", "Set primary runtime window source fields.", "runtime", "source-document", [
    stringArg("runtimeId"),
    numberArg("height", false),
    stringArg("title", false),
    numberArg("width", false),
  ]), async ({ args, projectPath }) =>
    setRuntimeWindow({ height: optionalNumber(args, "height"), projectPath, runtimeId: requiredString(args, "runtimeId"), title: optionalString(args, "title"), width: optionalNumber(args, "width") })),
  operation(descriptor("runtime.set_rendering", "Set promoted runtime renderer source fields.", "runtime", "source-document", [
    stringArg("runtimeId"),
    stringArg("antialias", false),
    booleanArg("bloomEnabled", false),
    numberArg("bloomIntensity", false),
    numberArg("bloomThreshold", false),
    stringArg("renderProfile", false),
    numberArg("renderLookBloomIntensity", false),
    numberArg("renderLookContrast", false),
    numberArg("renderLookEnvironmentIntensity", false),
    numberArg("renderLookExposure", false),
    numberArg("renderLookSaturation", false),
    stringArg("renderLookShadowQuality", false),
    stringArg("renderPath", false),
  ]), async ({ args, projectPath }) =>
    setRuntimeRendering({
      antialias: optionalString(args, "antialias"),
      bloomEnabled: optionalBoolean(args, "bloomEnabled"),
      bloomIntensity: optionalNumber(args, "bloomIntensity"),
      bloomThreshold: optionalNumber(args, "bloomThreshold"),
      projectPath,
      renderLookBloomIntensity: optionalNumber(args, "renderLookBloomIntensity"),
      renderLookContrast: optionalNumber(args, "renderLookContrast"),
      renderLookEnvironmentIntensity: optionalNumber(args, "renderLookEnvironmentIntensity"),
      renderLookExposure: optionalNumber(args, "renderLookExposure"),
      renderLookSaturation: optionalNumber(args, "renderLookSaturation"),
      renderLookShadowQuality: optionalString(args, "renderLookShadowQuality"),
      renderPath: optionalString(args, "renderPath"),
      renderProfile: optionalString(args, "renderProfile"),
      runtimeId: requiredString(args, "runtimeId"),
    })),
  operation(descriptor("target.set_profile", "Create or update a structured target profile source document.", "target", "source-document", [
    stringArg("targetProfileId"),
    stringArrayArg("targets"),
    objectArg("budgets", false),
    objectArg("performance", false),
  ]), async ({ args, projectPath }) =>
    setTargetProfile({ budgets: optionalObject(args, "budgets"), performance: optionalObject(args, "performance"), projectPath, targetProfileId: requiredString(args, "targetProfileId"), targets: requiredStringArray(args, "targets") })),
  operation(descriptor("scene.add_entity", "Add an entity to a structured scene document.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("prefabId", false),
  ]), async ({ args, projectPath }) =>
    addEntity({ entityId: requiredString(args, "entityId"), prefabId: optionalString(args, "prefabId"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.add_prefab_instance", "Add or replace a compact prefab-backed scene instance.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("instanceId"),
    stringArg("prefabId"),
    vectorArg("position", false),
    vectorArg("rotation", false),
    vectorArg("scale", false),
    objectArg("components", false),
    booleanArg("replace", false),
  ]), async ({ args, projectPath }) =>
    addPrefabInstance({
      components: optionalObject(args, "components"),
      instanceId: requiredString(args, "instanceId"),
      prefabId: requiredString(args, "prefabId"),
      projectPath,
      replace: optionalBoolean(args, "replace"),
      sceneId: requiredString(args, "sceneId"),
      transform: compactTransformArgs(args),
    })),
  operation(descriptor("scene.layout_ten_pin", "Create or replace a compact ten-pin bowling layout.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("prefabId"),
    stringArg("prefix", false),
    vectorArg("origin", false),
    numberArg("spacing", false),
    booleanArg("replace", false),
  ]), async ({ args, projectPath }) =>
    addTenPinLayout({
      origin: optionalVector3(args, "origin"),
      prefabId: requiredString(args, "prefabId"),
      prefix: optionalString(args, "prefix"),
      projectPath,
      replace: optionalBoolean(args, "replace"),
      sceneId: requiredString(args, "sceneId"),
      spacing: optionalNumber(args, "spacing"),
    })),
  operation(descriptor("scene.add_group", "Add a scene container group entity to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("groupId"),
    stringArg("name", false),
    vectorArg("position", false),
  ]), async ({ args, projectPath }) =>
    addGroup({ groupId: requiredString(args, "groupId"), name: optionalString(args, "name"), position: optionalVector3(args, "position"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.add_prefab", "Add a scene-local prefab declaration to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("prefabId"),
    stringArg("primitive", false),
    stringArg("color", false),
    stringArg("asset", false),
  ]), async ({ args, projectPath }) =>
    addPrefab({ asset: optionalString(args, "asset"), color: optionalString(args, "color"), prefabId: requiredString(args, "prefabId"), primitive: optionalString(args, "primitive"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.add_tag", "Add a zero-field ECS tag component to a scene entity.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("tag"),
  ]), async ({ args, projectPath }) =>
    addTag({ entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId"), tag: requiredString(args, "tag") })),
  operation(descriptor("scene.add_resource", "Add a scene resource declaration to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]), async ({ args, projectPath }) =>
    addResource({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), sceneId: requiredString(args, "sceneId"), value: optionalJson(args, "value") })),
  operation(descriptor("scene.add_ui_node", "Add a scene-owned UI node to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("uiNodeId"),
  ]), async ({ args, projectPath }) =>
    addUiNode({ projectPath, sceneId: requiredString(args, "sceneId"), uiNodeId: requiredString(args, "uiNodeId") })),
  operation(descriptor("scene.set_transform", "Set a scene entity transform through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    vectorArg("position", false),
    vectorArg("rotation", false),
    vectorArg("scale", false),
  ]), async ({ args, projectPath }) =>
    setTransform({ entityId: requiredString(args, "entityId"), position: optionalVector3(args, "position"), projectPath, rotation: optionalVector3(args, "rotation"), scale: optionalVector3(args, "scale"), sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.set_camera", "Set source camera metadata for a scene entity.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("cameraId"),
    stringArg("mode"),
    stringArg("targetId"),
    numberArg("fovY", false),
    numberArg("near", false),
    numberArg("far", false),
    numberArg("size", false),
  ]), async ({ args, projectPath }) =>
    setCamera({ cameraId: requiredString(args, "cameraId"), far: optionalNumber(args, "far"), fovY: optionalNumber(args, "fovY"), mode: requiredString(args, "mode"), near: optionalNumber(args, "near"), projectPath, sceneId: requiredString(args, "sceneId"), size: optionalNumber(args, "size"), targetId: requiredString(args, "targetId") })),
  operation(descriptor("scene.set_component", "Set a scene entity component through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("componentKind"),
    objectArg("value"),
  ]), async ({ args, projectPath }) =>
    setComponent({ componentKind: requiredString(args, "componentKind"), entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId"), value: requiredObject(args, "value") })),
  operation(descriptor("scene.set_stylized_nature", "Attach a portable stylized nature patch component inspired by grass/tree/path scene abstractions.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    numberArg("size", false),
    stringArg("density", false),
    numberArg("grassCount", false),
    numberArg("treeCount", false),
    numberArg("pathWidth", false),
    numberArg("windStrength", false),
    stringArg("groundColor", false),
    stringArg("grassRootColor", false),
    stringArg("grassTipColor", false),
    stringArg("barkColor", false),
    stringArg("leafColor", false),
    stringArg("pathColor", false),
  ]), async ({ args, projectPath }) =>
    setStylizedNatureComponent(args, projectPath)),
  operation(descriptor("scene.set_stylized_sparkles", "Attach a deterministic additive sparkle field component inspired by three-effect event/spark bursts.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    numberArg("count", false),
    numberArg("radius", false),
    numberArg("height", false),
    stringArg("color", false),
    stringArg("secondaryColor", false),
    numberArg("size", false),
    numberArg("speed", false),
    numberArg("seed", false),
  ]), async ({ args, projectPath }) =>
    setComponent({
      componentKind: "StylizedSparkles",
      entityId: requiredString(args, "entityId"),
      projectPath,
      sceneId: requiredString(args, "sceneId"),
      value: {
        color: optionalString(args, "color") ?? "#fff3a6",
        count: optionalNumber(args, "count") ?? 96,
        height: optionalNumber(args, "height") ?? 3.2,
        radius: optionalNumber(args, "radius") ?? 10,
        secondaryColor: optionalString(args, "secondaryColor") ?? "#89d7ff",
        seed: optionalNumber(args, "seed") ?? 4242,
        size: optionalNumber(args, "size") ?? 0.08,
        speed: optionalNumber(args, "speed") ?? 0.45,
      },
    })),
  operation(descriptor("scene.set_ripple_water", "Attach a portable pond/water ripple component borrowing Evan Wallace WebGL Water shader ideas: radial drop waves, normals, Fresnel and foam.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    numberArg("size", false),
    stringArg("color", false),
    stringArg("foamColor", false),
    numberArg("opacity", false),
    numberArg("rippleScale", false),
    numberArg("speed", false),
    numberArg("waveStrength", false),
  ]), async ({ args, projectPath }) =>
    setComponent({
      componentKind: "RippleWater",
      entityId: requiredString(args, "entityId"),
      projectPath,
      sceneId: requiredString(args, "sceneId"),
      value: {
        color: optionalString(args, "color") ?? "#36bad5",
        foamColor: optionalString(args, "foamColor") ?? "#d6fbff",
        opacity: optionalNumber(args, "opacity") ?? 0.78,
        rippleScale: optionalNumber(args, "rippleScale") ?? 6.4,
        size: optionalNumber(args, "size") ?? 5.8,
        speed: optionalNumber(args, "speed") ?? 0.95,
        waveStrength: optionalNumber(args, "waveStrength") ?? 0.18,
      },
    })),
  operation(descriptor("scene.set_camera_component", "Set a typed camera component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("mode", false),
    stringArg("targetId", false),
    numberArg("fovY", false),
    numberArg("near", false),
    numberArg("far", false),
    numberArg("size", false),
  ]), async ({ args, projectPath }) =>
    setCameraComponent({ entityId: requiredString(args, "entityId"), far: optionalNumber(args, "far"), fovY: optionalNumber(args, "fovY"), mode: optionalString(args, "mode"), near: optionalNumber(args, "near"), projectPath, sceneId: requiredString(args, "sceneId"), size: optionalNumber(args, "size"), targetId: optionalString(args, "targetId") })),
  operation(descriptor("scene.set_light", "Set a typed Light component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("kind", false),
    numberArg("intensity", false),
    stringArg("color", false),
    numberArg("range", false),
    numberArg("angle", false),
    numberArg("shadowBias", false),
    numberArg("shadowNormalBias", false),
  ]), async ({ args, projectPath }) =>
    setLightComponent({ angle: optionalNumber(args, "angle"), color: optionalString(args, "color"), entityId: requiredString(args, "entityId"), intensity: optionalNumber(args, "intensity"), kind: optionalString(args, "kind"), projectPath, range: optionalNumber(args, "range"), sceneId: requiredString(args, "sceneId"), shadowBias: optionalNumber(args, "shadowBias"), shadowNormalBias: optionalNumber(args, "shadowNormalBias") })),
  operation(descriptor("scene.set_lifecycle", "Set scene lifecycle source metadata.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("kind", false),
    stringArg("activation", false),
    booleanArg("initial", false),
  ]), async ({ args, projectPath }) =>
    setSceneLifecycle({ activation: optionalString(args, "activation"), initial: optionalBoolean(args, "initial"), kind: optionalString(args, "kind"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.set_prefab", "Set scene-local prefab source fields.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("prefabId"),
    stringArg("asset", false),
    stringArg("color", false),
    stringArg("primitive", false),
  ]), async ({ args, projectPath }) =>
    setPrefab({ asset: optionalString(args, "asset"), color: optionalString(args, "color"), prefabId: requiredString(args, "prefabId"), primitive: optionalString(args, "primitive"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.set_mesh_renderer", "Set a typed MeshRenderer component.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("mesh"),
    stringArg("material"),
    booleanArg("visible", false),
    booleanArg("castShadow", false),
    booleanArg("receiveShadow", false),
  ]), async ({ args, projectPath }) =>
    setMeshRendererComponent({ castShadow: optionalBoolean(args, "castShadow"), entityId: requiredString(args, "entityId"), material: requiredString(args, "material"), mesh: requiredString(args, "mesh"), projectPath, receiveShadow: optionalBoolean(args, "receiveShadow"), sceneId: requiredString(args, "sceneId"), visible: optionalBoolean(args, "visible") })),
  operation(descriptor("scene.set_render_layers", "Set a typed RenderLayers component.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArrayArg("layers"),
  ]), async ({ args, projectPath }) =>
    setRenderLayersComponent({ entityId: requiredString(args, "entityId"), layers: requiredStringArray(args, "layers"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.set_rigid_body", "Set a typed RigidBody component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("kind", false),
    numberArg("mass", false),
    numberArg("damping", false),
    numberArg("gravityScale", false),
  ]), async ({ args, projectPath }) =>
    setRigidBodyComponent({ damping: optionalNumber(args, "damping"), entityId: requiredString(args, "entityId"), gravityScale: optionalNumber(args, "gravityScale"), kind: optionalString(args, "kind"), mass: optionalNumber(args, "mass"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.set_collider", "Set a typed Collider component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("kind", false),
    vectorArg("size", false),
    numberArg("radius", false),
    numberArg("height", false),
    booleanArg("trigger", false),
  ]), async ({ args, projectPath }) =>
    setColliderComponent({ entityId: requiredString(args, "entityId"), height: optionalNumber(args, "height"), kind: optionalString(args, "kind"), projectPath, radius: optionalNumber(args, "radius"), sceneId: requiredString(args, "sceneId"), size: optionalVector3(args, "size"), trigger: optionalBoolean(args, "trigger") })),
  operation(descriptor("scene.set_character_controller", "Set a typed CharacterController component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("moveXAxis", false),
    stringArg("moveZAxis", false),
    numberArg("speed", false),
    booleanArg("blocking", false),
    stringArg("grounding", false),
    numberArg("slopeLimit", false),
    numberArg("stepOffset", false),
  ]), async ({ args, projectPath }) =>
    setCharacterControllerComponent({ blocking: optionalBoolean(args, "blocking"), grounding: optionalString(args, "grounding"), entityId: requiredString(args, "entityId"), moveXAxis: optionalString(args, "moveXAxis"), moveZAxis: optionalString(args, "moveZAxis"), projectPath, sceneId: requiredString(args, "sceneId"), slopeLimit: optionalNumber(args, "slopeLimit"), speed: optionalNumber(args, "speed"), stepOffset: optionalNumber(args, "stepOffset") })),
  operation(descriptor("scene.set_visibility", "Set a typed Visibility component.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    booleanArg("visible", false),
  ]), async ({ args, projectPath }) =>
    setVisibilityComponent({ entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId"), visible: optionalBoolean(args, "visible") })),
  operation(descriptor("scene.remove_component", "Remove a scene entity component through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("componentKind"),
  ]), async ({ args, projectPath }) =>
    removeComponent({ componentKind: requiredString(args, "componentKind"), entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId") })),
  operation(descriptor("scene.set_resource", "Set an existing scene resource declaration in structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]), async ({ args, projectPath }) =>
    setResource({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), sceneId: requiredString(args, "sceneId"), value: optionalJson(args, "value") })),
  operation(descriptor("scene.attach_script", "Attach a script module/export to a scene system.", "scene", "source-script", [
    stringArg("sceneId"),
    stringArg("systemId"),
    stringArg("modulePath"),
    stringArg("exportName"),
  ]), async ({ args, projectPath }) =>
    attachScript({ exportName: requiredString(args, "exportName"), modulePath: requiredString(args, "modulePath"), projectPath, sceneId: requiredString(args, "sceneId"), systemId: requiredString(args, "systemId") })),
  operation(descriptor("scene.bind_ui", "Bind a scene-owned UI node to a resource path.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("uiNodeId"),
    stringArg("resourcePath"),
  ]), async ({ args, projectPath }) =>
    bindUi({ projectPath, resourcePath: requiredString(args, "resourcePath"), sceneId: requiredString(args, "sceneId"), uiNodeId: requiredString(args, "uiNodeId") })),
  operation(descriptor("ui.create", "Create a structured UI source document.", "ui", "source-document", [
    stringArg("uiDocId"),
  ]), async ({ args, projectPath }) =>
    createUiDocument({ projectPath, uiDocId: requiredString(args, "uiDocId") })),
  operation(descriptor("ui.add_text", "Add or update a retained UI text node in structured source.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("text"),
  ]), async ({ args, projectPath }) =>
    addUiText({ nodeId: requiredString(args, "nodeId"), projectPath, text: requiredString(args, "text"), uiDocId: requiredString(args, "uiDocId") })),
  operation(descriptor("ui.add_node", "Add or update a retained UI widget node in structured source.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("type"),
    stringArg("action", false),
    stringArg("label", false),
    stringArg("src", false),
    stringArg("text", false),
    numberArg("value", false),
  ]), async ({ args, projectPath }) =>
    addUiNodeDocument({ action: optionalString(args, "action"), label: optionalString(args, "label"), nodeId: requiredString(args, "nodeId"), projectPath, src: optionalString(args, "src"), text: optionalString(args, "text"), type: requiredString(args, "type"), uiDocId: requiredString(args, "uiDocId"), value: optionalNumber(args, "value") })),
  operation(descriptor("ui.set_layout", "Set retained UI layout fields in a structured UI document.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("justify", false),
    stringArg("align", false),
    numberArg("top", false),
    numberArg("height", false),
    numberArg("width", false),
  ]), async ({ args, projectPath }) =>
    setUiLayout({ align: optionalString(args, "align"), height: optionalNumber(args, "height"), justify: optionalString(args, "justify"), nodeId: requiredString(args, "nodeId"), projectPath, top: optionalNumber(args, "top"), uiDocId: requiredString(args, "uiDocId"), width: optionalNumber(args, "width") })),
  operation(descriptor("ui.bind", "Bind a retained UI node to a resource path.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("resourcePath"),
  ]), async ({ args, projectPath }) =>
    bindUiDocument({ nodeId: requiredString(args, "nodeId"), projectPath, resourcePath: requiredString(args, "resourcePath"), uiDocId: requiredString(args, "uiDocId") })),
  operation(descriptor("ui.set_style", "Set retained UI style fields in a structured UI document.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("backgroundColor", false),
    stringArg("borderColor", false),
    numberArg("borderRadius", false),
    numberArg("borderWidth", false),
    stringArg("color", false),
    numberArg("fontSize", false),
    stringArg("fontWeight", false),
    numberArg("opacity", false),
    stringArg("textAlign", false),
    stringArg("textDecoration", false),
    booleanArg("wrap", false),
  ]), async ({ args, projectPath }) =>
    setUiStyle({ backgroundColor: optionalString(args, "backgroundColor"), borderColor: optionalString(args, "borderColor"), borderRadius: optionalNumber(args, "borderRadius"), borderWidth: optionalNumber(args, "borderWidth"), color: optionalString(args, "color"), fontSize: optionalNumber(args, "fontSize"), fontWeight: optionalString(args, "fontWeight"), nodeId: requiredString(args, "nodeId"), opacity: optionalNumber(args, "opacity"), projectPath, textAlign: optionalString(args, "textAlign"), textDecoration: optionalString(args, "textDecoration"), uiDocId: requiredString(args, "uiDocId"), wrap: optionalBoolean(args, "wrap") })),
  operation(descriptor("system.create", "Create a structured system source document.", "system", "source-document", [
    stringArg("systemId"),
    stringArg("schedule"),
  ]), async ({ args, projectPath }) =>
    createSystem({ projectPath, schedule: requiredString(args, "schedule"), systemId: requiredString(args, "systemId") })),
  operation(descriptor("system.attach_script", "Attach a script module/export to a system document.", "system", "source-script", [
    stringArg("systemId"),
    stringArg("modulePath"),
    stringArg("exportName"),
    stringArg("file", false),
  ]), async ({ args, projectPath }) =>
    attachSystemScript({ exportName: requiredString(args, "exportName"), file: optionalString(args, "file"), modulePath: requiredString(args, "modulePath"), projectPath, systemId: requiredString(args, "systemId") })),
  operation(descriptor("system.set_metadata", "Set system access, query, command, service, and ordering metadata.", "system", "source-document", [
    stringArg("systemId"),
    stringArg("file", false),
    stringArrayArg("after", false),
    stringArrayArg("before", false),
    objectArrayArg("commands", false),
    stringArrayArg("eventReads", false),
    stringArrayArg("eventWrites", false),
    objectArrayArg("queries", false),
    stringArrayArg("reads", false),
    stringArrayArg("resourceReads", false),
    stringArrayArg("resourceWrites", false),
    stringArg("schedule", false),
    stringArrayArg("services", false),
    stringArrayArg("writes", false),
  ]), async ({ args, projectPath }) =>
    setSystemMetadata({
      after: optionalStringArray(args, "after"),
      before: optionalStringArray(args, "before"),
      commands: optionalObjectArray(args, "commands"),
      eventReads: optionalStringArray(args, "eventReads"),
      eventWrites: optionalStringArray(args, "eventWrites"),
      file: optionalString(args, "file"),
      projectPath,
      queries: optionalObjectArray(args, "queries"),
      reads: optionalStringArray(args, "reads"),
      resourceReads: optionalStringArray(args, "resourceReads"),
      resourceWrites: optionalStringArray(args, "resourceWrites"),
      schedule: optionalString(args, "schedule"),
      services: optionalStringArray(args, "services"),
      systemId: requiredString(args, "systemId"),
      writes: optionalStringArray(args, "writes"),
    }))
] as const satisfies readonly OperationRegistryEntry<string>[];

export type AuthoringOperationName = (typeof operationEntries)[number]["name"];

export const AUTHORING_OPERATION_NAMES: readonly AuthoringOperationName[] = operationEntries.map((operation) => operation.name);
export const AUTHORING_OPERATION_REGISTRY: ReadonlyMap<AuthoringOperationName, IAuthoringOperationDescriptor> = new Map(
  operationEntries.map((operation) => [operation.name, operationDescriptor(operation)]),
);
const AUTHORING_OPERATION_ENTRIES: ReadonlyMap<AuthoringOperationName, OperationRegistryEntry> = new Map(
  operationEntries.map((operation) => [operation.name, operation]),
);

export function listAuthoringOperationDescriptors(): IAuthoringOperationDescriptor[] {
  return operationEntries.map(operationDescriptor);
}

export function getAuthoringOperationDescriptor(name: string): IAuthoringOperationDescriptor | undefined {
  const operation = AUTHORING_OPERATION_REGISTRY.get(name as AuthoringOperationName);
  return operation === undefined ? undefined : { ...operation, arguments: operation.arguments.map((argument) => ({ ...argument })) };
}

export async function dispatchAuthoringOperation(options: IDispatchAuthoringOperationOptions): Promise<IAuthoringOperationResult> {
  const operation = AUTHORING_OPERATION_ENTRIES.get(options.name as AuthoringOperationName);
  if (operation === undefined) {
    return {
      changed: false,
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_OPERATION_UNSUPPORTED",
          message: `Authoring operation '${options.name}' is not registered.`,
          path: "/name",
          suggestion: `Use one of: ${AUTHORING_OPERATION_NAMES.join(", ")}.`,
          value: options.name,
        }),
      ],
      filesWritten: [],
      ok: false,
      projectPath: options.projectPath,
    };
  }

  const diagnostics = validateRegistryArguments(operation, options.args);
  if (diagnostics.length > 0) {
    return {
      changed: false,
      diagnostics,
      filesWritten: [],
      ok: false,
      projectPath: options.projectPath,
    };
  }

  return operation.dispatch({ ...options, name: operation.name });
}

function operationDescriptor(operation: IAuthoringOperationDescriptor): IAuthoringOperationDescriptor {
  return {
    arguments: operation.arguments.map((argument) => ({ ...argument })),
    description: operation.description,
    name: operation.name,
    pathPolicy: operation.pathPolicy,
    resultShape: operation.resultShape,
    sourceFamily: operation.sourceFamily,
  };
}

function validateRegistryArguments(operation: IAuthoringOperationDescriptor, args: Record<string, unknown>) {
  return operation.arguments.flatMap((argument) => {
    const value = args[argument.name];
    if (value === undefined) {
      return argument.required
        ? [
            authoringDiagnostic({
              code: "TN_AUTHORING_OPERATION_ARG_MISSING",
              message: `Authoring operation '${operation.name}' requires argument '${argument.name}'.`,
              path: `/${argument.name}`,
              value: operation.name,
            }),
          ]
        : [];
    }
    if (argument.type === "string" && (typeof value !== "string" || value.trim() === "")) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a non-empty string")];
    }
    if (argument.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a finite number")];
    }
    if (argument.type === "number-array" && (!Array.isArray(value) || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry)))) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "an array of finite numbers")];
    }
    if (argument.type === "boolean" && typeof value !== "boolean") {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a boolean")];
    }
    if (argument.type === "json-object" && !isObject(value)) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a JSON object")];
    }
    if (argument.type === "json-object-array" && (!Array.isArray(value) || !value.every(isObject))) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "an array of JSON objects")];
    }
    if (argument.type === "string-array" && !isStringArray(value)) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "an array of non-empty strings")];
    }
    if (argument.type === "vector3" && !isVector3(value)) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a three-number vector")];
    }
    return [];
  });
}

function invalidArgumentDiagnostic(operationName: string, argumentName: string, expected: string) {
  return authoringDiagnostic({
    code: "TN_AUTHORING_OPERATION_ARG_INVALID",
    message: `Authoring operation '${operationName}' argument '${argumentName}' must be ${expected}.`,
    path: `/${argumentName}`,
    value: operationName,
  });
}

function setStylizedNatureComponent(args: Record<string, unknown>, projectPath: string): Promise<IAuthoringOperationResult> {
  const density = stylizedNatureDensity(optionalString(args, "density")) ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.density;
  const densityDefaults = STYLIZED_NATURE_DENSITY_DEFAULTS[density];
  return setComponent({
    componentKind: "StylizedNature",
    entityId: requiredString(args, "entityId"),
    projectPath,
    sceneId: requiredString(args, "sceneId"),
    value: {
      barkColor: optionalString(args, "barkColor") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.barkColor,
      density,
      grassCount: optionalNumber(args, "grassCount") ?? densityDefaults.grassCount,
      grassRootColor: optionalString(args, "grassRootColor") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.grassRootColor,
      grassTipColor: optionalString(args, "grassTipColor") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.grassTipColor,
      groundColor: optionalString(args, "groundColor") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.groundColor,
      leafColor: optionalString(args, "leafColor") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.leafColor,
      pathColor: optionalString(args, "pathColor") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.pathColor,
      pathWidth: optionalNumber(args, "pathWidth") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.pathWidth,
      size: optionalNumber(args, "size") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.size,
      treeCount: optionalNumber(args, "treeCount") ?? densityDefaults.treeCount,
      windStrength: optionalNumber(args, "windStrength") ?? STYLIZED_NATURE_AUTHORED_DEFAULTS.windStrength,
    },
  });
}

function stylizedNatureDensity(value: string | undefined): StylizedNatureDensity | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function descriptor<const TName extends string>(
  name: TName,
  description: string,
  sourceFamily: AuthoringOperationSourceFamily,
  pathPolicy: AuthoringOperationPathPolicy,
  args: IAuthoringOperationArgumentDescriptor[],
): IAuthoringOperationDescriptor<TName> {
  return {
    arguments: args,
    description,
    name,
    pathPolicy,
    resultShape: "authoring-operation-result",
    sourceFamily,
  };
}

function operation<const TName extends string>(
  descriptor: IAuthoringOperationDescriptor<TName>,
  dispatch: OperationDispatcher,
): OperationRegistryEntry<TName> {
  return { ...descriptor, dispatch };
}

function anyJsonArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "json-value" };
}

function booleanArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "boolean" };
}

function numberArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "number" };
}

function numberArrayArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "number-array" };
}

function objectArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "json-object" };
}

function objectArrayArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "json-object-array" };
}

function stringArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "string" };
}

function stringArrayArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "string-array" };
}

function vectorArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "vector3" };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Operation argument '${key}' was not validated.`);
  }
  return value;
}

function requiredObject(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (!isObject(value)) {
    throw new Error(`Operation argument '${key}' was not validated.`);
  }
  return value;
}

function requiredObjectArray(args: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = args[key];
  if (!Array.isArray(value) || !value.every(isObject)) {
    throw new Error(`Operation argument '${key}' was not validated.`);
  }
  return value;
}

function requiredStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!isStringArray(value)) {
    throw new Error(`Operation argument '${key}' was not validated.`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  return isStringArray(value) ? value : undefined;
}

function optionalObject(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = args[key];
  return isObject(value) ? value : undefined;
}

function optionalObjectArray(args: Record<string, unknown>, key: string): Record<string, unknown>[] | undefined {
  const value = args[key];
  return Array.isArray(value) && value.every(isObject) ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalNumberArray(args: Record<string, unknown>, key: string): number[] | undefined {
  const value = args[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? value : undefined;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function optionalJson(args: Record<string, unknown>, key: string): unknown {
  return args[key];
}

function compactTransformArgs(args: Record<string, unknown>): { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] } | undefined {
  const transform = {
    position: optionalVector3(args, "position"),
    rotation: optionalVector3(args, "rotation"),
    scale: optionalVector3(args, "scale"),
  };
  return transform.position === undefined && transform.rotation === undefined && transform.scale === undefined ? undefined : transform;
}

function optionalVector3(args: Record<string, unknown>, key: string): [number, number, number] | undefined {
  const value = args[key];
  return isVector3(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim() !== "");
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
