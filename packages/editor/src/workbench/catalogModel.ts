import type { IAuthoringDocument } from "@threenative/authoring";

export interface ICatalogRow {
  documentPath: string;
  id: string;
  kind: "asset" | "mesh" | "prefab";
  mutation: "enabled" | "inspect-only";
}

export function buildCatalogModel(documents: readonly IAuthoringDocument[]): ICatalogRow[] {
  return documents
    .filter((document) => document.kind === "asset" || document.kind === "mesh" || document.kind === "prefab")
    .map((document) => ({
      documentPath: document.projectRelativePath,
      id: readDocumentId(document.data) ?? document.projectRelativePath,
      kind: document.kind as ICatalogRow["kind"],
      mutation: document.kind === "asset" ? "inspect-only" as const : "enabled" as const,
    }))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function readDocumentId(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string" ? value.id : undefined;
}
