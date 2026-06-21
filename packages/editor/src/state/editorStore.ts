import { create } from "zustand";

import type { IViewportTransform } from "../preview/EditorViewport3d.js";

export type EditorModal = "addComponent" | "addObject" | "build" | "chat" | "delete" | "newScene" | "save" | "settings" | undefined;

export interface IEditorSessionState {
  modal: EditorModal;
  parentByRowId: Record<string, string | undefined>;
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
  setParent: (rowId: string, parentId: string | undefined) => void;
  setStatus: (status: string) => void;
  setTransformOverride: (rowId: string, transform: IViewportTransform) => void;
}

export type EditorStore = IEditorSessionState & IEditorSessionActions;

export const defaultEditorSessionState: IEditorSessionState = {
  modal: undefined,
  parentByRowId: {},
  selectedRowId: undefined,
  status: "Ready",
  transformByRowId: {},
};

export const useEditorStore = create<EditorStore>((set) => ({
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
  setParent: (rowId, parentId) =>
    set((state) => ({
      parentByRowId: { ...state.parentByRowId, [rowId]: parentId },
    })),
  setStatus: (status) => set({ status }),
  setTransformOverride: (rowId, transform) =>
    set((state) => ({
      transformByRowId: { ...state.transformByRowId, [rowId]: transform },
    })),
}));

