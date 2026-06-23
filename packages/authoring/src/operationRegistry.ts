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
  addResourceDocumentEntry,
  addResource,
  addTag,
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
  setLightComponent,
  setMaterial,
  setMeshRendererComponent,
  setPrefab,
  setRenderLayersComponent,
  setResource,
  setResourceDocumentEntry,
  setRuntimeRendering,
  setRuntimeWindow,
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

export type AuthoringOperationName =
  | "asset.add"
  | "audio.add_sound"
  | "audio.create"
  | "environment.create"
  | "environment.set_map"
  | "environment.set_light_probe"
  | "environment.set_path"
  | "environment.set_skybox"
  | "environment.set_source_asset_lod"
  | "environment.set_terrain"
  | "environment.set_walkability"
  | "generator.record"
  | "input.add_action"
  | "input.add_axis"
  | "material.create"
  | "material.set"
  | "mesh.create_custom"
  | "mesh.create_primitive"
  | "prefab.add_component"
  | "prefab.create"
  | "project.create"
  | "resources.add"
  | "resources.create"
  | "resources.set"
  | "runtime.create"
  | "runtime.set_rendering"
  | "runtime.set_window"
  | "scene.add_entity"
  | "scene.add_group"
  | "scene.add_prefab"
  | "scene.add_resource"
  | "scene.add_tag"
  | "scene.add_ui_node"
  | "scene.attach_script"
  | "scene.bind_ui"
  | "scene.remove_component"
  | "scene.set_camera"
  | "scene.set_camera_component"
  | "scene.set_character_controller"
  | "scene.set_collider"
  | "scene.set_component"
  | "scene.set_light"
  | "scene.set_lifecycle"
  | "scene.set_mesh_renderer"
  | "scene.set_prefab"
  | "scene.set_render_layers"
  | "scene.set_rigid_body"
  | "scene.set_resource"
  | "scene.set_transform"
  | "scene.set_visibility"
  | "system.attach_script"
  | "system.create"
  | "system.set_metadata"
  | "target.set_profile"
  | "ui.add_text"
  | "ui.add_node"
  | "ui.bind"
  | "ui.create"
  | "ui.set_layout"
  | "ui.set_style";

export type AuthoringOperationPathPolicy = "source-document" | "source-script";
export type AuthoringOperationSourceFamily = "asset" | "audio" | "environment" | "generator" | "input" | "material" | "mesh" | "prefab" | "project" | "resources" | "runtime" | "scene" | "system" | "target" | "ui";
export type AuthoringOperationResultShape = "authoring-operation-result";

export interface IAuthoringOperationArgumentDescriptor {
  name: string;
  required: boolean;
  type: "boolean" | "json-object" | "json-object-array" | "json-value" | "number" | "number-array" | "string" | "string-array" | "vector3";
}

export interface IAuthoringOperationDescriptor {
  arguments: IAuthoringOperationArgumentDescriptor[];
  description: string;
  name: AuthoringOperationName;
  pathPolicy: AuthoringOperationPathPolicy;
  resultShape: AuthoringOperationResultShape;
  sourceFamily: AuthoringOperationSourceFamily;
}

export interface IDispatchAuthoringOperationOptions extends IAuthoringOperationContext {
  args: Record<string, unknown>;
  name: AuthoringOperationName | string;
}

type OperationDispatcher = (options: IDispatchAuthoringOperationOptions) => Promise<IAuthoringOperationResult>;

const descriptors = [
  descriptor("asset.add", "Add or replace an asset declaration in a structured asset document.", "asset", "source-document", [
    stringArg("assetId"),
    stringArg("type"),
    stringArg("path", false),
    numberArg("width", false),
    numberArg("height", false),
    stringArg("usage", false),
    stringArg("format", false),
    numberArg("sampleCount", false),
    stringArg("file", false),
  ]),
  descriptor("audio.create", "Create a structured audio source document.", "audio", "source-document", [
    stringArg("audioDocId"),
  ]),
  descriptor("audio.add_sound", "Add or replace an audio sound declaration in structured source.", "audio", "source-document", [
    stringArg("audioDocId"),
    stringArg("soundId"),
    stringArg("asset"),
  ]),
  descriptor("environment.create", "Create a structured environment source document.", "environment", "source-document", [
    stringArg("environmentId"),
  ]),
  descriptor("environment.set_skybox", "Set environment skybox source fields.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("asset"),
    stringArg("mode", false),
  ]),
  descriptor("environment.set_map", "Set environment map source fields.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("asset"),
  ]),
  descriptor("environment.set_light_probe", "Add or replace environment light probe metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("probeId"),
    objectArg("probe"),
  ]),
  descriptor("environment.set_path", "Set environment path metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    anyJsonArg("path"),
  ]),
  descriptor("environment.set_terrain", "Set promoted environment terrain source fields.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("terrainId", false),
    stringArg("heightMode", false),
    stringArg("heightmap", false),
  ]),
  descriptor("environment.set_walkability", "Set environment walkability metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    anyJsonArg("walkability"),
  ]),
  descriptor("environment.set_source_asset_lod", "Set environment source asset LOD metadata.", "environment", "source-document", [
    stringArg("environmentId"),
    stringArg("sourceAssetId"),
    anyJsonArg("lod"),
  ]),
  descriptor("generator.record", "Create or update one-way generator provenance metadata.", "generator", "source-document", [
    stringArg("generatorId"),
    stringArg("modulePath"),
    stringArg("exportName"),
    stringArrayArg("outputs"),
    stringArg("overwritePolicy", false),
    stringArg("inputHash", false),
    stringArg("outputHash", false),
  ]),
  descriptor("input.add_action", "Add or replace an input action in a structured input document.", "input", "source-document", [
    stringArg("inputDocId"),
    stringArg("actionId"),
    stringArrayArg("keys"),
  ]),
  descriptor("input.add_axis", "Add or replace an input axis in a structured input document.", "input", "source-document", [
    stringArg("inputDocId"),
    stringArg("axisId"),
    stringArrayArg("negativeKeys"),
    stringArrayArg("positiveKeys"),
    stringArg("value", false),
  ]),
  descriptor("material.create", "Create a structured material source document.", "material", "source-document", [
    stringArg("materialId"),
  ]),
  descriptor("material.set", "Set material source fields.", "material", "source-document", [
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
  ]),
  descriptor("mesh.create_primitive", "Create or update a primitive mesh source declaration.", "mesh", "source-document", [
    stringArg("meshId"),
    stringArg("kind"),
    stringArg("file", false),
  ]),
  descriptor("mesh.create_custom", "Create a custom mesh source document with attributes and indices.", "mesh", "source-document", [
    stringArg("meshId"),
    objectArrayArg("attributes"),
    numberArrayArg("indices", false),
    stringArg("storage", false),
  ]),
  descriptor("prefab.create", "Create a structured prefab source document.", "prefab", "source-document", [
    stringArg("prefabId"),
  ]),
  descriptor("prefab.add_component", "Add or replace a component on a structured prefab document.", "prefab", "source-document", [
    stringArg("prefabId"),
    stringArg("componentKind"),
    objectArg("value"),
  ]),
  descriptor("project.create", "Create or update structured project metadata.", "project", "source-document", [
    stringArg("projectId"),
    stringArg("authoringVersion", false),
    stringArrayArg("sourceRoots", false),
    stringArrayArg("buildTargets", false),
    stringArg("file", false),
  ]),
  descriptor("resources.create", "Create a reusable resources source document.", "resources", "source-document", [
    stringArg("resourcesDocId"),
  ]),
  descriptor("resources.add", "Add a resource declaration to a reusable resources source document.", "resources", "source-document", [
    stringArg("resourcesDocId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]),
  descriptor("resources.set", "Update a resource declaration in a reusable resources source document.", "resources", "source-document", [
    stringArg("resourcesDocId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]),
  descriptor("runtime.create", "Create a structured runtime config source document.", "runtime", "source-document", [
    stringArg("runtimeId"),
  ]),
  descriptor("runtime.set_window", "Set primary runtime window source fields.", "runtime", "source-document", [
    stringArg("runtimeId"),
    numberArg("height", false),
    stringArg("title", false),
    numberArg("width", false),
  ]),
  descriptor("runtime.set_rendering", "Set promoted runtime renderer source fields.", "runtime", "source-document", [
    stringArg("runtimeId"),
    stringArg("antialias", false),
    booleanArg("bloomEnabled", false),
    numberArg("bloomIntensity", false),
    numberArg("bloomThreshold", false),
    stringArg("renderPath", false),
  ]),
  descriptor("target.set_profile", "Create or update a structured target profile source document.", "target", "source-document", [
    stringArg("targetProfileId"),
    stringArrayArg("targets"),
    objectArg("budgets", false),
    objectArg("performance", false),
  ]),
  descriptor("scene.add_entity", "Add an entity to a structured scene document.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("prefabId", false),
  ]),
  descriptor("scene.add_group", "Add a scene container group entity to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("groupId"),
    stringArg("name", false),
    vectorArg("position", false),
  ]),
  descriptor("scene.add_prefab", "Add a scene-local prefab declaration to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("prefabId"),
    stringArg("primitive", false),
    stringArg("color", false),
    stringArg("asset", false),
  ]),
  descriptor("scene.add_tag", "Add a zero-field ECS tag component to a scene entity.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("tag"),
  ]),
  descriptor("scene.add_resource", "Add a scene resource declaration to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]),
  descriptor("scene.add_ui_node", "Add a scene-owned UI node to structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("uiNodeId"),
  ]),
  descriptor("scene.set_transform", "Set a scene entity transform through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    vectorArg("position", false),
    vectorArg("rotation", false),
    vectorArg("scale", false),
  ]),
  descriptor("scene.set_camera", "Set source camera metadata for a scene entity.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("cameraId"),
    stringArg("mode"),
    stringArg("targetId"),
    numberArg("fovY", false),
    numberArg("near", false),
    numberArg("far", false),
    numberArg("size", false),
  ]),
  descriptor("scene.set_component", "Set a scene entity component through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("componentKind"),
    objectArg("value"),
  ]),
  descriptor("scene.set_camera_component", "Set a typed camera component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("mode", false),
    stringArg("targetId", false),
    numberArg("fovY", false),
    numberArg("near", false),
    numberArg("far", false),
    numberArg("size", false),
  ]),
  descriptor("scene.set_light", "Set a typed Light component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("kind", false),
    numberArg("intensity", false),
    stringArg("color", false),
    numberArg("range", false),
    numberArg("angle", false),
    numberArg("shadowBias", false),
    numberArg("shadowNormalBias", false),
  ]),
  descriptor("scene.set_lifecycle", "Set scene lifecycle source metadata.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("kind", false),
    stringArg("activation", false),
    booleanArg("initial", false),
  ]),
  descriptor("scene.set_prefab", "Set scene-local prefab source fields.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("prefabId"),
    stringArg("asset", false),
    stringArg("color", false),
    stringArg("primitive", false),
  ]),
  descriptor("scene.set_mesh_renderer", "Set a typed MeshRenderer component.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("mesh"),
    stringArg("material"),
    booleanArg("visible", false),
    booleanArg("castShadow", false),
    booleanArg("receiveShadow", false),
  ]),
  descriptor("scene.set_render_layers", "Set a typed RenderLayers component.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArrayArg("layers"),
  ]),
  descriptor("scene.set_rigid_body", "Set a typed RigidBody component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("kind", false),
    numberArg("mass", false),
    numberArg("damping", false),
    numberArg("gravityScale", false),
  ]),
  descriptor("scene.set_collider", "Set a typed Collider component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("kind", false),
    vectorArg("size", false),
    numberArg("radius", false),
    numberArg("height", false),
    booleanArg("trigger", false),
  ]),
  descriptor("scene.set_character_controller", "Set a typed CharacterController component with defaults.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("moveXAxis", false),
    stringArg("moveZAxis", false),
    numberArg("speed", false),
    booleanArg("blocking", false),
    stringArg("grounding", false),
    numberArg("slopeLimit", false),
    numberArg("stepOffset", false),
  ]),
  descriptor("scene.set_visibility", "Set a typed Visibility component.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    booleanArg("visible", false),
  ]),
  descriptor("scene.remove_component", "Remove a scene entity component through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("componentKind"),
  ]),
  descriptor("scene.set_resource", "Set an existing scene resource declaration in structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("resourceId"),
    stringArg("path", false),
    anyJsonArg("value", false),
  ]),
  descriptor("scene.attach_script", "Attach a script module/export to a scene system.", "scene", "source-script", [
    stringArg("sceneId"),
    stringArg("systemId"),
    stringArg("modulePath"),
    stringArg("exportName"),
  ]),
  descriptor("scene.bind_ui", "Bind a scene-owned UI node to a resource path.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("uiNodeId"),
    stringArg("resourcePath"),
  ]),
  descriptor("ui.create", "Create a structured UI source document.", "ui", "source-document", [
    stringArg("uiDocId"),
  ]),
  descriptor("ui.add_text", "Add or update a retained UI text node in structured source.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("text"),
  ]),
  descriptor("ui.add_node", "Add or update a retained UI widget node in structured source.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("type"),
    stringArg("action", false),
    stringArg("label", false),
    stringArg("src", false),
    stringArg("text", false),
    numberArg("value", false),
  ]),
  descriptor("ui.set_layout", "Set retained UI layout fields in a structured UI document.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("justify", false),
    stringArg("align", false),
    numberArg("top", false),
    numberArg("height", false),
    numberArg("width", false),
  ]),
  descriptor("ui.bind", "Bind a retained UI node to a resource path.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("resourcePath"),
  ]),
  descriptor("ui.set_style", "Set retained UI style fields in a structured UI document.", "ui", "source-document", [
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
  ]),
  descriptor("system.create", "Create a structured system source document.", "system", "source-document", [
    stringArg("systemId"),
    stringArg("schedule"),
  ]),
  descriptor("system.attach_script", "Attach a script module/export to a system document.", "system", "source-script", [
    stringArg("systemId"),
    stringArg("modulePath"),
    stringArg("exportName"),
    stringArg("file", false),
  ]),
  descriptor("system.set_metadata", "Set system access, query, command, service, and ordering metadata.", "system", "source-document", [
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
  ]),
] as const satisfies readonly IAuthoringOperationDescriptor[];

const dispatchers: Record<AuthoringOperationName, OperationDispatcher> = {
  "asset.add": async ({ args, projectPath }) =>
    addAsset({ assetId: requiredString(args, "assetId"), file: optionalString(args, "file"), format: optionalString(args, "format"), height: optionalNumber(args, "height"), path: optionalString(args, "path"), projectPath, sampleCount: optionalNumber(args, "sampleCount"), type: requiredString(args, "type"), usage: optionalString(args, "usage"), width: optionalNumber(args, "width") }),
  "audio.add_sound": async ({ args, projectPath }) =>
    addAudioSound({ asset: requiredString(args, "asset"), audioDocId: requiredString(args, "audioDocId"), projectPath, soundId: requiredString(args, "soundId") }),
  "audio.create": async ({ args, projectPath }) =>
    createAudioDocument({ audioDocId: requiredString(args, "audioDocId"), projectPath }),
  "environment.create": async ({ args, projectPath }) =>
    createEnvironmentDocument({ environmentId: requiredString(args, "environmentId"), projectPath }),
  "environment.set_map": async ({ args, projectPath }) =>
    setEnvironmentMap({ asset: requiredString(args, "asset"), environmentId: requiredString(args, "environmentId"), projectPath }),
  "environment.set_light_probe": async ({ args, projectPath }) =>
    setEnvironmentLightProbe({ environmentId: requiredString(args, "environmentId"), probe: requiredObject(args, "probe"), probeId: requiredString(args, "probeId"), projectPath }),
  "environment.set_path": async ({ args, projectPath }) =>
    setEnvironmentPath({ environmentId: requiredString(args, "environmentId"), path: optionalJson(args, "path"), projectPath }),
  "environment.set_skybox": async ({ args, projectPath }) =>
    setEnvironmentSkybox({ asset: requiredString(args, "asset"), environmentId: requiredString(args, "environmentId"), mode: optionalString(args, "mode"), projectPath }),
  "environment.set_source_asset_lod": async ({ args, projectPath }) =>
    setEnvironmentSourceAssetLod({ environmentId: requiredString(args, "environmentId"), lod: optionalJson(args, "lod"), projectPath, sourceAssetId: requiredString(args, "sourceAssetId") }),
  "environment.set_terrain": async ({ args, projectPath }) =>
    setEnvironmentTerrain({ environmentId: requiredString(args, "environmentId"), heightmap: optionalString(args, "heightmap"), heightMode: optionalString(args, "heightMode"), projectPath, terrainId: optionalString(args, "terrainId") }),
  "environment.set_walkability": async ({ args, projectPath }) =>
    setEnvironmentWalkability({ environmentId: requiredString(args, "environmentId"), projectPath, walkability: optionalJson(args, "walkability") }),
  "generator.record": async ({ args, projectPath }) =>
    recordGeneratorProvenance({ exportName: requiredString(args, "exportName"), generatorId: requiredString(args, "generatorId"), inputHash: optionalString(args, "inputHash"), modulePath: requiredString(args, "modulePath"), outputHash: optionalString(args, "outputHash"), outputs: requiredStringArray(args, "outputs"), overwritePolicy: optionalString(args, "overwritePolicy"), projectPath }),
  "input.add_action": async ({ args, projectPath }) =>
    addInputAction({ actionId: requiredString(args, "actionId"), inputDocId: requiredString(args, "inputDocId"), keys: requiredStringArray(args, "keys"), projectPath }),
  "input.add_axis": async ({ args, projectPath }) =>
    addInputAxis({ axisId: requiredString(args, "axisId"), inputDocId: requiredString(args, "inputDocId"), negativeKeys: requiredStringArray(args, "negativeKeys"), positiveKeys: requiredStringArray(args, "positiveKeys"), projectPath, value: optionalString(args, "value") }),
  "material.create": async ({ args, projectPath }) =>
    createMaterial({ materialId: requiredString(args, "materialId"), projectPath }),
  "material.set": async ({ args, projectPath }) =>
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
    }),
  "mesh.create_primitive": async ({ args, projectPath }) =>
    createMeshPrimitive({ file: optionalString(args, "file"), kind: requiredString(args, "kind"), meshId: requiredString(args, "meshId"), projectPath }),
  "mesh.create_custom": async ({ args, projectPath }) =>
    createMeshCustom({ attributes: requiredObjectArray(args, "attributes") as Array<{ itemSize: number; name: string; values: number[] }>, indices: optionalNumberArray(args, "indices"), meshId: requiredString(args, "meshId"), projectPath, storage: optionalString(args, "storage") }),
  "prefab.add_component": async ({ args, projectPath }) =>
    addPrefabComponent({ componentKind: requiredString(args, "componentKind"), prefabId: requiredString(args, "prefabId"), projectPath, value: requiredObject(args, "value") }),
  "prefab.create": async ({ args, projectPath }) =>
    createPrefabDocument({ prefabId: requiredString(args, "prefabId"), projectPath }),
  "project.create": async ({ args, projectPath }) =>
    createProjectMetadata({ authoringVersion: optionalString(args, "authoringVersion"), buildTargets: optionalStringArray(args, "buildTargets"), file: optionalString(args, "file"), projectId: requiredString(args, "projectId"), projectPath, sourceRoots: optionalStringArray(args, "sourceRoots") }),
  "resources.add": async ({ args, projectPath }) =>
    addResourceDocumentEntry({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), resourcesDocId: requiredString(args, "resourcesDocId"), value: optionalJson(args, "value") }),
  "resources.create": async ({ args, projectPath }) =>
    createResourcesDocument({ projectPath, resourcesDocId: requiredString(args, "resourcesDocId") }),
  "resources.set": async ({ args, projectPath }) =>
    setResourceDocumentEntry({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), resourcesDocId: requiredString(args, "resourcesDocId"), value: optionalJson(args, "value") }),
  "runtime.create": async ({ args, projectPath }) =>
    createRuntimeConfig({ projectPath, runtimeId: requiredString(args, "runtimeId") }),
  "runtime.set_rendering": async ({ args, projectPath }) =>
    setRuntimeRendering({ antialias: optionalString(args, "antialias"), bloomEnabled: optionalBoolean(args, "bloomEnabled"), bloomIntensity: optionalNumber(args, "bloomIntensity"), bloomThreshold: optionalNumber(args, "bloomThreshold"), projectPath, renderPath: optionalString(args, "renderPath"), runtimeId: requiredString(args, "runtimeId") }),
  "runtime.set_window": async ({ args, projectPath }) =>
    setRuntimeWindow({ height: optionalNumber(args, "height"), projectPath, runtimeId: requiredString(args, "runtimeId"), title: optionalString(args, "title"), width: optionalNumber(args, "width") }),
  "target.set_profile": async ({ args, projectPath }) =>
    setTargetProfile({ budgets: optionalObject(args, "budgets"), performance: optionalObject(args, "performance"), projectPath, targetProfileId: requiredString(args, "targetProfileId"), targets: requiredStringArray(args, "targets") }),
  "scene.add_entity": async ({ args, projectPath }) =>
    addEntity({ entityId: requiredString(args, "entityId"), prefabId: optionalString(args, "prefabId"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.add_group": async ({ args, projectPath }) =>
    addGroup({ groupId: requiredString(args, "groupId"), name: optionalString(args, "name"), position: optionalVector3(args, "position"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.add_prefab": async ({ args, projectPath }) =>
    addPrefab({ asset: optionalString(args, "asset"), color: optionalString(args, "color"), prefabId: requiredString(args, "prefabId"), primitive: optionalString(args, "primitive"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.add_resource": async ({ args, projectPath }) =>
    addResource({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), sceneId: requiredString(args, "sceneId"), value: optionalJson(args, "value") }),
  "scene.add_tag": async ({ args, projectPath }) =>
    addTag({ entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId"), tag: requiredString(args, "tag") }),
  "scene.add_ui_node": async ({ args, projectPath }) =>
    addUiNode({ projectPath, sceneId: requiredString(args, "sceneId"), uiNodeId: requiredString(args, "uiNodeId") }),
  "scene.attach_script": async ({ args, projectPath }) =>
    attachScript({ exportName: requiredString(args, "exportName"), modulePath: requiredString(args, "modulePath"), projectPath, sceneId: requiredString(args, "sceneId"), systemId: requiredString(args, "systemId") }),
  "scene.bind_ui": async ({ args, projectPath }) =>
    bindUi({ projectPath, resourcePath: requiredString(args, "resourcePath"), sceneId: requiredString(args, "sceneId"), uiNodeId: requiredString(args, "uiNodeId") }),
  "scene.remove_component": async ({ args, projectPath }) =>
    removeComponent({ componentKind: requiredString(args, "componentKind"), entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.set_camera": async ({ args, projectPath }) =>
    setCamera({ cameraId: requiredString(args, "cameraId"), far: optionalNumber(args, "far"), fovY: optionalNumber(args, "fovY"), mode: requiredString(args, "mode"), near: optionalNumber(args, "near"), projectPath, sceneId: requiredString(args, "sceneId"), size: optionalNumber(args, "size"), targetId: requiredString(args, "targetId") }),
  "scene.set_camera_component": async ({ args, projectPath }) =>
    setCameraComponent({ entityId: requiredString(args, "entityId"), far: optionalNumber(args, "far"), fovY: optionalNumber(args, "fovY"), mode: optionalString(args, "mode"), near: optionalNumber(args, "near"), projectPath, sceneId: requiredString(args, "sceneId"), size: optionalNumber(args, "size"), targetId: optionalString(args, "targetId") }),
  "scene.set_character_controller": async ({ args, projectPath }) =>
    setCharacterControllerComponent({ blocking: optionalBoolean(args, "blocking"), grounding: optionalString(args, "grounding"), entityId: requiredString(args, "entityId"), moveXAxis: optionalString(args, "moveXAxis"), moveZAxis: optionalString(args, "moveZAxis"), projectPath, sceneId: requiredString(args, "sceneId"), slopeLimit: optionalNumber(args, "slopeLimit"), speed: optionalNumber(args, "speed"), stepOffset: optionalNumber(args, "stepOffset") }),
  "scene.set_collider": async ({ args, projectPath }) =>
    setColliderComponent({ entityId: requiredString(args, "entityId"), height: optionalNumber(args, "height"), kind: optionalString(args, "kind"), projectPath, radius: optionalNumber(args, "radius"), sceneId: requiredString(args, "sceneId"), size: optionalVector3(args, "size"), trigger: optionalBoolean(args, "trigger") }),
  "scene.set_component": async ({ args, projectPath }) =>
    setComponent({ componentKind: requiredString(args, "componentKind"), entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId"), value: requiredObject(args, "value") }),
  "scene.set_light": async ({ args, projectPath }) =>
    setLightComponent({ angle: optionalNumber(args, "angle"), color: optionalString(args, "color"), entityId: requiredString(args, "entityId"), intensity: optionalNumber(args, "intensity"), kind: optionalString(args, "kind"), projectPath, range: optionalNumber(args, "range"), sceneId: requiredString(args, "sceneId"), shadowBias: optionalNumber(args, "shadowBias"), shadowNormalBias: optionalNumber(args, "shadowNormalBias") }),
  "scene.set_lifecycle": async ({ args, projectPath }) =>
    setSceneLifecycle({ activation: optionalString(args, "activation"), initial: optionalBoolean(args, "initial"), kind: optionalString(args, "kind"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.set_prefab": async ({ args, projectPath }) =>
    setPrefab({ asset: optionalString(args, "asset"), color: optionalString(args, "color"), prefabId: requiredString(args, "prefabId"), primitive: optionalString(args, "primitive"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.set_mesh_renderer": async ({ args, projectPath }) =>
    setMeshRendererComponent({ castShadow: optionalBoolean(args, "castShadow"), entityId: requiredString(args, "entityId"), material: requiredString(args, "material"), mesh: requiredString(args, "mesh"), projectPath, receiveShadow: optionalBoolean(args, "receiveShadow"), sceneId: requiredString(args, "sceneId"), visible: optionalBoolean(args, "visible") }),
  "scene.set_render_layers": async ({ args, projectPath }) =>
    setRenderLayersComponent({ entityId: requiredString(args, "entityId"), layers: requiredStringArray(args, "layers"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.set_rigid_body": async ({ args, projectPath }) =>
    setRigidBodyComponent({ damping: optionalNumber(args, "damping"), entityId: requiredString(args, "entityId"), gravityScale: optionalNumber(args, "gravityScale"), kind: optionalString(args, "kind"), mass: optionalNumber(args, "mass"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.set_resource": async ({ args, projectPath }) =>
    setResource({ path: optionalString(args, "path"), projectPath, resourceId: requiredString(args, "resourceId"), sceneId: requiredString(args, "sceneId"), value: optionalJson(args, "value") }),
  "scene.set_transform": async ({ args, projectPath }) =>
    setTransform({ entityId: requiredString(args, "entityId"), position: optionalVector3(args, "position"), projectPath, rotation: optionalVector3(args, "rotation"), scale: optionalVector3(args, "scale"), sceneId: requiredString(args, "sceneId") }),
  "scene.set_visibility": async ({ args, projectPath }) =>
    setVisibilityComponent({ entityId: requiredString(args, "entityId"), projectPath, sceneId: requiredString(args, "sceneId"), visible: optionalBoolean(args, "visible") }),
  "system.attach_script": async ({ args, projectPath }) =>
    attachSystemScript({ exportName: requiredString(args, "exportName"), file: optionalString(args, "file"), modulePath: requiredString(args, "modulePath"), projectPath, systemId: requiredString(args, "systemId") }),
  "system.create": async ({ args, projectPath }) =>
    createSystem({ projectPath, schedule: requiredString(args, "schedule"), systemId: requiredString(args, "systemId") }),
  "system.set_metadata": async ({ args, projectPath }) =>
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
    }),
  "ui.add_text": async ({ args, projectPath }) =>
    addUiText({ nodeId: requiredString(args, "nodeId"), projectPath, text: requiredString(args, "text"), uiDocId: requiredString(args, "uiDocId") }),
  "ui.add_node": async ({ args, projectPath }) =>
    addUiNodeDocument({ action: optionalString(args, "action"), label: optionalString(args, "label"), nodeId: requiredString(args, "nodeId"), projectPath, src: optionalString(args, "src"), text: optionalString(args, "text"), type: requiredString(args, "type"), uiDocId: requiredString(args, "uiDocId"), value: optionalNumber(args, "value") }),
  "ui.bind": async ({ args, projectPath }) =>
    bindUiDocument({ nodeId: requiredString(args, "nodeId"), projectPath, resourcePath: requiredString(args, "resourcePath"), uiDocId: requiredString(args, "uiDocId") }),
  "ui.create": async ({ args, projectPath }) =>
    createUiDocument({ projectPath, uiDocId: requiredString(args, "uiDocId") }),
  "ui.set_layout": async ({ args, projectPath }) =>
    setUiLayout({ align: optionalString(args, "align"), height: optionalNumber(args, "height"), justify: optionalString(args, "justify"), nodeId: requiredString(args, "nodeId"), projectPath, top: optionalNumber(args, "top"), uiDocId: requiredString(args, "uiDocId"), width: optionalNumber(args, "width") }),
  "ui.set_style": async ({ args, projectPath }) =>
    setUiStyle({ backgroundColor: optionalString(args, "backgroundColor"), borderColor: optionalString(args, "borderColor"), borderRadius: optionalNumber(args, "borderRadius"), borderWidth: optionalNumber(args, "borderWidth"), color: optionalString(args, "color"), fontSize: optionalNumber(args, "fontSize"), fontWeight: optionalString(args, "fontWeight"), nodeId: requiredString(args, "nodeId"), opacity: optionalNumber(args, "opacity"), projectPath, textAlign: optionalString(args, "textAlign"), textDecoration: optionalString(args, "textDecoration"), uiDocId: requiredString(args, "uiDocId"), wrap: optionalBoolean(args, "wrap") }),
};

export const AUTHORING_OPERATION_NAMES: readonly AuthoringOperationName[] = descriptors.map((operation) => operation.name);
export const AUTHORING_OPERATION_REGISTRY: ReadonlyMap<AuthoringOperationName, IAuthoringOperationDescriptor> = new Map(
  descriptors.map((operation) => [operation.name, operation]),
);

export function listAuthoringOperationDescriptors(): IAuthoringOperationDescriptor[] {
  return descriptors.map((operation) => ({ ...operation, arguments: operation.arguments.map((argument) => ({ ...argument })) }));
}

export function getAuthoringOperationDescriptor(name: string): IAuthoringOperationDescriptor | undefined {
  const operation = AUTHORING_OPERATION_REGISTRY.get(name as AuthoringOperationName);
  return operation === undefined ? undefined : { ...operation, arguments: operation.arguments.map((argument) => ({ ...argument })) };
}

export async function dispatchAuthoringOperation(options: IDispatchAuthoringOperationOptions): Promise<IAuthoringOperationResult> {
  const operation = getAuthoringOperationDescriptor(options.name);
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

  return dispatchers[operation.name]({ ...options, name: operation.name });
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

function descriptor(
  name: AuthoringOperationName,
  description: string,
  sourceFamily: AuthoringOperationSourceFamily,
  pathPolicy: AuthoringOperationPathPolicy,
  args: IAuthoringOperationArgumentDescriptor[],
): IAuthoringOperationDescriptor {
  return {
    arguments: args,
    description,
    name,
    pathPolicy,
    resultShape: "authoring-operation-result",
    sourceFamily,
  };
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
