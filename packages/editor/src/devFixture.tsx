import { createRoot } from "react-dom/client";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { EditorApp } from "./EditorApp.js";
import { createEditorSessionModel, defaultEditorSessionState, useEditorStore } from "./state/editorStore.js";
import "./styles.css";

export function renderDevFixture(root: Element) {
  createRoot(root).render(<EditorDevApp />);
}

function EditorDevApp() {
  const modelState = useEditorStore(useShallow((state) => ({
    activeScenePath: state.activeScenePath,
    parentByRowId: state.parentByRowId,
    project: state.project,
    selectedRowId: state.selectedRowId,
    status: state.status,
    transformByRowId: state.transformByRowId,
  })));
  const refreshProject = useEditorStore((state) => state.refreshProject);
  const addObject = useEditorStore((state) => state.addObject);
  const addComponent = useEditorStore((state) => state.addComponent);
  const buildPreview = useEditorStore((state) => state.buildPreview);
  const createDefaultScene = useEditorStore((state) => state.createDefaultScene);
  const saveScene = useEditorStore((state) => state.saveScene);
  const selectEditorRow = useEditorStore((state) => state.selectEditorRow);
  const moveEditorRow = useEditorStore((state) => state.moveEditorRow);
  const editProperty = useEditorStore((state) => state.editProperty);
  const transformObject = useEditorStore((state) => state.transformObject);
  const model = useMemo(() => createEditorSessionModel({ ...defaultEditorSessionState, ...modelState }), [modelState]);

  useEffect(() => {
    void refreshProject({ selectFirstObject: true, updateLoadErrorStatus: true });
  }, []);

  return (
    <EditorApp
      model={model}
      onAddComponent={(definition) => void addComponent(definition, model.sceneObjects)}
      onAddObject={(action) => void addObject(action)}
      onBuildPreview={buildPreview}
      onCreateScene={createDefaultScene}
      onEditProperty={editProperty}
      onMoveRow={moveEditorRow}
      onSaveScene={saveScene}
      onSelectRow={selectEditorRow}
      onTransformObject={(rowId, transform) => transformObject(model.sceneObjects, rowId, transform)}
    />
  );
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
