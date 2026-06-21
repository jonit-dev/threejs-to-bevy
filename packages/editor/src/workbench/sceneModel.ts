import type { IAuthoringDocument } from "@threenative/authoring";

export interface ISceneHierarchyRow {
  documentPath: string;
  id: string;
  kind: "entity" | "prefab" | "scene";
  label: string;
  sourcePersistable: boolean;
}

export type EditorSceneLifecycleState = "build-ready" | "diagnostic" | "dirty" | "empty" | "saved";

export interface ISceneLifecycleModel {
  activeScene?: ISceneLifecycleEntry;
  scenes: ISceneLifecycleEntry[];
  state: EditorSceneLifecycleState;
}

export interface ISceneLifecycleEntry {
  documentPath: string;
  id: string;
  label: string;
  sourcePersistable: boolean;
}

export function buildSceneHierarchyModel(documents: readonly IAuthoringDocument[]): ISceneHierarchyRow[] {
  return documents.flatMap((document) => {
    if (document.kind === "scene" && isRecord(document.data)) {
      return [
        { documentPath: document.projectRelativePath, id: `scene:${readString(document.data.id) ?? document.projectRelativePath}`, kind: "scene", label: readString(document.data.id) ?? document.projectRelativePath, sourcePersistable: true },
        ...readRows(document.data.entities, document.projectRelativePath, "entity"),
      ];
    }
    if (document.kind === "prefab" && isRecord(document.data)) {
      return [
        { documentPath: document.projectRelativePath, id: `prefab:${readString(document.data.id) ?? document.projectRelativePath}`, kind: "prefab", label: readString(document.data.id) ?? document.projectRelativePath, sourcePersistable: true },
      ];
    }
    return [];
  });
}

export function buildSceneLifecycleModel(
  documents: readonly IAuthoringDocument[],
  options: { activeScenePath?: string; buildReady?: boolean; dirty?: boolean; hasErrors?: boolean } = {},
): ISceneLifecycleModel {
  const scenes: ISceneLifecycleEntry[] = [];
  for (const document of documents) {
    if (document.kind !== "scene" || !isRecord(document.data)) {
      continue;
    }
    const id = readString(document.data.id) ?? document.projectRelativePath;
    scenes.push({
      documentPath: document.projectRelativePath,
      id,
      label: id,
      sourcePersistable: true,
    });
  }
  scenes.sort((left, right) => left.documentPath.localeCompare(right.documentPath));
  const activeScene = scenes.find((scene) => scene.documentPath === options.activeScenePath) ?? scenes[0];
  return {
    activeScene,
    scenes,
    state: lifecycleState({ buildReady: options.buildReady, dirty: options.dirty, hasErrors: options.hasErrors, scenes }),
  };
}

function lifecycleState(options: { buildReady?: boolean; dirty?: boolean; hasErrors?: boolean; scenes: readonly ISceneLifecycleEntry[] }): EditorSceneLifecycleState {
  if (options.hasErrors === true) {
    return "diagnostic";
  }
  if (options.scenes.length === 0) {
    return "empty";
  }
  if (options.dirty === true) {
    return "dirty";
  }
  if (options.buildReady === true) {
    return "build-ready";
  }
  return "saved";
}

function readRows(value: unknown, documentPath: string, kind: "entity"): ISceneHierarchyRow[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((entry) => ({
        documentPath,
        id: `${kind}:${readString(entry.id) ?? documentPath}`,
        kind,
        label: readString(entry.id) ?? "unnamed",
        sourcePersistable: true,
      }))
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
