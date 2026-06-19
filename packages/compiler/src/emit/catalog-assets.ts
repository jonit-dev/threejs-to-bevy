import type { IAssetIr } from "@threenative/ir";

export interface ICatalogGeneratedAssetPayload {
  id: string;
  schema: string;
  payload: Record<string, unknown>;
}

export function emitCatalogGeneratedAssetManifestEntry(asset: ICatalogGeneratedAssetPayload): IAssetIr {
  if (asset.schema.trim() === "") {
    throw new Error("Generated catalog assets must declare a schema.");
  }
  const data = stableStringify({
    payload: asset.payload,
    schema: asset.schema,
  });
  return {
    format: "bin",
    id: asset.id,
    kind: "buffer",
    path: `artifacts/generated/${asset.id}.json`,
    sourceMode: "bundle",
    embedded: {
      byteLength: Buffer.byteLength(data, "utf8"),
      data: Buffer.from(data, "utf8").toString("base64"),
      encoding: "base64",
      mediaType: "application/json",
    },
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}
