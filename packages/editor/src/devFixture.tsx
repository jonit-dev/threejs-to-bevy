import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import { EditorApp } from "./EditorApp.js";
import { devFixtureModel } from "./devFixtureModel.js";
import "./styles.css";

interface IProjectPayload {
  documents?: Array<{ documents: Array<{ path: string }>; kind: string }>;
  ok?: boolean;
  projectRevision?: string;
}

export function renderDevFixture(root: Element) {
  createRoot(root).render(<EditorDevApp />);
}

function EditorDevApp() {
  const [project, setProject] = useState<IProjectPayload>();
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    void refreshProject(setProject);
  }, []);

  async function addPrimitive() {
    const suffix = Date.now().toString(36);
    const prefabId = `prefab.editor-box-${suffix}`;
    const entityId = `editor-box-${suffix}`;
    setStatus("Adding primitive");
    await postOperation("scene.add_prefab", { color: "#27ae60", prefabId, primitive: "box", sceneId: "arena" }, project?.projectRevision);
    await postOperation("scene.add_entity", { entityId, prefabId, sceneId: "arena" }, project?.projectRevision);
    await postOperation("scene.set_transform", { entityId, position: [2, 0.5, 1], sceneId: "arena" }, project?.projectRevision);
    const nextProject = await refreshProject(setProject);
    setStatus(`Added ${entityId}; documents ${nextProject.documents?.reduce((count, group) => count + group.documents.length, 0) ?? 0}`);
  }

  async function buildPreview() {
    setStatus("Building preview");
    const response = await fetch("/api/build", { method: "POST" });
    const payload = await response.json() as { bundlePath?: string; ok: boolean };
    setStatus(payload.ok ? `Built ${payload.bundlePath ?? "bundle"}` : "Build failed");
  }

  return (
    <>
      <EditorApp model={devFixtureModel} />
      <div className="tn-editor-dev-controls" aria-label="Workbench controls">
        <button onClick={addPrimitive} type="button">Add primitive</button>
        <button onClick={buildPreview} type="button">Build preview</button>
        <span>{status}</span>
      </div>
    </>
  );
}

async function refreshProject(setProject: (project: IProjectPayload) => void): Promise<IProjectPayload> {
  const response = await fetch("/api/project");
  const payload = await response.json() as IProjectPayload;
  setProject(payload);
  return payload;
}

async function postOperation(name: string, args: Record<string, unknown>, projectRevision: string | undefined): Promise<void> {
  const response = await fetch("/api/operation", {
    body: JSON.stringify({ args, name, projectRevision }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json() as { diagnostics?: Array<{ message: string }>; ok: boolean };
  if (!payload.ok) {
    throw new Error(payload.diagnostics?.[0]?.message ?? `Operation ${name} failed`);
  }
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
