import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import { EditorApp } from "./EditorApp.js";
import type { IEditorDiagnosticView, IEditorLodStats, IEditorPropertyRow, IEditorSceneObject, IEditorShellModel, IEditorTreeRow } from "./adapters/editorModel.js";
import { devFixtureModel } from "./devFixtureModel.js";
import "./styles.css";

interface IProjectPayload {
  diagnostics?: Array<{ code?: string; file?: string; message: string; path?: string; severity?: "error" | "info" | "warning"; suggestion?: string }>;
  documents?: IProjectDocumentGroup[];
  ok?: boolean;
  projectPath?: string;
  projectRevision?: string;
  lod?: IEditorLodStats;
  sceneObjects?: IEditorSceneObject[];
}

interface IProjectDocumentGroup {
  documents: Array<{ id: string; kind: string; path: string }>;
  kind: string;
}

export function renderDevFixture(root: Element) {
  createRoot(root).render(<EditorDevApp />);
}

function EditorDevApp() {
  const [project, setProject] = useState<IProjectPayload>();
  const [parentByRowId, setParentByRowId] = useState<Record<string, string | undefined>>({});
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>(devFixtureModel.selectedRowId);
  const [status, setStatus] = useState("Ready");
  const model = project === undefined ? devFixtureModel : projectToEditorModel(project, selectedRowId, parentByRowId, status);

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
      setSelectedRowId(`entity:${entityId}`);
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
    setParentByRowId((current) => {
      if (draggedId === targetId || isDescendant(targetId, draggedId, current)) {
        return current;
      }
      return { ...current, [draggedId]: targetId };
    });
    setSelectedRowId(draggedId);
    setStatus(`Nested ${findRowLabel(model.hierarchy, draggedId)} under ${findRowLabel(model.hierarchy, targetId)} in editor view`);
  }

  return (
    <EditorApp
      model={model}
      onAddObject={addPrimitive}
      onBuildPreview={buildPreview}
      onCreateScene={createDefaultScene}
      onMoveRow={moveRow}
      onSaveScene={saveScene}
      onSelectRow={setSelectedRowId}
    />
  );
}

function projectToEditorModel(project: IProjectPayload, selectedRowId: string | undefined, parentByRowId: Record<string, string | undefined>, status: string): IEditorShellModel {
  const sceneObjects = project.sceneObjects ?? [];
  const hierarchy = buildHierarchy(project.documents ?? [], sceneObjects, parentByRowId);
  const selectedObject = sceneObjects.find((object) => object.rowId === selectedRowId);
  const selectedDocument = selectedObject === undefined ? findDocument(project.documents ?? [], selectedRowId) : undefined;
  return {
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

function buildHierarchy(documents: readonly IProjectDocumentGroup[], sceneObjects: readonly IEditorSceneObject[], parentByRowId: Record<string, string | undefined>): IEditorTreeRow[] {
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

function documentInspectorRows(document: { kind: string; path: string } | undefined): IEditorPropertyRow[] {
  if (document === undefined) {
    return [];
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

function findDocument(documents: readonly IProjectDocumentGroup[], selectedRowId: string | undefined): { kind: string; path: string } | undefined {
  if (selectedRowId === undefined || !selectedRowId.startsWith("source:")) {
    return undefined;
  }
  const path = selectedRowId.slice("source:".length);
  return documents.flatMap((group) => group.documents).find((document) => document.path === path);
}

function isDescendant(candidateId: string, parentId: string, parentByRowId: Record<string, string | undefined>): boolean {
  let current = parentByRowId[candidateId];
  while (current !== undefined) {
    if (current === parentId) {
      return true;
    }
    current = parentByRowId[current];
  }
  return false;
}

async function refreshProject(
  setProject: (project: IProjectPayload) => void,
  setStatus?: (status: string) => void,
  setSelectedRowId?: (selectedRowId: string) => void,
): Promise<IProjectPayload> {
  const response = await fetch("/api/project");
  const payload = await response.json() as IProjectPayload;
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

function countDocuments(project: IProjectPayload): number {
  return project.documents?.reduce((count, group) => count + group.documents.length, 0) ?? 0;
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
