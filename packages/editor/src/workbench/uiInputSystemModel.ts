import type { IAuthoringDocument } from "@threenative/authoring";

export interface IUiInputSystemRow {
  documentPath: string;
  id: string;
  kind: "input" | "system" | "ui";
}

export function buildUiInputSystemModel(documents: readonly IAuthoringDocument[]): IUiInputSystemRow[] {
  return documents
    .filter((document) => document.kind === "ui" || document.kind === "input" || document.kind === "systems")
    .map((document) => ({
      documentPath: document.projectRelativePath,
      id: readDocumentId(document.data) ?? document.projectRelativePath,
      kind: (document.kind === "systems" ? "system" : document.kind) as IUiInputSystemRow["kind"],
    }))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function readDocumentId(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string" ? value.id : undefined;
}
