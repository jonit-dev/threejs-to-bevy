import { create } from "zustand";

import type { IEditorLodStats, IEditorPropertyRow, IEditorSceneObject } from "../adapters/editorModel.js";
import type { IViewportTransform } from "../preview/EditorViewport3d.js";

export type EditorModal = "addComponent" | "addObject" | "build" | "chat" | "delete" | "newScene" | "save" | "settings" | undefined;

export interface IEditorProjectPayload {
  diagnostics?: Array<{ code?: string; file?: string; message: string; path?: string; severity?: "error" | "info" | "warning"; suggestion?: string }>;
  documents?: IEditorProjectDocumentGroup[];
  ok?: boolean;
  projectPath?: string;
  projectRevision?: string;
  lod?: IEditorLodStats;
  sceneObjects?: IEditorSceneObject[];
}

export interface IEditorProjectDocumentGroup {
  documents: Array<{ id: string; inspectorRows?: IEditorPropertyRow[]; kind: string; path: string }>;
  kind: string;
}

export interface IEditorSessionState {
  modal: EditorModal;
  parentByRowId: Record<string, string | undefined>;
  project?: IEditorProjectPayload;
  selectedRowId?: string;
  status: string;
  transformByRowId: Record<string, IViewportTransform>;
}

export interface IEditorSessionActions {
  clearTransformOverride: (rowId: string) => void;
  closeModal: () => void;
  openModal: (modal: Exclude<EditorModal, undefined>) => void;
  reset: (state?: Partial<IEditorSessionState>) => void;
  selectRow: (rowId: string | undefined) => void;
  setParent: (rowId: string, parentId: string | undefined) => boolean;
  setProject: (project: IEditorProjectPayload | undefined) => void;
  setStatus: (status: string) => void;
  setTransformOverride: (rowId: string, transform: IViewportTransform) => void;
}

export type EditorStore = IEditorSessionState & IEditorSessionActions;

export const defaultEditorSessionState: IEditorSessionState = {
  modal: undefined,
  parentByRowId: {},
  project: undefined,
  selectedRowId: undefined,
  status: "Ready",
  transformByRowId: {},
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...defaultEditorSessionState,
  clearTransformOverride: (rowId) =>
    set((state) => {
      const transformByRowId = { ...state.transformByRowId };
      delete transformByRowId[rowId];
      return { transformByRowId };
    }),
  closeModal: () => set({ modal: undefined }),
  openModal: (modal) => set({ modal }),
  reset: (state) => set({ ...defaultEditorSessionState, ...state }),
  selectRow: (selectedRowId) => set({ selectedRowId }),
  setParent: (rowId, parentId) => {
    const current = get().parentByRowId;
    if (rowId === parentId || (parentId !== undefined && isDescendant(parentId, rowId, current))) {
      return false;
    }
    set({ parentByRowId: { ...current, [rowId]: parentId } });
    return true;
  },
  setProject: (project) => set({ project }),
  setStatus: (status) => set({ status }),
  setTransformOverride: (rowId, transform) =>
    set((state) => ({
      transformByRowId: { ...state.transformByRowId, [rowId]: transform },
    })),
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
