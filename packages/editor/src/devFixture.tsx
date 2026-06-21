import { createRoot } from "react-dom/client";
import { useEffect } from "react";

import { EditorApp } from "./EditorApp.js";
import { EDITOR_ADD_COMPONENT_DEFINITIONS, type IEditorDiagnosticView, type IEditorPropertyRow, type IEditorSceneObject, type IEditorShellModel, type IEditorTreeRow } from "./adapters/editorModel.js";
import type { IViewportTransform } from "./preview/EditorViewport3d.js";
import { devFixtureModel } from "./devFixtureModel.js";
import { useEditorStore, type IEditorProjectDocumentGroup, type IEditorProjectPayload } from "./state/editorStore.js";
import "./styles.css";

export function renderDevFixture(root: Element) {
  createRoot(root).render(<EditorDevApp />);
}

function EditorDevApp() {
  const project = useEditorStore((state) => state.project);
  const setProject = useEditorStore((state) => state.setProject);
  const parentByRowId = useEditorStore((state) => state.parentByRowId);
  const setParent = useEditorStore((state) => state.setParent);
  const selectedRowId = useEditorStore((state) => state.selectedRowId ?? devFixtureModel.selectedRowId);
  const setSelectedRowId = useEditorStore((state) => state.selectRow);
  const status = useEditorStore((state) => state.status);
  const setStatus = useEditorStore((state) => state.setStatus);
  const transformByRowId = useEditorStore((state) => state.transformByRowId);
  const refreshProject = useEditorStore((state) => state.refreshProject);
  const addObject = useEditorStore((state) => state.addObject);
  const addComponent = useEditorStore((state) => state.addComponent);
  const buildPreview = useEditorStore((state) => state.buildPreview);
  const createDefaultScene = useEditorStore((state) => state.createDefaultScene);
  const saveScene = useEditorStore((state) => state.saveScene);
  const editProperty = useEditorStore((state) => state.editProperty);
  const transformObject = useEditorStore((state) => state.transformObject);
  const model = project === undefined ? devFixtureModel : projectToEditorModel(project, selectedRowId, parentByRowId, status, transformByRowId);

  useEffect(() => {
    void refreshProject({ selectFirstObject: true, updateLoadErrorStatus: true });
  }, []);

  function moveRow(draggedId: string, targetId: string) {
    const nested = setParent(draggedId, targetId);
    setSelectedRowId(draggedId);
    setStatus(
      nested
        ? `Nested ${findRowLabel(model.hierarchy, draggedId)} under ${findRowLabel(model.hierarchy, targetId)} in editor view`
        : `Cannot nest ${findRowLabel(model.hierarchy, draggedId)} under ${findRowLabel(model.hierarchy, targetId)}`,
    );
  }

  return (
    <EditorApp
      model={model}
      onAddComponent={(definition) => void addComponent(definition, model.sceneObjects)}
      onAddObject={(action) => void addObject(action)}
      onBuildPreview={buildPreview}
      onCreateScene={createDefaultScene}
      onEditProperty={editProperty}
      onMoveRow={moveRow}
      onSaveScene={saveScene}
      onSelectRow={setSelectedRowId}
      onTransformObject={(rowId, transform) => transformObject(model.sceneObjects, rowId, transform)}
    />
  );
}

function projectToEditorModel(
  project: IEditorProjectPayload,
  selectedRowId: string | undefined,
  parentByRowId: Record<string, string | undefined>,
  status: string,
  transformByRowId: Record<string, IViewportTransform>,
): IEditorShellModel {
  const sceneObjects = (project.sceneObjects ?? []).map((object) => applyTransformOverride(object, transformByRowId[object.rowId]));
  const hierarchy = buildHierarchy(project.documents ?? [], sceneObjects, parentByRowId);
  const selectedObject = sceneObjects.find((object) => object.rowId === selectedRowId);
  const selectedDocument = selectedObject === undefined ? findDocument(project.documents ?? [], selectedRowId) : undefined;
  return {
    addComponentDefinitions: [...EDITOR_ADD_COMPONENT_DEFINITIONS],
    assets: (project.documents ?? [])
      .filter((group) => ["asset", "material", "mesh", "prefab"].includes(group.kind))
      .flatMap((group) => group.documents.map((document) => ({ access: "sourcePersistable" as const, id: `asset:${document.path}`, kind: group.kind, label: document.id, path: document.path }))),
    diagnostics: (project.diagnostics ?? []).map<IEditorDiagnosticView>((diagnostic) => ({
      code: diagnostic.code ?? "TN_EDITOR_DIAGNOSTIC",
      file: diagnostic.file,
      message: diagnostic.message,
      path: diagnostic.path,
      severity: diagnostic.severity ?? "info",
      suggestion: diagnostic.suggestion,
    })),
    hierarchy,
    inspector: selectedObject === undefined ? documentInspectorRows(selectedDocument) : objectInspectorRows(selectedObject),
    lod: project.lod ?? devFixtureModel.lod,
    projectName: project.projectPath?.split("/").pop() ?? "structured-source-starter",
    sceneObjects,
    selectedRowId,
    status: project.ok === false ? "error" : "ready",
    statusItems: [
      { id: "editorStatus", label: "Editor", value: status },
      { id: "sourceDocuments", label: "Source docs", value: String(countDocuments(project)) },
      { id: "sceneEntities", label: "Scene entities", value: String(sceneObjects.length) },
      { id: "mode", label: "Mode", value: "Source-backed editor" },
    ],
  };
}

function applyTransformOverride(object: IEditorSceneObject, transform: IViewportTransform | undefined): IEditorSceneObject {
  if (transform === undefined) {
    return object;
  }
  return {
    ...object,
    position: transform.position,
    rotation: transform.rotation,
    scale: transform.scale,
  };
}

function buildHierarchy(documents: readonly IEditorProjectDocumentGroup[], sceneObjects: readonly IEditorSceneObject[], parentByRowId: Record<string, string | undefined>): IEditorTreeRow[] {
  if (sceneObjects.length > 0) {
    return sceneChildren(undefined, sceneObjects, parentByRowId);
  }
  return documents.map((documentGroup) => ({
    access: "sourcePersistable",
    badge: documentGroup.kind,
    children: documentGroup.documents.map((document) => ({
      access: "sourcePersistable",
      badge: document.kind,
      children: document.kind === "scene" ? sceneChildren(document.path, sceneObjects, parentByRowId) : undefined,
      documentPath: document.path,
      id: `source:${document.path}`,
      label: document.path,
      sourcePath: document.path,
    })),
    id: `group:${documentGroup.kind}`,
    label: documentGroup.kind,
  }));
}

function sceneChildren(documentPath: string | undefined, sceneObjects: readonly IEditorSceneObject[], parentByRowId: Record<string, string | undefined>): IEditorTreeRow[] {
  const rows = sceneObjects
    .filter((object) => documentPath === undefined || object.documentPath === documentPath)
    .map<IEditorTreeRow>((object) => ({
      access: "sourcePersistable",
      badge: object.kind,
      children: [],
      documentPath: object.documentPath,
      id: object.rowId,
      label: object.label,
      sourcePath: object.sourcePath,
    }));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const roots: IEditorTreeRow[] = [];
  for (const row of rows) {
    const parentId = parentByRowId[row.id];
    const parent = parentId === undefined ? undefined : rowById.get(parentId);
    if (parent === undefined) {
      roots.push(row);
    } else {
      parent.children = [...(parent.children ?? []), row];
    }
  }
  return roots;
}

function findRowLabel(rows: readonly IEditorTreeRow[], id: string): string {
  for (const row of rows) {
    if (row.id === id) {
      return row.label;
    }
    const childLabel = findRowLabel(row.children ?? [], id);
    if (childLabel !== id) {
      return childLabel;
    }
  }
  return id;
}

function objectInspectorRows(object: IEditorSceneObject): IEditorPropertyRow[] {
  if (object.inspectorRows !== undefined && object.inspectorRows.length > 0) {
    return [...object.inspectorRows];
  }
  return [
    property("inspect:id", "ID", object.id, object),
    property("inspect:name", "Name", object.label, object),
    property("inspect:kind", "Kind", object.kind, object),
    ...componentRows(object),
    property("inspect:source", "Source", object.sourcePath ?? object.documentPath ?? "unknown", object),
  ];
}

function componentRows(object: IEditorSceneObject): IEditorPropertyRow[] {
  const components = new Set(object.components ?? []);
  return [
    ...(components.has("Transform")
      ? [
          property("inspect:position", "Position", formatVector(object.position, [0, 0, 0]), object, "Transform"),
          property("inspect:rotation", "Rotation", formatVector(object.rotation, [0, 0, 0]), object, "Transform"),
          property("inspect:scale", "Scale", formatVector(object.scale, [1, 1, 1]), object, "Transform"),
        ]
      : []),
    ...(components.has("MeshRenderer")
      ? [
          property("inspect:primitive", "Primitive", object.primitive, object, "MeshRenderer"),
          property("inspect:color", "Color", object.color ?? "default", object, "MeshRenderer"),
          property("inspect:asset", "Asset", object.assetPath ?? "none", object, "MeshRenderer"),
        ]
      : []),
    ...(components.has("Camera") ? [property("inspect:camera-mode", "Mode", "perspective", object, "Camera")] : []),
    ...(components.has("Light") ? [property("inspect:light-kind", "Kind", object.kind, object, "Light")] : []),
  ];
}

function documentInspectorRows(document: { inspectorRows?: IEditorPropertyRow[]; kind: string; path: string } | undefined): IEditorPropertyRow[] {
  if (document === undefined) {
    return [];
  }
  if (document.inspectorRows !== undefined && document.inspectorRows.length > 0) {
    return [...document.inspectorRows];
  }
  return [
    { access: "sourcePersistable", documentPath: document.path, id: `document:${document.path}:path`, label: "Document", readOnly: false, value: document.path },
    { access: "sourcePersistable", documentPath: document.path, id: `document:${document.path}:kind`, label: "Kind", readOnly: false, value: document.kind },
  ];
}

function property(id: string, label: string, value: string, object: IEditorSceneObject, component?: string): IEditorPropertyRow {
  return { access: "sourcePersistable", component, documentPath: object.documentPath, id: `${id}:${object.rowId}`, label, readOnly: false, value };
}

function formatVector(value: readonly [number, number, number] | undefined, fallback: readonly [number, number, number]): string {
  return `[${(value ?? fallback).join(", ")}]`;
}

function findDocument(documents: readonly IEditorProjectDocumentGroup[], selectedRowId: string | undefined): { inspectorRows?: IEditorPropertyRow[]; kind: string; path: string } | undefined {
  if (selectedRowId === undefined || !selectedRowId.startsWith("source:")) {
    return undefined;
  }
  const path = selectedRowId.slice("source:".length);
  return documents.flatMap((group) => group.documents).find((document) => document.path === path);
}

function countDocuments(project: IEditorProjectPayload): number {
  return project.documents?.reduce((count, group) => count + group.documents.length, 0) ?? 0;
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
