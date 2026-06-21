import type { IAuthoringDocument } from "@threenative/authoring";

export interface ISceneHierarchyRow {
  documentPath: string;
  id: string;
  kind: "entity" | "prefab" | "scene";
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
