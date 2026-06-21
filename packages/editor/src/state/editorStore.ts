import { create } from "zustand";

import type { IEditorAddComponentDefinition, IEditorAssetRow, IEditorLodStats, IEditorModalActionDefinition, IEditorPropertyRow, IEditorSceneObject } from "../adapters/editorModel.js";
import type { EditorViewportGizmoMode, IViewportTransform } from "../preview/EditorViewport3d.js";
import type { ISceneLifecycleModel } from "../workbench/sceneModel.js";

export type EditorModal = "addComponent" | "addObject" | "build" | "chat" | "delete" | "newScene" | "save" | "settings" | undefined;

export interface IEditorProjectPayload {
  assets?: IEditorAssetRow[];
  diagnostics?: Array<{ code?: string; file?: string; message: string; path?: string; severity?: "error" | "info" | "warning"; suggestion?: string }>;
  documents?: IEditorProjectDocumentGroup[];
  ok?: boolean;
  projectPath?: string;
  projectRevision?: string;
  lod?: IEditorLodStats;
  sceneLifecycle?: ISceneLifecycleModel;
  sceneObjects?: IEditorSceneObject[];
}

export interface IEditorProjectDocumentGroup {
  documents: Array<{ id: string; inspectorRows?: IEditorPropertyRow[]; kind: string; path: string }>;
  kind: string;
}

export interface IEditorSessionState {
  activeScenePath?: string;
  gizmoMode: EditorViewportGizmoMode;
  modal: EditorModal;
  parentByRowId: Record<string, string | undefined>;
  project?: IEditorProjectPayload;
  selectedRowId?: string;
  status: string;
  transformByRowId: Record<string, IViewportTransform>;
}

export interface IEditorSessionActions {
  addComponent: (definition: IEditorAddComponentDefinition, sceneObjects: readonly IEditorSceneObject[]) => Promise<void>;
  addObject: (action: IEditorModalActionDefinition) => Promise<void>;
  buildPreview: () => Promise<void>;
  clearTransformOverride: (rowId: string) => void;
  closeModal: () => void;
  commitTransform: (object: IEditorSceneObject, transform: IViewportTransform) => Promise<void>;
  createDefaultScene: () => Promise<void>;
  editProperty: (row: IEditorPropertyRow, value: unknown) => Promise<void>;
  loadScene: (documentPath: string) => void;
  openModal: (modal: Exclude<EditorModal, undefined>) => void;
  refreshProject: (options?: IRefreshProjectOptions) => Promise<IEditorProjectPayload>;
  reset: (state?: Partial<IEditorSessionState>) => void;
  saveScene: () => Promise<void>;
  selectRow: (rowId: string | undefined) => void;
  setGizmoMode: (mode: EditorViewportGizmoMode) => void;
  setParent: (rowId: string, parentId: string | undefined) => boolean;
  setProject: (project: IEditorProjectPayload | undefined) => void;
  setStatus: (status: string) => void;
  setTransformOverride: (rowId: string, transform: IViewportTransform) => void;
  transformObject: (sceneObjects: readonly IEditorSceneObject[], rowId: string, transform: IViewportTransform) => void;
}

export type EditorStore = IEditorSessionState & IEditorSessionActions;

export interface IRefreshProjectOptions {
  selectFirstObject?: boolean;
  updateLoadErrorStatus?: boolean;
}

export const defaultEditorSessionState: IEditorSessionState = {
  activeScenePath: undefined,
  gizmoMode: "translate",
  modal: undefined,
  parentByRowId: {},
  project: undefined,
  selectedRowId: undefined,
  status: "Ready",
  transformByRowId: {},
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...defaultEditorSessionState,
  addComponent: async (definition, sceneObjects) => {
    const state = get();
    const object = sceneObjects.find((item) => item.rowId === state.selectedRowId);
    if (object === undefined) {
      set({ status: "Select a source entity before adding a component" });
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
          state.project?.projectRevision,
        );
      } else if (definition.component === "Camera") {
        await postOperation(
          "scene.set_component",
          { componentKind: "camera", entityId: object.id, sceneId: sceneIdFromDocumentPath(object.documentPath), value: definition.defaults },
          state.project?.projectRevision,
        );
      } else if (definition.component === "Light") {
        await postOperation(
          "scene.set_component",
          { componentKind: "Light", entityId: object.id, sceneId: sceneIdFromDocumentPath(object.documentPath), value: definition.defaults },
          state.project?.projectRevision,
        );
      } else {
        set({ status: definition.readOnlyReason ?? `${definition.component} does not have a promoted add operation yet` });
        return;
      }
      await get().refreshProject();
      set({ status: `Added ${definition.component} to ${object.label}` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  addObject: async (action) => {
    const suffix = Date.now().toString(36);
    const sceneId = sceneIdFromDocumentPath(get().activeScenePath ?? get().project?.sceneLifecycle?.activeScene?.documentPath);
    try {
      const revision = get().project?.projectRevision;
      const result = addObjectOperationPlan(action, suffix);
      if (result === undefined) {
        set({ status: action.readOnlyReason ?? `${action.label} does not have a promoted add operation yet` });
        return;
      }
      set({ status: `Adding ${result.statusLabel}` });
      for (const operation of result.operations) {
        await postOperation(operation.name, { ...operation.args, sceneId }, revision);
      }
      const nextProject = await get().refreshProject();
      set({
        selectedRowId: nextProject.sceneObjects?.find((object) => object.id === result.entityId)?.rowId ?? `entity:content/scenes/arena.scene.json:${result.entityId}`,
        status: `Added ${result.entityId}; ${result.statusLabel}; documents ${countDocuments(nextProject)}`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  buildPreview: async () => {
    try {
      set({ status: "Building preview" });
      const response = await fetch("/api/build", { method: "POST" });
      const payload = await response.json() as { bundlePath?: string; diagnostics?: Array<{ message: string }>; ok: boolean };
      set({ status: payload.ok ? `Built ${payload.bundlePath ?? "bundle"}` : `Build failed: ${payload.diagnostics?.[0]?.message ?? "unknown error"}` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  clearTransformOverride: (rowId) =>
    set((state) => {
      const transformByRowId = { ...state.transformByRowId };
      delete transformByRowId[rowId];
      return {
        project: state.project === undefined ? undefined : withClientSceneLifecycle(state.project, state.activeScenePath, hasTransformOverrides(transformByRowId)),
        transformByRowId,
      };
    }),
  closeModal: () => set({ modal: undefined }),
  commitTransform: async (object, transform) => {
    try {
      await postOperation(
        "scene.set_transform",
        { entityId: object.id, position: transform.position, rotation: transform.rotation, scale: transform.scale, sceneId: sceneIdFromDocumentPath(object.documentPath) },
        get().project?.projectRevision,
      );
      await get().refreshProject();
      get().clearTransformOverride(object.rowId);
      set({ status: `Saved transform for ${object.label}` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  createDefaultScene: async () => {
    const suffix = Date.now().toString(36);
    const sceneId = `editor-scene-${suffix}`;
    try {
      set({ status: `Creating ${sceneId}` });
      const response = await postOperation("scene.create_default", { sceneId }, get().project?.projectRevision);
      set({ activeScenePath: `content/scenes/${sceneId}.scene.json` });
      const nextProject = await get().refreshProject({ selectFirstObject: true });
      set({ status: `Created ${sceneId}; saved ${response.filesWritten.join(", ")}; documents ${countDocuments(nextProject)}` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  editProperty: async (row, value) => {
    if (row.operation === undefined || row.readOnly) {
      set({ status: row.readOnlyReason ?? `${row.label} is read-only` });
      return;
    }
    try {
      await postOperation(row.operation.name, buildOperationArgs(row, value), get().project?.projectRevision);
      await get().refreshProject();
      set({ status: `Saved ${row.label}` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  loadScene: (documentPath) => {
    const project = get().project;
    const scene = project?.sceneLifecycle?.scenes.find((item) => item.documentPath === documentPath);
    if (project === undefined || scene === undefined) {
      set({ status: `Scene ${documentPath} is not available in the loaded source project` });
      return;
    }
    const firstObject = project.sceneObjects?.find((object) => object.documentPath === documentPath)?.rowId;
    set({
      activeScenePath: documentPath,
      project: withClientSceneLifecycle(project, documentPath, hasTransformOverrides(get().transformByRowId)),
      selectedRowId: firstObject,
      status: `Loaded source scene ${scene.label}`,
    });
  },
  openModal: (modal) => set({ modal }),
  refreshProject: async (options = {}) => {
    const response = await fetch("/api/project");
    const payload = await response.json() as IEditorProjectPayload;
    const activeScenePath = get().activeScenePath ?? payload.sceneLifecycle?.activeScene?.documentPath;
    const nextProject = withClientSceneLifecycle(payload, activeScenePath, hasTransformOverrides(get().transformByRowId));
    const firstObject = nextProject.sceneObjects?.find((object) => activeScenePath === undefined || object.documentPath === activeScenePath)?.rowId;
    set({
      activeScenePath,
      project: nextProject,
      selectedRowId: options.selectFirstObject && firstObject !== undefined ? firstObject : get().selectedRowId,
      status: options.updateLoadErrorStatus && nextProject.ok === false ? nextProject.diagnostics?.[0]?.message ?? "Project load failed" : get().status,
    });
    return nextProject;
  },
  reset: (state) => set({ ...defaultEditorSessionState, ...state }),
  saveScene: async () => {
    try {
      const nextProject = await get().refreshProject({ selectFirstObject: true, updateLoadErrorStatus: true });
      set({ status: `Saved scene sources; revision ${nextProject.projectRevision ?? "unknown"}` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : String(error) });
    }
  },
  selectRow: (selectedRowId) => set({ selectedRowId }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  setParent: (rowId, parentId) => {
    const current = get().parentByRowId;
    if (rowId === parentId || (parentId !== undefined && isDescendant(parentId, rowId, current))) {
      return false;
    }
    set({ parentByRowId: { ...current, [rowId]: parentId } });
    return true;
  },
  setProject: (project) =>
    set((state) => ({
      activeScenePath: state.activeScenePath ?? project?.sceneLifecycle?.activeScene?.documentPath,
      project: project === undefined ? undefined : withClientSceneLifecycle(project, state.activeScenePath ?? project.sceneLifecycle?.activeScene?.documentPath, hasTransformOverrides(state.transformByRowId)),
    })),
  setStatus: (status) => set({ status }),
  setTransformOverride: (rowId, transform) =>
    set((state) => ({
      project: state.project === undefined ? undefined : withClientSceneLifecycle(state.project, state.activeScenePath, true),
      transformByRowId: { ...state.transformByRowId, [rowId]: transform },
    })),
  transformObject: (sceneObjects, rowId, transform) => {
    set((state) => ({
      selectedRowId: rowId,
      transformByRowId: { ...state.transformByRowId, [rowId]: transform },
    }));
    const object = sceneObjects.find((item) => item.rowId === rowId);
    if (object === undefined) {
      set({ status: `Moved ${rowId} in viewport` });
      return;
    }
    set({ status: `Moved ${object.label} in viewport` });
    void get().commitTransform(object, transform);
  },
}));

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

function sceneIdFromDocumentPath(documentPath: string | undefined): string {
  const fileName = documentPath?.split("/").pop() ?? "arena.scene.json";
  return fileName.endsWith(".scene.json") ? fileName.slice(0, -".scene.json".length) : fileName;
}

function countDocuments(project: IEditorProjectPayload): number {
  return project.documents?.reduce((count, group) => count + group.documents.length, 0) ?? 0;
}

function hasTransformOverrides(transformByRowId: Record<string, IViewportTransform>): boolean {
  return Object.keys(transformByRowId).length > 0;
}

function withClientSceneLifecycle(project: IEditorProjectPayload, activeScenePath: string | undefined, dirty: boolean): IEditorProjectPayload {
  if (project.sceneLifecycle === undefined) {
    return project;
  }
  const activeScene = project.sceneLifecycle.scenes.find((scene) => scene.documentPath === activeScenePath) ?? project.sceneLifecycle.activeScene;
  const hasActiveSceneObjects = activeScene === undefined
    ? (project.sceneObjects?.length ?? 0) > 0
    : project.sceneObjects?.some((object) => object.documentPath === activeScene.documentPath) === true;
  return {
    ...project,
    sceneLifecycle: {
      ...project.sceneLifecycle,
      activeScene,
      state: project.ok === false || project.sceneLifecycle.state === "diagnostic"
        ? "diagnostic"
        : project.sceneLifecycle.scenes.length === 0
          ? "empty"
          : dirty
            ? "dirty"
            : hasActiveSceneObjects
              ? "build-ready"
              : "saved",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface IPlannedEditorOperation {
  args: Record<string, unknown>;
  name: string;
}

function addObjectOperationPlan(action: IEditorModalActionDefinition, suffix: string): { entityId: string; operations: IPlannedEditorOperation[]; statusLabel: string } | undefined {
  switch (action.id) {
    case "add.primitive_sphere": {
      const prefabId = `prefab.editor-box-${suffix}`;
      const entityId = `editor-box-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { color: "#9b59b6", prefabId, primitive: "sphere" }, name: "scene.add_prefab" },
          { args: { entityId, prefabId }, name: "scene.add_entity" },
          { args: { entityId, position: [12, 0.5, 5] }, name: "scene.set_transform" },
        ],
        statusLabel: "primitive sphere",
      };
    }
    case "add.empty_entity": {
      const entityId = `editor-entity-${suffix}`;
      return {
        entityId,
        operations: [{ args: { entityId }, name: "scene.add_entity" }],
        statusLabel: "empty entity",
      };
    }
    case "add.camera": {
      const entityId = `editor-camera-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { entityId }, name: "scene.add_entity" },
          { args: { componentKind: "camera", entityId, value: { mode: "perspective" } }, name: "scene.set_component" },
          { args: { entityId, position: [0, 1.8, 6], rotation: [-0.25, 0, 0] }, name: "scene.set_transform" },
        ],
        statusLabel: "camera",
      };
    }
    case "add.light": {
      const entityId = `editor-light-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { entityId }, name: "scene.add_entity" },
          { args: { componentKind: "Light", entityId, value: { intensity: 1, kind: "directional" } }, name: "scene.set_component" },
          { args: { entityId, position: [2, 4, 3] }, name: "scene.set_transform" },
        ],
        statusLabel: "light",
      };
    }
    case "add.custom_glb": {
      if (action.assetPath === undefined) {
        return undefined;
      }
      const prefabId = `prefab.editor-model-${suffix}`;
      const entityId = `editor-model-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { asset: action.assetPath, prefabId }, name: "scene.add_prefab" },
          { args: { entityId, prefabId }, name: "scene.add_entity" },
          { args: { entityId, position: [0, 0, 0], scale: [1, 1, 1] }, name: "scene.set_transform" },
        ],
        statusLabel: `model ${action.assetPath}`,
      };
    }
    case "add.terrain":
    case "build.preview":
    case "delete.selection":
    case "scene.create_default":
    case "scene.save":
    case "settings.editor":
      return undefined;
  }
}
