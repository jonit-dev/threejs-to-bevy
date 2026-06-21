import type { IAuthoringDocument } from "@threenative/authoring";

export interface IMaterialRow {
  color?: string;
  documentPath: string;
  id: string;
  roughness?: number;
  textureFieldsReadOnly: true;
}

export function buildMaterialModel(documents: readonly IAuthoringDocument[]): IMaterialRow[] {
  return documents
    .filter((document) => document.kind === "material" && isRecord(document.data) && Array.isArray(document.data.materials))
    .flatMap((document) =>
      (document.data as { materials: unknown[] }).materials.filter(isRecord).map((material) => ({
        color: readString(material.color),
        documentPath: document.projectRelativePath,
        id: readString(material.id) ?? document.projectRelativePath,
        roughness: typeof material.roughness === "number" ? material.roughness : undefined,
        textureFieldsReadOnly: true as const,
      })),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
