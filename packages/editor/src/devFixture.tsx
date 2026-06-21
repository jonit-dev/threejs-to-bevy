import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import { EditorApp } from "./EditorApp.js";
import { devFixtureModel } from "./devFixtureModel.js";
import "./styles.css";

interface IProjectPayload {
  diagnostics?: Array<{ message: string }>;
  documents?: Array<{ documents: Array<{ path: string }>; kind: string }>;
  ok?: boolean;
  projectRevision?: string;
}

type PrimitiveKind = "box" | "capsule" | "cylinder" | "plane" | "sphere";

export function renderDevFixture(root: Element) {
  createRoot(root).render(<EditorDevApp />);
}

function EditorDevApp() {
  const [project, setProject] = useState<IProjectPayload>();
  const [primitive, setPrimitive] = useState<PrimitiveKind>("box");
  const [color, setColor] = useState("#27ae60");
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    void refreshProject(setProject, setStatus);
  }, []);

  async function addPrimitive() {
    const suffix = Date.now().toString(36);
    const prefabId = `prefab.editor-box-${suffix}`;
    const entityId = `editor-box-${suffix}`;
    try {
      setStatus(`Adding ${primitive}`);
      await postOperation("scene.add_prefab", { color, prefabId, primitive, sceneId: "arena" }, project?.projectRevision);
      await postOperation("scene.add_entity", { entityId, prefabId, sceneId: "arena" }, project?.projectRevision);
      await postOperation("scene.set_transform", { entityId, position: [2, 0.5, 1], sceneId: "arena" }, project?.projectRevision);
      const nextProject = await refreshProject(setProject, setStatus);
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

  return (
    <>
      <EditorApp model={devFixtureModel} />
      <div className="tn-editor-dev-controls" aria-label="Workbench controls">
        <label>
          Primitive
          <select aria-label="Primitive" onChange={(event) => setPrimitive(event.currentTarget.value as PrimitiveKind)} value={primitive}>
            <option value="box">Box</option>
            <option value="sphere">Sphere</option>
            <option value="capsule">Capsule</option>
            <option value="cylinder">Cylinder</option>
            <option value="plane">Plane</option>
          </select>
        </label>
        <label>
          Color
          <input aria-label="Color" onChange={(event) => setColor(event.currentTarget.value)} type="color" value={color} />
        </label>
        <button onClick={addPrimitive} type="button">Add primitive</button>
        <button onClick={buildPreview} type="button">Build preview</button>
        <span role="status">{status}</span>
      </div>
    </>
  );
}

async function refreshProject(setProject: (project: IProjectPayload) => void, setStatus?: (status: string) => void): Promise<IProjectPayload> {
  const response = await fetch("/api/project");
  const payload = await response.json() as IProjectPayload;
  setProject(payload);
  if (payload.ok === false) {
    setStatus?.(payload.diagnostics?.[0]?.message ?? "Project load failed");
  }
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

function countDocuments(project: IProjectPayload): number {
  return project.documents?.reduce((count, group) => count + group.documents.length, 0) ?? 0;
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
