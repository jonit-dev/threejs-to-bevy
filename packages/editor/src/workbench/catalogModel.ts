import type { IAuthoringDocument } from "@threenative/authoring";

export interface ICatalogRow {
  assetKind?: string;
  addObjectCandidate: boolean;
  documentPath: string;
  id: string;
  kind: "asset" | "mesh" | "prefab";
  mutation: "enabled" | "inspect-only";
  path?: string;
}

export function buildCatalogModel(documents: readonly IAuthoringDocument[]): ICatalogRow[] {
  return documents
    .filter((document) => document.kind === "asset" || document.kind === "mesh" || document.kind === "prefab")
    .flatMap((document) => catalogRowsForDocument(document))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function catalogRowsForDocument(document: IAuthoringDocument): ICatalogRow[] {
  if (document.kind === "asset" && isRecord(document.data) && Array.isArray(document.data.assets) && document.data.assets.length > 0) {
    return document.data.assets.filter(isRecord).map((asset, index) => {
      const path = readString(asset.path);
      const assetKind = readString(asset.type);
      return {
        addObjectCandidate: isModelAsset(path, assetKind),
        assetKind,
        documentPath: document.projectRelativePath,
        id: readString(asset.id) ?? `${readDocumentId(document.data) ?? document.projectRelativePath}.asset.${index}`,
        kind: "asset",
        mutation: isModelAsset(path, assetKind) ? "enabled" : "inspect-only",
        path,
      };
    });
  }
  return [
    {
      addObjectCandidate: false,
      documentPath: document.projectRelativePath,
      id: readDocumentId(document.data) ?? document.projectRelativePath,
      kind: document.kind as ICatalogRow["kind"],
      mutation: document.kind === "asset" ? "inspect-only" as const : "enabled" as const,
    },
  ];
}

function isModelAsset(path: string | undefined, assetKind: string | undefined): boolean {
  return path?.endsWith(".glb") === true || path?.endsWith(".gltf") === true || assetKind === "model";
}

function readDocumentId(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string" ? value.id : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
