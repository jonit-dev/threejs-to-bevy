import type { IAuthoringProject } from "@threenative/authoring";
import type {
  EditorDocumentAccess,
  IEditorDocumentClassification,
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

export type EditorInspectorSourceFamily = "asset" | "audio" | "input" | "material" | "mesh" | "prefab" | "scene" | "system" | "ui";

export interface IEditorPropertyOperation {
  args: Record<string, unknown>;
  name: string;
  valueArg?: string;
}

export interface IEditorAddComponentDefinition {
  component: string;
  defaults: Record<string, unknown>;
  incompatibleWith: readonly string[];
  pack: "core" | "experimental" | "rendering" | "scripting";
  readOnlyReason?: string;
  sourceFamily: EditorInspectorSourceFamily;
}

export interface IEditorAssetRow {
  access: EditorDocumentAccess;
  id: string;
  kind?: string;
  label: string;
  path?: string;
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
  selected: string;
  triangleCount: number;
}

export interface IEditorShellModel {
  addComponentDefinitions: IEditorAddComponentDefinition[];
  assets: IEditorAssetRow[];
  diagnostics: IEditorDiagnosticView[];
  hierarchy: IEditorTreeRow[];
  inspector: IEditorPropertyRow[];
  lod: IEditorLodStats;
  projectName: string;
  sceneObjects: IEditorSceneObject[];
  selectedRowId?: string;
  status: EditorShellStatus;
  statusItems: IEditorStatusItem[];
}

export interface IEditorAdapterInput {
  addComponentDefinitions?: readonly IEditorAddComponentDefinition[];
  assets?: readonly IEditorAssetRow[];
  diagnostics?: readonly IEditorDiagnosticView[];
  hierarchy?: readonly IEditorTreeRow[];
  inspector?: readonly IEditorPropertyRow[];
  lod?: IEditorLodStats;
  projectName?: string;
  sceneObjects?: readonly IEditorSceneObject[];
  selectedRowId?: string;
  status?: EditorShellStatus;
  statusItems?: readonly IEditorStatusItem[];
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
    hierarchy,
    inspector,
    lod: input.lod ?? { budget: 200_000, loadedTriangles: 0, loading: false, mode: "auto", selected: "original", triangleCount: 0 },
    projectName: input.projectName ?? "Untitled ThreeNative Project",
    sceneObjects: [...(input.sceneObjects ?? [])],
    selectedRowId: input.selectedRowId,
    status,
    statusItems: [
      { id: "documents", label: "Documents", value: String(countRows(hierarchy)) },
      { id: "diagnostics", label: "Diagnostics", value: String(diagnostics.length) },
      ...(input.statusItems ?? []),
    ],
  };
}

export const EDITOR_ADD_COMPONENT_DEFINITIONS = [
  {
    component: "Transform",
    defaults: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    incompatibleWith: [],
    pack: "core",
    sourceFamily: "scene",
  },
  {
    component: "MeshRenderer",
    defaults: { color: "#2f80ed", primitive: "box" },
    incompatibleWith: ["Camera", "Light"],
    pack: "rendering",
    sourceFamily: "scene",
  },
  {
    component: "Camera",
    defaults: { mode: "perspective", target: "" },
    incompatibleWith: ["MeshRenderer", "Light"],
    pack: "core",
    sourceFamily: "scene",
  },
  {
    component: "Light",
    defaults: { intensity: 1, kind: "directional" },
    incompatibleWith: ["MeshRenderer", "Camera"],
    pack: "core",
    sourceFamily: "scene",
  },
  {
    component: "Script",
    defaults: { export: "default", module: "./systems/update.ts" },
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

export const EDITOR_INSPECTOR_FIELD_INVENTORY = [
  { component: "Transform", defaultValue: [0, 0, 0], field: "position", fieldKind: "vector3", operationName: "scene.set_transform", readOnly: false, sourceFamily: "scene" },
  { component: "Transform", defaultValue: [0, 0, 0], field: "rotation", fieldKind: "vector3", operationName: "scene.set_transform", readOnly: false, sourceFamily: "scene" },
  { component: "Transform", defaultValue: [1, 1, 1], field: "scale", fieldKind: "vector3", operationName: "scene.set_transform", readOnly: false, sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: "box", field: "primitive", fieldKind: "enum", readOnly: true, readOnlyReason: "Prefab primitive updates do not have a promoted source operation yet.", sourceFamily: "scene" },
  { component: "MeshRenderer", defaultValue: "#2f80ed", field: "color", fieldKind: "color", readOnly: true, readOnlyReason: "Scene prefab color updates do not have a promoted editor operation yet.", sourceFamily: "scene" },
  { component: "MeshRenderer", field: "asset", fieldKind: "asset", readOnly: true, readOnlyReason: "Prefab asset reference updates do not have a promoted source operation yet.", sourceFamily: "scene" },
  { component: "Camera", defaultValue: "perspective", field: "mode", fieldKind: "enum", operationName: "scene.set_camera", readOnly: false, sourceFamily: "scene" },
  { component: "Camera", defaultValue: "", field: "target", fieldKind: "string", operationName: "scene.set_camera", readOnly: false, sourceFamily: "scene" },
  { component: "Light", defaultValue: "directional", field: "kind", fieldKind: "enum", readOnly: true, readOnlyReason: "Light is not part of supportedComponentKinds; source data is preserved read-only.", sourceFamily: "scene" },
  { component: "Light", defaultValue: 1, field: "intensity", fieldKind: "number", readOnly: true, readOnlyReason: "Light is not part of supportedComponentKinds; source data is preserved read-only.", sourceFamily: "scene" },
  { field: "materials.color", fieldKind: "color", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "materials.roughness", fieldKind: "number", operationName: "material.set", readOnly: false, sourceFamily: "material" },
  { field: "actions.id", fieldKind: "string", readOnly: true, readOnlyReason: "Input action ids are stable source identifiers after creation.", sourceFamily: "input" },
  { field: "actions.bindings", fieldKind: "stringList", operationName: "input.add_action", readOnly: false, sourceFamily: "input" },
  { field: "systems.schedule", fieldKind: "string", operationName: "system.create", readOnly: true, readOnlyReason: "System schedule mutation is not promoted after creation.", sourceFamily: "system" },
  { field: "systems.script", fieldKind: "script", operationName: "system.attach_script", readOnly: false, sourceFamily: "system" },
  { field: "ui.bindings.resource", fieldKind: "string", operationName: "ui.bind", readOnly: false, sourceFamily: "ui" },
  { field: "resources.path", fieldKind: "asset", readOnly: true, readOnlyReason: "Scene resource mutation is not exposed through the editor operation API yet.", sourceFamily: "scene" },
  { field: "assets.path", fieldKind: "asset", readOnly: true, readOnlyReason: "Asset catalog mutation is not exposed through the editor operation API yet.", sourceFamily: "asset" },
  { field: "meshes.primitive", fieldKind: "enum", operationName: "mesh.create_primitive", readOnly: true, readOnlyReason: "Mesh primitive declarations are edited through create flows in this slice.", sourceFamily: "mesh" },
  { field: "provenance", fieldKind: "generated", readOnly: true, readOnlyReason: "Generated provenance is inspectable evidence, not editor-owned source.", sourceFamily: "scene" },
] as const satisfies readonly IEditorInspectorFieldInventoryItem[];

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
