export interface ICatalogPreviewRow {
  diagnostic?: string;
  id: string;
  kind: "asset" | "input" | "material" | "mesh";
  path?: string;
}

export function buildCatalogPreviewModel(bundle: {
  assets?: Array<{ id: string; kind?: string; path?: string }>;
  input?: Array<{ id: string }>;
  materials?: Array<{ id: string }>;
  meshes?: Array<{ id: string }>;
}): ICatalogPreviewRow[] {
  return [
    ...(bundle.assets ?? []).map((asset) => ({
      diagnostic: asset.path?.startsWith("http") ? "Streaming or remote media preview is unsupported." : undefined,
      id: asset.id,
      kind: "asset" as const,
      path: asset.path,
    })),
    ...(bundle.materials ?? []).map((material) => ({ id: material.id, kind: "material" as const })),
    ...(bundle.input ?? []).map((input) => ({ id: input.id, kind: "input" as const })),
    ...(bundle.meshes ?? []).map((mesh) => ({ id: mesh.id, kind: "mesh" as const })),
  ].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}
