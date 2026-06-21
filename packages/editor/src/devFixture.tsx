import { createRoot } from "react-dom/client";
import { useEffect } from "react";

import { EditorApp } from "./EditorApp.js";
import { EDITOR_ADD_COMPONENT_DEFINITIONS, type IEditorAddComponentDefinition, type IEditorDiagnosticView, type IEditorPropertyRow, type IEditorSceneObject, type IEditorShellModel, type IEditorTreeRow } from "./adapters/editorModel.js";
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
  const setTransformOverride = useEditorStore((state) => state.setTransformOverride);
  const clearTransformOverride = useEditorStore((state) => state.clearTransformOverride);
  const model = project === undefined ? devFixtureModel : projectToEditorModel(project, selectedRowId, parentByRowId, status, transformByRowId);

  useEffect(() => {
    void refreshProject(setProject, setStatus, setSelectedRowId);
  }, []);

  async function addPrimitive() {
    const suffix = Date.now().toString(36);
    const prefabId = `prefab.editor-box-${suffix}`;
    const entityId = `editor-box-${suffix}`;
    const primitive = "sphere";
    const color = "#9b59b6";
    try {
      setStatus(`Adding ${primitive}`);
      await postOperation("scene.add_prefab", { color, prefabId, primitive, sceneId: "arena" }, project?.projectRevision);
      await postOperation("scene.add_entity", { entityId, prefabId, sceneId: "arena" }, project?.projectRevision);
      await postOperation("scene.set_transform", { entityId, position: [12, 0.5, 5], sceneId: "arena" }, project?.projectRevision);
      const nextProject = await refreshProject(setProject, setStatus, setSelectedRowId);
      setSelectedRowId(nextProject.sceneObjects?.find((object) => object.id === entityId)?.rowId ?? `entity:content/scenes/arena.scene.json:${entityId}`);
      setStatus(`Added ${entityId}; primitive ${primitive}; documents ${countDocuments(nextProject)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function buildPreview() {
    try {
      setStatus("Building preview");
      const response = await fetch("/api/build", { method: "POST" });
      const payload = await response.json() as { bundlePath?: string; diagnostics?: Array<{ message: string }>; ok: boolean };
      setStatus(payload.ok ? `Built ${payload.bundlePath ?? "bundle"}` : `Build failed: ${payload.diagnostics?.[0]?.message ?? "unknown error"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createDefaultScene() {
    const suffix = Date.now().toString(36);
    const sceneId = `editor-scene-${suffix}`;
    try {
      setStatus(`Creating ${sceneId}`);
      const response = await postOperation("scene.create_default", { sceneId }, project?.projectRevision);
      const nextProject = await refreshProject(setProject, setStatus, setSelectedRowId);
      setStatus(`Created ${sceneId}; saved ${response.filesWritten.join(", ")}; documents ${countDocuments(nextProject)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveScene() {
    try {
      const nextProject = await refreshProject(setProject, setStatus, setSelectedRowId);
      setStatus(`Saved scene sources; revision ${nextProject.projectRevision ?? "unknown"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function moveRow(draggedId: string, targetId: string) {
    const nested = setParent(draggedId, targetId);
    setSelectedRowId(draggedId);
    setStatus(
      nested
        ? `Nested ${findRowLabel(model.hierarchy, draggedId)} under ${findRowLabel(model.hierarchy, targetId)} in editor view`
        : `Cannot nest ${findRowLabel(model.hierarchy, draggedId)} under ${findRowLabel(model.hierarchy, targetId)}`,
    );
  }

  function transformObject(rowId: string, transform: IViewportTransform) {
    setSelectedRowId(rowId);
    setTransformOverride(rowId, transform);
    const object = model.sceneObjects.find((item) => item.rowId === rowId);
    if (object === undefined) {
      setStatus(`Moved ${rowId} in viewport`);
      return;
    }
    setStatus(`Moved ${object.label} in viewport`);
    void commitTransform(object, transform);
  }

  async function commitTransform(object: IEditorSceneObject, transform: IViewportTransform) {
    try {
      await postOperation(
        "scene.set_transform",
        { entityId: object.id, position: transform.position, rotation: transform.rotation, scale: transform.scale, sceneId: sceneIdFromDocumentPath(object.documentPath) },
        project?.projectRevision,
      );
      await refreshProject(setProject, undefined, undefined);
      clearTransformOverride(object.rowId);
      setStatus(`Saved transform for ${object.label}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function editProperty(row: IEditorPropertyRow, value: unknown) {
    if (row.operation === undefined || row.readOnly) {
      setStatus(row.readOnlyReason ?? `${row.label} is read-only`);
      return;
    }
    try {
      await postOperation(row.operation.name, buildOperationArgs(row, value), project?.projectRevision);
      await refreshProject(setProject, undefined, undefined);
      setStatus(`Saved ${row.label}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function addComponent(definition: IEditorAddComponentDefinition) {
    const object = model.sceneObjects.find((item) => item.rowId === selectedRowId);
    if (object === undefined) {
      setStatus("Select a source entity before adding a component");
      return;
    }
    try {
      if (definition.component === "Transform") {
        await postOperation(
          "scene.set_transform",
          {
            entityId: object.id,
            position: vectorDefault(definition.defaults.position, [0, 0, 0]),
            rotation: vectorDefault(definition.defaults.rotation, [0, 0, 0]),
            scale: vectorDefault(definition.defaults.scale, [1, 1, 1]),
            sceneId: sceneIdFromDocumentPath(object.documentPath),
          },
          project?.projectRevision,
        );
      } else if (definition.component === "Camera") {
        await postOperation(
          "scene.set_component",
          { componentKind: "camera", entityId: object.id, sceneId: sceneIdFromDocumentPath(object.documentPath), value: definition.defaults },
          project?.projectRevision,
        );
      } else if (definition.component === "Light") {
        await postOperation(
          "scene.set_component",
          { componentKind: "Light", entityId: object.id, sceneId: sceneIdFromDocumentPath(object.documentPath), value: definition.defaults },
          project?.projectRevision,
        );
      } else {
        setStatus(definition.readOnlyReason ?? `${definition.component} does not have a promoted add operation yet`);
        return;
      }
      await refreshProject(setProject, undefined, undefined);
      setStatus(`Added ${definition.component} to ${object.label}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <EditorApp
      model={model}
      onAddComponent={addComponent}
      onAddObject={addPrimitive}
      onBuildPreview={buildPreview}
      onCreateScene={createDefaultScene}
      onEditProperty={editProperty}
      onMoveRow={moveRow}
      onSaveScene={saveScene}
      onSelectRow={setSelectedRowId}
      onTransformObject={transformObject}
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

function buildOperationArgs(row: IEditorPropertyRow, value: unknown): Record<string, unknown> {
  const args = { ...(row.operation?.args ?? {}) };
  const valueArg = row.operation?.valueArg;
  if (row.operation?.name === "input.add_action" && Array.isArray(value)) {
    args[valueArg ?? "keys"] = value.map((item) => String(item).replace(/^keyboard\./, ""));
    return args;
  }
  if (row.operation?.name === "system.attach_script" && isRecord(value)) {
    args.modulePath = typeof value.modulePath === "string" ? value.modulePath : args.modulePath;
    args.exportName = typeof value.exportName === "string" ? value.exportName : args.exportName;
    return args;
  }
  if (valueArg !== undefined) {
    args[valueArg] = value;
  }
  return args;
}

function vectorDefault(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    return fallback;
  }
  return [value[0], value[1], value[2]];
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

function sceneIdFromDocumentPath(documentPath: string | undefined): string {
  const fileName = documentPath?.split("/").pop() ?? "arena.scene.json";
  return fileName.endsWith(".scene.json") ? fileName.slice(0, -".scene.json".length) : fileName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function refreshProject(
  setProject: (project: IEditorProjectPayload) => void,
  setStatus?: (status: string) => void,
  setSelectedRowId?: (selectedRowId: string) => void,
): Promise<IEditorProjectPayload> {
  const response = await fetch("/api/project");
  const payload = await response.json() as IEditorProjectPayload;
  setProject(payload);
  const firstObject = payload.sceneObjects?.[0]?.rowId;
  if (firstObject !== undefined) {
    setSelectedRowId?.(firstObject);
  }
  if (payload.ok === false) {
    setStatus?.(payload.diagnostics?.[0]?.message ?? "Project load failed");
  }
  return payload;
}

async function postOperation(name: string, args: Record<string, unknown>, projectRevision: string | undefined): Promise<{ filesWritten: string[] }> {
  const response = await fetch("/api/operation", {
    body: JSON.stringify({ args, name, projectRevision }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json() as { diagnostics?: Array<{ message: string }>; filesWritten?: string[]; ok: boolean };
  if (!payload.ok) {
    throw new Error(payload.diagnostics?.[0]?.message ?? `Operation ${name} failed`);
  }
  return { filesWritten: payload.filesWritten ?? [] };
}

function countDocuments(project: IEditorProjectPayload): number {
  return project.documents?.reduce((count, group) => count + group.documents.length, 0) ?? 0;
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
