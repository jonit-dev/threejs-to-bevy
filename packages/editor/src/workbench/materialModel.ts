import type { IAuthoringDocument } from "@threenative/authoring";

export interface IMaterialRow {
  alphaMode?: string;
  baseColorTexture?: string;
  color?: string;
  documentPath: string;
  emissive?: string;
  id: string;
  metalness?: number;
  normalTexture?: string;
  roughness?: number;
  textureFieldsReadOnly: false;
}

export function buildMaterialModel(documents: readonly IAuthoringDocument[]): IMaterialRow[] {
  return documents
    .filter((document) => document.kind === "material" && isRecord(document.data) && Array.isArray(document.data.materials))
    .flatMap((document) =>
      (document.data as { materials: unknown[] }).materials.filter(isRecord).map((material) => ({
        color: readString(material.color),
        documentPath: document.projectRelativePath,
        alphaMode: readString(material.alphaMode),
        baseColorTexture: readString(material.baseColorTexture),
        emissive: readString(material.emissive),
        id: readString(material.id) ?? document.projectRelativePath,
        metalness: typeof material.metalness === "number" ? material.metalness : undefined,
        normalTexture: readString(material.normalTexture),
        roughness: typeof material.roughness === "number" ? material.roughness : undefined,
        textureFieldsReadOnly: false as const,
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
