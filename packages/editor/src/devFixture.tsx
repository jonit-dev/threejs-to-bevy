import { createRoot } from "react-dom/client";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  PHYSICS_DEBUG_SCHEMA,
  PHYSICS_DEBUG_VERSION,
  type IPhysicsDebugSnapshot,
} from "@threenative/ir/physicsDebug";

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
  const model = useMemo(() => {
    const session = createEditorSessionModel({ ...defaultEditorSessionState, ...modelState });
    return isPhysicsDebugReview()
      ? { ...session, physicsDebug: physicsDebugReviewSnapshot() }
      : session;
  }, [modelState]);

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

function isPhysicsDebugReview(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("physics-debug-review");
}

function physicsDebugReviewSnapshot(): IPhysicsDebugSnapshot {
  const telemetry = {
    allocatedPieces: 2,
    bodies: { active: 5, sleeping: 2 },
    contacts: 4,
    fixedDt: 1 / 60,
    queries: 16,
    rebuilds: 0,
    solverIterations: 12,
    tick: 360,
    timings: [{ milliseconds: 0.42, system: "physics" }],
  };
  const primitives: IPhysicsDebugSnapshot["summary"]["primitives"] = [
    { category: "contact", entity: "chassis", id: "contact:chassis:ground:0", kind: "point", position: [0, 0, 0], value: 12 },
    { category: "joint-load", entity: "chassis", from: [0, 1, 0], id: "joint-load:chassis", kind: "line", to: [0, 1, 2], value: 0.000161 },
    { category: "suspension", entity: "chassis", from: [-0.8, 1.85, -1.2], id: "suspension:chassis:front-left", kind: "line", to: [-0.8, 1.65, -1.2], value: 0 },
    { category: "wheel", entity: "chassis", id: "wheel:chassis:front-left", kind: "sphere", position: [-0.8, 1.65, -1.2], size: [0.7, 0.7, 0.7], value: 0 },
  ];
  const core = { omittedPrimitives: 0, primitives, telemetry, truncated: false };
  return { artifact: core, schema: PHYSICS_DEBUG_SCHEMA, summary: core, version: PHYSICS_DEBUG_VERSION };
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
