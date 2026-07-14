import type { IAuthoringProject } from "@threenative/authoring";
import type {
  EditorDocumentAccess,
  IEditorDocumentClassification,
  IEditorGamepadViewerSnapshot,
  IEditorToolSnapshot,
  IEditorVisualPanelRow,
  IEditorVisualPanelSnapshot,
} from "@threenative/ir";

export type EditorShellStatus = "empty" | "error" | "ready";

export interface IEditorDiagnosticView {
  code: string;
  file?: string;
  message: string;
  path?: string;
  severity: "error" | "info" | "warning";
  suggestion?: string;
}

export interface IEditorTreeRow {
  access: EditorDocumentAccess;
  badge?: string;
  children?: IEditorTreeRow[];
  documentPath?: string;
  id: string;
  jsonPointer?: string;
  label: string;
  sourcePath?: string;
}

export interface IEditorPropertyRow {
  access: EditorDocumentAccess;
  component?: string;
  defaultValue?: unknown;
  documentPath?: string;
  fieldKind?: EditorInspectorFieldKind;
  id: string;
  jsonPointer?: string;
  label: string;
  operation?: IEditorPropertyOperation;
  options?: readonly string[];
  path?: string;
  readOnly: boolean;
  readOnlyReason?: string;
  sourceFamily?: EditorInspectorSourceFamily;
  sourcePath?: string;
  value?: string;
}

export type EditorInspectorFieldKind =
  | "asset"
  | "boolean"
  | "color"
  | "enum"
  | "generated"
  | "json"
  | "number"
  | "script"
  | "string"
  | "stringList"
  | "vector3";

export type EditorInspectorSourceFamily = "asset" | "audio" | "distribution" | "environment" | "generator" | "input" | "material" | "mesh" | "prefab" | "project" | "resources" | "runtime" | "scene" | "schema" | "system" | "target" | "ui";

export interface IEditorPropertyOperation {
  args: Record<string, unknown>;
  name: string;
  valueArg?: string;
}

export interface IEditorAddComponentDefinition {
  component: string;
  defaults: Record<string, unknown>;
  featureStatus: EditorFeatureStatus;
  incompatibleWith: readonly string[];
  pack: "core" | "experimental" | "physics" | "rendering" | "scripting";
  readOnlyReason?: string;
  sourceFamily: EditorInspectorSourceFamily;
}

export type EditorFeatureStatus = "disabled" | "enabled" | "planned-prd";

export type EditorModalActionId =
  | "add.camera"
  | "add.custom_glb"
  | "add.empty_entity"
  | "add.primitive_sphere"
  | "add.terrain"
  | "add.light"
  | "build.preview"
  | "delete.selection"
  | "scene.create_default"
  | "scene.save"
  | "settings.editor";

export interface IEditorModalActionDefinition {
  assetPath?: string;
  featureStatus: EditorFeatureStatus;
  handler?: "buildPreview" | "saveScene";
  id: EditorModalActionId;
  label: string;
  operationName?: string;
  readOnly: boolean;
  readOnlyReason?: string;
}

export interface IEditorAssetRow {
  access: EditorDocumentAccess;
  id: string;
  kind?: string;
  label: string;
  path?: string;
}

export interface IEditorEnvironmentSummary {
  skybox?: { mode: string; value: string };
  terrain?: { heightMode?: string; id?: string; sourceAsset?: string };
}

export type EditorScenePrimitive = "box" | "camera" | "capsule" | "cone" | "cylinder" | "plane" | "sphere";

export interface IEditorSceneObject {
  assetPath?: string;
  color?: string;
  components?: readonly string[];
  documentPath?: string;
  id: string;
  inspectorRows?: readonly IEditorPropertyRow[];
  kind: "camera" | "entity" | "light";
  label: string;
  position?: readonly [number, number, number];
  primitive: EditorScenePrimitive;
  rotation?: readonly [number, number, number];
  rowId: string;
  scale?: readonly [number, number, number];
  sourcePath?: string;
}

export interface IEditorStatusItem {
  id: string;
  label: string;
  value: string;
}

export interface IEditorLodStats {
  budget: number;
  loadedTriangles: number;
  loading: boolean;
  mode: "auto" | "manual";
  precision: "estimate" | "exact";
  selected: string;
  triangleCount: number;
}

export interface IEditorShellModel {
  addComponentDefinitions: IEditorAddComponentDefinition[];
  assets: IEditorAssetRow[];
  diagnostics: IEditorDiagnosticView[];
  environment?: IEditorEnvironmentSummary;
  gamepadViewer: IEditorGamepadViewerSnapshot;
  hierarchy: IEditorTreeRow[];
  inspector: IEditorPropertyRow[];
  lod: IEditorLodStats;
  projectName: string;
  sceneObjects: IEditorSceneObject[];
  selectedRowId?: string;
  status: EditorShellStatus;
  statusItems: IEditorStatusItem[];
  uiPreview: IEditorUiPreviewDocument[];
}

export interface IEditorAdapterInput {
  addComponentDefinitions?: readonly IEditorAddComponentDefinition[];
  assets?: readonly IEditorAssetRow[];
  diagnostics?: readonly IEditorDiagnosticView[];
  environment?: IEditorEnvironmentSummary;
  gamepadViewer?: IEditorGamepadViewerSnapshot;
  hierarchy?: readonly IEditorTreeRow[];
  inspector?: readonly IEditorPropertyRow[];
  lod?: IEditorLodStats;
  projectName?: string;
  sceneObjects?: readonly IEditorSceneObject[];
  selectedRowId?: string;
  status?: EditorShellStatus;
  statusItems?: readonly IEditorStatusItem[];
  uiPreview?: readonly IEditorUiPreviewDocument[];
}

export interface IEditorUiPreviewDocument {
  documentPath: string;
  id: string;
  nodes: IEditorUiPreviewNode[];
  readOnlyReason: string;
}

export interface IEditorUiPreviewNode {
  action?: string;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  id: string;
  kind: string;
  label?: string;
  text?: string;
  value?: string;
}

export function createEditorShellModel(input: IEditorAdapterInput = {}): IEditorShellModel {
  const hierarchy = [...(input.hierarchy ?? [])];
  const inspector = [...(input.inspector ?? [])];
  const assets = [...(input.assets ?? [])];
  const diagnostics = [...(input.diagnostics ?? [])];
  const status = input.status ?? (hierarchy.length === 0 && inspector.length === 0 && assets.length === 0 ? "empty" : "ready");
  return {
    addComponentDefinitions: [...(input.addComponentDefinitions ?? EDITOR_ADD_COMPONENT_DEFINITIONS)],
    assets,
    diagnostics,
    environment: input.environment,
    gamepadViewer: input.gamepadViewer ?? { controls: [], devices: [], requiredControls: [] },
    hierarchy,
    inspector,
    lod: input.lod ?? { budget: 200_000, loadedTriangles: 0, loading: false, mode: "auto", precision: "estimate", selected: "original", triangleCount: 0 },
    projectName: input.projectName ?? "Untitled ThreeNative Project",
    sceneObjects: [...(input.sceneObjects ?? [])],
    selectedRowId: input.selectedRowId,
    status,
    statusItems: [
      { id: "documents", label: "Documents", value: String(countRows(hierarchy)) },
      { id: "diagnostics", label: "Diagnostics", value: String(diagnostics.length) },
      ...(input.statusItems ?? []),
    ],
    uiPreview: [...(input.uiPreview ?? [])],
  };
}

export const EDITOR_ADD_COMPONENT_DEFINITIONS = [
  {
    component: "Transform",
    defaults: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    featureStatus: "enabled",
    incompatibleWith: [],
    pack: "core",
    sourceFamily: "scene",
  },
  {
    component: "MeshRenderer",
    defaults: { castShadow: true, material: "mat.player", mesh: "mesh.player", receiveShadow: true, visible: true },
    featureStatus: "enabled",
    incompatibleWith: ["Camera", "Light"],
    pack: "rendering",
    sourceFamily: "scene",
  },
  {
    component: "RenderLayers",
    defaults: { layers: ["default"] },
    featureStatus: "enabled",
    incompatibleWith: [],
    pack: "rendering",
    sourceFamily: "scene",
  },
  {
    component: "Visibility",
    defaults: { visible: true },
    featureStatus: "enabled",
    incompatibleWith: [],
    pack: "rendering",
    sourceFamily: "scene",
  },
  {
    component: "Camera",
    defaults: { mode: "perspective", target: "" },
    featureStatus: "enabled",
    incompatibleWith: ["MeshRenderer", "Light"],
    pack: "core",
    sourceFamily: "scene",
  },
  {
    component: "Light",
    defaults: { color: "#ffffff", intensity: 1, kind: "directional" },
    featureStatus: "enabled",
    incompatibleWith: ["MeshRenderer", "Camera"],
    pack: "core",
    sourceFamily: "scene",
  },
  {
    component: "RigidBody",
    defaults: { damping: 0.05, gravityScale: 1, kind: "dynamic", mass: 1 },
    featureStatus: "enabled",
    incompatibleWith: [],
    pack: "physics",
    sourceFamily: "scene",
  },
  {
    component: "Collider",
    defaults: { kind: "box", size: [1, 1, 1], trigger: false },
    featureStatus: "enabled",
    incompatibleWith: [],
    pack: "physics",
    sourceFamily: "scene",
  },
  {
    component: "CharacterController",
    defaults: { blocking: true, grounding: "raycast", moveXAxis: "MoveX", moveZAxis: "MoveZ", speed: 4 },
    featureStatus: "enabled",
    incompatibleWith: [],
    pack: "physics",
    sourceFamily: "scene",
  },
  {
    component: "Script",
    defaults: { export: "default", module: "./systems/update.ts" },
    featureStatus: "planned-prd",
    incompatibleWith: [],
    pack: "scripting",
    readOnlyReason: "Scene and systems script references are edited through promoted script attach operations.",
    sourceFamily: "system",
  },
] as const satisfies readonly IEditorAddComponentDefinition[];

export interface IEditorInspectorFieldInventoryItem {
  component?: string;
  defaultValue?: unknown;
  fieldKind: EditorInspectorFieldKind;
  field: string;
  operationName?: string;
  readOnly: boolean;
  readOnlyReason?: string;
  sourceFamily: EditorInspectorSourceFamily;
}

export interface IEditorOperationCoverageRow {
  control: string;
  featureStatus?: EditorFeatureStatus;
  handler?: IEditorModalActionDefinition["handler"];
  kind: "inspector-field" | "modal-action";
  operationName?: string;
  readOnly: boolean;
  readOnlyReason?: string;
  sourceFamily?: EditorInspectorSourceFamily;
}

export const EDITOR_INSPECTOR_FIELD_INVENTORY: readonly IEditorInspectorFieldInventoryItem[] = [
  { component: "Transform", defaultValue: [0, 0, 0], field: "position", fieldKind: "vector3", operationName: "scene.set_transform", readOnly: false, sourceFamily: "scene" },
  { component: "Transform", defaultValue: [0, 0, 0], field: "rotation", fieldKind: "vector3", operationName: "scene.set_transform", readOnly: false, sourceFamily: "scene" },
  { component: "Transform", defaultValue: [1, 1, 1], field: "scale", fieldKind: "vector3", operationName: "scene.set_transform", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: "box", field: "primitive", fieldKind: "enum", operationName: "scene.set_prefab", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: "#2f80ed", field: "color", fieldKind: "color", operationName: "scene.set_prefab", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", field: "asset", fieldKind: "asset", operationName: "scene.set_prefab", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: "mesh.player", field: "mesh", fieldKind: "string", operationName: "scene.set_mesh_renderer", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: "mat.player", field: "material", fieldKind: "string", operationName: "scene.set_mesh_renderer", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: true, field: "visible", fieldKind: "boolean", operationName: "scene.set_mesh_renderer", readOnly: false, sourceFamily: "scene" },
  { component: "RenderLayers", defaultValue: ["default"], field: "layers", fieldKind: "stringList", operationName: "scene.set_render_layers", readOnly: false, sourceFamily: "scene" },
  { component: "Visibility", defaultValue: true, field: "visible", fieldKind: "boolean", operationName: "scene.set_visibility", readOnly: false, sourceFamily: "scene" },
  { component: "Camera", defaultValue: "perspective", field: "mode", fieldKind: "enum", operationName: "scene.set_camera", readOnly: false, sourceFamily: "scene" },
  { component: "Camera", defaultValue: "", field: "target", fieldKind: "string", operationName: "scene.set_camera", readOnly: false, sourceFamily: "scene" },
  { component: "Camera", defaultValue: "none", field: "skybox", fieldKind: "asset", operationName: "environment.set_skybox", readOnly: false, sourceFamily: "environment" },
  { field: "environment.environmentMap", fieldKind: "asset", operationName: "environment.set_map", readOnly: false, sourceFamily: "environment" },
  { field: "environment.atmosphere.volumetrics", fieldKind: "json", operationName: "environment.set_volumetrics", readOnly: false, sourceFamily: "environment" },
  { field: "environment.terrain.id", fieldKind: "string", operationName: "environment.set_terrain", readOnly: false, sourceFamily: "environment" },
  { field: "environment.terrain.heightMode", fieldKind: "enum", operationName: "environment.set_terrain", readOnly: false, sourceFamily: "environment" },
  { field: "environment.terrain.heightmap", fieldKind: "asset", operationName: "environment.set_terrain", readOnly: false, sourceFamily: "environment" },
  { field: "environment.walkability", fieldKind: "json", operationName: "environment.set_walkability", readOnly: false, sourceFamily: "environment" },
  { field: "environment.path", fieldKind: "json", operationName: "environment.set_path", readOnly: false, sourceFamily: "environment" },
  { field: "environment.lightProbes", fieldKind: "json", operationName: "environment.set_light_probe", readOnly: false, sourceFamily: "environment" },
  { field: "environment.sourceAssets.lod", fieldKind: "json", operationName: "environment.set_source_asset_lod", readOnly: false, sourceFamily: "environment" },
  { component: "Light", defaultValue: "directional", field: "kind", fieldKind: "enum", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "Light", defaultValue: 1, field: "intensity", fieldKind: "number", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "Light", defaultValue: "#ffffff", field: "color", fieldKind: "color", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "Light", field: "range", fieldKind: "number", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "Light", field: "angle", fieldKind: "number", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "Light", field: "shadowBias", fieldKind: "number", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "Light", field: "shadowNormalBias", fieldKind: "number", operationName: "scene.set_light", readOnly: false, sourceFamily: "scene" },
  { component: "RigidBody", defaultValue: "dynamic", field: "kind", fieldKind: "enum", operationName: "scene.set_rigid_body", readOnly: false, sourceFamily: "scene" },
  { component: "RigidBody", defaultValue: 1, field: "mass", fieldKind: "number", operationName: "scene.set_rigid_body", readOnly: false, sourceFamily: "scene" },
  { component: "RigidBody", defaultValue: 0.05, field: "damping", fieldKind: "number", operationName: "scene.set_rigid_body", readOnly: false, sourceFamily: "scene" },
  { component: "RigidBody", defaultValue: 1, field: "gravityScale", fieldKind: "number", operationName: "scene.set_rigid_body", readOnly: false, sourceFamily: "scene" },
  { component: "Collider", defaultValue: "box", field: "kind", fieldKind: "enum", operationName: "scene.set_collider", readOnly: false, sourceFamily: "scene" },
  { component: "Collider", defaultValue: [1, 1, 1], field: "size", fieldKind: "vector3", operationName: "scene.set_collider", readOnly: false, sourceFamily: "scene" },
  { component: "Collider", field: "radius", fieldKind: "number", operationName: "scene.set_collider", readOnly: false, sourceFamily: "scene" },
  { component: "Collider", field: "height", fieldKind: "number", operationName: "scene.set_collider", readOnly: false, sourceFamily: "scene" },
  { component: "Collider", defaultValue: false, field: "trigger", fieldKind: "boolean", operationName: "scene.set_collider", readOnly: false, sourceFamily: "scene" },
  { component: "CharacterController", defaultValue: "MoveX", field: "moveXAxis", fieldKind: "string", operationName: "scene.set_character_controller", readOnly: false, sourceFamily: "scene" },
  { component: "CharacterController", defaultValue: "MoveZ", field: "moveZAxis", fieldKind: "string", operationName: "scene.set_character_controller", readOnly: false, sourceFamily: "scene" },
  { component: "CharacterController", defaultValue: 4, field: "speed", fieldKind: "number", operationName: "scene.set_character_controller", readOnly: false, sourceFamily: "scene" },
  { component: "CharacterController", defaultValue: true, field: "blocking", fieldKind: "boolean", operationName: "scene.set_character_controller", readOnly: false, sourceFamily: "scene" },
  { component: "CharacterController", defaultValue: "raycast", field: "grounding", fieldKind: "enum", operationName: "scene.set_character_controller", readOnly: false, sourceFamily: "scene" },
  { field: "scene.kind", fieldKind: "enum", operationName: "scene.set_lifecycle", readOnly: false, sourceFamily: "scene" },
  { field: "scene.activation", fieldKind: "enum", operationName: "scene.set_lifecycle", readOnly: false, sourceFamily: "scene" },
  { field: "scene.initial", fieldKind: "boolean", operationName: "scene.set_lifecycle", readOnly: false, sourceFamily: "scene" },
  { field: "materials.color", fieldKind: "color", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.roughness", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.metalness", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.emissive", fieldKind: "color", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.emissiveIntensity", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.alphaMode", fieldKind: "enum", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.alphaCutoff", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.opacity", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.baseColorTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.normalTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.metallicRoughnessTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.emissiveTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.occlusionTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.clearcoat", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.clearcoatRoughness", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.clearcoatTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.clearcoatRoughnessTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.transmission", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.transmissionTexture", fieldKind: "asset", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "actions.id", fieldKind: "string", readOnly: true, readOnlyReason: "Input action ids are stable source identifiers after creation.", sourceFamily: "input" },
  { field: "actions.bindings", fieldKind: "stringList", operationName: "input.add_action", readOnly: false, sourceFamily: "input" },
  { field: "axes.negative", fieldKind: "stringList", operationName: "input.add_axis", readOnly: false, sourceFamily: "input" },
  { field: "axes.positive", fieldKind: "stringList", operationName: "input.add_axis", readOnly: false, sourceFamily: "input" },
  { field: "axes.value", fieldKind: "string", operationName: "input.add_axis", readOnly: false, sourceFamily: "input" },
  { field: "systems.schedule", fieldKind: "string", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.script", fieldKind: "script", operationName: "system.attach_script", readOnly: false, sourceFamily: "system" },
  { field: "systems.reads", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.writes", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.resourceReads", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.resourceWrites", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.eventReads", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.eventWrites", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.services", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.after", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.before", fieldKind: "stringList", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.queries", fieldKind: "json", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "systems.commands", fieldKind: "json", operationName: "system.set_metadata", readOnly: false, sourceFamily: "system" },
  { field: "project.id", fieldKind: "string", operationName: "project.create", readOnly: false, sourceFamily: "project" },
  { field: "project.authoringVersion", fieldKind: "string", operationName: "project.create", readOnly: false, sourceFamily: "project" },
  { field: "project.sourceRoots", fieldKind: "stringList", operationName: "project.create", readOnly: false, sourceFamily: "project" },
  { field: "project.buildTargets", fieldKind: "stringList", operationName: "project.create", readOnly: false, sourceFamily: "project" },
  { field: "target.targets", fieldKind: "stringList", operationName: "target.set_profile", readOnly: false, sourceFamily: "target" },
  { field: "target.budgets", fieldKind: "json", operationName: "target.set_profile", readOnly: false, sourceFamily: "target" },
  { field: "target.performance", fieldKind: "json", operationName: "target.set_profile", readOnly: false, sourceFamily: "target" },
  { field: "ui.nodes.type", fieldKind: "enum", operationName: "ui.add_node", readOnly: false, sourceFamily: "ui" },
  { field: "ui.nodes.label", fieldKind: "string", operationName: "ui.add_node", readOnly: false, sourceFamily: "ui" },
  { field: "ui.nodes.style.color", fieldKind: "color", operationName: "ui.set_style", readOnly: false, sourceFamily: "ui" },
  { field: "ui.nodes.style.backgroundColor", fieldKind: "color", operationName: "ui.set_style", readOnly: false, sourceFamily: "ui" },
  { field: "ui.nodes.style.fontSize", fieldKind: "number", operationName: "ui.set_style", readOnly: false, sourceFamily: "ui" },
  { field: "ui.bindings.resource", fieldKind: "string", operationName: "ui.bind", readOnly: false, sourceFamily: "ui" },
  { field: "resources.path", fieldKind: "asset", operationName: "scene.set_resource", readOnly: false, sourceFamily: "scene" },
  { field: "assets.path", fieldKind: "asset", operationName: "asset.add", readOnly: false, sourceFamily: "asset" },
  { field: "assets.renderTarget.width", fieldKind: "number", operationName: "asset.add", readOnly: false, sourceFamily: "asset" },
  { field: "assets.renderTarget.height", fieldKind: "number", operationName: "asset.add", readOnly: false, sourceFamily: "asset" },
  { field: "assets.renderTarget.usage", fieldKind: "enum", operationName: "asset.add", readOnly: false, sourceFamily: "asset" },
  { field: "assets.renderTarget.format", fieldKind: "enum", operationName: "asset.add", readOnly: false, sourceFamily: "asset" },
  { field: "components.custom", fieldKind: "json", operationName: "scene.set_component", readOnly: false, sourceFamily: "scene" },
  { field: "meshes.primitive", fieldKind: "enum", operationName: "mesh.create_primitive", readOnly: false, sourceFamily: "mesh" },
  { field: "generator.module", fieldKind: "string", readOnly: true, readOnlyReason: "Generator provenance is one-way metadata; edit the generator source or rerun generator.record.", sourceFamily: "generator" },
  { field: "generator.outputs", fieldKind: "stringList", readOnly: true, readOnlyReason: "Generator outputs are one-way provenance and do not receive reverse editor patches.", sourceFamily: "generator" },
  { field: "generator.overwritePolicy", fieldKind: "enum", readOnly: true, readOnlyReason: "Generator overwrite policy is controlled by generator.record.", sourceFamily: "generator" },
  { field: "provenance", fieldKind: "generated", readOnly: true, readOnlyReason: "Generated provenance is inspectable evidence, not editor-owned source.", sourceFamily: "scene" },
] as const;

export const EDITOR_MODAL_ACTION_DEFINITIONS: readonly IEditorModalActionDefinition[] = [
  { featureStatus: "enabled", id: "add.primitive_sphere", label: "Primitive Sphere", operationName: "scene.add_prefab", readOnly: false },
  { featureStatus: "enabled", id: "add.empty_entity", label: "Empty Entity", operationName: "scene.add_entity", readOnly: false },
  { featureStatus: "enabled", id: "add.camera", label: "Camera", operationName: "scene.add_entity", readOnly: false },
  { featureStatus: "enabled", id: "add.light", label: "Light", operationName: "scene.add_entity", readOnly: false },
  { featureStatus: "enabled", id: "add.terrain", label: "Terrain", operationName: "environment.add_flat_terrain", readOnly: false },
  { featureStatus: "planned-prd", id: "add.custom_glb", label: "Custom GLB", readOnly: true, readOnlyReason: "Custom GLB import needs a promoted asset and prefab operation before it can be enabled." },
  { featureStatus: "enabled", handler: "saveScene", id: "scene.save", label: "Save", readOnly: false },
  { featureStatus: "enabled", id: "scene.create_default", label: "Create Scene", operationName: "scene.create_default", readOnly: false },
  { featureStatus: "enabled", handler: "buildPreview", id: "build.preview", label: "Build", readOnly: false },
  { featureStatus: "planned-prd", id: "delete.selection", label: "Delete", readOnly: true, readOnlyReason: "Delete requires a promoted source operation before it is enabled." },
  { featureStatus: "planned-prd", id: "settings.editor", label: "Settings", readOnly: true, readOnlyReason: "Editor settings are inspect-only in this slice." },
] as const;

export const EDITOR_OPERATION_COVERAGE_MATRIX: readonly IEditorOperationCoverageRow[] = [
  ...EDITOR_INSPECTOR_FIELD_INVENTORY.map((item) => ({
    control: item.component === undefined ? item.field : `${item.component}.${item.field}`,
    kind: "inspector-field" as const,
    operationName: item.operationName,
    readOnly: item.readOnly,
    readOnlyReason: item.readOnlyReason,
    sourceFamily: item.sourceFamily,
  })),
  ...EDITOR_MODAL_ACTION_DEFINITIONS.map((action) => ({
    control: action.id,
    featureStatus: action.featureStatus,
    handler: action.handler,
    kind: "modal-action" as const,
    operationName: action.operationName,
    readOnly: action.readOnly,
    readOnlyReason: action.readOnlyReason,
  })),
];

export function editorModelFromAuthoringProject(project: IAuthoringProject): IEditorShellModel {
  const hierarchy = project.documents.map<IEditorTreeRow>((document) => ({
    access: "sourcePersistable",
    badge: document.kind,
    documentPath: document.projectRelativePath,
    id: `source:${document.projectRelativePath}`,
    label: document.projectRelativePath,
    sourcePath: document.projectRelativePath,
  }));
  return createEditorShellModel({
    diagnostics: project.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      file: diagnostic.file,
      message: diagnostic.message,
      path: diagnostic.path,
      severity: diagnostic.severity,
      suggestion: diagnostic.suggestion,
    })),
    hierarchy,
    inspector: project.documents.map<IEditorPropertyRow>((document) => ({
      access: "sourcePersistable",
      documentPath: document.projectRelativePath,
      id: `document:${document.projectRelativePath}:kind`,
      label: "Document kind",
      path: document.projectRelativePath,
      readOnly: false,
      value: document.kind,
    })),
    projectName: project.projectPath.split("/").pop() ?? project.projectPath,
    status: project.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "error" : "ready",
    statusItems: [{ id: "project", label: "Project", value: project.projectPath }],
  });
}

export function editorModelFromInspection(input: {
  documentKinds?: Record<string, IEditorDocumentClassification>;
  projectName?: string;
  tools?: IEditorToolSnapshot;
  visualPanels: IEditorVisualPanelSnapshot;
}): IEditorShellModel {
  const panelRows = new Map(input.visualPanels.panels.map((panel) => [panel.kind, panel.rows]));
  return createEditorShellModel({
    assets: [
      ...(input.tools?.assetPreview.assets.map<IEditorAssetRow>((asset) => ({
        access: "inspectableOnly",
        id: `asset:${asset.id}`,
        kind: asset.kind,
        label: asset.id,
        path: asset.path,
      })) ?? []),
      ...rowsToAssets(panelRows.get("assets") ?? []),
    ],
    diagnostics: (panelRows.get("diagnostics") ?? []).map((row) => ({
      code: row.badge ?? "TN_EDITOR_DIAGNOSTIC",
      message: row.label,
      path: row.path,
      severity: row.severity ?? "info",
    })),
    hierarchy: (panelRows.get("hierarchy") ?? []).map((row) => rowToTreeRow(row, input.documentKinds)),
    inspector: (panelRows.get("properties") ?? []).map((row) => rowToPropertyRow(row, input.documentKinds)),
    projectName: input.projectName,
    gamepadViewer: input.tools?.gamepadViewer,
    selectedRowId: input.visualPanels.selectedNode,
    status: "ready",
    statusItems: [
      { id: "rootNodes", label: "Root nodes", value: String(input.visualPanels.summary.rootNodes) },
      { id: "properties", label: "Properties", value: String(input.visualPanels.summary.editableProperties) },
      { id: "assets", label: "Assets", value: String(input.visualPanels.summary.assets) },
    ],
  });
}

export function assertNoForbiddenEditorImports(files: Record<string, string>): string[] {
  const forbidden = [
    "@/core",
    "@editor/",
    "@react-three/fiber",
    "@react-three/drei",
    "@react-three/rapier",
    "bitecs",
    "ComponentRegistry",
    "EntityManager",
    "KnownComponentTypes",
  ];
  return Object.entries(files).flatMap(([file, source]) =>
    forbidden.filter((token) => source.includes(token)).map((token) => `${file}: forbidden editor import '${token}'`),
  );
}

function rowToTreeRow(row: IEditorVisualPanelRow, documentKinds: Record<string, IEditorDocumentClassification> | undefined): IEditorTreeRow {
  const classification = row.path === undefined ? undefined : documentKinds?.[row.path];
  return {
    access: classification?.access ?? "inspectableOnly",
    badge: row.badge,
    documentPath: row.path,
    id: row.id,
    label: row.label,
    sourcePath: classification?.sourcePath,
  };
}

function rowToPropertyRow(row: IEditorVisualPanelRow, documentKinds: Record<string, IEditorDocumentClassification> | undefined): IEditorPropertyRow {
  const classification = row.path === undefined ? undefined : documentKinds?.[row.path.split("/")[0] ?? row.path];
  const access = classification?.access ?? "inspectableOnly";
  return {
    access,
    documentPath: row.path,
    id: row.id,
    label: row.label,
    path: row.path,
    readOnly: access !== "sourcePersistable",
    value: row.value,
  };
}

function rowsToAssets(rows: readonly IEditorVisualPanelRow[]): IEditorAssetRow[] {
  return rows.map((row) => ({
    access: "inspectableOnly",
    id: row.id,
    label: row.label,
    path: row.path,
  }));
}

function countRows(rows: readonly IEditorTreeRow[]): number {
  return rows.reduce((total, row) => total + 1 + countRows(row.children ?? []), 0);
}
